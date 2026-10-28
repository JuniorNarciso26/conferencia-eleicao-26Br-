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
