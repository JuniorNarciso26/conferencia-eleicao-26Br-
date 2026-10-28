"use strict";
import { validarLocalidade, gerarRoteiro } from "./coleta-roteiro.mjs";

const $ = s => document.querySelector(s);
const start = $("#contribute-start"), guide = $("#contribute-guide");
const close = $("#contribute-close"), form = $("#contribute-form");
const steps = $("#collect-steps"), output = $("#collect-export");
const message = $("#collect-message"), build = $("#collect-build");
const status = $("#collect-total-message");
const uf = $("#collect-uf"), city = $("#collect-city"), zone = $("#collect-zone");
const code = $("#collect-city-code"), zoneState = $("#collect-zone-status");
const totalInput = $("#collect-total"), generate = $("#collect-generate");
let locationSelected = null, locations = null, published = null;

function text(id,value){ document.getElementById(id).textContent=value; }
function replaceOptions(select,placeholder,entries=[]){
  select.replaceChildren();
  const empty=document.createElement("option");
  empty.value="";empty.textContent=placeholder;select.appendChild(empty);
  for(const entry of entries){
    const option=document.createElement("option");
    option.value=entry.value;option.textContent=entry.text;
    select.appendChild(option);
  }
  select.disabled=entries.length===0;
  select.value="";
}
function estado(message,kind="unknown"){
  zoneState.textContent=message;
  zoneState.className="zone-state "+kind;
}
function resetGuide(){
  locationSelected=null;steps.hidden=true;output.hidden=true;
  totalInput.value="";status.textContent="";message.textContent="";
  generate.disabled=true;
}
function cityForSelection(){
  return (locations?.ufs?.[uf.value] || []).find(c=>c.codigo===city.value);
}
function zoneKey(loc){return loc.uf+"-"+loc.codigo+"-"+loc.zona;}
function isPublished(loc){
  return published?.some(entry => entry.uf===loc.uf &&
      entry.municipio_codigo===loc.codigo &&
      String(entry.zona).padStart(4,"0")===loc.zona);
}
function selectStatus(){
  resetGuide();
  const selected=cityForSelection();
  if(!selected || !zone.value){
    estado("Selecione uma zona para consultar o status da apuração.");
    return;
  }
  const loc=validarLocalidade({uf:uf.value,municipio:selected.nome,codigo:selected.codigo,zona:zone.value});
  if(published===null){
    estado("Não foi possível confirmar a publicação da zona. Recarregue a página antes de iniciar a coleta.","error");
    return;
  }
  if(isPublished(loc)){
    estado("Zona "+loc.zona+" já apurada e PUBLICADA no portal. Consulte os resultados na página pública. Não é necessário repetir a coleta.","published");
  }else{
    estado("Zona "+loc.zona+" ainda NÃO PUBLICADA no portal. Ela pode estar em coleta por outro colaborador; reserva automática ainda não disponível.","available");
    generate.disabled=false;
  }
}
async function loadCatalog(){
  try{
    const [locRes,pubRes]=await Promise.all([
      fetch("../dados/localidades_2026.json",{cache:"no-store"}),
      fetch("../dados/catalogo.json",{cache:"no-store"})
    ]);
    if(!locRes.ok)throw Error("Catálogo de localidades indisponível");
    if(!pubRes.ok)throw Error("Status da apuração indisponível");
    const data=await locRes.json(), pub=await pubRes.json();
    const keys=Object.keys(data.ufs||{});
    if(data.versao!==1 || data.eleicao!==2026 || keys.length!==27 ||
        !Array.isArray(pub.zonas) || !keys.every(k=>Array.isArray(data.ufs[k]))) {
      throw Error("Catálogo incompleto ou inválido");
    }
    locations=data;published=pub.zonas;
    replaceOptions(uf,"Escolha o estado",keys.sort().map(x=>({value:x,text:x})));
    estado("Selecione um estado, depois município e zona.","unknown");
    $("#collect-source").textContent="Catálogo de localidades TSE 2026, gerado em "+
      new Date(data.gerado_utc).toLocaleDateString("pt-BR")+
      " · "+data.total_municipios.toLocaleString("pt-BR")+" municípios.";
  }catch(err){
    locations=null;published=null;
    replaceOptions(uf,"Catálogo indisponível");
    estado("Não foi possível carregar municípios ou verificar zonas publicadas. Tente atualizar a página.","error");
    $("#collect-source").textContent=String(err.message);
  }
}
uf.addEventListener("change",()=>{
  resetGuide();
  code.value="";
  replaceOptions(zone,"Selecione primeiro o município");
  const cities=locations?.ufs?.[uf.value]||[];
  replaceOptions(city,"Escolha o município",cities.map(c=>({value:c.codigo,text:c.nome})));
  estado(cities.length?"Selecione o município para listar suas zonas.":"Selecione uma UF.");
});
city.addEventListener("change",()=>{
  resetGuide();
  const selected=cityForSelection();
  code.value=selected?.codigo||"";
  const zones=selected?.zonas||[];
  replaceOptions(zone,"Escolha a zona eleitoral",zones.map(z=>({value:z,text:"Zona "+z})));
  estado(selected?"Selecione a zona para consultar o status.":"Selecione um município.");
});
zone.addEventListener("change",selectStatus);
start.addEventListener("click",()=>{
  guide.hidden=false;
  start.setAttribute("aria-expanded","true");
  guide.scrollIntoView({behavior:"smooth",block:"start"});
  uf.focus({preventScroll:true});
});
close.addEventListener("click",()=>{
  guide.hidden=true;
  start.setAttribute("aria-expanded","false");
  start.focus();
});
function updateCommandOutput(data){
  for(const key of ["install","check","start","status","catalog"]){
    text("cmd-"+key,data[key]);
  }
  if(data.export)text("cmd-export",data.export);
}
form.addEventListener("submit",event=>{
  event.preventDefault();
  resetGuide();
  const selected=cityForSelection();
  if(!selected||!zone.value||published===null){
    message.textContent="Escolha uma zona válida e confira o status antes de prosseguir.";
    return;
  }
  try{
    const loc=validarLocalidade({
      uf:uf.value,municipio:selected.nome,codigo:selected.codigo,zona:zone.value
    });
    if(!selected.zonas.includes(loc.zona))throw Error("Esta zona não pertence ao município selecionado.");
    if(isPublished(loc)){
      message.textContent="Esta zona já foi publicada; escolha outra para evitar duplicidade.";
      selectStatus();return;
    }
    locationSelected=loc;
    const commands=gerarRoteiro(loc);
    updateCommandOutput(commands);
    text("collect-location",loc.uf+" · "+loc.municipio+" · zona "+loc.zona);
    steps.hidden=false;steps.scrollIntoView({behavior:"smooth",block:"start"});
    message.textContent="Zona selecionada. Confirme com outros colaboradores se já existe coleta em andamento.";
  }catch(err){message.textContent=String(err.message);}
});
build.addEventListener("click",()=>{
  output.hidden=true;status.textContent="";
  if(!locationSelected){status.textContent="Escolha a zona primeiro.";return;}
  try{
    const commands=gerarRoteiro(locationSelected,totalInput.value);
    text("cmd-export",commands.export);text("cmd-catalog",commands.catalog);
    output.hidden=false;
    status.textContent="Roteiro gerado. Execute e valide antes de enviar o Pull Request.";
    output.scrollIntoView({behavior:"smooth",block:"start"});
  }catch(err){status.textContent=String(err.message);}
});
for(const button of document.querySelectorAll(".copy-command")){
  button.addEventListener("click",async()=>{
    const content=document.getElementById(button.dataset.copy).textContent;
    try{
      await navigator.clipboard.writeText(content);
      const previous=button.textContent;button.textContent="Copiado!";
      setTimeout(()=>button.textContent=previous,1400);
    }catch{status.textContent="Não foi possível copiar. Selecione o texto manualmente.";}
  });
}
loadCatalog();
