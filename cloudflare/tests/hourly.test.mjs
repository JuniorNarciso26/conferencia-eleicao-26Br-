import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import worker from "../src/worker.js";
import {validarZona} from "../src/reservas.js";
import {validHours,beginHourly,hourlyChunk,finishHourly,pendingHourlyReviews,
  hourlyReviewDecision,publishedHourlyZones,publishedHourlyZone} from "../src/hourly.js";

globalThis.crypto ??= webcrypto;

function fixture(){
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for(const name of ["0001_schema.sql","0002_zone_reservations_24h.sql",
    "0003_direct_upload.sql","0004_review_author.sql","0005_hourly_voting.sql"]){
    sqlite.exec(readFileSync(new URL("../migrations/"+name,import.meta.url),"utf8"));
  }
  sqlite.exec("INSERT INTO users(id,login,created_at,last_seen) VALUES (1,'contributor',0,0),(2,'reviewer',0,0),(3,'other',0,0)");
  sqlite.prepare("INSERT INTO zone_uploads(upload_id,zone_key,uf,municipio,zona,municipio_nome,"+
    "contributor_id,contributor_login,state,expected_sections,meta_json,summary_json,created_at) "+
    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run("results","SP-71072-0252","SP","71072","0252","São Paulo",
      1,"contributor","published",1,"{}",JSON.stringify({turnos:{"1":{comparecimento:2},"2":{comparecimento:3}}}),0);
  sqlite.prepare("INSERT INTO zone_upload_sections(upload_id,secao,section_json) VALUES (?,?,?)")
    .run("results","0001",JSON.stringify({turnos:{"1":{comparecimento:2},"2":{comparecimento:3}}}));
  const env={ADMIN_GITHUB_IDS:"2",DB:{
    prepare(sql){
      const wrap=args=>({
        bind(...next){return wrap(next);},
        first(){return sqlite.prepare(sql).get(...args)??null;},
        all(){return {results:sqlite.prepare(sql).all(...args)};},
        run(){return sqlite.prepare(sql).run(...args);}
      });
      return wrap([]);
    },
    batch(statements){
      sqlite.exec("BEGIN");
      try{
        const out=statements.map(s=>({results:s.all?s.all().results:[]}));
        sqlite.exec("COMMIT");return out;
      }catch(e){sqlite.exec("ROLLBACK");throw e;}
    }
  }};
  return {sqlite,env,zone:validarZona({uf:"SP",municipio:"71072",zona:"0252"})};
}

test("validates 24 anonymous hourly counts for both turns",()=>{
  const hours={secao:"0001",turnos:{"1":Array(24).fill(0),"2":Array(24).fill(0)}};
  hours.turnos["1"][8]=2;hours.turnos["2"][9]=3;
  assert.deepEqual(validHours(hours).totals,{"1":2,"2":3});
  assert.throws(()=>validHours({...hours,secao:"01"}),/INVALID_HOURS/);
  assert.throws(()=>validHours({...hours,turnos:{"1":[2],"2":hours.turnos["2"]}}),/INVALID_HOURS/);
});

test("uploads match published BU by section before review and public access",async()=>{
  const {sqlite,env,zone}=fixture(),owner={id:1,login:"contributor"},reviewer={id:2,login:"reviewer"};
  try{
    await assert.rejects(beginHourly(env,zone,{id:3,login:"other"},{sha256:"a".repeat(64)},100),/FORBIDDEN/);
    const started=await beginHourly(env,zone,owner,{sha256:"a".repeat(64)},100);
    const hours={secao:"0001",turnos:{"1":Array(24).fill(0),"2":Array(24).fill(0)}};
    hours.turnos["1"][8]=2;hours.turnos["2"][9]=2;
    await hourlyChunk(env,{upload_id:started.upload_id,secoes:[hours]},owner,101);
    await assert.rejects(finishHourly(env,{upload_id:started.upload_id},owner,102),/HOURLY_TOTAL_MISMATCH/);
    hours.turnos["2"][9]=3;
    await hourlyChunk(env,{upload_id:started.upload_id,secoes:[hours]},owner,103);
    assert.equal((await finishHourly(env,{upload_id:started.upload_id},owner,104)).state,"pending_review");
    assert.equal((await pendingHourlyReviews(env)).length,1);
    assert.equal((await publishedHourlyZones(env)).length,0);
    await hourlyReviewDecision(env,{upload_id:started.upload_id,decision:"approve"},reviewer,105);
    assert.equal((await publishedHourlyZones(env)).length,1);
    const publicData=await publishedHourlyZone(env,zone);
    assert.equal(publicData.secoes[0].turnos["2"][9],3);
  }finally{sqlite.close();}
});

test("hourly API requires login and same origin to write; unpublished data stays private",async()=>{
  const {sqlite,env}=fixture();
  env.SITE_URL="https://juniornarciso26.github.io/conferencia-eleicao-26Br-/";
  const base="https://conferencia-eleitoral-api.junior-ab2.workers.dev";
  try{
    const foreign=await worker.fetch(new Request(base+"/api/hourly/start",{method:"POST",
      headers:{Origin:"https://example.org","Content-Type":"application/json"},
      body:JSON.stringify({uf:"SP",municipio:"71072",zona:"0252",sha256:"a".repeat(64)})}),env);
    assert.equal(foreign.status,403);
    const anonymous=await worker.fetch(new Request(base+"/api/hourly/start",{method:"POST",
      headers:{Origin:"https://juniornarciso26.github.io","Content-Type":"application/json"},
      body:JSON.stringify({uf:"SP",municipio:"71072",zona:"0252",sha256:"a".repeat(64)})}),env);
    assert.equal(anonymous.status,401);
    const list=await worker.fetch(new Request(base+"/api/published/hourly/zones"),env);
    assert.deepEqual((await list.json()).zonas,[]);
    const zone=await worker.fetch(new Request(base+"/api/published/hourly/zone?uf=SP&municipio=71072&zona=0252"),env);
    assert.equal(zone.status,404);
  }finally{sqlite.close();}
});
