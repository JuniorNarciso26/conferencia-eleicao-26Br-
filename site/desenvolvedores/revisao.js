"use strict";
const $=s=>document.querySelector(s);
const API=(window.CONF_CONFIG?.apiBaseUrl||"").replace(/\/+$/,"");
const TOKEN_KEY="conferencia_eleitoral_token";
const message=$("#review-message"),list=$("#review-list"),detail=$("#review-detail");
const detailTitle=$("#review-detail-title"),detailStats=$("#review-detail-stats");
const preview=$("#review-detail-preview"),download=$("#review-download");
const approve=$("#review-approve"),reject=$("#review-reject"),reason=$("#review-reason");
let selected=null,downloadURL=null;

async function api(path,options={}){
  const token=sessionStorage.getItem(TOKEN_KEY);
  if(!token)throw Error("Entre com GitHub para acessar a revisão.");
  const r=await fetch(API+path,{cache:"no-store",...options,
    headers:{Authorization:"Bearer "+token,...options.headers}});
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(r.status===403?"Esta conta GitHub não está autorizada a revisar resultados.":
    (body.code||"Erro HTTP "+r.status));
  return body;
}
function node(tag,text,className){
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=text;
  if(className)el.className=className;
  return el;
}
async function refresh(){
  message.textContent="Consultando entregas pendentes...";
  list.replaceChildren();detail.hidden=true;selected=null;
  if(downloadURL){URL.revokeObjectURL(downloadURL);downloadURL=null;}
  try{
    const result=await api("/api/review/queue");
    if(!result.items.length){message.textContent="Nenhuma entrega aguardando revisão.";return;}
    message.textContent=result.items.length+" entregas aguardam conferência.";
    for(const item of result.items){
      const card=node("div",undefined,"review-item");
      card.append(node("strong",item.zone_key+" · "+item.expected_sections+" seções"),
        node("p","Enviado por @"+item.contributor_login+
          " em "+new Date(item.submitted_at*1000).toLocaleString("pt-BR")));
      const button=node("button","Examinar pacote","button outline");
      button.type="button";
      button.addEventListener("click",()=>openPacket(item.upload_id));
      card.append(button);list.append(card);
    }
  }catch(e){message.textContent=e.message;}
}
async function openPacket(id){
  message.textContent="Carregando pacote completo para conferência...";
  try{
    const res=await api("/api/review/packet?upload_id="+encodeURIComponent(id));
    selected=id;
    detail.hidden=false;
    detailTitle.textContent="Revisão da "+res.zone+" · @"+res.contributor;
    const sum=res.packet.resumo.turnos;
    detailStats.textContent=res.packet.meta.total_secoes+" seções, dois turnos. "+
      "Comparecimento 1º turno: "+sum["1"].comparecimento.toLocaleString("pt-BR")+
      "; 2º turno: "+sum["2"].comparecimento.toLocaleString("pt-BR")+".";
    preview.textContent=JSON.stringify({meta:res.packet.meta,resumo:res.packet.resumo},null,2);
    reason.value="";
    if(downloadURL)URL.revokeObjectURL(downloadURL);
    downloadURL=URL.createObjectURL(new Blob([JSON.stringify(res.packet,null,2)],{type:"application/json"}));
    download.href=downloadURL;
    download.download=res.zone.toLowerCase().replaceAll("-","_")+".json";
    message.textContent="Confira os indicadores, as seções e a consistência do pacote antes de aprovar.";
    detail.scrollIntoView({behavior:"smooth",block:"start"});
  }catch(e){message.textContent=e.message;}
}
async function decision(value){
  if(!selected)return;
  if(value==="reject"&&reason.value.trim().length<5){
    message.textContent="Informe o motivo da rejeição (mínimo cinco caracteres).";return;
  }
  if(value==="approve"&&!window.confirm("Confirma a aprovação e publicação pública desta zona?"))return;
  approve.disabled=true;reject.disabled=true;
  try{
    await api("/api/review/decision",{method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({upload_id:selected,decision:value,reason:reason.value})});
    await refresh();
    message.textContent=value==="approve"?"Zona aprovada e publicada na consulta pública.":
      "Entrega rejeitada, reserva liberada para nova coleta.";
  }catch(e){message.textContent=e.message;}
  finally{approve.disabled=false;reject.disabled=false;}
}
$("#review-refresh").addEventListener("click",refresh);
approve.addEventListener("click",()=>decision("approve"));
reject.addEventListener("click",()=>decision("reject"));
