// Exclusividade via PK(zone_key) e indice de usuario, 24 horas UTC.
const TTL=24*60*60;
const UFS=new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));
const REPO="JuniorNarciso26/conferencia-eleicao-26Br-";
export function validarZona(value) {
  const uf=String(value?.uf??"").trim().toUpperCase();
  const municipio=String(value?.municipio??"").trim();
  const zona=String(value?.zona??"").trim();
  if(!UFS.has(uf)||!/^[0-9]{5}$/.test(municipio)||!/^[0-9]{4}$/.test(zona)||+zona<=0)throw Error("INVALID_ZONE");
  return {uf,municipio,zona,key:uf+"-"+municipio+"-"+zona};
}
function sanitized(row,now,viewerId=null) {
  if(!row||(row.status==="reserved"&&row.expires_at<=now))return {status:"available"};
  return {status:row.status,mine:row.user_id===viewerId,contributor:row.contributor_login,reserved_at:row.reserved_at,
    expires_at:row.expires_at,pr_number:row.pr_number||null,submitted_at:row.submitted_at||null};
}
export async function getLease(env,zone,now,viewerId=null){
  const row=await env.DB.prepare("SELECT user_id,contributor_login,status,reserved_at,expires_at,pr_number,submitted_at FROM zone_reservations WHERE zone_key=?").bind(zone.key).first();
  return sanitized(row,now,viewerId);
}
export async function ensureValidUnpublishedZone(env,zone,siteBase,fetchImpl=fetch){
  const [l,c]=await Promise.all([
    fetchImpl(new URL("dados/localidades_2026.json",siteBase).toString(),{cache:"no-store"}),
    fetchImpl(new URL("dados/catalogo.json",siteBase).toString(),{cache:"no-store"})
  ]);
  if(!l.ok||!c.ok)throw Error("CATALOG_UNAVAILABLE");
  const [loc,cat]=await Promise.all([l.json(),c.json()]);
  const city=loc?.ufs?.[zone.uf]?.find(m=>m.codigo===zone.municipio);
  if(loc?.eleicao!==2026||!city||!Array.isArray(city.zonas)||!city.zonas.includes(zone.zona))throw Error("UNKNOWN_ZONE");
  if(!Array.isArray(cat?.zonas))throw Error("CATALOG_UNAVAILABLE");
  if(cat.zonas.some(x=>x.uf===zone.uf&&x.municipio_codigo===zone.municipio&&String(x.zona).padStart(4,"0")===zone.zona))
    throw Error("ZONE_PUBLISHED");
}
export async function reserveZone(env,zone,user,now) {
  // Expiracao logica imediata. Limpeza so no momento de reservar.
  await env.DB.prepare("DELETE FROM zone_reservations WHERE status='reserved' AND expires_at<=?").bind(now).run();
  const created=await env.DB.prepare(
    "INSERT OR IGNORE INTO zone_reservations (zone_key,uf,municipio,zona,user_id,contributor_login,status,reserved_at,expires_at) "+
    "VALUES (?,?,?,?,?,?,'reserved',?,?) RETURNING contributor_login,status,reserved_at,expires_at,pr_number,submitted_at")
    .bind(zone.key,zone.uf,zone.municipio,zone.zona,user.id,user.login,now,now+TTL).first();
  if(created)return {ok:true,...sanitized(created,now)};
  const current=await getLease(env,zone,now);
  if(current.status!=="available")return {ok:false,code:"ZONE_UNAVAILABLE",...current};
  const mine=await env.DB.prepare("SELECT zone_key FROM zone_reservations WHERE user_id=? AND status='reserved' AND expires_at>?")
    .bind(user.id,now).first();
  return {ok:false,code:mine?"ALREADY_HAS_ACTIVE_ZONE":"RESERVATION_CONFLICT",zone:mine?.zone_key||null};
}
export async function releaseZone(env,zone,user,now){
  const removed=await env.DB.prepare(
    "DELETE FROM zone_reservations WHERE zone_key=? AND user_id=? AND status='reserved' AND expires_at>? RETURNING zone_key")
    .bind(zone.key,user.id,now).first();
  return Boolean(removed);
}
export async function verifyPullRequest(zone,user,prNumber,fetchImpl=fetch){
  if(!Number.isSafeInteger(prNumber)||prNumber<1||prNumber>100000000)throw Error("INVALID_PR");
  const headers={"Accept":"application/vnd.github+json","User-Agent":"conferencia-eleitoral-2026"};
  const base="https://api.github.com/repos/"+REPO+"/pulls/"+prNumber;
  const res=await fetchImpl(base,{headers});
  if(!res.ok)throw Error("PR_NOT_FOUND");
  const pr=await res.json();
  if(pr.state!=="open"||pr.base?.ref!=="main"||pr.user?.id!==user.id)throw Error("PR_NOT_ELIGIBLE");
  const filesRes=await fetchImpl(base+"/files?per_page=100",{headers});
  if(!filesRes.ok)throw Error("PR_FILES_UNAVAILABLE");
  const files=await filesRes.json();
  const expected="site/dados/"+zone.uf.toLowerCase()+"_"+zone.municipio+"_"+zone.zona+".json";
  if(!Array.isArray(files)||!files.some(f=>f.filename===expected&&f.status!=="removed")||
     !files.some(f=>f.filename==="site/dados/catalogo.json"&&f.status!=="removed"))throw Error("PR_MISSING_ZONE_DATA");
  return prNumber;
}
export async function submitZone(env,zone,user,now,prNumber){
  const updated=await env.DB.prepare(
    "UPDATE zone_reservations SET status='submitted',submitted_at=?,pr_number=? "+
    "WHERE zone_key=? AND user_id=? AND status='reserved' AND expires_at>? RETURNING zone_key")
    .bind(now,prNumber,zone.key,user.id,now).first();
  return Boolean(updated);
}
