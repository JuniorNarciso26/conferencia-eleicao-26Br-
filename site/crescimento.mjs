// Identidades contabeis da variacao de votos entre turnos.
// Sem inferencia de migracao individual, significancia ou irregularidades.
const numericFields=["lula","flavio","outros","brancos","nulos","nulos_tecnicos","comparecimento","aptos"];

export function calcularCrescimento(resumo) {
  const t1=resumo?.turnos?.["1"],t2=resumo?.turnos?.["2"];
  if(!t1||!t2)throw Error("Turnos 1 e 2 ausentes");
  for(const t of [t1,t2]){
    for(const f of numericFields)
      if(!Number.isSafeInteger(t[f])||t[f]<0)throw Error("Campo inválido: "+f);
    const soma=t.lula+t.flavio+t.outros+t.brancos+t.nulos+t.nulos_tecnicos;
    if(soma!==t.comparecimento||t.comparecimento>t.aptos)
      throw Error("Totais do turno não conferem");
  }
  const deltaLula=t2.lula-t1.lula;
  const deltaFlavio=t2.flavio-t1.flavio;
  const incrementoFinalistas=deltaLula+deltaFlavio;
  const outros=t1.outros-t2.outros;
  const comparecimento=t2.comparecimento-t1.comparecimento;
  const brancosNulos=(t1.brancos+t1.nulos+t1.nulos_tecnicos)-
                     (t2.brancos+t2.nulos+t2.nulos_tecnicos);
  const componentes=outros+comparecimento+brancosNulos;
  if(componentes!==incrementoFinalistas)throw Error("Reconciliação matemática divergente");
  const totalFinalistasT1=t1.lula+t1.flavio;
  const totalFinalistasT2=t2.lula+t2.flavio;
  const participacaoLulaT1=totalFinalistasT1>0?t1.lula/totalFinalistasT1:null;
  const participacaoLulaT2=totalFinalistasT2>0?t2.lula/totalFinalistasT2:null;
  // A parcela de incremento so tem interpretacao natural quando ambos os candidatos crescem.
  const comparacaoAplicavel=incrementoFinalistas>0&&deltaLula>=0&&deltaFlavio>=0&&
    participacaoLulaT1!==null;
  const referenciaLula=comparacaoAplicavel?incrementoFinalistas*participacaoLulaT1:null;
  return {
    lula:{t1:t1.lula,t2:t2.lula,delta:deltaLula},
    flavio:{t1:t1.flavio,t2:t2.flavio,delta:deltaFlavio},
    incrementoFinalistas,
    componentes:{outros,comparecimento,brancosNulos},
    reconciliacao:incrementoFinalistas-componentes,
    participacaoLulaT1,participacaoLulaT2,
    parcelaIncrementoLula:comparacaoAplicavel?deltaLula/incrementoFinalistas:null,
    referenciaLula,
    desvioReferencia:referenciaLula===null?null:deltaLula-referenciaLula
  };
}


// Diferenca relativa ao 1o turno, quando existe denominador valido.
// Nunca confundir percentual relativo com diferenca em pontos percentuais.
export function percentualVariacao(primeiro,segundo){
  if(!Number.isSafeInteger(primeiro)||!Number.isSafeInteger(segundo)||
     primeiro<0||segundo<0||primeiro===0)return null;
  return (segundo-primeiro)/primeiro*100;
}

// Descreve a distribuicao dos ganhos/variacoes pelas secoes; nao atribui
// transferencias de votos individuais nem inferencia causal.
export function analisarPadraoSecoes(secoes) {
  if(!Array.isArray(secoes)||secoes.length===0)throw Error("Sem seções válidas");
  const vistos=new Set(),linhas=[];
  const totais={lulaMaior:0,flavioMaior:0,iguais:0,ambosCresceram:0};
  for(const secao of secoes){
    const id=String(secao?.meta?.secao||"");
    if(!/^[0-9]{4}$/.test(id)||vistos.has(id))throw Error("Seção inválida ou repetida");
    vistos.add(id);
    const analise=calcularCrescimento(secao);
    const l=analise.lula,f=analise.flavio;
    const grupo=l.delta>f.delta?"lula":f.delta>l.delta?"flavio":"igual";
    if(grupo==="lula")totais.lulaMaior++;
    else if(grupo==="flavio")totais.flavioMaior++;
    else totais.iguais++;
    if(l.delta>0&&f.delta>0)totais.ambosCresceram++;
    linhas.push({
      secao:id,
      deltaLula:l.delta,deltaFlavio:f.delta,
      percentualLula:percentualVariacao(l.t1,l.t2),
      percentualFlavio:percentualVariacao(f.t1,f.t2),
      deltaComparecimento:analise.componentes.comparecimento,
      deltaVotosValidos:analise.componentes.comparecimento+analise.componentes.brancosNulos,
      grupo
    });
  }
  linhas.sort((a,b)=>a.secao.localeCompare(b.secao));
  return {total:linhas.length,contagens:totais,linhas};
}


