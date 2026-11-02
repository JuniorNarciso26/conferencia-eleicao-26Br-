"use strict";
const $=id=>document.getElementById(id);
const API=(window.CONF_CONFIG?.apiBaseUrl||"").replace(/\/+$/,"");
const TOKEN_KEY="conferencia_eleitoral_token";
let selected=null,downloadURL=null;

async function api(path,options={}){
  const token=sessionStorage.getItem(TOKEN_KEY);
  if(!token)throw Error("Entre com GitHub para revisar os horários.");
  const response=await fetch(API+path,{cache:"no-store",...options,
    headers:{Authorization:"Bearer "+token,...options.headers}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(response.status===403?"Esta conta não está autorizada a revisar.":data.code||"Erro HTTP "+response.status);
  return data;
}

async function refresh(){
  $("hourly-review-message").textContent="Consultando horários pendentes...";
  $("hourly-review-list").replaceChildren();$("hourly-review-detail").hidden=true;selected=null;
  try{
    const data=await api("/api/review/hourly/queue");
    $("hourly-review-message").textContent=data.items.length?data.items.length+" zona(s) aguardam revisão.":"Nenhum horário pendente.";
    for(const item of data.items){
      const card=document.createElement("div");card.className="review-item";
      const title=document.createElement("strong");title.textContent=item.zone_key+" · "+item.expected_sections+" seções";
      const detail=document.createElement("p");detail.textContent="Enviado por @"+item.contributor_login;
      const button=document.createElement("button");button.type="button";button.className="button outline";
      button.textContent="Examinar horários";button.addEventListener("click",()=>open(item.upload_id));
      card.append(title,detail,button);$("hourly-review-list").append(card);
    }
  }catch(e){$("hourly-review-message").textContent=e.message;}
}

async function open(uploadId){
  try{
    const data=await api("/api/review/hourly/packet?upload_id="+encodeURIComponent(uploadId));
    selected=uploadId;
    $("hourly-review-detail").hidden=false;
    $("hourly-review-detail-title").textContent=data.zone+" · @"+data.contributor;
    const totals={"1":0,"2":0};
    for(const section of data.sections)for(const turno of ["1","2"])
      totals[turno]+=section.turnos[turno].reduce((a,b)=>a+b,0);
    $("hourly-review-detail-stats").textContent=data.sections.length+" seções · 1º turno: "+
      totals["1"].toLocaleString("pt-BR")+" · 2º turno: "+totals["2"].toLocaleString("pt-BR");
    $("hourly-review-detail-preview").textContent=JSON.stringify({zone:data.zone,sections:data.sections.slice(0,2)},null,2);
    if(downloadURL)URL.revokeObjectURL(downloadURL);
    downloadURL=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
    $("hourly-review-download").href=downloadURL;
    $("hourly-review-download").download=data.zone.toLowerCase().replaceAll("-","_")+"_horarios.json";
    $("hourly-review-reason").value="";
  }catch(e){$("hourly-review-message").textContent=e.message;}
}

async function decide(decision){
  if(!selected)return;
  const reason=$("hourly-review-reason").value.trim();
  if(decision==="reject"&&reason.length<5){
    $("hourly-review-message").textContent="Informe o motivo da rejeição (mínimo cinco caracteres).";return;
  }
  if(decision==="approve"&&!window.confirm("Confirma a publicação pública destes horários?"))return;
  $("hourly-review-approve").disabled=true;$("hourly-review-reject").disabled=true;
  try{
    await api("/api/review/hourly/decision",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({upload_id:selected,decision,reason})});
    await refresh();
    $("hourly-review-message").textContent=decision==="approve"?"Horários aprovados e publicados.":"Horários rejeitados.";
  }catch(e){$("hourly-review-message").textContent=e.message;}
  finally{$("hourly-review-approve").disabled=false;$("hourly-review-reject").disabled=false;}
}

$("hourly-review-refresh").addEventListener("click",refresh);
$("hourly-review-approve").addEventListener("click",()=>decide("approve"));
$("hourly-review-reject").addEventListener("click",()=>decide("reject"));
