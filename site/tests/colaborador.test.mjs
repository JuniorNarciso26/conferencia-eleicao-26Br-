import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { UFS, validarLocalidade, gerarRoteiro } from "../desenvolvedores/coleta-roteiro.mjs";
const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("guia de contribuicao existe na area de colaboradores; consulta publica permanece independente", () => {
  const dev = read("desenvolvedores/index.html");
  assert.match(dev, /id="contribute-start"/);
  assert.match(dev, /id="contribute-guide"[^>]*hidden/);
  assert.match(dev, /id="contribute-form"/);
  assert.match(dev, /id="collect-total"/);
  assert.match(dev, /src="\.\/contribuir\.js"/);
  assert.match(dev, /id="login-button"/);
  const publicHome = read("index.html");
  assert.doesNotMatch(publicHome, /contribuir\.js|coleta-roteiro/);
  assert.doesNotMatch(publicHome, /id="login-button"/);
});

test("valida estado, municipio TSE e zona", () => {
  assert.equal(UFS.length, 27);
  assert.deepEqual(validarLocalidade({
    uf:"sp", municipio:" São Paulo ", codigo:"71072", zona:"254"
  }), {uf:"SP", municipio:"São Paulo", codigo:"71072", zona:"0254"});
  for(const data of [
    {uf:"ZZ",municipio:"Rio",codigo:"60011",zona:"1"},
    {uf:"SP",municipio:"SP",codigo:"71072 && echo hack",zona:"254"},
    {uf:"SP",municipio:"SP",codigo:"71072",zona:"254;rm -rf ."},
    {uf:"SP",municipio:"SP",codigo:"71072",zona:"0000"},
    {uf:"SP",municipio:"",codigo:"71072",zona:"254"}
  ]) assert.throws(() => validarLocalidade(data));
});

test("monta comandos para nova zona sem reutilizar o total da zona 0253", () => {
  const input={uf:"SP",municipio:"São Paulo",codigo:"71072",zona:"0254"};
  const basic=gerarRoteiro(input);
  assert.match(basic.install,/git clone/);
  assert.match(basic.install,/uv python install 3\.12/);
  assert.match(basic.install,/PYTHON=.*uv python find 3\.12.*bash scripts\/instalar_vps\.sh/);
  assert.match(basic.check,/--uf sp --municipio 71072 --zona 0254 --dry-run$/);
  assert.match(basic.start,/--uf sp --municipio 71072 --zona 0254$/);
  assert.equal(basic.status,"scripts/coleta status");
  assert.equal(basic.monitor,"scripts/coleta painel");
  assert.equal(basic.export,undefined);
  const finished=gerarRoteiro(input,312);
  assert.match(finished.export,/--saida site\/dados\/sp_71072_0254\.json/);
  assert.match(finished.export,/--esperado 312$/);
  assert.deepEqual(JSON.parse(finished.catalog),{
    uf:"SP",municipio_codigo:"71072",municipio_nome:"São Paulo",
    zona:"0254",arquivo:"dados/sp_71072_0254.json"
  });
  for(const total of ["", "0", "-5", "3.5", "abc", 10001]) {
    assert.throws(() => gerarRoteiro(input,total));
  }
});

test("não publica arquivos brutos, não promete reserva nem upload automático", () => {
  const html=read("desenvolvedores/index.html");
  assert.match(html,/não reserva zonas automaticamente/i);
  assert.match(html,/não executa a coleta/i);
  assert.match(html,/não envie BU, RDV, VSC/i);
  assert.match(html,/Pull Request/);
  const js=read("desenvolvedores/contribuir.js");
  assert.match(js,/catalogo\.json/);
  assert.match(js,/isPublished/);
  assert.match(js,/localidades_2026\.json/);
  assert.doesNotMatch(js,/\/api\/zones|\/api\/contributions/);
});


test("catálogo TSE 2026 tem 27 UFs, municípios e zonas vinculados", () => {
  const source = JSON.parse(read("dados/localidades_2026.json"));
  assert.equal(source.eleicao, 2026);
  assert.equal(source.versao, 1);
  assert.equal(Object.keys(source.ufs).length, 27);
  assert.ok(source.total_municipios >= 5500);
  assert.ok(source.total_relacoes_zona >= 5500);
  const cities = source.ufs.SP;
  const saoPaulo = cities.find(m => m.codigo === "71072");
  assert.equal(saoPaulo.nome.toLocaleLowerCase("pt-BR"), "são paulo");
  assert.ok(saoPaulo.zonas.includes("0253"));
  for (const [uf, municipios] of Object.entries(source.ufs)) {
    assert.match(uf,/^[A-Z]{2}$/);
    const codes = new Set();
    for (const m of municipios) {
      assert.match(m.codigo,/^\d{5}$/);
      assert.ok(m.nome);
      assert.ok(m.zonas.length > 0);
      assert.equal(codes.has(m.codigo), false);
      codes.add(m.codigo);
      for (const z of m.zonas) assert.match(z,/^\d{4}$/);
    }
  }
});

test("seletores preenchem código TSE e zona sem digitação manual", () => {
  const html = read("desenvolvedores/index.html");
  assert.match(html, /<select id="collect-city"/);
  assert.match(html, /id="collect-city-code"[^>]*readonly/);
  assert.match(html, /<select id="collect-zone"/);
  assert.match(html, /id="collect-zone-status"/);
  const script = read("desenvolvedores/contribuir.js");
  assert.match(script, /zone\.addEventListener\("change",selectStatus\)/);
  assert.match(script, /isPublished\(loc\)/);
  assert.match(script, /alreadyPublished|published===null/);
  assert.match(script, /generate\.disabled=false/);
});


test("guia inclui painel de acompanhamento local sem coletar via GitHub Pages", () => {
  const html = read("desenvolvedores/index.html");
  assert.match(html, /id="cmd-monitor"/);
  assert.match(html, /127\.0\.0\.1:8765/);
  assert.match(html, /Acompanhe na tela/);
  const js = read("desenvolvedores/contribuir.js");
  assert.match(js,/monitor","catalog"/);
  assert.doesNotMatch(js,/\/api\/status/);
});

test("colaborador pode anotar zona em coleta neste navegador sem reservar no servidor", () => {
  const html=read("desenvolvedores/index.html");
  assert.match(html,/id="collect-mark-local"/);
  assert.match(html,/id="collect-unmark-local"/);
  assert.match(html,/id="collect-local-controls"/);
  assert.match(html,/somente neste navegador/i);
  assert.match(html,/id="cmd-monitor-help"/);
  assert.match(html,/scripts\/coleta painel/);
  assert.match(html,/127\.0\.0\.1:8765/);
  const code=read("desenvolvedores/contribuir.js");
  assert.match(code,/localStorage\.getItem\(LOCAL_KEY\)/);
  assert.match(code,/localStorage\.setItem\(LOCAL_KEY/);
  assert.match(code,/localMarked\.has\(zoneKey\(loc\)\)/);
  assert.match(code,/EM COLETA NESTE NAVEGADOR/);
  assert.match(code,/resultados AINDA NÃO PUBLICADOS/);
  assert.match(code,/if\(isPublished\(loc\)\)/);
  assert.match(code,/markLocal\.addEventListener\("click"/);
  assert.match(code,/unmarkLocal\.addEventListener\("click"/);
  assert.doesNotMatch(code,/api\/zones|api\/contributions|fetch\(.+method:"POST"/);
});
