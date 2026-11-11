"use strict";
const $=id=>document.getElementById(id);
const labels={biometria_reconhecida:"Biometria reconhecida",sem_biometria_cadastrada:"Sem biometria cadastrada",biometria_nao_reconhecida_habilitacao_manual:"Habilitação manual após falha"};
let data=null,visible=0;
function node(tag,content,cls){const e=document.createElement(tag);if(content!==undefined)e.textContent=content;if(cls)e.className=cls;return e}
function summary(){
  const rows=data.percursos;
  const count=(path,n)=>rows.filter(row=>(!path||row[1]===path)&&
    (n===undefined||row[2].length===n)).length;
  const recognized="biometria_reconhecida",absent="sem_biometria_cadastrada",manual="biometria_nao_reconhecida_habilitacao_manual";
  const entries=[["Percursos concluídos",rows.length],["Biometria reconhecida",count(recognized)],["Sem biometria",count(absent)],["Habilitação manual",count(manual)]];
  $("resumo").replaceChildren(...entries.map(([label,value])=>{const box=node("div");box.append(node("b",String(value)),node("span",label));return box}));
  function button(label,total,path,attempts,detail,major=false){
    const b=node("button",undefined,"fluxo-botao"+(major?" total":""));
    b.type="button";
    b.append(node("b",String(total)),node("span",label));
    if(detail)b.append(node("small",detail));
    b.addEventListener("click",()=>{
      $("caminho").value=path;
      $("tentativas").value=attempts===undefined?"":String(attempts);
      $("numero").value="";
      $("quantidade-eventos").value="";
      render();
      $("percursos-title").scrollIntoView({behavior:"smooth",block:"start"});
    });
    return b;
  }
  const yes=node("div",undefined,"fluxo-ramo");
  yes.append(node("h4","Biometria reconhecida"),node("p","Digital do eleitor reconhecida; votação habilitada."));
  yes.append(button("Todos os reconhecidos",count(recognized),recognized,undefined,"1 a 4 tentativas",true));
  const yesChildren=node("div",undefined,"fluxo-filhos");
  for(const n of [1,2,3,4])yesChildren.append(button(n+" tentativa"+(n>1?"s":""),count(recognized,n),recognized,n,"Reconhecimento na tentativa "+n));
  yes.append(yesChildren);
  const no=node("div",undefined,"fluxo-ramo");
  no.append(node("h4","Sem biometria reconhecida"),node("p","Sem cadastro biométrico ou leituras sem reconhecimento."));
  const noTotal=count(absent)+count(manual);
  no.append(button("Todos deste ramo",noTotal,"sem_reconhecimento",undefined,"20 sem cadastro + 8 habilitações manuais",true));
  const noChildren=node("div",undefined,"fluxo-filhos");
  noChildren.append(button("Sem biometria cadastrada",count(absent),absent,0,"Conferência de dado pessoal"));
  noChildren.append(button("Após 4 tentativas",count(manual,4),manual,4,"Falha biométrica → dado pessoal → digital do mesário"));
  no.append(noChildren);
  $("fluxos").replaceChildren(yes,no);
  const percent=value=>(100*value/rows.length).toLocaleString("pt-BR",{maximumFractionDigits:1})+"%";
  const summaryBox=$("resumo-texto");
  summaryBox.replaceChildren();
  summaryBox.append(node("h3","Resumo do primeiro teste"));
  const text=node("p");
  text.textContent="Dos "+rows.length+" percursos concluídos, "+count(recognized)+" ("+percent(count(recognized))+") tiveram biometria reconhecida. Os outros "+noTotal+" se dividem em "+count(absent)+" sem biometria cadastrada e "+count(manual)+" com habilitação manual após falha biométrica.";
  summaryBox.append(text);
  const detail=node("p");
  detail.textContent="Entre os percursos com leitura biométrica, "+count(recognized,4)+" foram reconhecidos na quarta tentativa e "+count(manual,4)+" seguiram para habilitação manual depois de quatro tentativas. Esta contagem descreve a seção 0001; não comprova voto sem eleitor.";
  summaryBox.append(detail);
}
function routeMatch(row){
  const path=$("caminho").value,attempts=$("tentativas").value;
  return (!path||row[1]===path||(path==="sem_reconhecimento"&&row[1]!=="biometria_reconhecida"))&&
    (!attempts||row[2].length===Number(attempts));
}
function match(row){
  const n=$("numero").value.trim(),eventCount=$("quantidade-eventos").value;
  return routeMatch(row)&&(!eventCount||row[3].length===Number(eventCount))&&
    (!n||row[0]===Number(n));
}
function eventGroups(){
  const counts=new Map();
  for(const row of data.percursos.filter(routeMatch)){
    const n=row[3].length;counts.set(n,(counts.get(n)||0)+1);
  }
  const select=$("quantidade-eventos"),selected=select.value;
  select.replaceChildren(new Option("Todas",""),...([...counts.keys()].sort((a,b)=>a-b).map(n=>new Option(n+" eventos",String(n)))));
  if(counts.has(Number(selected))&&selected!=="")select.value=selected;
  const buttons=[...counts].sort((a,b)=>a[0]-b[0]).map(([events,total])=>{
    const button=node("button",total+" percurso"+(total===1?"":"s")+" · "+events+" eventos","mapa-event-button");
    button.type="button";
    if(select.value===String(events))button.setAttribute("aria-pressed","true");
    button.addEventListener("click",()=>{
      select.value=select.value===String(events)?"":String(events);
      $("numero").value="";
      render();
    });
    return button;
  });
  $("eventos-grupos").replaceChildren(...buttons);
}
function card(row){
  const details=node("details",undefined,"mapa-item");
  const head=node("summary");head.append(node("span","Percurso "+row[0]),node("span",labels[row[1]]||row[1]),node("small",row[2].length+" tentativa(s) solicitada(s) · "+row[3].length+" eventos"));details.append(head);
  const list=node("ol");for(const [second,code] of row[3]){const li=node("li");li.append(node("time","+"+second+" s"),node("span",data.eventos[code]));list.append(li)}details.append(list);return details;
}
function render(reset=true){
  if(!data)return;
  if(reset)visible=20;else visible+=20;
  eventGroups();
  const rows=data.percursos.filter(match);
  $("resultado-count").textContent=rows.length+" percurso(s) encontrado(s)";
  $("lista").replaceChildren(...rows.slice(0,visible).map(card));
  $("mais").hidden=visible>=rows.length;
}
function temporalSignature(row){
  const events=row[3],deltas=events.map(([second],i)=>i?second-events[i-1][0]:0);
  const messages=events.map(([,code])=>data.eventos[code]);
  const key=JSON.stringify([row[1],row[2].length,events.length,messages,deltas]);
  return {key,deltas,messages};
}
function renderTemporal(){
  if(!data)return;
  const route=$("rota-assinatura").value,attempts=$("tentativas-assinatura").value;
  const eventSelect=$("eventos-assinatura"),referenceSelect=$("referencia-assinatura");
  const eligible=data.percursos.filter(row=>(!route||row[1]===route)&&(!attempts||row[2].length===Number(attempts)));
  const selectedEvents=eventSelect.value;
  const lengths=[...new Set(eligible.map(row=>row[3].length))].sort((a,b)=>a-b);
  eventSelect.replaceChildren(new Option("Todos",""),...lengths.map(n=>new Option(n+" eventos",String(n))));
  if(selectedEvents&&lengths.includes(Number(selectedEvents)))eventSelect.value=selectedEvents;
  const options=eligible.filter(row=>!eventSelect.value||row[3].length===Number(eventSelect.value));
  const selectedReference=Number(referenceSelect.value);
  referenceSelect.replaceChildren(...options.map(row=>new Option(
    "Percurso "+row[0]+(row[0]===92?" — assinatura do estudo":""),String(row[0]))));
  const reference=options.find(row=>row[0]===selectedReference)||
    options.find(row=>row[0]===92)||options[0];
  const target=$("temporal-grupos");
  if(!reference){
    $("temporal-resumo").textContent="Nenhum percurso com esses filtros.";
    target.replaceChildren();return;
  }
  referenceSelect.value=String(reference[0]);
  const sig=temporalSignature(reference);
  const matches=data.percursos.filter(row=>temporalSignature(row).key===sig.key);
  const others=matches.filter(row=>row[0]!==reference[0]);
  $("temporal-resumo").textContent="Assinatura do percurso "+reference[0]+": "+
    matches.length+" percurso(s) com a mesma sequência e todos os intervalos iguais. "+
    (others.length?"Correspondências: "+matches.map(row=>row[0]).join(", ")+".":"Nenhuma outra correspondência.");
  const wrap=node("details",undefined,"mapa-temporal-item");wrap.open=true;
  const head=node("summary");
  head.append(node("strong","Uma assinatura selecionada"),
    node("span",labels[reference[1]]||reference[1]),
    node("small",reference[2].length+" tentativa(s) · "+reference[3].length+" eventos"));
  wrap.append(head);
  const body=node("div",undefined,"mapa-temporal-body");
  body.append(node("p","Percursos com esta assinatura: "+matches.map(row=>row[0]).join(", ")));
  body.append(node("p","Intervalos entre eventos (s): "+sig.deltas.slice(1).join(" · ")));
  const list=node("ol");
  sig.messages.forEach((message,i)=>{
    const li=node("li");
    li.append(node("b",i===0?"início":"+"+sig.deltas[i]+" s"),node("span",message));
    list.append(li);
  });
  body.append(list);wrap.append(body);target.replaceChildren(wrap);
}
async function load(){
  try{
    const response=await fetch("./dados/mapa_votos_0252_0001_2t_compacto.json",{cache:"no-store"});
    if(!response.ok)throw new Error("HTTP "+response.status);
    data=await response.json();
    if(!Array.isArray(data.percursos)||!Array.isArray(data.eventos))throw new Error("Formato inválido");
    summary();render();renderTemporal();
  }catch(e){$("resumo").replaceChildren(node("p","Não foi possível carregar os percursos: "+e.message));}
}
for(const id of ["rota-assinatura","tentativas-assinatura","eventos-assinatura","referencia-assinatura"])$(id).addEventListener("change",renderTemporal);
for(const id of ["caminho","tentativas","quantidade-eventos","numero"])$(id).addEventListener(id==="numero"?"input":"change",()=>render());
$("mais").addEventListener("click",()=>render(false));
load();
