import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {calcularCrescimento,percentualVariacao,analisarPadraoSecoes} from "../crescimento.mjs";

const published=JSON.parse(readFileSync(new URL("../dados/zona_0253.json",import.meta.url),"utf8"));

test("variação percentual usa o 1º turno como denominador",()=>{
  assert.ok(Math.abs(percentualVariacao(31977,40758)-27.460987584826594)<0.001);
  assert.ok(Math.abs(percentualVariacao(38173,42754)-12.000628716632173)<0.001);
  assert.ok(Math.abs(percentualVariacao(84773,87648)-3.391408820012268)<0.01);
  assert.ok(Math.abs(percentualVariacao(79527,83512)-5.010876809134005)<0.001);
  assert.equal(percentualVariacao(9377,0),-100);
  assert.equal(percentualVariacao(0,20),null);
  assert.equal(percentualVariacao(0,0),null);
  assert.equal(percentualVariacao(-1,5),null);
});

test("com os totais exibidos da zona 0252, decomposição é exata",()=>{
  const z={
    turnos:{
      "1":{lula:31977,flavio:38173,outros:9377,brancos:1803,nulos:3437,nulos_tecnicos:6,comparecimento:84773,aptos:110445},
      "2":{lula:40758,flavio:42754,outros:0,brancos:1220,nulos:2916,nulos_tecnicos:0,comparecimento:87648,aptos:110440}
    }
  };
  const r=calcularCrescimento(z);
  assert.equal(r.lula.delta,8781);
  assert.equal(r.flavio.delta,4581);
  assert.equal(r.incrementoFinalistas,13362);
  assert.deepEqual(r.componentes,{outros:9377,comparecimento:2875,brancosNulos:1110});
  assert.equal(r.reconciliacao,0);
  assert.ok(Math.abs(r.parcelaIncrementoLula*100-65.7162101481814)<0.001);
});

test("lista todas as seções da zona publicada sem selecionar apenas as favoráveis",()=>{
  const p=analisarPadraoSecoes(published.secoes);
  assert.equal(p.total,496);
  assert.equal(p.linhas.length,496);
  assert.equal(p.contagens.lulaMaior+p.contagens.flavioMaior+p.contagens.iguais,496);
  assert.ok(p.contagens.ambosCresceram>=0&&p.contagens.ambosCresceram<=496);
  const unique=new Set(p.linhas.map(s=>s.secao));
  assert.equal(unique.size,496);
  for(const row of p.linhas){
    const original=published.secoes.find(s=>s.meta.secao===row.secao);
    assert.equal(row.deltaLula,original.turnos["2"].lula-original.turnos["1"].lula);
    assert.equal(row.deltaFlavio,original.turnos["2"].flavio-original.turnos["1"].flavio);
    assert.ok(["lula","flavio","igual"].includes(row.grupo));
  }
});

test("conta variação maior mesmo quando ambos caem, sem chamar isso de transferência",()=>{
  const mk=(id,l1,l2,f1,f2)=>({
    meta:{secao:id},turnos:{
      "1":{lula:l1,flavio:f1,outros:0,brancos:0,nulos:0,nulos_tecnicos:0,comparecimento:l1+f1,aptos:150},
      "2":{lula:l2,flavio:f2,outros:0,brancos:0,nulos:0,nulos_tecnicos:0,comparecimento:l2+f2,aptos:150}
    }
  });
  const p=analisarPadraoSecoes([mk("0001",60,40,50,35),mk("0002",30,50,30,32),mk("0003",40,40,40,40)]);
  assert.equal(p.contagens.flavioMaior,1);
  assert.equal(p.contagens.lulaMaior,1);
  assert.equal(p.contagens.iguais,1);
  assert.equal(p.contagens.ambosCresceram,1);
  assert.throws(()=>analisarPadraoSecoes([mk("0001",60,40,50,30),mk("0001",40,50,30,32)]),/repetida/);
});
