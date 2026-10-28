"use strict";
import { UFS, validarLocalidade, gerarRoteiro } from "./coleta-roteiro.mjs";

const $ = (selector) => document.querySelector(selector);
const start = $("#contribute-start");
const guide = $("#contribute-guide");
const close = $("#contribute-close");
const form = $("#contribute-form");
const steps = $("#collect-steps");
const output = $("#collect-export");
const message = $("#collect-message");
const build = $("#collect-build");
const status = $("#collect-total-message");
const uf = $("#collect-uf");
const totalInput = $("#collect-total");
let locationSelected = null;
let lastCommands = null;

for (const state of UFS) {
  const option = document.createElement("option");
  option.value = state;
  option.textContent = state;
  uf.appendChild(option);
}
start.addEventListener("click", () => {
  guide.hidden = false;
  start.setAttribute("aria-expanded", "true");
  guide.scrollIntoView({behavior:"smooth", block:"start"});
  uf.focus({preventScroll:true});
});
close.addEventListener("click", () => {
  guide.hidden = true;
  start.setAttribute("aria-expanded", "false");
  start.focus();
});
function setText(id, content) {
  const node = document.getElementById(id);
  node.textContent = content;
}
function updateCommandOutput(data) {
  for (const key of ["install","check","start","status","catalog"]) {
    setText("cmd-" + key, data[key]);
  }
  if (data.export) setText("cmd-export", data.export);
}
async function published(loc) {
  const response = await fetch("../dados/catalogo.json", {cache:"no-store"});
  if (!response.ok) throw Error("Catálogo indisponível");
  const data = await response.json();
  if (!Array.isArray(data.zonas)) throw Error("Catálogo inválido");
  return data.zonas.some(entry =>
    entry.uf === loc.uf && entry.municipio_codigo === loc.codigo && 
    String(entry.zona).padStart(4,"0") === loc.zona);
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  steps.hidden = true;
  output.hidden = true;
  locationSelected = null;
  lastCommands = null;
  build.disabled = false;
  status.textContent = "";
  message.textContent = "";
  const data = {
    uf: uf.value,
    municipio: $("#collect-city").value,
    codigo: $("#collect-city-code").value,
    zona: $("#collect-zone").value
  };
  try {
    const loc = validarLocalidade(data);
    const action = $("#collect-generate");
    action.disabled = true;
    message.textContent = "Verificando o catálogo público...";
    try {
      const alreadyPublished = await published(loc);
      if (alreadyPublished) {
        message.textContent = "Esta zona já consta no catálogo público. Escolha uma zona que ainda não foi publicada para evitar trabalho duplicado.";
        return;
      }
      message.textContent = "Zona não encontrada entre as já publicadas. Atenção: ela ainda pode estar em coleta por outro colaborador; a reserva automática não está disponível.";
    } catch {
      message.textContent = "Não foi possível consultar o catálogo público. Confira se a zona já existe no portal antes de iniciar: não temos reserva automática.";
    } finally { action.disabled = false; }
    locationSelected = loc;
    lastCommands = gerarRoteiro(loc);
    updateCommandOutput(lastCommands);
    setText("collect-location", `${loc.uf} · ${loc.municipio} · zona ${loc.zona}`);
    totalInput.value = "";
    steps.hidden = false;
    steps.scrollIntoView({behavior:"smooth", block:"start"});
  } catch (err) {
    message.textContent = err.message || "Confira os dados informados.";
  }
});
build.addEventListener("click", () => {
  output.hidden = true;
  status.textContent = "";
  if (!locationSelected) {status.textContent = "Escolha a zona primeiro."; return;}
  try {
    lastCommands = gerarRoteiro(locationSelected, totalInput.value);
    setText("cmd-export", lastCommands.export);
    setText("cmd-catalog", lastCommands.catalog);
    output.hidden = false;
    status.textContent = "Roteiro de validação gerado. Execute e revise os resultados antes do Pull Request.";
    output.scrollIntoView({behavior:"smooth", block:"start"});
  } catch (err) {status.textContent = err.message;}
});
for (const button of document.querySelectorAll(".copy-command")) {
  button.addEventListener("click", async () => {
    const content = document.getElementById(button.dataset.copy).textContent;
    try {
      await navigator.clipboard.writeText(content);
      const previous = button.textContent;
      button.textContent = "Copiado!";
      setTimeout(() => {button.textContent = previous;}, 1400);
    } catch {
      status.textContent = "O navegador não permitiu copiar. Selecione o comando para copiar manualmente.";
    }
  });
}
