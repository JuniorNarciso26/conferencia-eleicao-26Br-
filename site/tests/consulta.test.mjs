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

test("catálogo inicial é vazio: não publica resultado fictício", () => {
  const data = JSON.parse(read("dados/catalogo.json"));
  assert.equal(data.versao, 1);
  assert.deepEqual(data.zonas, []);
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
