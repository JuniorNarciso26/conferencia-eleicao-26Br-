// Validacao dos pacotes de 2026 e API D1 com revisao explicita.
import {validarZona,ensureValidUnpublishedZone} from "./reservas.js";

const FIELDS=["aptos","comparecimento","comparecimento_bu","habilitados_biometria",
 "habilitados_biografia","comp_sem_biometria","flavio","lula","outros",
 "brancos","nulos","nulos_tecnicos"];
const VOTES=["flavio","lula","outros","brancos","nulos","nulos_tecnicos"];
const MAX_SECTIONS=2000,CHUNK_SIZE=20;

function invalid(message="INVALID_PACKAGE"){throw Error(message);}
function isPlainObject(v){return v!==null&&typeof v==="object"&&!Array.isArray(v);}
function identityMatches(meta,zone){
  return isPlainObject(meta)&&meta.uf===zone.uf&&String(meta.codigo_municipio??meta.municipio)===zone.municipio&&
    String(meta.zona).padStart(4,"0")===zone.zona;
}
export function validTurn(turn){
  if(!isPlainObject(turn)||FIELDS.some(k=>!Number.isSafeInteger(turn[k])||turn[k]<0))invalid("INVALID_TOTALS");
  if(turn.comparecimento>turn.aptos||VOTES.reduce((n,k)=>n+turn[k],0)!==turn.comparecimento)
    invalid("VOTE_SUM_MISMATCH");
}
export function validSection(section,zone){
  if(!isPlainObject(section)||!identityMatches(section.meta,zone)||
     !/^[0-9]{4}$/.test(String(section.meta.secao||"")))invalid("INVALID_SECTION");
  if(!isPlainObject(section.turnos))invalid("INVALID_SECTION");
  for(const turn of ["1","2"])validTurn(section.turnos[turn]);
  const raw=JSON.stringify(section);
  if(raw.length>7000)invalid("SECTION_TOO_LARGE");
  return {secao:section.meta.secao,raw};
}
export function validHeader(payload,zone){
  if(!isPlainObject(payload)||!isPlainObject(payload.meta)||
    !identityMatches(payload.meta,zone)||payload.meta.cobertura_completa!==true||
    !Number.isSafeInteger(payload.meta.total_secoes)||
    payload.meta.total_secoes<1||payload.meta.total_secoes>MAX_SECTIONS)invalid("INVALID_PACKAGE");
  const summary=payload.resumo;
  if(!isPlainObject(summary)||!identityMatches(summary.meta,zone)||
     summary.meta.secao!=="RESUMO"||!isPlainObject(summary.turnos))invalid("INVALID_SUMMARY");
  for(const turn of ["1","2"])validTurn(summary.turnos[turn]);
  if(JSON.stringify(summary).length>7500||JSON.stringify(payload.meta).length>2000)
    invalid("INVALID_PACKAGE");
  const hash=payload.sha256||null;
  if(hash!==null&&!/^[a-f0-9]{64}$/.test(hash))invalid("INVALID_HASH");
  return {total:payload.meta.total_secoes,meta:JSON.stringify(payload.meta),
    summary:JSON.stringify(summary),sha256:hash};
}
function normalizeId(value){
  if(typeof value!=="string"||!/^[a-f0-9]{32}$/.test(value))invalid("INVALID_UPLOAD_ID");
  return value;
}
function newId(){
  const b=new Uint8Array(16);crypto.getRandomValues(b);
  return [...b].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function authorized(row,user,now){
  return row&&row.contributor_id===user.id&&row.state==="uploading" &&
   row.lease_user_id===user.id&&row.lease_status==="reserved"&&row.lease_expires_at>now;
}
async function uploading(env,id,user,now){
  const row=await env.DB.prepare(
    "SELECT u.*,r.user_id lease_user_id,r.status lease_status,r.expires_at lease_expires_at "+
    "FROM zone_uploads u LEFT JOIN zone_reservations r ON u.zone_key=r.zone_key "+
    "WHERE u.upload_id=?"
  ).bind(id).first();
  if(!authorized(row,user,now))invalid("UPLOAD_NOT_ACTIVE");
  return row;
}
function totalsSQL(){
  const cols=["COUNT(*) AS qty"];
  for(const t of ["1","2"])for(const f of FIELDS){
    cols.push("SUM(CAST(json_extract(section_json,'$.turnos.\"" +t+"\"."+f+"') AS INTEGER)) AS t"+t+"_"+f);
  }
  return "SELECT "+cols.join(",")+" FROM zone_upload_sections WHERE upload_id=?";
}
export async function beginUpload(env,zone,user,body,now,siteBase){
  const header=validHeader(body,zone);
  const own=await env.DB.prepare(
    "SELECT user_id,status,expires_at,reserved_at FROM zone_reservations WHERE zone_key=?"
  ).bind(zone.key).first();
  if(!own||own.user_id!==user.id||own.status!=="reserved"||own.expires_at<=now)invalid("RESERVATION_NOT_ACTIVE");
  // Confere contra o catalogo TSE oficial e pacotes estaticos ja publicados.
  const cityName=await ensureValidUnpublishedZone(env,zone,siteBase);
  // Um upload abandonado por outra reserva nao bloqueia o novo proprietario.
  await env.DB.prepare("DELETE FROM zone_upload_sections WHERE upload_id IN "+
    "(SELECT upload_id FROM zone_uploads WHERE zone_key=? AND state='uploading' AND created_at<?)")
    .bind(zone.key,own.reserved_at).run();
  await env.DB.prepare("DELETE FROM zone_uploads WHERE zone_key=? AND state='uploading' AND created_at<?")
    .bind(zone.key,own.reserved_at).run();
  const existing=await env.DB.prepare(
    "SELECT upload_id,contributor_id,state,expected_sections,meta_json,summary_json FROM zone_uploads "+
    "WHERE zone_key=? AND state IN ('uploading','pending_review','published')"
  ).bind(zone.key).first();
  if(existing&&existing.state!=="uploading")invalid("ALREADY_SUBMITTED");
  if(existing&&existing.contributor_id===user.id&&existing.meta_json===header.meta&&
    existing.summary_json===header.summary&&existing.expected_sections===header.total){
    return {upload_id:existing.upload_id,sections:header.total,resumed:true};
  }
  if(existing)invalid("UPLOAD_EXISTS");
  const id=newId();
  const created=await env.DB.prepare(
    "INSERT OR IGNORE INTO zone_uploads "+
    "(upload_id,zone_key,uf,municipio,zona,municipio_nome,contributor_id,contributor_login,state,"+
    "expected_sections,meta_json,summary_json,declared_file_sha256,created_at) "+
    "VALUES (?,?,?,?,?,?,?,?,'uploading',?,?,?,?,?) RETURNING upload_id"
  ).bind(id,zone.key,zone.uf,zone.municipio,zone.zona,cityName,user.id,user.login,
    header.total,header.meta,header.summary,header.sha256,now).first();
  if(!created)invalid("UPLOAD_EXISTS");
  return {upload_id:id,sections:header.total,resumed:false};
}
export async function uploadChunk(env,body,user,now){
  const id=normalizeId(body?.upload_id);
  const row=await uploading(env,id,user,now);
  if(!Array.isArray(body.secoes)||body.secoes.length<1||body.secoes.length>CHUNK_SIZE)
    invalid("INVALID_CHUNK");
  const zone=validarZona({uf:row.uf,municipio:row.municipio,zona:row.zona});
  const keys=new Set();
  const statements=[];
  for(const section of body.secoes){
    const {secao,raw}=validSection(section,zone);
    if(keys.has(secao))invalid("DUPLICATE_SECTION");
    keys.add(secao);
    statements.push(env.DB.prepare(
      "INSERT INTO zone_upload_sections(upload_id,secao,section_json) "+
      "SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM zone_uploads u "+
      "JOIN zone_reservations r ON r.zone_key=u.zone_key "+
      "WHERE u.upload_id=? AND u.state='uploading' AND u.contributor_id=? "+
      "AND r.user_id=? AND r.status='reserved' AND r.expires_at>?) "+
      "ON CONFLICT(upload_id,secao) DO UPDATE SET section_json=excluded.section_json"
    ).bind(id,secao,raw,id,user.id,user.id,now));
  }
  await env.DB.batch(statements);
  const result=await env.DB.prepare(
    "SELECT COUNT(*) AS qty FROM zone_upload_sections WHERE upload_id=?"
  ).bind(id).first();
  return {upload_id:id,received:result.qty,expected:row.expected_sections};
}
export async function finishUpload(env,body,user,now){
  const id=normalizeId(body?.upload_id);
  const row=await uploading(env,id,user,now);
  const totals=await env.DB.prepare(totalsSQL()).bind(id).first();
  if(Number(totals.qty)!==row.expected_sections)invalid("INCOMPLETE_UPLOAD");
  const summary=JSON.parse(row.summary_json);
  for(const t of ["1","2"])for(const f of FIELDS){
    if(Number(totals["t"+t+"_"+f])!==summary.turnos[t][f])invalid("AGGREGATE_MISMATCH");
  }
  // Transacao: reserva so passa a enviada se o upload tambem for finalizado.
  const tx=await env.DB.batch([
    env.DB.prepare("UPDATE zone_uploads SET state='pending_review',submitted_at=? "+
      "WHERE upload_id=? AND state='uploading' AND EXISTS "+
      "(SELECT 1 FROM zone_reservations WHERE zone_key=zone_uploads.zone_key AND user_id=? AND "+
      "status='reserved' AND expires_at>?) RETURNING upload_id").bind(now,id,user.id,now),
    env.DB.prepare("UPDATE zone_reservations SET status='submitted',submitted_at=? "+
      "WHERE zone_key=? AND user_id=? AND status='reserved' AND expires_at>? RETURNING zone_key")
      .bind(now,row.zone_key,user.id,now)
  ]);
  if(!tx[0].results?.length||!tx[1].results?.length)invalid("RESERVATION_EXPIRED");
  return {upload_id:id,state:"pending_review",sections:row.expected_sections};
}
async function reconstruct(env,row){
  const sections=await env.DB.prepare(
    "SELECT section_json FROM zone_upload_sections WHERE upload_id=? ORDER BY secao"
  ).bind(row.upload_id).all();
  if(sections.results.length!==row.expected_sections)invalid("INCOMPLETE_UPLOAD");
  return {meta:JSON.parse(row.meta_json),resumo:JSON.parse(row.summary_json),
    secoes:sections.results.map(x=>JSON.parse(x.section_json))};
}
export async function publishedZones(env){
  const result=await env.DB.prepare(
    "SELECT uf,municipio,zona,municipio_nome,expected_sections FROM zone_uploads "+
    "WHERE state='published' ORDER BY uf,municipio,zona"
  ).all();
  return result.results.map(r=>({uf:r.uf,municipio_codigo:r.municipio,municipio_nome:r.municipio_nome,
    zona:r.zona,total_secoes:r.expected_sections,fonte:"d1"}));
}
export async function publishedZone(env,zone){
  const row=await env.DB.prepare(
    "SELECT upload_id,expected_sections,meta_json,summary_json FROM zone_uploads "+
    "WHERE zone_key=? AND state='published'"
  ).bind(zone.key).first();
  if(!row)invalid("ZONE_NOT_PUBLISHED");
  return reconstruct(env,row);
}
export function isAdmin(env,user){
  const ids=String(env.ADMIN_GITHUB_IDS||"").split(",").map(x=>x.trim()).filter(Boolean);
  return Boolean(user&&ids.includes(String(user.id)));
}
export async function pendingReviews(env){
  const rows=await env.DB.prepare(
    "SELECT upload_id,zone_key,contributor_login,expected_sections,submitted_at FROM zone_uploads "+
    "WHERE state='pending_review' ORDER BY submitted_at ASC LIMIT 100"
  ).all();
  return rows.results;
}
export async function reviewPacket(env,id){
  const normalized=normalizeId(id);
  const row=await env.DB.prepare("SELECT * FROM zone_uploads WHERE upload_id=? AND state='pending_review'")
    .bind(normalized).first();
  if(!row)invalid("NOT_PENDING");
  return {upload_id:normalized,contributor:row.contributor_login,zone:row.zone_key,
    packet:await reconstruct(env,row)};
}
export async function reviewDecision(env,body,user,now){
  const id=normalizeId(body?.upload_id);
  if(!["approve","reject"].includes(body?.decision))invalid("INVALID_DECISION");
  const reason=typeof body.reason==="string"?body.reason.trim().slice(0,500):"";
  if(body.decision==="reject"&&reason.length<5)invalid("REVIEW_REASON_REQUIRED");
  const row=await env.DB.prepare(
    "SELECT zone_key,state FROM zone_uploads WHERE upload_id=?"
  ).bind(id).first();
  if(!row||row.state!=="pending_review")invalid("NOT_PENDING");
  const accepted=body.decision==="approve",newStatus=accepted?"published":"rejected";
  const batch=await env.DB.batch([
    env.DB.prepare("UPDATE zone_uploads SET state=?,reviewer_id=?,reviewed_at=?,review_reason=? "+
      "WHERE upload_id=? AND state='pending_review' RETURNING upload_id")
      .bind(newStatus,user.id,now,reason,id),
    // Rejeicao devolve a zona; aprovacao mantem a reserva historica como submitted.
    env.DB.prepare("DELETE FROM zone_reservations WHERE zone_key=? AND status='submitted' "+
      "AND ?='rejected' RETURNING zone_key").bind(row.zone_key,newStatus)
  ]);
  if(!batch[0].results?.length)invalid("NOT_PENDING");
  return {upload_id:id,state:newStatus};
}
export const UPLOAD_MAX_CHUNK=CHUNK_SIZE;
