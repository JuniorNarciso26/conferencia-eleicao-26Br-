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
  assert.equal(finished.catalog,"python3 scripts/registrar_zona.py --arquivo site/dados/sp_71072_0254.json");
  for(const total of ["", "0", "-5", "3.5", "abc", 10001]) {
    assert.throws(() => gerarRoteiro(input,total));
  }
});

test("portal preserva coleta local mas exige reserva central para iniciar", () => {
  const html=read("desenvolvedores/index.html");
  assert.match(html,/reserva é compartilhada entre colaboradores/i);
  assert.match(html,/não envie BU, RDV, VSC/i);
  assert.match(html,/Enviar resultados para revisão/);
  const js=read("desenvolvedores/contribuir.js");
  assert.match(js,/catalogo\.json/);
  assert.match(js,/isPublished/);
  assert.match(js,/localidades_2026\.json/);
  assert.match(js,/api\/zones\/reserve/);
  assert.match(js,/api\/uploads\/start/);
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

test("seletores mantêm código TSE automático e consultam o status central", () => {
  const html=read("desenvolvedores/index.html");
  assert.match(html,/<select id="collect-city"/);
  assert.match(html,/id="collect-city-code"[^>]*readonly/);
  assert.match(html,/<select id="collect-zone"/);
  assert.match(html,/id="collect-zone-status"/);
  const script=read("desenvolvedores/contribuir.js");
  assert.match(script,/zone\.addEventListener\("change"/);
  assert.match(script,/api\/zones\/reservation/);
  assert.match(script,/isPublished\(loc\)/);
  assert.match(script,/reserveButton\.hidden=false/);
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

test("reserva compartilhada permite upload seguro e revisao", () => {
  const html=read("desenvolvedores/index.html");
  assert.match(html,/id="collect-reserve"/);
  assert.match(html,/id="collect-release"/);
  assert.match(html,/id="collect-upload-button"/);
  assert.match(html,/id="collect-upload-file"/);
  assert.match(html,/id="collect-upload-progress"/);
  assert.match(html,/24 horas/);
  assert.match(html,/id="cmd-monitor-help"/);
  const js=read("desenvolvedores/contribuir.js");
  assert.match(js,/SENDO PROCESSADA POR/);
  assert.match(js,/SUA RESERVA ATIVA/);
  assert.match(js,/AGUARDANDO REVISÃO/);
  assert.match(js,/api\/zones\/reserve/);
  assert.match(js,/api\/uploads\/finish/);
  assert.match(js,/api\/zones\/release/);
  assert.match(js,/sessionStorage\.getItem\(TOKEN_KEY\)/);
  assert.doesNotMatch(js,/localStorage/);
  assert.doesNotMatch(js,/collect-mark-local/);
});

test("guia de contribuicao nao exige Git, push nem PR para enviar o arquivo",()=>{
  const html=read("desenvolvedores/index.html");
  assert.match(html,/Envie o JSON pelo portal/);
  assert.match(html,/id="collect-upload-file"/);
  assert.match(html,/id="review-refresh"/);
  assert.match(html,/src="\.\/revisao\.js"/);
  const code=read("desenvolvedores/contribuir.js");
  assert.match(code,/api\/uploads\/start/);
  assert.match(code,/api\/uploads\/chunk/);
  assert.match(code,/api\/uploads\/finish/);
  assert.match(code,/crypto\.subtle\.digest/);
  assert.match(code,/validateFile/);
  assert.doesNotMatch(code,/localStorage/);
});
