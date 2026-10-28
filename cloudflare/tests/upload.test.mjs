import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validTurn,validSection,validHeader,isAdmin} from "../src/upload.js";
import {validarZona} from "../src/reservas.js";
import worker from "../src/worker.js";

const zone=validarZona({uf:"SP",municipio:"71072",zona:"0253"});
const packet=JSON.parse(readFileSync(new URL("../../site/dados/zona_0253.json",import.meta.url),"utf8"));

test("validates real pinned zone package and its 496 sections",()=>{
  const parsed=validHeader({meta:packet.meta,resumo:packet.resumo,sha256:"a".repeat(64)},zone);
  assert.equal(parsed.total,496);
  for(const section of packet.secoes)assert.equal(validSection(section,zone).secao,section.meta.secao);
});

test("rejects wrong zone, incomplete aggregate, duplicate identification and tampering",()=>{
  const other=validarZona({uf:"SP",municipio:"71072",zona:"0252"});
  assert.throws(()=>validHeader({meta:packet.meta,resumo:packet.resumo},other),/INVALID_PACKAGE/);
  assert.throws(()=>validHeader({meta:{...packet.meta,cobertura_completa:false},resumo:packet.resumo},zone),/INVALID_PACKAGE/);
  assert.throws(()=>validHeader({meta:packet.meta,resumo:packet.resumo,sha256:"not-a-hash"},zone),/INVALID_HASH/);
  assert.throws(()=>validSection({...packet.secoes[0],meta:{...packet.secoes[0].meta,zona:"0001"}},zone),/INVALID_SECTION/);
  const corrupted={...packet.secoes[0].turnos["1"],comparecimento:100000};
  assert.throws(()=>validTurn(corrupted),/VOTE_SUM_MISMATCH|INVALID_TOTALS/);
  assert.throws(()=>validTurn({ ...corrupted,aptos:-1 }),/INVALID_TOTALS/);
});

test("administrator gating is deny-by-default and based on immutable GitHub ID",()=>{
  assert.equal(isAdmin({}, {id:123}),false);
  assert.equal(isAdmin({ADMIN_GITHUB_IDS:"123, 42"},{id:123}),true);
  assert.equal(isAdmin({ADMIN_GITHUB_IDS:"123"},{id:124,login:"administrator"}),false);
});

test("upload is not accepted anonymously or from foreign origins",async()=>{
  const base="https://conferencia-eleitoral-api.junior-ab2.workers.dev";
  const origin="https://juniornarciso26.github.io";
  const env={SITE_URL:origin+"/conferencia-eleicao-26Br/"};
  const foreign=await worker.fetch(new Request(base+"/api/uploads/start",{
    method:"POST",headers:{"Origin":"https://attacker.test","Content-Type":"application/json"},
    body:JSON.stringify({uf:"SP",municipio:"71072",zona:"0252"})}),env);
  assert.equal(foreign.status,403);
  const anonymous=await worker.fetch(new Request(base+"/api/uploads/start",{
    method:"POST",headers:{"Origin":origin,"Content-Type":"application/json"},
    body:JSON.stringify({uf:"SP",municipio:"71072",zona:"0252"})}),env);
  assert.equal(anonymous.status,401);
  const review=await worker.fetch(new Request(base+"/api/review/queue",{headers:{"Origin":origin}}),env);
  assert.equal(review.status,403);
});
