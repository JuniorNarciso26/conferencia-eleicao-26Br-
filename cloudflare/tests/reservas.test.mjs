import test from "node:test";
import assert from "node:assert/strict";
import { validarZona,getLease,ensureValidUnpublishedZone,reserveZone,releaseZone,verifyPullRequest,submitZone } from "../src/reservas.js";
import worker from "../src/worker.js";

const zone=validarZona({uf:"sp",municipio:"71072",zona:"0252"});
const owner={id:42,login:"colaborador-exemplo"};
const other={id:7,login:"outra-pessoa"};
const base="https://juniornarciso26.github.io/conferencia-eleicao-26Br-/";
const api="https://conferencia-eleitoral-api.junior-ab2.workers.dev";
const envConfig={GH_CLIENT_ID:"id",GH_CLIENT_SECRET:"secret",SITE_URL:base,API_ORIGIN:api};

function fakeDB(){
  const rows=new Map();
  return {rows,prepare(sql){
    let args=[];
    return {
      bind(...a){args=a;return this;},
      async run(){
        if(sql.startsWith("DELETE FROM zone_reservations WHERE status='reserved'")){
          for(const [k,row] of rows){if(row.status==="reserved"&&row.expires_at<=args[0])rows.delete(k);}
          return {success:true};
        }
        throw Error("Unexpected SQL run "+sql);
      },
      async first(){
        if(sql.startsWith("INSERT OR IGNORE INTO zone_reservations")){
          const [key,uf,municipio,zona,userId,login,started,expires]=args;
          if(rows.has(key)||[...rows.values()].some(x=>x.user_id===userId&&x.status==="reserved"))return null;
          const row={zone_key:key,uf,municipio,zona,user_id:userId,contributor_login:login,
            status:"reserved",reserved_at:started,expires_at:expires,pr_number:null,submitted_at:null};
          rows.set(key,row);return {...row};
        }
        if(sql.startsWith("SELECT user_id,contributor_login,status")){
          return rows.get(args[0])||null;
        }
        if(sql.startsWith("SELECT zone_key FROM zone_reservations WHERE user_id=")){
          const row=[...rows.values()].find(x=>x.user_id===args[0]&&x.status==="reserved"&&x.expires_at>args[1]);
          return row?{zone_key:row.zone_key}:null;
        }
        if(sql.startsWith("DELETE FROM zone_reservations WHERE zone_key=")){
          const row=rows.get(args[0]);
          if(!row||row.user_id!==args[1]||row.status!=="reserved"||row.expires_at<=args[2])return null;
          rows.delete(args[0]);return {zone_key:args[0]};
        }
        if(sql.startsWith("UPDATE zone_reservations SET status='submitted'")){
          const row=rows.get(args[2]);
          if(!row||row.user_id!==args[3]||row.status!=="reserved"||row.expires_at<=args[4])return null;
          row.status="submitted";row.submitted_at=args[0];row.pr_number=args[1];
          return {zone_key:args[2]};
        }
        if(sql.startsWith("SELECT u.id, u.login"))return null;
        throw Error("Unexpected SQL first "+sql);
      }
    };
  }};
}
test("validates TSE key and rejects arbitrary inputs",()=>{
  assert.deepEqual(zone,{uf:"SP",municipio:"71072",zona:"0252",key:"SP-71072-0252"});
  for(const input of [
    {uf:"SP",municipio:"71072",zona:"0252;rm"},
    {uf:"XX",municipio:"71072",zona:"0252"},
    {uf:"SP",municipio:"not-code",zona:"0252"},
    {uf:"SP",municipio:"71072",zona:"0000"}
  ])assert.throws(()=>validarZona(input),/INVALID_ZONE/);
});

test("exclusive 24h lease, one active per user, manual release",async()=>{
  const env={DB:fakeDB()},now=2000000000;
  const first=await reserveZone(env,zone,owner,now);
  assert.equal(first.ok,true);assert.equal(first.expires_at,now+86400);
  const same=await reserveZone(env,zone,owner,now+10);
  assert.equal(same.code,"ZONE_UNAVAILABLE");assert.equal(same.expires_at,now+86400);
  const competing=await reserveZone(env,zone,other,now+5);
  assert.equal(competing.code,"ZONE_UNAVAILABLE");
  const another=validarZona({uf:"SP",municipio:"71072",zona:"0254"});
  const duplicate=await reserveZone(env,another,owner,now+5);
  assert.equal(duplicate.code,"ALREADY_HAS_ACTIVE_ZONE");
  assert.equal((await getLease(env,zone,now+5,owner.id)).mine,true);
  assert.equal((await getLease(env,zone,now+5,other.id)).mine,false);
  assert.equal(await releaseZone(env,zone,other,now+5),false);
  assert.equal(await releaseZone(env,zone,owner,now+5),true);
  assert.equal((await getLease(env,zone,now+5)).status,"available");
  assert.equal((await reserveZone(env,zone,other,now+10)).ok,true);
});

