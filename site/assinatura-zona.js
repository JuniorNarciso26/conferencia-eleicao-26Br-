"use strict";
(() => {
  const get=id=>document.getElementById(id);
  const make=(tag,content,cls)=>{const e=document.createElement(tag);if(content!==undefined)e.textContent=content;if(cls)e.className=cls;return e};
  const pct=(n,d)=>(100*n/d).toLocaleString("pt-BR",{maximumFractionDigits:1})+"%";
  let data;
  function draw(){
    if(!data)return;
    const q=get("zona-secao").value.trim(),only=get("zona-somente").checked;
    const sections=data.secoes.filter(s=>(!only||s.posicoes.length>0)&&(!q||s.secao.includes(q)));
    get("zona-contagem").textContent=sections.length+" seção(ões) exibida(s)";
    const rows=sections.map(s=>{
      const tr=make("tr");
      tr.append(make("th",s.secao),make("td",String(s.computados)),make("td",String(s.posicoes.length)),
        make("td",s.posicoes.length?s.posicoes.join(", "):"—"),make("td",s.ressalvas.join("; ")||"—"));
      return tr;
    });
    get("zona-corpo").replaceChildren(...rows);
  }
  async function load(){
    try{
      const response=await fetch("./dados/assinatura_zona_0252.json",{cache:"no-store"});
      if(!response.ok)throw Error("HTTP "+response.status);
      data=await response.json();
      const hits=data.ocorrencias.length,sections=data.secoes.filter(s=>s.posicoes.length).length;
      const cards=[["Ocorrências",hits],["Seções com assinatura",sections],["Seções analisadas",data.secoes.length]];
      get("zona-indicadores").replaceChildren(...cards.map(([label,n])=>{const e=make("div");e.append(make("b",String(n)),make("span",label));return e}));
      const a=data.comparacao.assinatura,b=data.comparacao.controle;
      get("zona-comparacao").replaceChildren(
        make("li","Posição: da 20ª à 271ª conclusão; não há uma posição fixa."),
        make("li","Distância entre posições consecutivas da assinatura na mesma seção: "+data.secoes.flatMap(s=>s.posicoes.slice(1).map((n,i)=>n-s.posicoes[i])).sort((x,y)=>x-y).join(", ")+" posições; as dez distâncias são diferentes."),
        make("li","Intervalo desde a conclusão anterior: mediana de "+a.mediana_intervalo_s+" s nas ocorrências e "+b.mediana_intervalo_s+" s no controle; nas ocorrências variou de "+a.intervalo_min_s+" a "+a.intervalo_max_s+" s."),
        make("li","Última mensagem: “Aguardando digitação do identificador do eleitor” em "+a.aguardando_identificador+"/"+a.total+" ocorrências ("+pct(a.aguardando_identificador,a.total)+") e "+b.aguardando_identificador+"/"+b.total+" controles ("+pct(b.aguardando_identificador,b.total)+")."),
        make("li","Entre a conclusão anterior e o início: só a mensagem de espera em "+data.comparacao.entre_percursos.somente_espera_casos+"/"+a.total+" casos e "+data.comparacao.entre_percursos.somente_espera_controles+"/"+b.total+" controles."),
        make("li","Rota anterior com biometria reconhecida: "+a.anterior_biometrica+"/"+a.total+" ocorrências e "+b.anterior_biometrica+"/"+b.total+" controles."),
        make("li","Percurso anterior: "+data.comparacao.sequencia_anterior.distintas_nos_casos+" sequências de mensagens distintas entre os casos; a mais frequente apareceu em "+data.comparacao.sequencia_anterior.mais_comum_nos_casos+"/"+a.total+" casos e "+data.comparacao.sequencia_anterior.mesma_sequencia_nos_controles+"/"+b.total+" controles."),
        make("li","Posição no segundo quarto da seção: "+a.quartil_2+"/"+a.total+" ocorrências ("+pct(a.quartil_2,a.total)+") e "+b.quartil_2+"/"+b.total+" controles ("+pct(b.quartil_2,b.total)+"). Esta diferença é exploratória e precisa ser testada em outra amostra.")
      );
      draw();
    }catch(error){get("zona-erro").textContent="Não foi possível carregar o painel: "+error.message;get("zona-erro").hidden=false}
  }
  get("zona-somente").addEventListener("change",draw);
  get("zona-secao").addEventListener("input",draw);
  load();
})();