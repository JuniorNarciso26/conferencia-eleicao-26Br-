import { validarZona,getLease,ensureValidUnpublishedZone,reserveZone,releaseZone,verifyPullRequest,submitZone } from "./reservas.js";
// Conferencia Eleitoral 2026 - GitHub OAuth com PKCE e sessoes no D1.
// Apenas login. Nenhum dado eleitoral e enviado por esta versao.
const SESSION_TTL = 8 * 60 * 60;
const STATE_TTL = 10 * 60;
const TICKET_TTL = 2 * 60;
const COOKIE = "ce_oauth_state";
const te = new TextEncoder();

function randomToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return b64url(arr);
}
function b64url(bytes) {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function sha256(text) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(text))));
}
function epoch() { return Math.floor(Date.now() / 1000); }
function siteUrl(env) { return new URL(env.SITE_URL || "https://juniornarciso26.github.io/conferencia-eleicao-26Br-/"); }
function apiUrl(env) { return new URL(env.API_ORIGIN || "https://conferencia-eleitoral-api.junior-ab2.workers.dev"); }
function authorizedOrigin(request, env) { return request.headers.get("Origin") === siteUrl(env).origin; }
function corsHeaders(request, env) {
  const h = { "Vary": "Origin" };
  if (authorizedOrigin(request, env)) {
    h["Access-Control-Allow-Origin"] = siteUrl(env).origin;
    h["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
    h["Access-Control-Allow-Headers"] = "Authorization,Content-Type";
    h["Access-Control-Max-Age"] = "600";
  }
  return h;
}
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra
  } });
}
function error(code, status, request, env) {
  return json({ ok: false, code }, status, corsHeaders(request, env));
}
function cookie(value, maxAge) {
  return COOKIE + "=" + encodeURIComponent(value) +
    "; Path=/api/auth; Secure; HttpOnly; SameSite=Lax; Max-Age=" + maxAge;
}
function getCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > -1 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return ""; }
    }
  }
  return "";
}
function callbackUrl(env) { return new URL("/api/auth/callback", apiUrl(env)).toString(); }
function configReady(env) {
  return Boolean(env.DB && env.GH_CLIENT_ID && env.GH_CLIENT_SECRET &&
    env.GH_CLIENT_ID !== "PREENCHER_CLIENT_ID" &&
    env.SITE_URL && env.API_ORIGIN);
}
async function readBody(request, maxBytes = 2048) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > maxBytes) throw new Error("BODY_TOO_LARGE");
  if (!request.body) throw new Error("EMPTY_BODY");
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new Error("BODY_TOO_LARGE"); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const chunk of chunks) { out.set(chunk, off); off += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(out)); }
  catch { throw new Error("INVALID_JSON"); }
}
async function identity(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const match = /^Bearer ([A-Za-z0-9_-]{40,200})$/.exec(authorization);
  if (!match) return null;
  const hash = await sha256(match[1]);
  return env.DB.prepare(
    "SELECT u.id, u.login, u.avatar_url, s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id " +
    "WHERE s.token_hash=? AND s.expires_at>?"
  ).bind(hash, epoch()).first();
}
async function startAuth(env) {
  if (!configReady(env)) return json({ok:false, code:"OAUTH_NOT_CONFIGURED"}, 503);
  const state = randomToken();
  const verifier = randomToken();
  const challenge = await sha256(verifier);
  await env.DB.prepare("INSERT INTO oauth_states (state_hash,code_verifier,expires_at) VALUES (?,?,?)")
    .bind(await sha256(state), verifier, epoch() + STATE_TTL).run();
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", env.GH_CLIENT_ID);
  url.searchParams.set("redirect_uri", callbackUrl(env));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Escopo intencionalmente omitido: API usa apenas informacoes publicas do perfil.
  return new Response(null, { status: 302, headers: {
    "Location": url.toString(), "Set-Cookie": cookie(state, STATE_TTL),
    "Cache-Control": "no-store", "Referrer-Policy": "no-referrer"
  } });
}
function redirectSite(env, fragment, clear = true) {
  const url = siteUrl(env);
  url.hash = fragment;
  return new Response(null, { status: 302, headers: {
    "Location": url.toString(),
    ...(clear ? { "Set-Cookie": cookie("", 0) } : {}),
    "Referrer-Policy": "no-referrer", "Cache-Control": "no-store"
  } });
}
async function callback(request, env) {
  const query = new URL(request.url).searchParams;
  const state = query.get("state") || "";
  const fromCookie = getCookie(request, COOKIE);
  if (!state || state.length > 150 || !fromCookie || state !== fromCookie) {
    return redirectSite(env, "login_error=invalid_state");
  }
  // Consome o state atomica e unicamente; protege contra replay.
  const record = await env.DB.prepare(
    "DELETE FROM oauth_states WHERE state_hash=? AND expires_at>? RETURNING code_verifier"
  ).bind(await sha256(state), epoch()).first();
  if (!record) return redirectSite(env, "login_error=expired_state");
  if (query.get("error")) return redirectSite(env, "login_error=authorization_denied");
  const code = query.get("code") || "";
  if (!/^[A-Za-z0-9_-]{6,300}$/.test(code)) return redirectSite(env, "login_error=missing_code");
  try {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST", headers: {
        "Accept": "application/json", "Content-Type": "application/json",
        "User-Agent": "conferencia-eleitoral-2026"
      },
      body: JSON.stringify({
        client_id: env.GH_CLIENT_ID, client_secret: env.GH_CLIENT_SECRET,
        code, redirect_uri: callbackUrl(env), code_verifier: record.code_verifier
      })
    });
    if (!response.ok) throw new Error("OAUTH_EXCHANGE_FAILED");
    const payload = await response.json();
    if (!payload.access_token || payload.error) throw new Error("OAUTH_TOKEN_REJECTED");
    const profileResponse = await fetch("https://api.github.com/user", { headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + payload.access_token,
      "User-Agent": "conferencia-eleitoral-2026"
    } });
    if (!profileResponse.ok) throw new Error("GITHUB_USER_FAILED");
    const profile = await profileResponse.json();
    if (!Number.isSafeInteger(profile.id) || profile.id <= 0 ||
        !/^[a-zA-Z0-9-]{1,39}$/.test(profile.login || "")) throw new Error("INVALID_GITHUB_PROFILE");
    // Nao armazenamos o token GitHub nem solicitamos acesso a repositorios.
    let avatar = typeof profile.avatar_url === "string" ? profile.avatar_url : null;
    if (avatar) {
      try { const u = new URL(avatar); if (u.protocol !== "https:" || u.hostname !== "avatars.githubusercontent.com") avatar = null; }
      catch { avatar = null; }
    }
    const now = epoch();
    await env.DB.prepare(
      "INSERT INTO users(id,login,avatar_url,created_at,last_seen) VALUES (?,?,?,?,?) " +
      "ON CONFLICT(id) DO UPDATE SET login=excluded.login, avatar_url=excluded.avatar_url,last_seen=excluded.last_seen"
    ).bind(profile.id, profile.login, avatar, now, now).run();
    const ticket = randomToken();
    await env.DB.prepare("INSERT INTO oauth_tickets(ticket_hash,user_id,expires_at) VALUES(?,?,?)")
      .bind(await sha256(ticket), profile.id, now + TICKET_TTL).run();
    return redirectSite(env, "ticket=" + encodeURIComponent(ticket));
  } catch {
    // Nunca retornamos token, codigo nem segredo do GitHub.
    return redirectSite(env, "login_error=github_unavailable");
  }
}
async function exchange(request, env) {
  if (!authorizedOrigin(request, env)) return error("ORIGIN_FORBIDDEN", 403, request, env);
  let payload;
  try { payload = await readBody(request); }
  catch (err) { return error(err.message, 400, request, env); }
  const ticket = payload && payload.ticket;
  if (typeof ticket !== "string" || !/^[A-Za-z0-9_-]{40,200}$/.test(ticket)) {
    return error("INVALID_TICKET", 400, request, env);
  }
  const row = await env.DB.prepare(
    "DELETE FROM oauth_tickets WHERE ticket_hash=? AND expires_at>? RETURNING user_id"
  ).bind(await sha256(ticket), epoch()).first();
  if (!row) return error("TICKET_EXPIRED_OR_USED", 401, request, env);
  const token = randomToken();
  await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)")
    .bind(await sha256(token), row.user_id, epoch() + SESSION_TTL).run();
  return json({ ok: true, token, expires_in: SESSION_TTL }, 200, corsHeaders(request, env));
}
async function health(env, request) {
  try {
    const r = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name IN " +
      "('users','oauth_states','oauth_tickets','sessions','zones','contributions','section_results')"
    ).first();
    const database = Number(r?.total) === 7;
    return json({ ok: database && configReady(env), database: database ? "OK" : "ERRO",
      tables: Number(r?.total) || 0,
      github_configuration: Boolean(env.GH_CLIENT_ID && env.GH_CLIENT_SECRET) ? "OK" : "ERRO",
      github_login: configReady(env) ? "IMPLEMENTADO" : "CONFIGURACAO_PENDENTE" }, database ? 200 : 503, corsHeaders(request, env));
  } catch {
    return json({ ok: false, database: "ERRO_DE_CONEXAO" }, 503, corsHeaders(request, env));
  }
}
async function zoneRequest(request,env,path){
  const headers=corsHeaders(request,env);
  let zone;
  if(path==="/api/zones/reservation"&&request.method==="GET"){
    const url=new URL(request.url);
    try{zone=validarZona({uf:url.searchParams.get("uf"),municipio:url.searchParams.get("municipio"),zona:url.searchParams.get("zona")});}
    catch{return error("INVALID_ZONE",400,request,env);}
    const auth=request.headers.has("Authorization")?await identity(request,env):null;
    const result=await getLease(env,zone,epoch(),auth?.id||null);
    return json({ok:true,zone:zone.key,...result},200,headers);
  }
  if(request.method!=="POST" || !authorizedOrigin(request,env))return error("ORIGIN_FORBIDDEN",403,request,env);
  const user=await identity(request,env);
  if(!user)return error("UNAUTHORIZED",401,request,env);
  let payload;
  try{payload=await readBody(request,1024);zone=validarZona(payload);}
  catch(e){return error(e.message==="INVALID_ZONE"?"INVALID_ZONE":"INVALID_JSON",400,request,env);}
  const now=epoch();
  if(path==="/api/zones/reserve"){
    try{await ensureValidUnpublishedZone(env,zone,siteUrl(env));}
    catch(e){
      const code=e.message;
      return error(code==="UNKNOWN_ZONE"||code==="ZONE_PUBLISHED"?code:"CATALOG_UNAVAILABLE",
        code==="UNKNOWN_ZONE"?400:code==="ZONE_PUBLISHED"?409:503,request,env);
    }
    const result=await reserveZone(env,zone,user,now);
    return json({zone:zone.key,...result},result.ok?201:409,headers);
  }
  if(path==="/api/zones/release"){
    const ok=await releaseZone(env,zone,user,now);
    return ok?json({ok:true,status:"available",zone:zone.key},200,headers):error("NOT_OWNER_OR_EXPIRED",409,request,env);
  }
  if(path==="/api/zones/submit"){
    const myZone=await env.DB.prepare(
      "SELECT zone_key FROM zone_reservations WHERE zone_key=? AND user_id=? AND status='reserved' AND expires_at>?"
    ).bind(zone.key,user.id,now).first();
    if(!myZone)return error("RESERVATION_NOT_ACTIVE",409,request,env);
    const pr=Number(payload.pr_number);
    try{await verifyPullRequest(zone,user,pr);}
    catch(e){
      const c=e.message;
      return error(c,c==="PR_NOT_FOUND"?404:c==="PR_FILES_UNAVAILABLE"?503:400,request,env);
    }
    const ok=await submitZone(env,zone,user,epoch(),pr);
    return ok?json({ok:true,status:"submitted",zone:zone.key,pr_number:pr},200,headers)
      :error("RESERVATION_EXPIRED",409,request,env);
  }
  return error("NOT_FOUND",404,request,env);
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method === "OPTIONS") {
      return authorizedOrigin(request, env)
        ? new Response(null, {status: 204, headers: corsHeaders(request, env)})
        : error("ORIGIN_FORBIDDEN", 403, request, env);
    }
    try {
      if (path === "/api/health" && request.method === "GET") return await health(env, request);
      if (path === "/api/zones/reservation" || path === "/api/zones/reserve" ||
          path === "/api/zones/release" || path === "/api/zones/submit")
        return await zoneRequest(request,env,path);
      if (path === "/api/auth/github" && request.method === "GET") return await startAuth(env);
      if (path === "/api/auth/callback" && request.method === "GET") return await callback(request, env);
      if (path === "/api/auth/ticket" && request.method === "POST") return await exchange(request, env);
      if (path === "/api/me" && request.method === "GET") {
        const user = await identity(request, env);
        return user ? json({ ok: true, user: { id: user.id, login: user.login, avatar_url: user.avatar_url } },
          200, corsHeaders(request, env)) : error("UNAUTHORIZED", 401, request, env);
      }
      if (path === "/api/logout" && request.method === "POST") {
        if (!authorizedOrigin(request, env)) return error("ORIGIN_FORBIDDEN", 403, request, env);
        const authorization = request.headers.get("Authorization") || "";
        const match = /^Bearer ([A-Za-z0-9_-]{40,200})$/.exec(authorization);
        if (!match) return error("UNAUTHORIZED", 401, request, env);
        await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
          .bind(await sha256(match[1])).run();
        return json({ ok: true }, 200, corsHeaders(request, env));
      }
      return error("NOT_FOUND", 404, request, env);
    } catch {
      return error("INTERNAL_ERROR", 500, request, env);
    }
  }
};
