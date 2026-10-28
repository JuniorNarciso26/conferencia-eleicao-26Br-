import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {analisarHistogramaPonderado,classificarDiferencaPontos,FAIXAS_DIFERENCA} from "../crescimento.mjs";

const sample=JSON.parse(readFileSync(new URL("../dados/zona_0253.json",import.meta.url),"utf8"));
const make=(id,t1,t2)=>{
  function turn(x){
    const {lula=0,flavio=0,outros=0,brancos=0,nulos=0,nulos_tecnicos=0}=x;
    const comparecimento=lula+flavio+outros+brancos+nulos+nulos_tecnicos;
    return {lula,flavio,outros,brancos,nulos,nulos_tecnicos,comparecimento,
      aptos:Math.max(500,comparecimento)};
  }
  return {meta:{secao:id},turnos:{"1":turn(t1),"2":turn(t2)}};
};
test("faixas são simétricas e têm limites explícitos em pontos percentuais",()=>{
  assert.equal(FAIXAS_DIFERENCA.length,9);
  const xs=[[-25,"f20"],[-20,"f20"],[-15,"f10"],[-10,"f10"],
    [-9.99,"f5"],[-5,"f5"],[-4.99,"f2"],[-2,"f2"],
    [-1.99,"equilibrio"],[0,"equilibrio"],[1.99,"equilibrio"],
    [2,"l2"],[4.99,"l2"],[5,"l5"],[9.99,"l5"],[10,"l10"],[19.99,"l10"],[20,"l20"]];
  xs.forEach(([value,expected])=>assert.equal(classificarDiferencaPontos(value),expected));
  assert.throws(()=>classificarDiferencaPontos(Infinity),/inválida/);
});
test("urna do exemplo: 38 votos líquidos adicionais para Lula e 3 para Flávio",()=>{
  const urna=make("0001",
    {lula:117,flavio:109,outros:38,brancos:5,nulos:7},
    {lula:155,flavio:112,outros:0,brancos:4,nulos:9});
  const r=analisarHistogramaPonderado([urna]);
  assert.equal(r.linhas[0].diferencaVotos,35);
  assert.equal(r.linhas[0].eleitores1t,276);
  assert.ok(Math.abs(r.linhas[0].pontos-12.68115942029)<1e-8);
  assert.equal(r.linhas[0].faixa,"l10");
  assert.equal(r.forte.lula.urnas,1);
  assert.equal(r.forte.flavio.urnas,0);
});
test("ponderação usa tamanho das urnas, não apenas quantidade de seções",()=>{
  const sec=[
    make("0001",{lula:100,flavio:140},{lula:140,flavio:140}),
    make("0002",{lula:20,flavio:20},{lula:20,flavio:40})
  ];
  const r=analisarHistogramaPonderado(sec);
  const l=r.faixas.find(x=>x.id==="l10"),f=r.faixas.find(x=>x.id==="f20");
  assert.equal(r.totalUrnas,2);
  assert.equal(r.totalEleitores1t,280);
  assert.equal(l.urnas,1);
  assert.equal(f.urnas,1);
  assert.equal(l.percentualUrnas,50);
  assert.equal(f.percentualUrnas,50);
  assert.ok(Math.abs(l.percentualPonderado-85.71428571428571)<1e-8);
  assert.ok(Math.abs(f.percentualPonderado-14.285714285714286)<1e-8);
  assert.equal(r.forte.lula.urnas,1);
  assert.equal(r.forte.flavio.urnas,1);
  assert.equal(l.secoes[0],"0001");
});
test("zona 0253: todas as 496 urnas classificadas, incluindo ambos os lados",()=>{
  const r=analisarHistogramaPonderado(sample.secoes);
  assert.equal(r.totalUrnas,496);
  assert.equal(r.urnasComBase,496);
  assert.equal(r.semBase,0);
  assert.equal(r.totalEleitores1t,123408);
  assert.deepEqual(r.faixas.map(b=>b.urnas),[0,0,9,53,183,135,103,13,0]);
  assert.equal(r.faixas.reduce((n,b)=>n+b.eleitores1t,0),r.totalEleitores1t);
  assert.ok(Math.abs(r.faixas.reduce((n,b)=>n+b.percentualPonderado,0)-100)<1e-8);
  assert.equal(r.forte.lula.urnas,13);
  assert.equal(r.forte.flavio.urnas,0);
  assert.ok(Math.abs(r.forte.lula.percentualPonderado-2.265655387008946)<1e-8);
});
test("seção sem base não entra no denominador; IDs repetidos são rejeitados",()=>{
  const empty=make("0001",{},{lula:1});
  const normal=make("0002",{lula:20,flavio:30},{lula:24,flavio:30});
  const r=analisarHistogramaPonderado([empty,normal]);
  assert.equal(r.totalUrnas,2);
  assert.equal(r.semBase,1);
  assert.equal(r.urnasComBase,1);
  assert.equal(r.totalEleitores1t,50);
  assert.equal(r.linhas.find(x=>x.secao==="0001").faixa,null);
  assert.equal(r.faixas.reduce((n,b)=>n+b.urnas,0),1);
  assert.throws(()=>analisarHistogramaPonderado([normal,normal]),/repetida/);
});
