const HEADER = ["turno", "secao", "hora", "votacoes_concluidas"];

export function analisarCsv(texto) {
  const linhas = texto.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (linhas.shift() !== HEADER.join(";")) throw new Error("Cabeçalho CSV inválido. Use o exportador de horários do projeto.");
  const registros = new Map();
  const secoes = new Set();
  const totais = {"1T": 0, "2T": 0};
  for (const [indice, linha] of linhas.entries()) {
    const campos = linha.split(";");
    if (campos.length !== 4) throw new Error(`Linha ${indice + 2}: esperado quatro campos.`);
    const [turno, secao, hora, quantidade] = campos;
    const valor = Number(quantidade);
    if (!["1T", "2T"].includes(turno) || !/^\d{4}$/.test(secao) ||
        !/^\d{2}$/.test(hora) || Number(hora) > 23 ||
        !/^(0|[1-9]\d*)$/.test(quantidade) || !Number.isSafeInteger(valor)) {
      throw new Error(`Linha ${indice + 2}: turno, seção, hora ou contagem inválidos.`);
    }
    const chave = `${turno}|${secao}|${hora}`;
    if (registros.has(chave)) throw new Error(`Linha ${indice + 2}: registro repetido.`);
    registros.set(chave, valor);
    secoes.add(secao);
    totais[turno] += valor;
    if (!Number.isSafeInteger(totais[turno])) throw new Error("Total acima do limite numérico seguro.");
  }
  if (!secoes.size || !totais["1T"] || !totais["2T"]) throw new Error("O CSV deve conter votações nos dois turnos.");
  return {registros, secoes: [...secoes].sort(), totais};
}

export function analisarPacoteHorario(pacote) {
  if(!pacote||!pacote.meta||!Array.isArray(pacote.secoes)||
     !Number.isSafeInteger(pacote.meta.total_secoes)||
     pacote.secoes.length!==pacote.meta.total_secoes||
     pacote.secoes.length<1)throw new Error("Pacote de horários inválido.");
  const linhas=[HEADER.join(";")];
  const secoes=new Set();
  for(const item of pacote.secoes){
    if(!/^[0-9]{4}$/.test(item?.secao)||secoes.has(item.secao))
      throw new Error("Seção de horários inválida ou repetida.");
    secoes.add(item.secao);
    for(const turno of ["1","2"]){
      const horas=item.turnos?.[turno];
      if(!Array.isArray(horas)||horas.length!==24||
         horas.some(x=>!Number.isSafeInteger(x)||x<0))
        throw new Error("Contagens horárias inválidas.");
      horas.forEach((valor,hora)=>{
        if(valor)linhas.push(`${turno}T;${item.secao};${String(hora).padStart(2,"0")};${valor}`);
      });
    }
  }
  return analisarCsv(linhas.join("\n"));
}

export function secoesParaUpload(dados) {
  const porSecao=new Map(dados.secoes.map(secao=>[secao,{secao,turnos:{
    "1":Array(24).fill(0),"2":Array(24).fill(0)
  }}]));
  for(const [chave,valor] of dados.registros){
    const [turno,secao,hora]=chave.split("|");
    porSecao.get(secao).turnos[turno==="1T"?"1":"2"][Number(hora)]=valor;
  }
  return [...porSecao.values()];
}

export function seriePorHora(dados, turno, secao = "") {
  const horas = Array(24).fill(0);
  for (const [chave, quantidade] of dados.registros) {
    const [t, s, hora] = chave.split("|");
    if (t === turno && (!secao || s === secao)) horas[Number(hora)] += quantidade;
  }
  return horas;
}

export function acumuladoPercentual(horas) {
  const total = horas.reduce((soma, valor) => soma + valor, 0);
  let soma = 0;
  return horas.map(valor => { soma += valor; return total ? 100 * soma / total : 0; });
}
