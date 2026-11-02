import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {analisarCsv, analisarPacoteHorario, secoesParaUpload, seriePorHora, acumuladoPercentual} from "../horarios.mjs";

test("CSV publicado da zona 0252 fecha com os totais oficiais", () => {
  const texto = readFileSync(new URL("../dados/horarios_sp_71072_0252.csv", import.meta.url), "utf8");
  const dados = analisarCsv(texto);
  assert.equal(dados.secoes.length, 339);
  assert.deepEqual(dados.totais, {"1T": 84773, "2T": 87648});
  assert.equal(seriePorHora(dados, "1T").reduce((a, b) => a + b), 84773);
  assert.equal(seriePorHora(dados, "2T", "0001").reduce((a, b) => a + b), 280);
  assert.equal(acumuladoPercentual(seriePorHora(dados, "1T"))[23], 100);
  const carga=secoesParaUpload(dados);
  assert.equal(carga.length,339);
  assert.equal(carga.reduce((total,s)=>total+s.turnos["1"].reduce((a,b)=>a+b,0),0),84773);
  assert.equal(carga.reduce((total,s)=>total+s.turnos["2"].reduce((a,b)=>a+b,0),0),87648);
});

test("CSV repetido ou inválido é recusado", () => {
  const cabecalho = "turno;secao;hora;votacoes_concluidas\n";
  const linhas = "1T;0001;08;3\n2T;0001;08;4";
  assert.throws(() => analisarCsv(cabecalho + linhas + "\n1T;0001;08;2"), /repetido/);
  assert.throws(() => analisarCsv(cabecalho + "1T;0001;08;-3\n2T;0001;08;4"), /inválidos/);
  assert.throws(() => analisarCsv(cabecalho + "1T;0001;08;3"), /dois turnos/);
});

test("pacote aprovado do banco alimenta a mesma comparação",()=>{
  const pacote={meta:{total_secoes:1},secoes:[{secao:"0001",turnos:{
    "1":Array(24).fill(0),"2":Array(24).fill(0)
  }}]};
  pacote.secoes[0].turnos["1"][8]=2;
  pacote.secoes[0].turnos["2"][9]=3;
  const dados=analisarPacoteHorario(pacote);
  assert.deepEqual(dados.totais,{"1T":2,"2T":3});
  assert.throws(()=>analisarPacoteHorario({...pacote,meta:{total_secoes:2}}),/inválido/);
});
