"use strict";
import { validarLocalidade, gerarRoteiro } from "./coleta-roteiro.mjs";
const $=s=>document.querySelector(s);
const start=$("#contribute-start"),guide=$("#contribute-guide"),close=$("#contribute-close");
const form=$("#contribute-form"),steps=$("#collect-steps"),output=$("#collect-export");
const message=$("#collect-message"),build=$("#collect-build"),status=$("#collect-total-message");
const uf=$("#collect-uf"),city=$("#collect-city"),zone=$("#collect-zone");
const code=$("#collect-city-code"),zoneState=$("#collect-zone-status");
const totalInput=$("#collect-total"),generate=$("#collect-generate");
const controls=$("#collect-reservation-controls"),info=$("#collect-reservation-status");
const reserveButton=$("#collect-reserve"),releaseButton=$("#collect-release");
const submitControls=$("#collect-submit-controls"),submitButton=$("#collect-submit");
const prInput=$("#collect-pr-number");
const API=(window.CONF_CONFIG?.apiBaseUrl||"").replace(/\/+$/,"");
const TOKEN_KEY="conferencia_eleitoral_token";
let locations=null,published=null,locationSelected=null,activeLease=null,version=0;

function text(id,value){document.getElementById(id).textContent=value;}
function replaceOptions(select,placeholder,entries=[]){
  select.replaceChildren();
  const blank=document.createElement("option");blank.value="";blank.textContent=placeholder;
  select.appendChild(blank);
  for(const entry of entries){
    const opt=document.createElement("option");
    opt.value=entry.value;opt.textContent=entry.text;select.appendChild(opt);
  }
  select.disabled=entries.length===0;select.value="";
}
function state(textValue,kind="unknown"){
  zoneState.textContent=textValue;zoneState.className="zone-state "+kind;
}
function resetGuide(){
  locationSelected=null;steps.hidden=true;output.hidden=true;
  totalInput.value="";status.textContent="";message.textContent="";generate.disabled=true;
}
function resetControls(){
  controls.hidden=true;reserveButton.hidden=true;releaseButton.hidden=true;
  submitControls.hidden=true;info.textContent="";activeLease=null;
}
function cityForSelection(){return (locations?.ufs?.[uf.value]||[]).find(x=>x.codigo===city.value);}
function currentZone(){
  const selected=cityForSelection();
  if(!selected||!zone.value)return null;
  try{return validarLocalidade({uf:uf.value,municipio:selected.nome,codigo:selected.codigo,zona:zone.value});}
  catch{return null;}
}
function isPublished(loc){
  return published?.some(x=>x.uf===loc.uf&&x.municipio_codigo===loc.codigo&&
    String(x.zona).padStart(4,"0")===loc.zona);
}
function date(ts){
  if(!Number.isFinite(Number(ts)))return "indefinido";
  return new Date(Number(ts)*1000).toLocaleString("pt-BR");
}
function authHeaders(){
  const token=sessionStorage.getItem(TOKEN_KEY);
  return token?{Authorization:"Bearer "+token}:{};
}
function niceError(code){
  return ({
    UNAUTHORIZED:"Seu login GitHub expirou. Entre novamente para reservar a zona.",
    ALREADY_HAS_ACTIVE_ZONE:"Você já tem outra reserva em andamento. Libere-a ou finalize o envio antes de reservar outra.",
    ZONE_UNAVAILABLE:"Outro colaborador já reservou esta zona.",
    ZONE_PUBLISHED:"Esta zona já possui resultados publicados.",
    UNKNOWN_ZONE:"Zona não encontrada no catálogo do TSE.",
    CATALOG_UNAVAILABLE:"Não foi possível verificar o catálogo eleitoral. Tente novamente.",
    RESERVATION_NOT_ACTIVE:"Sua reserva venceu ou não está ativa. Consulte o status novamente.",
    RESERVATION_EXPIRED:"O prazo da sua reserva venceu. A zona voltou a ficar disponível.",
    NOT_OWNER_OR_EXPIRED:"Não foi possível liberar: a reserva não pertence à sua conta ou já venceu.",
    PR_NOT_FOUND:"Pull Request não encontrado no repositório oficial.",
    PR_NOT_ELIGIBLE:"O Pull Request precisa estar aberto, destinado à main e criado pela sua conta GitHub.",
    PR_MISSING_ZONE_DATA:"O PR precisa incluir o JSON consolidado da zona e a atualização do catálogo.",
    PR_FILES_UNAVAILABLE:"Não foi possível conferir os arquivos do PR no GitHub.",
    INVALID_PR:"Informe um número de Pull Request válido."
  })[code]||"Não foi possível concluir a solicitação. Confira a conexão e tente novamente.";
}
async function api(path,options={}){
  if(!API)throw Error("API_NOT_CONFIGURED");
  const response=await fetch(API+path,{cache:"no-store",...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.code||"HTTP_"+response.status);
  return data;
}
async function checkStatus(reset=true){
  if(reset)resetGuide();
  resetControls();
  const seq=++version,loc=currentZone();
  if(!loc){state("Selecione uma zona para verificar a disponibilidade.");return;}
  if(published===null){state("Catálogo de resultados indisponível. Atualize a página.","error");return;}
  if(isPublished(loc)){
    state("Zona "+loc.zona+": resultados PUBLICADOS no portal. Não é necessário repetir a coleta.","published");
    return;
  }
  state("Consultando as reservas compartilhadas da Zona "+loc.zona+"...");
  try{
    const params=new URLSearchParams({uf:loc.uf,municipio:loc.codigo,zona:loc.zona});
    const result=await api("/api/zones/reservation?"+params.toString(),{headers:authHeaders()});
    if(seq!==version)return;
    activeLease=result;controls.hidden=false;
    if(result.status==="available"){
      state("Zona "+loc.zona+": DISPONÍVEL para reserva por 24 horas.","available");
      if(sessionStorage.getItem(TOKEN_KEY)){
        reserveButton.hidden=false;
        info.textContent="Clique para reservar. O prazo começa quando a reserva for confirmada no servidor.";
      }else info.textContent="Entre com GitHub acima para reservar a zona.";
    }else if(result.status==="reserved"){
      const owner="@"+result.contributor,deadline=date(result.expires_at);
      if(result.mine){
        state("Zona "+loc.zona+": SUA RESERVA ATIVA. Prazo de entrega até "+deadline+".","mine");
        releaseButton.hidden=false;submitControls.hidden=false;generate.disabled=false;
        info.textContent="Reserva registrada no servidor. Prepare os dados e informe o número do Pull Request antes do prazo.";
      }else{
        state("Zona "+loc.zona+": SENDO PROCESSADA POR "+owner+". Prazo até "+deadline+".","reserved");
        info.textContent="A zona está reservada por outro colaborador. Ela será liberada após o vencimento se os dados não forem entregues.";
      }
    }else if(result.status==="submitted"){
      state("Zona "+loc.zona+": DADOS ENVIADOS POR @"+result.contributor+"; AGUARDANDO REVISÃO.","submitted");
      info.textContent=result.pr_number
        ?"Pull Request #"+result.pr_number+" registrado. O bloqueio permanece até a revisão/publicação."
        :"O envio foi registrado e aguarda revisão.";
    }else{
      state("Não foi possível interpretar o estado desta zona.","error");
    }
  }catch(err){
    if(seq!==version)return;
    resetControls();
    state("Não foi possível confirmar se a Zona "+loc.zona+" está reservada. Nenhuma nova coleta deve ser iniciada sem verificar a disponibilidade.","error");
    info.textContent=niceError(err.message);
  }
}
async function changeReservation(path,payload){
  const token=sessionStorage.getItem(TOKEN_KEY);
  if(!token)throw Error("UNAUTHORIZED");
  const loc=currentZone();
  if(!loc)throw Error("INVALID_ZONE");
  return api(path,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
    body:JSON.stringify({uf:loc.uf,municipio:loc.codigo,zona:loc.zona,...payload})});
}
async function action(button,path,payload){
  button.disabled=true;message.textContent="";
  try{
    await changeReservation(path,payload);
    await checkStatus(path==="/api/zones/release");
  }catch(err){
    message.textContent=niceError(err.message);
    await checkStatus(false);
    message.textContent=niceError(err.message);
  }finally{button.disabled=false;}
}
reserveButton.addEventListener("click",()=>action(reserveButton,"/api/zones/reserve",{}));
releaseButton.addEventListener("click",()=>action(releaseButton,"/api/zones/release",{}));
submitButton.addEventListener("click",()=>{
  const n=Number(prInput.value);
  if(!Number.isSafeInteger(n)||n<1){message.textContent="Informe um número de Pull Request válido.";return;}
  action(submitButton,"/api/zones/submit",{pr_number:n});
});
async function loadCatalog(){
  try{
    const [r1,r2]=await Promise.all([
      fetch("../dados/localidades_2026.json",{cache:"no-store"}),
      fetch("../dados/catalogo.json",{cache:"no-store"})
    ]);
    if(!r1.ok||!r2.ok)throw Error("Catálogos indisponíveis");
    const [data,cat]=await Promise.all([r1.json(),r2.json()]);
    const keys=Object.keys(data.ufs||{});
    if(data.versao!==1||data.eleicao!==2026||keys.length!==27||
       !Array.isArray(cat.zonas)||!keys.every(k=>Array.isArray(data.ufs[k])))throw Error("Catálogos inválidos");
    locations=data;published=cat.zonas;
    replaceOptions(uf,"Escolha o estado",keys.sort().map(x=>({value:x,text:x})));
    state("Selecione estado, município e zona para verificar as reservas.");
    $("#collect-source").textContent="Catálogo oficial TSE 2026 · "+data.total_municipios.toLocaleString("pt-BR")+" municípios.";
  }catch(err){
    locations=null;published=null;
    replaceOptions(uf,"Catálogo indisponível");
    state("Não foi possível carregar as localidades ou o catálogo de resultados.","error");
    $("#collect-source").textContent=String(err.message);
  }
}
uf.addEventListener("change",()=>{
  version++;resetGuide();resetControls();code.value="";
  replaceOptions(zone,"Selecione primeiro o município");
  const cities=locations?.ufs?.[uf.value]||[];
  replaceOptions(city,"Escolha o município",cities.map(c=>({value:c.codigo,text:c.nome})));
  state(cities.length?"Selecione o município para listar suas zonas.":"Selecione um estado.");
});
city.addEventListener("change",()=>{
  version++;resetGuide();resetControls();
  const selected=cityForSelection();code.value=selected?.codigo||"";
  replaceOptions(zone,"Escolha a zona eleitoral",(selected?.zonas||[]).map(z=>({value:z,text:"Zona "+z})));
  state(selected?"Selecione a zona para consultar as reservas.":"Selecione um município.");
});
zone.addEventListener("change",()=>checkStatus(true));
start.addEventListener("click",()=>{
  guide.hidden=false;start.setAttribute("aria-expanded","true");
  guide.scrollIntoView({behavior:"smooth",block:"start"});uf.focus({preventScroll:true});
});
close.addEventListener("click",()=>{guide.hidden=true;start.setAttribute("aria-expanded","false");start.focus();});
function updateCommands(data){
  for(const k of ["install","check","start","status","monitor","catalog"])text("cmd-"+k,data[k]);
  if(data.export)text("cmd-export",data.export);
}
form.addEventListener("submit",async event=>{
  event.preventDefault();message.textContent="";
  const loc=currentZone();
  if(!loc||!activeLease||activeLease.status!=="reserved"||!activeLease.mine){
    message.textContent="Primeiro faça a reserva da zona com sua conta GitHub.";return;
  }
  try{
    // Revalida no servidor: a reserva pode ter expirado desde a ultima consulta.
    const params=new URLSearchParams({uf:loc.uf,municipio:loc.codigo,zona:loc.zona});
    const checked=await api("/api/zones/reservation?"+params,{headers:authHeaders()});
    if(checked.status!=="reserved"||!checked.mine){
      await checkStatus();
      message.textContent="Sua reserva não está mais ativa. Confira o prazo.";return;
    }
    locationSelected=loc;
    updateCommands(gerarRoteiro(loc));
    text("collect-location",loc.uf+" · "+loc.municipio+" · zona "+loc.zona);
    steps.hidden=false;steps.scrollIntoView({behavior:"smooth",block:"start"});
    message.textContent="Reserva confirmada. Acompanhe o prazo e registre seu PR antes do vencimento.";
  }catch(err){message.textContent=niceError(err.message);}
});
build.addEventListener("click",()=>{
  output.hidden=true;status.textContent="";
  if(!locationSelected){status.textContent="Primeiro reserve a zona.";return;}
  try{
    const commands=gerarRoteiro(locationSelected,totalInput.value);
    text("cmd-export",commands.export);text("cmd-catalog",commands.catalog);
    output.hidden=false;
    status.textContent="Gere e valide os resultados. Depois registre seu Pull Request antes do prazo.";
    output.scrollIntoView({behavior:"smooth",block:"start"});
  }catch(err){status.textContent=String(err.message);}
});
for(const button of document.querySelectorAll(".copy-command")){
  button.addEventListener("click",async()=>{
    try{
      await navigator.clipboard.writeText(document.getElementById(button.dataset.copy).textContent);
      const previous=button.textContent;button.textContent="Copiado!";
      setTimeout(()=>{button.textContent=previous;},1400);
    }catch{status.textContent="Não foi possível copiar. Selecione o texto manualmente.";}
  });
}
loadCatalog();
// O servidor define a expiracao. Reconsulta a cada minuto se ha uma zona selecionada.
setInterval(()=>{if(zone.value&&!guide.hidden)checkStatus(false);},60000);