test("at expiration becomes available without cron, may be taken by another",async()=>{
  const env={DB:fakeDB()},now=2000000000;
  await reserveZone(env,zone,owner,now);
  assert.equal((await getLease(env,zone,now+86399)).status,"reserved");
  assert.equal((await getLease(env,zone,now+86400)).status,"available");
  assert.equal((await reserveZone(env,zone,other,now+86400)).ok,true);
  assert.equal((await getLease(env,zone,now+86400)).contributor,other.login);
});

test("verified PR submission before expiration preserves under review",async()=>{
  const env={DB:fakeDB()},now=2000000000;
  await reserveZone(env,zone,owner,now);
  assert.equal(await submitZone(env,zone,other,now+20,15),false);
  assert.equal(await submitZone(env,zone,owner,now+86401,15),false);
  assert.equal(await submitZone(env,zone,owner,now+86399,15),true);
  const item=await getLease(env,zone,now+100000,owner.id);
  assert.equal(item.status,"submitted");assert.equal(item.pr_number,15);
  assert.equal(item.mine,true);
  assert.equal((await reserveZone(env,zone,other,now+100000)).code,"ZONE_UNAVAILABLE");
});

test("official catalog checks real zone and published zone",async()=>{
  function fetcher(url){
    if(url.endsWith("localidades_2026.json"))
      return Promise.resolve(Response.json({eleicao:2026,ufs:{SP:[{codigo:"71072",zonas:["0252","0253"]}]}}));
    return Promise.resolve(Response.json({zonas:[{uf:"SP",municipio_codigo:"71072",zona:"0253"}]}));
  }
  await ensureValidUnpublishedZone({},zone,base,fetcher);
  await assert.rejects(()=>ensureValidUnpublishedZone({},validarZona({uf:"SP",municipio:"71072",zona:"0253"}),base,fetcher),/ZONE_PUBLISHED/);
  await assert.rejects(()=>ensureValidUnpublishedZone({},validarZona({uf:"SP",municipio:"71072",zona:"0254"}),base,fetcher),/UNKNOWN_ZONE/);
});

test("PR must be open, owned by logged-in GitHub ID and contain both zone files",async()=>{
  const responses=[
    Response.json({state:"open",base:{ref:"main"},user:{id:42}}),
    Response.json([{filename:"site/dados/sp_71072_0252.json",status:"added"},
                   {filename:"site/dados/catalogo.json",status:"modified"}])
  ];
  const fake=()=>Promise.resolve(responses.shift());
  assert.equal(await verifyPullRequest(zone,owner,17,fake),17);
  await assert.rejects(()=>verifyPullRequest(zone,other,17,async()=>Response.json({state:"open",base:{ref:"main"},user:{id:42}})),/PR_NOT_ELIGIBLE/);
  await assert.rejects(()=>verifyPullRequest(zone,owner,17,async url=>url.endsWith("100")
    ? Response.json([])
    : Response.json({state:"open",base:{ref:"main"},user:{id:42}})),/PR_MISSING_ZONE_DATA/);
});

test("public API reads status; mutation requires origin and session",async()=>{
  const env={...envConfig,DB:fakeDB()};
  const res=await worker.fetch(new Request(api+"/api/zones/reservation?uf=SP&municipio=71072&zona=0252"),env);
  assert.equal(res.status,200);assert.equal((await res.json()).status,"available");
  const unauthorized=await worker.fetch(new Request(api+"/api/zones/reserve",{
    method:"POST",headers:{"Origin":new URL(base).origin,"Content-Type":"application/json"},
    body:JSON.stringify(zone)
  }),env);
  assert.equal(unauthorized.status,401);
  const foreign=await worker.fetch(new Request(api+"/api/zones/reserve",{
    method:"POST",headers:{"Origin":"https://attacker.example","Content-Type":"application/json"},
    body:JSON.stringify(zone)
  }),env);
  assert.equal(foreign.status,403);
});
