import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (name) => readFileSync(new URL("../" + name, import.meta.url), "utf8");

test("página principal é consulta pública sem login", () => {
  const html = read("index.html");
  assert.match(html, /CONSULTA PÚBLICA · ACESSO LIVRE · SEM CADASTRO/);
  assert.match(html, /id="uf"/);
  assert.match(html, /id="municipio"/);
  assert.match(html, /id="zona"/);
  assert.match(html, /id="view"/);
  assert.match(html, /src="\.\/consulta\.js"/);
  assert.match(html, /href="\.\/desenvolvedores\/"/);
  assert.doesNotMatch(html, /id="login-button"/);
  assert.doesNotMatch(html, /src="\.\/app\.js"/);
});

test("login permanece na área de colaboradores", () => {
  const html = read("desenvolvedores/index.html");
  assert.match(html, /id="login-button"/);
  assert.match(html, /id="logout-button"/);
  assert.match(html, /src="\.\.\/app\.js"/);
  assert.match(html, /href="\.\.\/"/);
  assert.match(html, /Conecte sua conta GitHub/);
});

test("catálogo publica somente a zona validada e mantém a consulta dinâmica", () => {
  const data = JSON.parse(read("dados/catalogo.json"));
  assert.equal(data.versao, 1);
  assert.deepEqual(data.zonas, [{
    uf: "SP",
    municipio_codigo: "71072",
    municipio_nome: "São Paulo",
    zona: "0253",
    arquivo: "dados/zona_0253.json"
  }]);
  const pack = JSON.parse(read("dados/zona_0253.json"));
  assert.equal(pack.meta.total_secoes, 496);
  assert.equal(pack.meta.cobertura_completa, true);
  assert.equal(pack.secoes.length, 496);
  const code = read("consulta.js");
  assert.match(code, /catalogo\.json/);
  assert.match(code, /PACOTE PUBLICADO/);
  assert.match(code, /validatePack/);
  assert.doesNotMatch(read("index.html"), /496 SEÇÕES/);
});

test("callback OAuth na raiz é enviado para /desenvolvedores/ sem alterar Worker", () => {
  const code = read("auth-redirect.js");
  const base = "https://juniornarciso26.github.io/conferencia-eleicao-26Br-/";
  const ticket = "a".repeat(43);
  const changes = [];
  const context = {
    URL, URLSearchParams,
    location: {
      href: base + "#ticket=" + ticket,
      hash: "#ticket=" + ticket,
      pathname: "/conferencia-eleicao-26Br-/",
      search: "",
      replace: (url) => changes.push(["redirect", url])
    },
    history: { replaceState: (...args) => changes.push(["clean", args[2]]) }
  };
  vm.runInNewContext(code, context);
  assert.deepEqual(changes, [
    ["clean", "/conferencia-eleicao-26Br-/"],
    ["redirect", base + "desenvolvedores/#ticket=" + ticket]
  ]);
});

test("sem callback OAuth, página inicial não redireciona visitante", () => {
  const code = read("auth-redirect.js");
  let redirects = 0;
  vm.runInNewContext(code, {
    URL, URLSearchParams,
    location: {
      href: "https://juniornarciso26.github.io/conferencia-eleicao-26Br-/",
      hash: "", replace: () => redirects++
    },
    history: { replaceState() { redirects++; } }
  });
  assert.equal(redirects, 0);
});

test("consulta pública também carrega zonas aprovadas no D1 sem mudar os dados estáticos",()=>{
  const html=read("index.html");
  assert.match(html,/src="\.\/config\.js"/);
  assert.match(html,/connect-src 'self' https:\/\/conferencia-eleitoral-api/);
  const code=read("consulta.js");
  assert.match(code,/api\/published\/zones/);
  assert.match(code,/api\/published\/zone/);
  assert.match(code,/fonte === "d1"/);
  const catalog=JSON.parse(read("dados/catalogo.json"));
  assert.equal(catalog.zonas.length,1);
  assert.equal(catalog.zonas[0].zona,"0253");
});

test("consulta pública identifica responsável pelo processamento e pela aprovação sem exibir dados privados", () => {
  const html=read("index.html");
  const code=read("consulta.js");
  assert.match(html,/id="audit-meta"/);
  assert.match(html,/id="audit-contributor"/);
  assert.match(html,/id="audit-reviewer"/);
  assert.match(html,/Revisão e aprovação/);
  assert.match(code,/function renderAudit/);
  assert.match(code,/audit\.processado_por/);
  assert.match(code,/audit\.revisado_por/);
  assert.match(code,/audit\.enviado_em/);
  assert.match(code,/audit\.revisado_em/);
  assert.doesNotMatch(html,/reviewer_id|contributor_id|user\.email/);
});

test("consulta mostra percentual sobre o 1º turno e padrão por seção sem comparar zonas",()=>{
  const html=read("index.html"),code=read("consulta.js");
  assert.match(html,/O que explica a diferença de votos entre os turnos/);
  assert.match(html,/<th>Variação \(%\)<\/th>/);
  assert.match(html,/id="section-pattern"/);
  assert.match(html,/id="pattern-rows"/);
  assert.match(html,/id="pattern-filter"/);
  assert.match(html,/id="pattern-stats"/);
  assert.match(code,/import \{ calcularCrescimento, percentualVariacao, analisarPadraoSecoes \}/);
  assert.match(code,/renderGrowth\(\)/);
  assert.match(code,/renderPattern\(\)/);
  assert.match(code,/percentualVariacao\(a,b\)/);
  assert.match(code,/renderPatternRows/);
  assert.match(code,/api\/published\/zone/);
  assert.doesNotMatch(html,/id="growth-comparison"/);
  assert.doesNotMatch(code,/renderComparison\(/);
  assert.doesNotMatch(code,/\["0252","0253"\]/);
  assert.match(html,/não estabelece causa/);
});


test("gráfico ponderado por urna permite alternar contagem/peso e filtrar sem inferir transferências",()=>{
  const html=read("index.html"),js=read("consulta.js"),model=read("crescimento.mjs");
  for(const id of ["weighted-pattern","weighted-summary","weighted-mode","weighted-chart","weighted-selection-status","weighted-clear"])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/transferência de votos entre candidatos/);
  assert.match(html,/comparecimento do 1º turno/);
  assert.match(js,/analisarHistogramaPonderado\(pack\.secoes\)/);
  assert.match(js,/renderWeightedChart\(\)/);
  assert.match(js,/renderWeightedSummary\(\)/);
  assert.match(js,/selectedWeightedBand/);
  assert.match(js,/renderPatternRows\(\)/);
  assert.match(js,/weighted-mode/);
  assert.match(model,/FAIXAS_DIFERENCA/);
  assert.match(model,/pontos<=-20/);
  assert.match(model,/pontos<20/);
  assert.match(model,/totalEleitores1t/);
  assert.doesNotMatch(js,/api\/private/);
});
