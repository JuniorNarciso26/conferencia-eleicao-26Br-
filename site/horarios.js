import {analisarCsv, seriePorHora, acumuladoPercentual} from "./horarios.mjs";

const $ = id => document.getElementById(id);
const formato = new Intl.NumberFormat("pt-BR");
const cores = ["#1261a8", "#0c8064", "#b74352", "#a96c12"];
const datasets = {a: null, b: null};

function nome(letra) {
  return $(`nome-${letra}`).value.trim() || `Localidade ${letra.toUpperCase()}`;
}

function mostrarErro(erro) {
  $("erro").textContent = erro ? String(erro.message || erro) : "";
  $("erro").hidden = !erro;
}

function opcoesSecoes(letra, dados) {
  const seletor = $(`secao-${letra}`);
  seletor.replaceChildren(new Option("Zona inteira", ""));
  for (const secao of dados.secoes) seletor.add(new Option(`Seção ${secao}`, secao));
  seletor.disabled = false;
}

function metricas(series) {
  $("totais").replaceChildren();
  for (const serie of series) {
    const card = document.createElement("article");
    card.className = "metric";
    const titulo = document.createElement("small");
    titulo.textContent = `${serie.nome} · ${serie.turno === "1T" ? "1º" : "2º"} turno`;
    const numero = document.createElement("b");
    numero.textContent = formato.format(serie.total);
    const detalhe = document.createElement("span");
    detalhe.textContent = "votações concluídas";
    card.append(titulo, numero, detalhe);
    $("totais").append(card);
  }
}

function svg(tag, attrs = {}, texto = "") {
  const elemento = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [chave, valor] of Object.entries(attrs)) elemento.setAttribute(chave, String(valor));
  if (texto) elemento.textContent = texto;
  return elemento;
}

function grafico(series) {
  const area = $("grafico");
  area.replaceChildren();
  const x = hora => 55 + hora * 34;
  const y = percentual => 310 - percentual * 2.6;
  for (const percentual of [0, 25, 50, 75, 100]) {
    area.append(svg("line", {x1: 55, x2: 837, y1: y(percentual), y2: y(percentual), stroke: "#dcebf6"}));
    area.append(svg("text", {x: 45, y: y(percentual) + 4, "text-anchor": "end", fill: "#58758f", "font-size": 12}, `${percentual}%`));
  }
  for (const hora of [0, 4, 8, 12, 16, 20, 23]) {
    area.append(svg("text", {x: x(hora), y: 334, "text-anchor": "middle", fill: "#58758f", "font-size": 12}, `${String(hora).padStart(2, "0")}h`));
  }
  const legenda = $("legenda");
  legenda.replaceChildren();
  series.forEach((serie, indice) => {
    const cor = cores[indice];
    const pontos = acumuladoPercentual(serie.horas).map((valor, hora) => `${x(hora)},${y(valor).toFixed(2)}`).join(" ");
    area.append(svg("polyline", {points: pontos, fill: "none", stroke: cor, "stroke-width": 3, "stroke-linejoin": "round"}));
    const item = document.createElement("span");
    const amostra = document.createElement("i");
    amostra.style.backgroundColor = cor;
    item.append(amostra, document.createTextNode(`${serie.nome} · ${serie.turno === "1T" ? "1º" : "2º"} turno`));
    legenda.append(item);
  });
}

function tabela(series) {
  const tabela = $("tabela");
  const cabeca = tabela.querySelector("thead");
  const corpo = tabela.querySelector("tbody");
  const rodape = tabela.querySelector("tfoot");
  cabeca.replaceChildren(); corpo.replaceChildren(); rodape.replaceChildren();
  const tr = document.createElement("tr");
  for (const titulo of ["Hora", ...series.map(s => `${s.nome} · ${s.turno}`)]) {
    const th = document.createElement("th"); th.textContent = titulo; tr.append(th);
  }
  cabeca.append(tr);
  const horasAtivas = Array.from({length: 24}, (_, i) => i).filter(h => series.some(s => s.horas[h]));
  for (const hora of horasAtivas) {
    const linha = document.createElement("tr");
    const celulas = [`${String(hora).padStart(2, "0")}:00–${String(hora).padStart(2, "0")}:59`, ...series.map(s => formato.format(s.horas[hora]))];
    for (const valor of celulas) { const td = document.createElement("td"); td.textContent = valor; linha.append(td); }
    corpo.append(linha);
  }
  const total = document.createElement("tr");
  for (const valor of ["Total", ...series.map(s => formato.format(s.total))]) {
    const td = document.createElement("td"); td.textContent = valor; total.append(td);
  }
  rodape.append(total);
}

function atualizar() {
  if (!datasets.a) return;
  const series = [];
  for (const letra of ["a", "b"]) {
    if (!datasets[letra]) continue;
    const secao = $(`secao-${letra}`).value;
    const rotulo = nome(letra) + (secao ? ` / seção ${secao}` : "");
    for (const turno of ["1T", "2T"]) {
      const horas = seriePorHora(datasets[letra], turno, secao);
      series.push({nome: rotulo, turno, horas, total: horas.reduce((a, b) => a + b, 0)});
    }
  }
  metricas(series); grafico(series); tabela(series);
}

async function arquivoLocal(letra, arquivo) {
  if (!arquivo) return;
  if (arquivo.size > 20 * 1024 * 1024) throw new Error("CSV acima do limite de 20 MiB.");
  const dados = analisarCsv(await arquivo.text());
  datasets[letra] = dados;
  opcoesSecoes(letra, dados);
  $(`meta-${letra}`).textContent = `${dados.secoes.length} seções · 1º turno: ${formato.format(dados.totais["1T"])} · 2º turno: ${formato.format(dados.totais["2T"])}`;
  atualizar();
}

for (const letra of ["a", "b"]) {
  $(`arquivo-${letra}`).addEventListener("change", async evento => {
    try { await arquivoLocal(letra, evento.target.files[0]); mostrarErro(null); }
    catch (erro) { mostrarErro(erro); }
  });
  $(`secao-${letra}`).addEventListener("change", atualizar);
  $(`nome-${letra}`).addEventListener("input", atualizar);
}

try {
  const resposta = await fetch("./dados/horarios_sp_71072_0252.csv");
  if (!resposta.ok) throw new Error(`Erro HTTP ${resposta.status}`);
  const dados = analisarCsv(await resposta.text());
  datasets.a = dados;
  opcoesSecoes("a", dados);
  $("meta-a").textContent = `${dados.secoes.length} seções · 1º turno: ${formato.format(dados.totais["1T"])} · 2º turno: ${formato.format(dados.totais["2T"])}`;
  atualizar();
} catch (erro) {
  $("meta-a").textContent = "Não foi possível carregar a zona 0252. Selecione um CSV local.";
  mostrarErro(erro);
}
