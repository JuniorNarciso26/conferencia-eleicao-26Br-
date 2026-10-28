"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const statuses = {
    running:["Em andamento","running"],
    starting:["Iniciando","running"],
    queued:["Na fila",""],
    completed:["Concluída","success"],
    completed_with_errors:["Concluída com falhas","error"],
    failed:["Interrompida por falha","error"],
    stopped:["Pausada",""],
    dry_run:["Simulação",""]
  };
  const number = x => Number(x || 0).toLocaleString("pt-BR");
  let loading = false;
  async function atualizar() {
    if (loading) return;
    loading = true;
    try {
      const res = await fetch("/api/status",{cache:"no-store"});
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const [title, variant] = statuses[data.status] || ["Status desconhecido",""];
      $("status").textContent=title;
      $("status").className="badge "+variant;
      $("location").textContent =
        data.uf + " · Município TSE " + data.municipio +
        (data.zona ? " · Zona " + data.zona : "") ;
      $("processed").textContent=number(data.processadas);
      $("total").textContent=number(data.total);
      $("percent").textContent=Number(data.percentual||0).toLocaleString("pt-BR",{maximumFractionDigits:2})+"%";
      $("progress").value=Math.max(0,Math.min(100,Number(data.percentual)||0));
      $("completed").textContent=number(data.concluidas);
      $("ignored").textContent=number(data.ignoradas);
      $("pending").textContent=number(data.pendentes);
      $("failed").textContent=number(data.falhas);
      $("job").textContent="Job: "+data.job_id;
      const date=new Date(data.atualizado_utc);
      $("updated").textContent="Última atualização: "+(Number.isNaN(date.getTime())?"—":date.toLocaleString("pt-BR"));
      $("current").textContent = data.status==="completed"
        ? "Todas as seções foram processadas. A etapa de validação e publicação ainda é separada."
        : data.status==="failed"
        ? "A coleta foi interrompida. Verifique o erro pelo comando scripts/coleta status."
        : data.status==="stopped" ? "A coleta está pausada."
        : data.atual ? "Processando agora: seção " + data.atual.split("-").at(-1)
        : "Monitorando o andamento da coleta...";
      $("notice").textContent="Atualização automática a cada 2 segundos. O monitor não controla nem interrompe o motor.";
    } catch {
      $("status").textContent="Sem conexão local";
      $("status").className="badge error";
      $("notice").textContent="Não foi possível ler o andamento. Verifique se o monitor está aberto no terminal.";
    } finally {loading=false;}
  }
  atualizar();
  setInterval(atualizar,2000);
})();
