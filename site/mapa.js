"use strict";
const $=id=>document.getElementById(id);
const labels={biometria_reconhecida:"Biometria reconhecida",sem_biometria_cadastrada:"Sem biometria cadastrada",biometria_nao_reconhecida_habilitacao_manual:"Habilitação manual após falha"};
let data=null,visible=0;
function node(tag,content,cls){const e=document.createElement(tag);if(content!==undefined)e.textContent=content;if(cls)e.className=cls;return e}
function summary(){
  const counts={};for(const row of data.percursos)counts[row[1]]=(counts[row[1]]||0)+1;
  const entries=[["Percursos concluídos",data.percursos.length],["Biometria reconhecida",counts.biometria_reconhecida||0],["Sem biometria",counts.sem_biometria_cadastrada||0],["Habilitação manual",counts.biometria_nao_reconhecida_habilitacao_manual||0]];
  $("resumo").replaceChildren(...entries.map(([label,value])=>{const box=node("div");box.append(node("b",String(value)),node("span",label));return box}));
}
function match(row){
  const path=$("caminho").value,attempts=$("tentativas").value,n=$("numero").value.trim();
  return (!path||row[1]===path)&&(!attempts||row[2].length===Number(attempts))&&(!n||row[0]===Number(n));
}
function card(row){
  const details=node("details",undefined,"mapa-item");
  const head=node("summary");head.append(node("span","Percurso "+row[0]),node("span",labels[row[1]]||row[1]),node("small",row[2].length+" tentativa(s) solicitada(s) · "+row[3].length+" eventos"));details.append(head);
  const list=node("ol");for(const [second,code] of row[3]){const li=node("li");li.append(node("time","+"+second+" s"),node("span",data.eventos[code]));list.append(li)}details.append(list);return details;
}
function render(reset=true){
  if(!data)return;
  if(reset)visible=20;else visible+=20;
  const rows=data.percursos.filter(match);
  $("resultado-count").textContent=rows.length+" percurso(s) encontrado(s)";
  $("lista").replaceChildren(...rows.slice(0,visible).map(card));
  $("mais").hidden=visible>=rows.length;
}
async function load(){
  try{
    const response=await fetch("./dados/mapa_votos_0252_0001_2t_compacto.json",{cache:"no-store"});
    if(!response.ok)throw new Error("HTTP "+response.status);
    data=await response.json();
    if(!Array.isArray(data.percursos)||!Array.isArray(data.eventos))throw new Error("Formato inválido");
    summary();render();
  }catch(e){$("resumo").replaceChildren(node("p","Não foi possível carregar os percursos: "+e.message));}
}
for(const id of ["caminho","tentativas","numero"])$(id).addEventListener(id==="numero"?"input":"change",()=>render());
$("mais").addEventListener("click",()=>render(false));
load();
