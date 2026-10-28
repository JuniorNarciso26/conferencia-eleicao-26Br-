import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker from "../src/worker.js";

globalThis.crypto ??= webcrypto;
const site = "https://juniornarciso26.github.io/conferencia-eleicao-26Br-/";
const api = "https://conferencia-eleitoral-api.junior-ab2.workers.dev";
const envBase = {
  GH_CLIENT_ID: "test-client-id",
  GH_CLIENT_SECRET: "test-secret",
  SITE_URL: site,
  API_ORIGIN: api
};

function memoryDB() {
  const states = new Map(), tickets = new Map(), sessions = new Map(), users = new Map();
  return {
    users, states, tickets, sessions,
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async run() {
          if (sql.startsWith("INSERT INTO oauth_states")) states.set(values[0], { code_verifier: values[1], expires_at: values[2] });
          else if (sql.startsWith("INSERT INTO users")) users.set(values[0], {
            id: values[0], login: values[1], avatar_url: values[2] });
          else if (sql.startsWith("INSERT INTO oauth_tickets")) tickets.set(values[0], { user_id: values[1], expires_at: values[2] });
          else if (sql.startsWith("INSERT INTO sessions")) sessions.set(values[0], { user_id: values[1], expires_at: values[2] });
          else if (sql.startsWith("DELETE FROM sessions")) sessions.delete(values[0]);
          else throw Error("Unexpected SQL run: " + sql);
          return { success: true };
        },
        async first() {
          if (sql.startsWith("SELECT COUNT(*) AS total")) return { total: 7 };
          if (sql.startsWith("DELETE FROM oauth_states")) {
            const row = states.get(values[0]);
            if (!row || row.expires_at <= values[1]) return null;
            states.delete(values[0]); return row;
          }
          if (sql.startsWith("DELETE FROM oauth_tickets")) {
            const row = tickets.get(values[0]);
            if (!row || row.expires_at <= values[1]) return null;
            tickets.delete(values[0]); return row;
          }
          if (sql.startsWith("SELECT u.id, u.login")) {
            const row = sessions.get(values[0]);
            if (!row || row.expires_at <= values[1]) return null;
            const user = users.get(row.user_id);
            return user ? { ...user, expires_at: row.expires_at } : null;
          }
          throw Error("Unexpected SQL first: " + sql);
        }
      };
    }
  };
}
function request(path, options = {}) { return new Request(api + path, options); }
function origin() { return { Origin: new URL(site).origin }; }

test("health reports configured database without exposing credentials", async () => {
  const res = await worker.fetch(request("/api/health"), { ...envBase, DB: memoryDB() });
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.github_login, "IMPLEMENTADO");
  assert.equal(out.tables, 7);
  assert.ok(!JSON.stringify(out).includes(envBase.GH_CLIENT_SECRET));
});

test("OAuth PKCE -> GitHub -> one-use ticket -> user registration -> logout", async () => {
  const db = memoryDB(), env = { ...envBase, DB: db };
  const start = await worker.fetch(request("/api/auth/github"), env);
  assert.equal(start.status, 302);
  const target = new URL(start.headers.get("location"));
  assert.equal(target.hostname, "github.com");
  assert.equal(target.searchParams.get("code_challenge_method"), "S256");
  assert.equal(target.searchParams.get("redirect_uri"), api + "/api/auth/callback");
  const state = target.searchParams.get("state");
  const cookie = start.headers.get("set-cookie").split(";")[0];
  assert.ok(cookie.includes(state));
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("oauth/access_token")) return Response.json({ access_token: "gho-test" });
    if (url.includes("api.github.com/user")) return Response.json({
      id: 123456, login: "colaborador-1",
      avatar_url: "https://avatars.githubusercontent.com/u/123456"
    });
    throw Error("Unexpected network call");
  };
  let callback;
  try {
    callback = await worker.fetch(request("/api/auth/callback?state=" +
      encodeURIComponent(state) + "&code=code-123456", { headers: { Cookie: cookie } }), env);
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(callback.status, 302);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.body.includes("code_verifier"), true);
  const destination = new URL(callback.headers.get("location"));
  assert.equal(destination.origin, new URL(site).origin);
  assert.equal(destination.pathname, new URL(site).pathname);
  const ticket = new URLSearchParams(destination.hash.slice(1)).get("ticket");
  assert.ok(ticket);
  assert.equal(db.users.get(123456).login, "colaborador-1");
  const headers = { ...origin(), "Content-Type": "application/json" };
  const res = await worker.fetch(request("/api/auth/ticket", {
    method: "POST", headers, body: JSON.stringify({ ticket })
  }), env);
  assert.equal(res.status, 200);
  const { token } = await res.json();
  assert.ok(token);
  const replay = await worker.fetch(request("/api/auth/ticket", {
    method: "POST", headers, body: JSON.stringify({ ticket })
  }), env);
  assert.equal(replay.status, 401);
  const profile = await worker.fetch(request("/api/me", {
    headers: { Authorization: "Bearer " + token }
  }), env);
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).user.login, "colaborador-1");
  const logout = await worker.fetch(request("/api/logout", {
    method: "POST", headers: { ...origin(), Authorization: "Bearer " + token }
  }), env);
  assert.equal(logout.status, 200);
  assert.equal((await worker.fetch(request("/api/me", {
    headers: { Authorization: "Bearer " + token }
  }), env)).status, 401);
});

test("rejects wrong state and cross-origin ticket exchange", async () => {
  const env = { ...envBase, DB: memoryDB() };
  const start = await worker.fetch(request("/api/auth/github"), env);
  const state = new URL(start.headers.get("location")).searchParams.get("state");
  const invalid = await worker.fetch(request("/api/auth/callback?state=" + state +
    "&code=code-123456", { headers: { Cookie: "ce_oauth_state=invalid" } }), env);
  assert.equal(new URL(invalid.headers.get("location")).hash, "#login_error=invalid_state");
  const foreign = await worker.fetch(request("/api/auth/ticket", {
    method: "POST",
    headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
    body: JSON.stringify({ ticket: "abc" })
  }), env);
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.has("access-control-allow-origin"), false);
});