// Histograma simetrico da diferenca de crescimento liquido dos finalistas,
// normalizada pelo comparecimento da propria secao no PRIMEIRO turno.
// "Ponderado" = percentual do comparecimento total do 1T representado
// pelas secoes de cada faixa, NAO atribuicao de transferencia individual.
export const FAIXAS_DIFERENCA=Object.freeze([
  {id:"f20",rotulo:"Flávio: 20 p.p. ou mais",lado:"flavio"},
  {id:"f10",rotulo:"Flávio: 10–20 p.p.",lado:"flavio"},
  {id:"f5",rotulo:"Flávio: 5–10 p.p.",lado:"flavio"},
  {id:"f2",rotulo:"Flávio: 2–5 p.p.",lado:"flavio"},
  {id:"equilibrio",rotulo:"Diferença abaixo de 2 p.p.",lado:"equilibrio"},
  {id:"l2",rotulo:"Lula: 2–5 p.p.",lado:"lula"},
  {id:"l5",rotulo:"Lula: 5–10 p.p.",lado:"lula"},
  {id:"l10",rotulo:"Lula: 10–20 p.p.",lado:"lula"},
  {id:"l20",rotulo:"Lula: 20 p.p. ou mais",lado:"lula"}
]);
export function classificarDiferencaPontos(pontos){
  if(!Number.isFinite(pontos))throw Error("Diferença normalizada inválida");
  if(pontos<=-20)return "f20";
  if(pontos<=-10)return "f10";
  if(pontos<=-5)return "f5";
  if(pontos<=-2)return "f2";
  if(pontos<2)return "equilibrio";
  if(pontos<5)return "l2";
  if(pontos<10)return "l5";
  if(pontos<20)return "l10";
  return "l20";
}
export function analisarHistogramaPonderado(secoes){
  if(!Array.isArray(secoes)||secoes.length===0)throw Error("Sem seções para ponderar");
  const faixas=FAIXAS_DIFERENCA.map(f=>({...f,urnas:0,eleitores1t:0,secoes:[]}));
  const index=new Map(faixas.map(f=>[f.id,f]));
  const seen=new Set();
  let totalEleitores=0,semBase=0;
  const linhas=[];
  for(const item of secoes){
    const id=String(item?.meta?.secao||"");
    if(!/^[0-9]{4}$/.test(id)||seen.has(id))throw Error("Seção inválida ou repetida");
    seen.add(id);
    const delta=calcularCrescimento(item);
    const base=item.turnos["1"].comparecimento;
    if(!Number.isSafeInteger(base)||base<0)throw Error("Comparecimento inválido");
    const diferenca=delta.lula.delta-delta.flavio.delta;
    if(base===0){
      semBase++;
      linhas.push({secao:id,diferencaVotos:diferenca,pontos:null,faixa:null,eleitores1t:base});
      continue;
    }
    const pontos=100*diferenca/base;
    const faixa=classificarDiferencaPontos(pontos);
    const b=index.get(faixa);
    b.urnas++;
    b.eleitores1t+=base;
    b.secoes.push(id);
    totalEleitores+=base;
    linhas.push({secao:id,diferencaVotos:diferenca,pontos,faixa,eleitores1t:base});
  }
  for(const b of faixas){
    b.percentualUrnas=b.urnas/secoes.length*100;
    b.percentualPonderado=totalEleitores?100*b.eleitores1t/totalEleitores:0;
  }
  const intensas={
    flavio:faixas.filter(f=>f.id==="f10"||f.id==="f20"),
    lula:faixas.filter(f=>f.id==="l10"||f.id==="l20")
  };
  const forte=Object.fromEntries(Object.entries(intensas).map(([key,groups])=>
    [key,{
      urnas:groups.reduce((n,f)=>n+f.urnas,0),
      eleitores1t:groups.reduce((n,f)=>n+f.eleitores1t,0),
      percentualUrnas:groups.reduce((n,f)=>n+f.urnas,0)/secoes.length*100,
      percentualPonderado:totalEleitores
        ? groups.reduce((n,f)=>n+f.eleitores1t,0)/totalEleitores*100:0
    }]));
  return {
    totalUrnas:secoes.length,
    urnasComBase:secoes.length-semBase,
    semBase,totalEleitores1t:totalEleitores,
    faixas,forte,linhas
  };
}
