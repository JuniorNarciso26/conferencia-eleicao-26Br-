import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {analisarCsv, seriePorHora, acumuladoPercentual} from "../horarios.mjs";

test("CSV publicado da zona 0252 fecha com os totais oficiais", () => {
  const texto = readFileSync(new URL("../dados/horarios_sp_71072_0252.csv", import.meta.url), "utf8");
  const dados = analisarCsv(texto);
  assert.equal(dados.secoes.length, 339);
  assert.deepEqual(dados.totais, {"1T": 84773, "2T": 87648});
  assert.equal(seriePorHora(dados, "1T").reduce((a, b) => a + b), 84773);
  assert.equal(seriePorHora(dados, "2T", "0001").reduce((a, b) => a + b), 280);
  assert.equal(acumuladoPercentual(seriePorHora(dados, "1T"))[23], 100);
});

test("CSV repetido ou inválido é recusado", () => {
  const cabecalho = "turno;secao;hora;votacoes_concluidas\n";
  const linhas = "1T;0001;08;3\n2T;0001;08;4";
  assert.throws(() => analisarCsv(cabecalho + linhas + "\n1T;0001;08;2"), /repetido/);
  assert.throws(() => analisarCsv(cabecalho + "1T;0001;08;-3\n2T;0001;08;4"), /inválidos/);
  assert.throws(() => analisarCsv(cabecalho + "1T;0001;08;3"), /dois turnos/);
});
