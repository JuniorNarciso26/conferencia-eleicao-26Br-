import { calcularCrescimento, percentualVariacao, analisarPadraoSecoes } from "./crescimento.mjs";
"use strict";
(() => {
  const $ = (s) => document.querySelector(s);
  const status = $("#status"), notice = $("#notice");
  const uf = $("#uf"), municipio = $("#municipio"), zona = $("#zona"), view = $("#view");
  const open = $("#open"), result = $("#resultado");
  const fields = ["aptos", "comparecimento", "comparecimento_bu",
    "habilitados_biometria", "habilitados_biografia", "comp_sem_biometria",
    "flavio", "lula", "outros", "brancos", "nulos", "nulos_tecnicos"];
  const groups = [
    ["Participação", [
      ["aptos", "Eleitores aptos"], ["comparecimento", "Comparecimento"],
      ["abstencao", "Abstenções"], ["taxa", "Taxa de comparecimento (%)"]]],
    ["Identificação", [
      ["comparecimento_bu", "Comparecimento geral do BU"],
      ["habilitados_biometria", "Habilitados por biometria"],
      ["habilitados_biografia", "Habilitados por dados biográficos"],
      ["comp_sem_biometria", "Sem biometria cadastrada"]]],
    ["Votação presidencial", [
      ["flavio", "Candidato 22 (campo do coletor)"], ["lula", "Candidato 13 (campo do coletor)"],
      ["outros", "Outros candidatos"], ["brancos", "Brancos"],
      ["nulos", "Nulos de urna"], ["nulos_tecnicos", "Nulos técnicos"],
      ["validos", "Votos válidos"], ["total", "Total recontado"]]]
  ];
  let catalog = [], pack = null, current = null, loadedZone = null, sectionPattern = null;
  const format = (value, decimals = 0) => Number.isFinite(value)
    ? value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : "—";
  const signed = (value, decimals = 0) => Number.isFinite(value)
    ? (value > 0 ? "+" : "") + format(value, decimals) : "—";
  const sum = (...args) => args.reduce((a, b) => a + b, 0);
  const num = (turn, key) => current.turnos[turn][key];
  const valid = (turn) => sum(num(turn, "flavio"), num(turn, "lula"), num(turn, "outros"));
  const total = (turn) => sum(valid(turn), num(turn, "brancos"), num(turn, "nulos"), num(turn, "nulos_tecnicos"));
  const pct = (number, turn) => valid(turn) ? 100 * number / valid(turn) : 0;
  function get(turn, field) {
    if (field === "abstencao") return num(turn, "aptos") - num(turn, "comparecimento");
    if (field === "taxa") return num(turn, "aptos") ? 100 * num(turn, "comparecimento") / num(turn, "aptos") : 0;
    if (field === "validos") return valid(turn);
    if (field === "total") return total(turn);
    return num(turn, field);
  }
  function element(tag, text, className) {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (className) e.className = className;
    return e;
  }
  function replace(parent, ...children) { parent.replaceChildren(...children); }
  function option(value, text) {
    const item = document.createElement("option");
    item.value = value;
    item.textContent = text;
    return item;
  }
  function reset(select, placeholder) {
    replace(select, option("", placeholder));
    select.value = "";
    select.disabled = true;
  }
  function setNotice(message, empty = false) {
    notice.textContent = message;
    notice.className = empty ? "notice empty" : "notice";
  }
  function clearResult() {
    result.hidden = true;
    $("#audit-meta").hidden = true;
    pack = current = loadedZone = sectionPattern = null;
    reset(view, "Resumo da zona");
  }
  function validEntry(x) {
    return x && /^[A-Z]{2}$/.test(x.uf) &&
      /^\d{1,10}$/.test(x.municipio_codigo) &&
      typeof x.municipio_nome === "string" && x.municipio_nome.length > 0 && x.municipio_nome.length <= 150 &&
      /^\d{1,4}$/.test(x.zona) &&
      (x.fonte === "d1" && Number.isSafeInteger(x.total_secoes) && x.total_secoes>0 ||
      typeof x.arquivo === "string" && /^dados\/[a-zA-Z0-9_-]+\.json$/.test(x.arquivo));
  }
  function zoneForSelection() {
    return catalog.find(x => x.uf === uf.value &&
      x.municipio_codigo === municipio.value && x.zona === zona.value);
  }
  function populateUfs() {
    reset(uf, "Selecione a UF");
    const values = [...new Set(catalog.map(x => x.uf))].sort();
    for (const value of values) uf.appendChild(option(value, value));
    uf.disabled = !values.length;
    reset(municipio, "Selecione o município");
    reset(zona, "Selecione a zona");
    open.disabled = true;
  }
  uf.addEventListener("change", () => {
    clearResult();
    reset(municipio, "Selecione o município");
    reset(zona, "Selecione a zona");
    open.disabled = true;
    const matches = catalog.filter(x => x.uf === uf.value);
    const byCity = new Map(matches.map(x => [x.municipio_codigo, x.municipio_nome]));
    for (const [code, name] of [...byCity.entries()].sort((a,b) => a[1].localeCompare(b[1], "pt-BR"))) {
      municipio.appendChild(option(code, name));
    }
    municipio.disabled = byCity.size === 0;
  });
  municipio.addEventListener("change", () => {
    clearResult();
    reset(zona, "Selecione a zona");
    const zones = catalog.filter(x => x.uf === uf.value && x.municipio_codigo === municipio.value);
    for (const item of zones.sort((a,b) => Number(a.zona) - Number(b.zona))) {
      zona.appendChild(option(item.zona, item.zona.padStart(4, "0")));
    }
    zona.disabled = !zones.length;
    open.disabled = true;
  });
  zona.addEventListener("change", () => {
    clearResult();
    open.disabled = !zoneForSelection();
    if (!open.disabled) setNotice("Zona selecionada. Clique em Consultar para carregar o pacote publicado.");
  });
  function validateTurnos(data) {
    if (!data || !data.turnos || !data.meta) return false;
    for (const turn of ["1", "2"]) {
      const t = data.turnos[turn];
      if (!t || !fields.every(f => Number.isSafeInteger(t[f]) && t[f] >= 0)) return false;
      const cast = t.flavio + t.lula + t.outros + t.brancos + t.nulos + t.nulos_tecnicos;
      if (cast !== t.comparecimento || t.comparecimento > t.aptos) return false;
    }
    return true;
  }
  function validatePack(data, selected) {
    if (!data || !data.meta || !data.resumo || !Array.isArray(data.secoes) ||
        !Number.isSafeInteger(data.meta.total_secoes) || data.meta.total_secoes < 1 ||
        data.meta.total_secoes !== data.secoes.length ||
        data.meta.uf !== selected.uf || String(data.meta.municipio) !== selected.municipio_codigo ||
        String(data.meta.zona).padStart(4, "0") !== selected.zona.padStart(4, "0") ||
        !validateTurnos(data.resumo) || !data.secoes.every(validateTurnos)) return false;
    const seen = new Set();
    for (const item of data.secoes) {
      if (!/^\d{1,4}$/.test(String(item.meta.secao)) || seen.has(item.meta.secao)) return false;
      seen.add(item.meta.secao);
      if (String(item.meta.zona).padStart(4, "0") !== selected.zona.padStart(4, "0")) return false;
    }
    for (const turn of ["1", "2"]) {
      for (const field of fields) {
        if (data.secoes.reduce((acc, section) => acc + section.turnos[turn][field], 0) !==
            data.resumo.turnos[turn][field]) return false;
      }
    }
    return true;
  }
  function appendGroup(table, name) {
    const row = element("tr", undefined, "group");
    const cell = element("th", name);
    cell.colSpan = 5;
    row.appendChild(cell);
    table.appendChild(row);
  }
  function renderAudit() {
    const audit = pack && pack.auditoria;
    const panel = $("#audit-meta");
    if (!audit || typeof audit !== "object") {
      panel.hidden = true;
      return;
    }
    function show(id, name, time) {
      const root = $(id);
      root.replaceChildren();
      const user = typeof name === "string" && /^[A-Za-z0-9-]{1,39}$/.test(name)
        ? "@" + name : "Não registrado";
      root.appendChild(element("span", user));
      if (Number.isSafeInteger(time) && time > 0) {
        const formatted = new Date(time * 1000).toLocaleString("pt-BR");
        root.appendChild(element("div", formatted, "audit-date"));
      }
    }
    show("#audit-contributor", audit.processado_por, audit.enviado_em);
    show("#audit-reviewer", audit.revisado_por, audit.revisado_em);
    panel.hidden = false;
  }
  function renderGrowth() {
    const m=calcularCrescimento(current);
    const t1=current.turnos["1"],t2=current.turnos["2"];
    const validos1=t1.lula+t1.flavio+t1.outros;
    const validos2=t2.lula+t2.flavio+t2.outros;
    const deltaValidos=validos2-validos1;
    const scope=current===pack.resumo
      ? "Zona "+loadedZone.zona.padStart(4,"0")+" · "+format(pack.meta.total_secoes)+" seções"
      : "Seção "+current.meta.secao+" · zona "+loadedZone.zona.padStart(4,"0");
    $("#growth-scope").textContent=scope+" — reconciliação contábil dos resultados dos dois turnos.";
    const growthPercent=(a,b)=>{
      const v=percentualVariacao(a,b);
      return v===null?"—":signed(v,2)+"%";
    };
    const cards=[
      ["Lula — diferença de votos",signed(m.lula.delta),
       "Variação: "+growthPercent(m.lula.t1,m.lula.t2)],
      ["Flávio — diferença de votos",signed(m.flavio.delta),
       "Variação: "+growthPercent(m.flavio.t1,m.flavio.t2)],
      ["Votos válidos adicionais",signed(deltaValidos),
       "Variação: "+growthPercent(validos1,validos2)]
    ];
    replace($("#growth-kpis"),...cards.map(([label,value,help])=>{
      const card=element("div",undefined,"growth-kpi");
      card.append(element("small",label),element("strong",value),element("small",help));
      return card;
    }));
    replace($("#growth-formula"),
      element("b","1. O que explica a variação de votos válidos?"),
      element("p","Δ votos válidos = Δ comparecimento + redução líquida de brancos/nulos"),
      element("p",signed(deltaValidos)+" = "+signed(m.componentes.comparecimento)+" + "+signed(m.componentes.brancosNulos)),
      element("b","2. Como se compõe o aumento líquido dos dois finalistas?"),
      element("p","Δ Lula + Δ Flávio = redução líquida de votos de outros candidatos + Δ votos válidos"),
      element("p",signed(m.lula.delta)+" + "+signed(m.flavio.delta)+" = "+signed(m.componentes.outros)+" + "+signed(deltaValidos)+" = "+signed(m.incrementoFinalistas))
    );
    const ref=$("#growth-reference");replace(ref);
    if(m.parcelaIncrementoLula!==null) {
      ref.append(
        element("p","Participação no incremento líquido dos finalistas: Lula "+
          format(m.parcelaIncrementoLula*100,2)+"%; Flávio "+
          format((1-m.parcelaIncrementoLula)*100,2)+"%."),
        element("p","Os saldos não mostram quais eleitores mudaram seu voto.")
      );
    }else {
      ref.appendChild(element("p","Com redução de votos de algum finalista ou incremento total não positivo, não há distribuição interpretável de votos adicionais."));
    }
  }
  function publishedUrl(item) {
    const base=(window.CONF_CONFIG?.apiBaseUrl||"").replace(/\/+$/,"");
    return item.fonte==="d1"
      ? base+"/api/published/zone?"+new URLSearchParams({
          uf:item.uf,municipio:item.municipio_codigo,zona:item.zona
        }).toString()
      : "./"+item.arquivo;
  }
  async function fetchValidatedPack(item) {
    const response=await fetch(publishedUrl(item),{cache:"no-store"});
    if(!response.ok)throw Error("HTTP "+response.status+" na Zona "+item.zona);
    const data=await response.json();
    if(!validatePack(data,item))throw Error("Pacote inconsistente na Zona "+item.zona);
    return data;
  }
  async function renderComparison() {
    const display=$("#growth-comparison-status"),wrap=$("#growth-comparison-wrap"),body=$("#growth-comparison-rows");
    wrap.hidden=true;replace(body);
    const numbers=["0252","0253"];
    const targets=numbers.map(z=>catalog.find(e=>e.uf==="SP" &&
      e.municipio_codigo==="71072" && e.zona.padStart(4,"0")===z));
    if(targets.some(x=>!x)){
      const missing=numbers.filter((z,i)=>!targets[i]);
      display.textContent="A comparação automática ficará disponível quando ambas as zonas estiverem publicadas. Aguardando zona(s): "+missing.join(", ")+".";
      return;
    }
    display.textContent="Carregando os pacotes publicados das duas zonas...";
    try{
      const packs=await Promise.all(targets.map(fetchValidatedPack));
      const rows=packs.map((p,i)=>({
        zona:targets[i].zona.padStart(4,"0"),secoes:p.meta.total_secoes,...calcularCrescimento(p.resumo)
      }));
      const keys=["lula","flavio","outros","brancos","nulos","nulos_tecnicos","comparecimento","aptos"];
      const combined={turnos:{"1":{},"2":{}}};
      for(const turn of ["1","2"])for(const key of keys)
        combined.turnos[turn][key]=packs.reduce((n,p)=>n+p.resumo.turnos[turn][key],0);
      rows.push({
        zona:"Total · 2 zonas",
        secoes:packs.reduce((n,p)=>n+p.meta.total_secoes,0),
        ...calcularCrescimento(combined)
      });
      for(const row of rows){
        const cells=[
          row.zona,format(row.secoes),signed(row.lula.delta),signed(row.flavio.delta),
          row.participacaoLulaT1===null?"—":format(row.participacaoLulaT1*100,2)+"%",
          row.parcelaIncrementoLula===null?"—":format(row.parcelaIncrementoLula*100,2)+"%"
        ];
        const tr=element("tr",undefined,row.zona.startsWith("Total")?"derived":"");
        cells.forEach((v,i)=>tr.appendChild(element(i===0?"th":"td",v)));
        body.appendChild(tr);
      }
      display.textContent="Valores calculados automaticamente dos dois pacotes públicos, conferidos por seção e por turno.";
      wrap.hidden=false;
    }catch(err){
      display.textContent="Comparação indisponível: "+err.message+". Não são apresentados números não confirmados.";
    }
  }
  function render() {
    const summary = current === pack.resumo;
    const title = summary
      ? "Resumo da zona " + loadedZone.zona.padStart(4, "0") + " · " + pack.meta.total_secoes + " seções"
      : "Seção " + current.meta.secao + " · zona " + loadedZone.zona.padStart(4, "0");
    setNotice(title + ". Dados de ambos os turnos no pacote publicado. Cobertura: " +
      (pack.meta.cobertura_completa ? "completa conforme o pacote" : "parcial") + ".");
    result.hidden = false;
    const c1 = get("1", "comparecimento"), c2 = get("2", "comparecimento");
    const v1 = valid("1"), v2 = valid("2");
    const metrics = [
      ["Comparecimento no 2º turno", c2, "1º turno: " + format(c1) + " · " + signed(c2 - c1)],
      ["Votos válidos no 2º turno", v2, "1º turno: " + format(v1) + " · " + signed(v2 - v1)],
      ["Votos do candidato 22", num("2", "flavio"), format(pct(num("2", "flavio"), "2"), 2) + "% dos válidos"],
      ["Votos do candidato 13", num("2", "lula"), format(pct(num("2", "lula"), "2"), 2) + "% dos válidos"]
    ];
    replace($("#metrics"), ...metrics.map(([label,value,description]) => {
      const card = element("article", undefined, "metric");
      card.append(element("small", label), element("b", format(value)),
                  element("span", description, "delta"));
      return card;
    }));
    const tbody = $("#rows");
    replace(tbody);
    for (const [name, entries] of groups) {
      appendGroup(tbody, name);
      for (const [key,label] of entries) {
        const a = get("1", key), b = get("2", key), dec = key === "taxa" ? 1 : 0;
        const row = element("tr");
        if (["abstencao","taxa","validos","total"].includes(key)) row.className = "derived";
        row.append(element("th", label), element("td", format(a, dec) + (key === "taxa" ? "%" : "")),
          element("td", format(b, dec) + (key === "taxa" ? "%" : "")),
          element("td", signed(b - a, dec) + (key === "taxa" ? " p.p." : ""), b - a >= 0 ? "up" : "down"));
        tbody.appendChild(row);
      }
    }
    const barContainer = $("#bars");
    replace(barContainer);
    for (const [label,key] of [["Candidato 22","flavio"],["Candidato 13","lula"],["Outros candidatos","outros"]]) {
      const a = pct(num("1",key), "1"), b = pct(num("2",key), "2");
      const card = element("div", undefined, "bar"), head = element("div", undefined, "barhead");
      head.append(element("span",label),element("span",signed(b-a,2)+" p.p.",b-a>=0?"up":"down"));
      card.appendChild(head);
      for (const [fraction, second] of [[a,false],[b,true]]) {
        const track = element("div",undefined,"track"), fill = element("div",undefined,second?"fill second":"fill");
        fill.style.width = Math.max(0,Math.min(100,fraction))+"%";
        track.appendChild(fill); card.appendChild(track);
      }
      card.appendChild(element("div", "1T: " + format(a,2) + "% · 2T: " + format(b,2) + "%", "legend"));
      barContainer.appendChild(card);
    }
    const checks = $("#checks"); replace(checks);
    for (const turn of ["1","2"]) {
      const good = total(turn) === num(turn,"comparecimento");
      const row = element("div",undefined,"check");
      row.appendChild(element("span",good?"✓":"▲",good?"ok":"warn"));
      const body = element("div");
      body.append(element("b",turn+"º turno: soma dos votos "+(good?"confere":"diverge")),
        element("p",format(total(turn))+" votos para "+format(num(turn,"comparecimento"))+" comparecimentos."));
      row.appendChild(body); checks.appendChild(row);
    }
    const coverage = element("div",undefined,"check");
    coverage.appendChild(element("span",pack.meta.cobertura_completa?"✓":"▲",pack.meta.cobertura_completa?"ok":"warn"));
    const text = element("div");
    text.append(element("b",pack.meta.cobertura_completa?"Cobertura indicada como completa":"Cobertura parcial"),
      element("p",format(pack.meta.total_secoes)+" seções no pacote publicado."));
    coverage.appendChild(text); checks.appendChild(coverage);
    renderAudit();
    renderGrowth();
    $("#source").textContent = "Fonte declarada pelo pacote: " +
      String(current.meta.origem || "não informada") +
      ". A integridade matemática do agregado é conferida no navegador; autenticação VSC e validação independente da fonte não são realizadas nesta tela. O voto individual permanece secreto.";
  }
  async function loadSelected() {
    const selected = zoneForSelection();
    if (!selected) return;
    clearResult();
    open.disabled = true;
    status.textContent = "CARREGANDO ZONA";
    setNotice("Carregando pacote público da zona " + selected.zona + "...");
    try {
      const data = await fetchValidatedPack(selected);
      loadedZone = selected;
      pack = data;
      replace(view, option("resumo", "Resumo da zona (" + pack.meta.total_secoes + " seções)"));
      for (const section of pack.secoes) {
        view.appendChild(option(String(section.meta.secao), "Seção " + section.meta.secao));
      }
      view.value = "resumo"; view.disabled = false;
      current = pack.resumo;
      status.textContent = pack.meta.total_secoes + " SEÇÕES · PACOTE PUBLICADO";
      render();
    } catch (err) {
      status.textContent = "DADOS NÃO DISPONÍVEIS";
      setNotice("Não foi possível abrir esta zona: " + err.message, true);
    } finally { open.disabled = !zoneForSelection(); }
  }
  open.addEventListener("click", loadSelected);
  view.addEventListener("change", () => {
    if (!pack) return;
    current = view.value === "resumo" ? pack.resumo :
      pack.secoes.find(s => String(s.meta.secao) === view.value);
    if (current) render();
  });
  async function start() {
    clearResult(); populateUfs();
    try {
      const response = await fetch("./dados/catalogo.json", { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (data.versao !== 1 || !Array.isArray(data.zonas) || !data.zonas.every(validEntry)) {
        throw new Error("Formato do catálogo inválido");
      }
      // Nao mostra zonas que nao constam expressamente no catalogo publico.
      catalog = [...data.zonas];
      const base = (window.CONF_CONFIG?.apiBaseUrl || "").replace(/\/+$/, "");
      if(base){
        try{
          const response = await fetch(base+"/api/published/zones",{cache:"no-store"});
          if(response.ok){
            const live=await response.json();
            if(!Array.isArray(live.zonas)||!live.zonas.every(x=>x.fonte==="d1"&&validEntry(x)))
              throw new Error("Catálogo dinâmico inválido");
            for(const entry of live.zonas){
              if(!catalog.some(x=>x.uf===entry.uf&&
                  x.municipio_codigo===entry.municipio_codigo&&x.zona===entry.zona))
                catalog.push(entry);
            }
          }
        }catch{
          // Preserva acesso aos pacotes estaticos quando a API esta indisponivel.
        }
      }
      populateUfs();
      void renderComparison();
      if (!catalog.length) {
        status.textContent = "AGUARDANDO RESULTADOS";
        setNotice("A consulta pública está disponível sem login. Ainda não há zonas eleitorais com pacotes de resultados consolidados publicados neste portal. Os filtros serão habilitados à medida que os pacotes forem disponibilizados.",true);
      } else {
        status.textContent = catalog.length + " ZONAS PUBLICADAS";
        setNotice("Selecione uma UF, um município e uma zona para consultar os resultados. Sem necessidade de cadastro.");
      }
    } catch {
      status.textContent = "CATÁLOGO INDISPONÍVEL";
      setNotice("Não foi possível carregar o catálogo público. Tente novamente mais tarde.",true);
    }
  }
  start();
})();
