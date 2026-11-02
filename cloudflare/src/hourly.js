// Contagens horárias anônimas: upload, conferência contra BUs, revisão e leitura pública.
import {validarZona} from "./reservas.js";
import {isAdmin} from "./upload.js";

const MAX_SECTIONS=2000,CHUNK_SIZE=20,UPLOAD_TTL=24*60*60;
const invalid=code=>{throw Error(code);};
const id=value=>typeof value==="string"&&/^[a-f0-9]{32}$/.test(value)?value:invalid("INVALID_UPLOAD_ID");
function newId(){
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
  return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("");
}

export function validHours(item){
  if(!item||typeof item!=="object"||Array.isArray(item)||
     !/^[0-9]{4}$/.test(item.secao)||!item.turnos||
     typeof item.turnos!=="object"||Array.isArray(item.turnos)||
     Object.keys(item.turnos).sort().join(",")!=="1,2")invalid("INVALID_HOURS");
  const totals={};
  for(const turno of ["1","2"]){
    const horas=item.turnos[turno];
    if(!Array.isArray(horas)||horas.length!==24||
       horas.some(x=>!Number.isSafeInteger(x)||x<0))invalid("INVALID_HOURS");
    totals[turno]=horas.reduce((a,b)=>a+b,0);
    if(!Number.isSafeInteger(totals[turno]))invalid("INVALID_HOURS");
  }
  return {secao:item.secao,raw:JSON.stringify(item.turnos),totals};
}

async function resultZone(env,zone){
  const row=await env.DB.prepare("SELECT upload_id,expected_sections,summary_json,contributor_id "+
    "FROM zone_uploads WHERE zone_key=? AND state='published'").bind(zone.key).first();
  if(!row)invalid("ZONE_NOT_PUBLISHED");
  return row;
}

async function active(env,uploadId,user,now){
  const row=await env.DB.prepare("SELECT * FROM zone_hourly_uploads WHERE upload_id=?")
    .bind(id(uploadId)).first();
  if(!row||row.state!=="uploading"||row.contributor_id!==user.id||
     row.created_at+UPLOAD_TTL<=now)invalid("HOURLY_UPLOAD_NOT_ACTIVE");
  return row;
}

export async function beginHourly(env,zone,user,body,now){
  const results=await resultZone(env,zone);
  if(user.id!==results.contributor_id&&!isAdmin(env,user))invalid("FORBIDDEN");
  if(!/^[a-f0-9]{64}$/.test(body?.sha256||""))invalid("INVALID_HASH");
  if(!Number.isSafeInteger(results.expected_sections)||results.expected_sections<1||
     results.expected_sections>MAX_SECTIONS)invalid("INVALID_PACKAGE");
  const stale=await env.DB.prepare("SELECT upload_id FROM zone_hourly_uploads WHERE zone_key=? "+
    "AND state='uploading' AND created_at<=?").bind(zone.key,now-UPLOAD_TTL).first();
  if(stale){
    await env.DB.batch([
      env.DB.prepare("DELETE FROM zone_hourly_sections WHERE upload_id=?").bind(stale.upload_id),
      env.DB.prepare("DELETE FROM zone_hourly_uploads WHERE upload_id=? AND state='uploading'").bind(stale.upload_id)
    ]);
  }
  const existing=await env.DB.prepare("SELECT upload_id,contributor_id,state,results_upload_id,declared_csv_sha256 "+
    "FROM zone_hourly_uploads WHERE zone_key=? AND state IN ('uploading','pending_review','published')")
    .bind(zone.key).first();
  if(existing?.state==="uploading"&&existing.contributor_id===user.id&&
     existing.results_upload_id===results.upload_id&&existing.declared_csv_sha256===body.sha256)
    return {upload_id:existing.upload_id,sections:results.expected_sections,resumed:true};
  if(existing)invalid("HOURLY_UPLOAD_EXISTS");
  const uploadId=newId();
  const added=await env.DB.prepare("INSERT OR IGNORE INTO zone_hourly_uploads "+
    "(upload_id,zone_key,results_upload_id,contributor_id,contributor_login,state,"+
    "expected_sections,declared_csv_sha256,created_at) VALUES (?,?,?,?,?,'uploading',?,?,?) "+
    "RETURNING upload_id").bind(uploadId,zone.key,results.upload_id,user.id,user.login,
      results.expected_sections,body.sha256,now).first();
  if(!added)invalid("HOURLY_UPLOAD_EXISTS");
  return {upload_id:uploadId,sections:results.expected_sections,resumed:false};
}

export async function hourlyChunk(env,body,user,now){
  const row=await active(env,body?.upload_id,user,now);
  if(!Array.isArray(body?.secoes)||body.secoes.length<1||body.secoes.length>CHUNK_SIZE)
    invalid("INVALID_CHUNK");
  const seen=new Set(),statements=[];
  for(const item of body.secoes){
    const {secao,raw}=validHours(item);
    if(seen.has(secao))invalid("DUPLICATE_SECTION");
    seen.add(secao);
    statements.push(env.DB.prepare("INSERT INTO zone_hourly_sections(upload_id,secao,hours_json) "+
      "SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM zone_hourly_uploads "+
      "WHERE upload_id=? AND contributor_id=? AND state='uploading' AND created_at>?) "+
      "ON CONFLICT(upload_id,secao) DO UPDATE SET hours_json=excluded.hours_json")
      .bind(row.upload_id,secao,raw,row.upload_id,user.id,now-UPLOAD_TTL));
  }
  await env.DB.batch(statements);
  const qty=await env.DB.prepare("SELECT COUNT(*) AS n FROM zone_hourly_sections WHERE upload_id=?")
    .bind(row.upload_id).first();
  return {upload_id:row.upload_id,received:qty.n,expected:row.expected_sections};
}

