import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {calcularCrescimento} from "../crescimento.mjs";

const pack=JSON.parse(readFileSync(new URL("../dados/zona_0253.json",import.meta.url),"utf8"));

test("zona 0253: valida o saldo real dos dois turnos e a hipótese proporcional",()=>{
  const r=calcularCrescimento(pack.resumo);
  assert.deepEqual(r.lula,{t1:39434,t2:50417,delta:10983});
  assert.deepEqual(r.flavio,{t1:62876,t2:71146,delta:8270});
  assert.equal(r.incrementoFinalistas,19253);
  assert.deepEqual(r.componentes,{outros:15202,comparecimento:3708,brancosNulos:343});
  assert.equal(r.reconciliacao,0);
  assert.ok(Math.abs(r.parcelaIncrementoLula-0.5704565522256272)<1e-12);
  assert.ok(Math.abs(r.participacaoLulaT1-0.38543641872739715)<1e-12);
  assert.ok(Math.abs(r.referenciaLula-7420.807369758577)<1e-9);
  assert.ok(Math.abs(r.desvioReferencia-3562.192630241423)<1e-9);
});
test("recusa dados inválidos e somas quebradas",()=>{
  const bad=structuredClone(pack.resumo);
  bad.turnos["2"].lula+=1;
  assert.throws(()=>calcularCrescimento(bad),/não conferem/);
  const negative=structuredClone(pack.resumo);
  negative.turnos["1"].brancos=-1;
  assert.throws(()=>calcularCrescimento(negative),/Campo inválido/);
});
test("saldos negativos não são interpretados como repartição de incrementos",()=>{
  const example={turnos:{
    "1":{lula:30,flavio:60,outros:10,brancos:0,nulos:0,nulos_tecnicos:0,comparecimento:100,aptos:110},
    "2":{lula:45,flavio:55,outros:0,brancos:0,nulos:0,nulos_tecnicos:0,comparecimento:100,aptos:110}
  }};
  const r=calcularCrescimento(example);
  assert.equal(r.reconciliacao,0);
  assert.equal(r.parcelaIncrementoLula,null);
  assert.equal(r.referenciaLula,null);
  assert.equal(r.desvioReferencia,null);
});
test("saldo zero não produz divisão por zero nem previsão artificial",()=>{
  const example=structuredClone(pack.resumo);
  example.turnos["2"]={...example.turnos["1"]};
  const r=calcularCrescimento(example);
  assert.equal(r.incrementoFinalistas,0);
  assert.equal(r.parcelaIncrementoLula,null);
  assert.equal(r.referenciaLula,null);
});
