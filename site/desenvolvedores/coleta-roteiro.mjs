// Funcoes puras para montar comandos sem aceitar parametros de shell arbitrarios.
export const UFS = Object.freeze([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
]);

export function validarLocalidade({ uf, municipio, codigo, zona }) {
  const sigla = String(uf || "").toUpperCase();
  const city = String(municipio || "").trim().replace(/\s+/g, " ");
  const cityCode = String(codigo || "").trim();
  const zone = String(zona || "").trim();
  if (!UFS.includes(sigla)) throw new Error("Selecione um estado válido.");
  if (!city || city.length > 100 || /[\x00-\x1f]/.test(city)) throw new Error("Informe o nome do município.");
  if (!/^[0-9]{1,6}$/.test(cityCode)) throw new Error("Informe o código TSE numérico do município.");
  if (!/^[0-9]{1,4}$/.test(zone) || Number(zone) < 1) throw new Error("Informe uma zona eleitoral válida.");
  return {uf:sigla, municipio:city, codigo:cityCode, zona:zone.padStart(4,"0")};
}

export function gerarRoteiro(localidade, totalEsperado) {
  const loc = validarLocalidade(localidade);
  const output = `site/dados/${loc.uf.toLowerCase()}_${loc.codigo}_${loc.zona}.json`;
  const prefix = `scripts/coleta start --escopo zona --uf ${loc.uf.toLowerCase()} --municipio ${loc.codigo} --zona ${loc.zona}`;
  const commands = {
    install: "sudo apt update && sudo apt install -y git curl\ncurl -LsSf https://astral.sh/uv/install.sh | sh\nexport PATH=\"$HOME/.local/bin:$PATH\"\nuv python install 3.12\ngit clone https://github.com/JuniorNarciso26/conferencia-eleicao-26Br-.git\ncd conferencia-eleicao-26Br-\nPYTHON=\"$(uv python find 3.12)\" bash scripts/instalar_vps.sh",
    check: prefix + " --dry-run",
    start: prefix,
    status: "scripts/coleta status",
    monitor: "scripts/coleta painel",
    output,
    catalog: JSON.stringify({
      uf:loc.uf, municipio_codigo:loc.codigo, municipio_nome:loc.municipio,
      zona:loc.zona, arquivo:`dados/${loc.uf.toLowerCase()}_${loc.codigo}_${loc.zona}.json`
    }, null, 2)
  };
  if (totalEsperado !== undefined && totalEsperado !== null) {
    const total = Number(totalEsperado);
    if (!Number.isSafeInteger(total) || total < 1 || total > 10000) {
      throw new Error("Informe um total válido de seções (entre 1 e 10.000).");
    }
    commands.export = `python3 scripts/gerar_painel_zona.py --raiz data/coletas --saida ${output} --uf ${loc.uf} --municipio ${loc.codigo} --zona ${loc.zona} --esperado ${total}`;
  }
  return commands;
}