export async function finishHourly(env,body,user,now){
  const row=await active(env,body?.upload_id,user,now);
  const result=await env.DB.prepare("SELECT h.secao,h.hours_json,s.section_json FROM zone_hourly_sections h "+
    "LEFT JOIN zone_upload_sections s ON s.upload_id=? AND s.secao=h.secao "+
    "WHERE h.upload_id=? ORDER BY h.secao").bind(row.results_upload_id,row.upload_id).all();
  if(result.results.length!==row.expected_sections)invalid("INCOMPLETE_UPLOAD");
  const total={"1":0,"2":0};
  for(const item of result.results){
    if(!item.section_json)invalid("SECTION_NOT_IN_RESULTS");
    const hours=validHours({secao:item.secao,turnos:JSON.parse(item.hours_json)});
    const section=JSON.parse(item.section_json);
    for(const turno of ["1","2"]){
      if(hours.totals[turno]!==section.turnos?.[turno]?.comparecimento)
        invalid("HOURLY_TOTAL_MISMATCH");
      total[turno]+=hours.totals[turno];
    }
  }
  const summary=JSON.parse((await env.DB.prepare("SELECT summary_json FROM zone_uploads "+
    "WHERE upload_id=? AND state='published'").bind(row.results_upload_id).first())?.summary_json||"null");
  if(!summary||total["1"]!==summary.turnos?.["1"]?.comparecimento||
     total["2"]!==summary.turnos?.["2"]?.comparecimento)invalid("HOURLY_TOTAL_MISMATCH");
  const changed=await env.DB.prepare("UPDATE zone_hourly_uploads SET state='pending_review',submitted_at=? "+
    "WHERE upload_id=? AND state='uploading' AND contributor_id=? AND created_at>? "+
    "RETURNING upload_id").bind(now,row.upload_id,user.id,now-UPLOAD_TTL).first();
  if(!changed)invalid("HOURLY_UPLOAD_NOT_ACTIVE");
  return {upload_id:row.upload_id,state:"pending_review",sections:row.expected_sections,totals:total};
}

export async function publishedHourlyZones(env){
  const rows=await env.DB.prepare("SELECT z.uf,z.municipio,z.zona,z.municipio_nome,h.expected_sections "+
    "FROM zone_hourly_uploads h JOIN zone_uploads z ON z.upload_id=h.results_upload_id "+
    "WHERE h.state='published' AND z.state='published' ORDER BY z.uf,z.municipio,z.zona").all();
  return rows.results.map(x=>({uf:x.uf,municipio_codigo:x.municipio,zona:x.zona,
    municipio_nome:x.municipio_nome,total_secoes:x.expected_sections}));
}

export async function publishedHourlyZone(env,zone){
  const row=await env.DB.prepare("SELECT h.upload_id,h.expected_sections FROM zone_hourly_uploads h "+
    "JOIN zone_uploads z ON z.upload_id=h.results_upload_id "+
    "WHERE h.zone_key=? AND h.state='published' AND z.state='published'").bind(zone.key).first();
  if(!row)invalid("ZONE_NOT_PUBLISHED");
  const items=await env.DB.prepare("SELECT secao,hours_json FROM zone_hourly_sections "+
    "WHERE upload_id=? ORDER BY secao").bind(row.upload_id).all();
  if(items.results.length!==row.expected_sections)invalid("INCOMPLETE_UPLOAD");
  return {meta:{uf:zone.uf,municipio:zone.municipio,zona:zone.zona,total_secoes:row.expected_sections},
    secoes:items.results.map(x=>({secao:x.secao,turnos:JSON.parse(x.hours_json)}))};
}

export async function pendingHourlyReviews(env){
  const rows=await env.DB.prepare("SELECT upload_id,zone_key,contributor_login,expected_sections,submitted_at "+
    "FROM zone_hourly_uploads WHERE state='pending_review' ORDER BY submitted_at LIMIT 100").all();
  return rows.results;
}

export async function hourlyReviewPacket(env,uploadId){
  const row=await env.DB.prepare("SELECT upload_id,zone_key,contributor_login,expected_sections "+
    "FROM zone_hourly_uploads WHERE upload_id=? AND state='pending_review'").bind(id(uploadId)).first();
  if(!row)invalid("NOT_PENDING");
  const items=await env.DB.prepare("SELECT secao,hours_json FROM zone_hourly_sections "+
    "WHERE upload_id=? ORDER BY secao").bind(row.upload_id).all();
  if(items.results.length!==row.expected_sections)invalid("INCOMPLETE_UPLOAD");
  return {upload_id:row.upload_id,zone:row.zone_key,contributor:row.contributor_login,
    sections:items.results.map(x=>({secao:x.secao,turnos:JSON.parse(x.hours_json)}))};
}

export async function hourlyReviewDecision(env,body,user,now){
  const uploadId=id(body?.upload_id);
  if(!["approve","reject"].includes(body?.decision))invalid("INVALID_DECISION");
  const reason=typeof body.reason==="string"?body.reason.trim().slice(0,500):"";
  if(body.decision==="reject"&&reason.length<5)invalid("REVIEW_REASON_REQUIRED");
  const state=body.decision==="approve"?"published":"rejected";
  const updated=await env.DB.prepare("UPDATE zone_hourly_uploads SET state=?,reviewer_id=?,"+
    "reviewer_login=?,reviewed_at=?,review_reason=? WHERE upload_id=? AND state='pending_review' "+
    "AND EXISTS (SELECT 1 FROM zone_uploads WHERE upload_id=results_upload_id AND state='published') "+
    "RETURNING upload_id").bind(state,user.id,user.login,now,reason,uploadId).first();
  if(!updated)invalid("NOT_PENDING");
  return {upload_id:uploadId,state};
}
