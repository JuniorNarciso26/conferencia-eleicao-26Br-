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
