#!/usr/bin/env python3
"""Motor operacional persistente para coleta eleitoral por seção, zona, município ou UF."""
from __future__ import annotations

import argparse
import fcntl
import json
import logging
import os
import shutil
import signal
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))
import baixar_secao as baixar  # noqa: E402
import gerar_json as gerador  # noqa: E402

DEFAULT_RUNTIME = ROOT / "data" / "motor"
DEFAULT_OUTPUT = ROOT / "data" / "coletas"
CATALOGO_MAX = 64 * 1024 * 1024
LOG = logging.getLogger("motor-coleta")


def agora():
    return datetime.now(timezone.utc).isoformat()


def gravar_json(destino: Path, dados):
    baixar.gravar_json_atomico(destino, dados)


def ler_json(caminho: Path, padrao=None):
    try:
        return json.loads(caminho.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return padrao


def normalizar_alvo(uf, municipio=None, zona=None, secao=None):
    alvo = {"uf": str(uf).strip().lower()}
    baixar.validar_segmento(alvo["uf"], "uf")
    if municipio is not None:
        alvo["municipio"] = str(municipio).strip().zfill(5)
        baixar.validar_segmento(alvo["municipio"], "municipio")
    if zona is not None:
        alvo["zona"] = str(zona).strip().zfill(4)
        baixar.validar_segmento(alvo["zona"], "zona")
    if secao is not None:
        alvo["secao"] = str(secao).strip().zfill(4)
        baixar.validar_segmento(alvo["secao"], "secao")
    return alvo


def iterar_catalogo(documento):
    """Interpreta o catálogo oficial *-cs.json de uma UF."""
    for abr in documento.get("abr", []):
        uf = str(abr.get("cd", "")).lower()
        for municipio in abr.get("mu", []):
            codigo = str(municipio.get("cd", "")).zfill(5)
            nome = str(municipio.get("nm", ""))
            for zona in municipio.get("zon", []):
                z = str(zona.get("cd", "")).zfill(4)
                for secao in zona.get("sec", []):
                    s = str(secao.get("ns", "")).zfill(4)
                    principal = secao.get("nsp")
                    yield {"uf": uf, "municipio": codigo, "municipio_nome": nome,
                           "zona": z, "secao": s,
                           "secao_principal": None if principal in (None, "") else str(principal).zfill(4)}


def filtrar_catalogo(documento, escopo, alvo):
    filas, vistos = [], set()
    for item in iterar_catalogo(documento):
        if item["uf"] != alvo["uf"]:
            continue
        if escopo in ("municipio", "zona") and item["municipio"] != alvo["municipio"]:
            continue
        if escopo == "zona" and item["zona"] != alvo["zona"]:
            continue
        # Seção agregada não possui pacote próprio; a seção principal representa o conjunto.
        if item["secao_principal"]:
            continue
        chave = chave_secao(item)
        if chave not in vistos:
            vistos.add(chave)
            filas.append(item)
    return sorted(filas, key=lambda x: (x["uf"], x["municipio"], x["zona"], x["secao"]))


def chave_secao(item):
    return f"{item['uf']}-{item['municipio']}-{item['zona']}-{item['secao']}"


def paths_job(runtime: Path, job_id: str):
    job = runtime / "jobs" / job_id
    return {"job": job, "config": job / "config.json", "state": job / "state.json",
            "queue": job / "queue.json", "lock": job / "worker.lock",
            "stop": job / "stop.request", "logs": job / "logs"}


def ultimo_job(runtime: Path):
    atual = runtime / "current"
    if atual.is_symlink():
        return atual.resolve().name
    if atual.is_file():
        return atual.read_text(encoding="utf-8").strip()
    return None


def apontar_atual(runtime: Path, job_id: str):
    runtime.mkdir(parents=True, exist_ok=True)
    atual = runtime / "current"
    tmp = runtime / f".current.{os.getpid()}"
    tmp.write_text(job_id + "\n", encoding="utf-8")
    os.replace(tmp, atual)


def criar_fila(args, runtime: Path, job_dir: Path):
    alvo = normalizar_alvo(args.uf, args.municipio, args.zona, args.secao)
    if args.escopo == "secao":
        fila = [{**alvo, "municipio_nome": "", "secao_principal": None}]
        catalogo = None
    else:
        catalogo_dir = runtime / "catalogos"
        catalogo_dir.mkdir(parents=True, exist_ok=True)
        catalogo = Path(args.catalogo) if args.catalogo else catalogo_dir / f"{alvo['uf']}-p003220-cs.json"
        if not catalogo.exists():
            url = (f"{baixar.RESULTADOS}/arquivo-urna/3220/config/{alvo['uf']}/"
                   f"{alvo['uf']}-p003220-cs.json")
            baixar.baixar_atomico(url, catalogo, CATALOGO_MAX)
        documento = baixar.ler_json_limitado(catalogo, CATALOGO_MAX)
        fila = filtrar_catalogo(documento, args.escopo, alvo)
    if not fila:
        raise ValueError("Nenhuma seção principal encontrada para o alvo")
    if args.max_secoes and len(fila) > args.max_secoes:
        fila = fila[:args.max_secoes]
    gravar_json(job_dir / "queue.json", fila)
    return alvo, fila, str(catalogo) if catalogo else None


def estado_inicial(job_id, config, total):
    return {"job_id": job_id, "status": "dry_run" if config["dry_run"] else "queued",
            "criado_utc": agora(), "atualizado_utc": agora(), "pid": None,
            "total": total, "pendentes": total, "concluidas": 0, "falhas": 0,
            "ignoradas": 0, "archive_pending": 0, "atual": None,
            "ultimo_erro": None, "resultados": {}}


def atualizar_estado(path, state, **mudancas):
    state.update(mudancas)
    state["atualizado_utc"] = agora()
    gravar_json(path, state)


def espaco_livre_gb(path):
    return shutil.disk_usage(path).free / (1024 ** 3)


def manifesto_secao(config, item, pasta, candidatos):
    # Cada seção fica autocontida para arquivamento posterior (ex.: Google Drive).
    candidatos_locais = []
    pasta_candidatos = pasta / "raw" / "candidatos"
    pasta_candidatos.mkdir(parents=True, exist_ok=True)
    for item_candidato in candidatos:
        origem = Path(item_candidato["arquivo"])
        destino = pasta_candidatos / origem.name
        shutil.copy2(origem, destino)
        candidatos_locais.append({**item_candidato, "arquivo": str(destino)})
    turnos = []
    for turno in (1, 2):
        turnos.append(baixar.coletar(turno, item["uf"], item["municipio"], item["zona"],
                                     item["secao"], pasta / "raw" / f"{turno}T"))
    manifesto = {"origem": "TSE resultados.tse.jus.br", "coleta_utc": agora(),
                 "limites_bytes": {"aux": baixar.MAX_AUX_BYTES,
                                    "candidatos": baixar.MAX_CANDIDATOS_BYTES,
                                    "arquivo": baixar.MAX_ARQUIVO_BYTES,
                                    "total_por_turno": baixar.MAX_TOTAL_BYTES},
                 "identificacao": {"uf": item["uf"].upper(), "municipio_tse": item["municipio"],
                                   "zona": item["zona"], "secao": item["secao"]},
                 "aviso": "Hashes locais; assinaturas VSC nao verificadas.",
                 "candidatos": candidatos_locais, "turnos": turnos}
    gravar_json(pasta / "manifesto_tse.json", manifesto)
    return manifesto


def obter_candidatos(config, job_dir):
    pasta = job_dir / "shared" / "candidatos"
    resultado = []
    for turno in (1, 2):
        _, eleicao, _ = baixar.TURNOS[turno]
        item = baixar.coletar_candidatos(turno, eleicao, pasta)
        resultado.append({"turno": turno, "eleicao": eleicao, **item})
    return resultado


def validar_manifesto(manifesto):
    candidatos = manifesto.get("candidatos") or []
    turnos = manifesto.get("turnos") or []
    cand_ok = (len(candidatos) == 2 and
               {int(c.get("turno", 0)) for c in candidatos} == {1, 2} and
               all(c.get("sha256") for c in candidatos))
    turnos_ok = (len(turnos) == 2 and
                 {int(t.get("turno", 0)) for t in turnos} == {1, 2} and
                 all(t.get("status") == "ok" and not t.get("erros") and
                     any(a.get("tipo") in ("bu", "busa") for a in t.get("arquivos", []))
                     for t in turnos))
    if not cand_ok or not turnos_ok:
        raise RuntimeError("Coleta incompleta: candidatos, BU ou artefatos com falha")


def processar_secao(config, item, job_dir, output_root, candidatos):
    chave = chave_secao(item)
    pasta = output_root / chave
    pronto = pasta / "validated.ok"
    if pronto.exists() and (pasta / "secao.json").exists() and (pasta / "manifesto_tse.json").exists():
        return "ignored", {"chave": chave, "pasta": str(pasta), "motivo": "já validada"}
    pasta.mkdir(parents=True, exist_ok=True)
    manifesto = manifesto_secao(config, item, pasta, candidatos)
    validar_manifesto(manifesto)
    gerador.gerar_arquivo(pasta / "manifesto_tse.json", pasta / "secao.json")
    pronto.write_text(agora() + "\n", encoding="utf-8")
    return "completed", {"chave": chave, "pasta": str(pasta),
                         "manifesto": str(pasta / "manifesto_tse.json"),
                         "json": str(pasta / "secao.json"), "archive_status": "pending"}


def configurar_log(log_path):
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(level=logging.INFO, format="%(asctime)sZ %(levelname)s %(message)s",
                        handlers=[logging.FileHandler(log_path, encoding="utf-8"),
                                  logging.StreamHandler(sys.stdout)], force=True)
    logging.Formatter.converter = time.gmtime


def executar(job_id, runtime: Path):
    p = paths_job(runtime, job_id)
    config = ler_json(p["config"])
    state = ler_json(p["state"])
    fila = ler_json(p["queue"], [])
    if not config or not state:
        raise FileNotFoundError(f"Job incompleto: {job_id}")
    p["job"].mkdir(parents=True, exist_ok=True)
    lock_file = p["lock"].open("a+")
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as exc:
        raise RuntimeError(f"Job {job_id} já está em execução") from exc
    log_path = p["logs"] / f"run-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}.log"
    configurar_log(log_path)
    atualizar_estado(p["state"], state, status="running", pid=os.getpid(), log=str(log_path))
    LOG.info("job=%s total=%d output=%s", job_id, len(fila), config["output_root"])
    output_root = Path(config["output_root"])
    output_root.mkdir(parents=True, exist_ok=True)
    try:
        if espaco_livre_gb(output_root) < config["min_free_gb"]:
            raise RuntimeError("Espaço livre abaixo do mínimo antes de iniciar")
        candidatos = None
        for item in fila:
            chave = chave_secao(item)
            anterior = state["resultados"].get(chave, {})
            if anterior.get("status") in ("completed", "ignored"):
                continue
            if p["stop"].exists():
                atualizar_estado(p["state"], state, status="stopped", pid=None, atual=None)
                LOG.warning("parada segura solicitada")
                return 2
            if espaco_livre_gb(output_root) < config["min_free_gb"]:
                raise RuntimeError("Espaço livre abaixo do mínimo durante a coleta")
            atualizar_estado(p["state"], state, atual=chave)
            LOG.info("iniciando %s", chave)
            try:
                pasta_secao = output_root / chave
                secao_pronta = ((pasta_secao / "validated.ok").exists() and
                                (pasta_secao / "secao.json").exists() and
                                (pasta_secao / "manifesto_tse.json").exists())
                if candidatos is None and not secao_pronta:
                    candidatos = obter_candidatos(config, p["job"])
                resultado, detalhe = processar_secao(config, item, p["job"], output_root, candidatos or [])
                state["resultados"][chave] = {"status": resultado, "atualizado_utc": agora(), **detalhe}
                if resultado == "completed":
                    state["concluidas"] += 1
                    state["archive_pending"] += 1
                else:
                    state["ignoradas"] += 1
                LOG.info("%s %s", resultado, chave)
            except Exception as exc:
                state["falhas"] += 1
                state["ultimo_erro"] = f"{chave}: {type(exc).__name__}: {exc}"
                state["resultados"][chave] = {"status": "failed", "atualizado_utc": agora(),
                                               "erro": state["ultimo_erro"]}
                LOG.exception("falha em %s", chave)
                if state["falhas"] >= config["max_falhas"]:
                    raise RuntimeError("Limite de falhas atingido") from exc
            state["pendentes"] = max(0, state["total"] - state["concluidas"] - state["ignoradas"])
            atualizar_estado(p["state"], state, atual=None)
            if config["intervalo"]:
                time.sleep(config["intervalo"])
        final = "completed" if state["falhas"] == 0 else "completed_with_errors"
        atualizar_estado(p["state"], state, status=final, pid=None, atual=None)
        LOG.info("finalizado status=%s concluidas=%d falhas=%d", final, state["concluidas"], state["falhas"])
        return 0 if state["falhas"] == 0 else 1
    except Exception as exc:
        state["ultimo_erro"] = f"{type(exc).__name__}: {exc}"
        atualizar_estado(p["state"], state, status="failed", pid=None, atual=None)
        LOG.exception("job interrompido")
        return 1
    finally:
        fcntl.flock(lock_file, fcntl.LOCK_UN)
        lock_file.close()


def spawn_worker(job_id, runtime):
    p = paths_job(runtime, job_id)
    p["logs"].mkdir(parents=True, exist_ok=True)
    launcher = p["logs"] / "launcher.log"
    with launcher.open("ab") as out:
        proc = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "_run",
                                 "--job", job_id, "--runtime", str(runtime)],
                                cwd=ROOT, stdin=subprocess.DEVNULL, stdout=out,
                                stderr=subprocess.STDOUT, start_new_session=True)
    state = ler_json(p["state"])
    atualizar_estado(p["state"], state, status="starting", pid=proc.pid, launcher_log=str(launcher))
    return proc.pid


def cmd_start(args):
    runtime, output = Path(args.runtime).resolve(), Path(args.output).resolve()
    job_id = args.job or f"coleta-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:6]}"
    p = paths_job(runtime, job_id)
    if p["job"].exists():
        raise FileExistsError(f"Job já existe: {job_id}")
    p["job"].mkdir(parents=True)
    alvo, fila, catalogo = criar_fila(args, runtime, p["job"])
    config = {"job_id": job_id, "escopo": args.escopo, "alvo": alvo, "catalogo": catalogo,
              "output_root": str(output), "intervalo": args.intervalo,
              "min_free_gb": args.min_free_gb, "max_falhas": args.max_falhas,
              "dry_run": args.dry_run, "criado_utc": agora()}
    gravar_json(p["config"], config)
    state = estado_inicial(job_id, config, len(fila))
    gravar_json(p["state"], state)
    apontar_atual(runtime, job_id)
    print(json.dumps({"job_id": job_id, "status": state["status"], "secoes": len(fila),
                      "alvo": alvo, "output": str(output)}, ensure_ascii=False, indent=2))
    if args.dry_run:
        return 0
    if args.foreground:
        return executar(job_id, runtime)
    print(f"worker_pid={spawn_worker(job_id, runtime)}")
    return 0


def resolver_job(args):
    runtime = Path(args.runtime).resolve()
    job_id = args.job or ultimo_job(runtime)
    if not job_id:
        raise ValueError("Nenhum job informado ou atual")
    return runtime, job_id, paths_job(runtime, job_id)


def cmd_status(args):
    _, job_id, p = resolver_job(args)
    state = ler_json(p["state"])
    config = ler_json(p["config"])
    if not state:
        raise FileNotFoundError(job_id)
    print(json.dumps({"config": config, "state": state}, ensure_ascii=False, indent=2))
    return 0


def cmd_stop(args):
    _, job_id, p = resolver_job(args)
    p["job"].mkdir(parents=True, exist_ok=True)
    p["stop"].write_text(agora() + "\n", encoding="utf-8")
    print(f"Parada segura solicitada para {job_id}")
    return 0


def cmd_resume(args):
    runtime, job_id, p = resolver_job(args)
    state = ler_json(p["state"])
    if state.get("status") == "completed":
        print(f"Job {job_id} já concluído")
        return 0
    p["stop"].unlink(missing_ok=True)
    if args.foreground:
        return executar(job_id, runtime)
    print(f"worker_pid={spawn_worker(job_id, runtime)}")
    return 0


def parser():
    ap = argparse.ArgumentParser(description="Motor automático de coleta dos arquivos de urna do TSE")
    sub = ap.add_subparsers(dest="comando", required=True)
    s = sub.add_parser("start", help="cria fila persistente e inicia o worker")
    s.add_argument("--escopo", choices=("secao", "zona", "municipio", "uf"), required=True)
    s.add_argument("--uf", required=True); s.add_argument("--municipio"); s.add_argument("--zona"); s.add_argument("--secao")
    s.add_argument("--catalogo", help="catálogo *-cs.json local; útil para teste/offline")
    s.add_argument("--job"); s.add_argument("--runtime", default=str(DEFAULT_RUNTIME)); s.add_argument("--output", default=str(DEFAULT_OUTPUT))
    s.add_argument("--max-secoes", type=int, default=0); s.add_argument("--max-falhas", type=int, default=3)
    s.add_argument("--intervalo", type=float, default=2.0); s.add_argument("--min-free-gb", type=float, default=2.0)
    s.add_argument("--dry-run", action="store_true"); s.add_argument("--foreground", action="store_true")
    s.set_defaults(func=cmd_start)
    for nome, func in (("status", cmd_status), ("stop", cmd_stop), ("resume", cmd_resume)):
        p = sub.add_parser(nome)
        p.add_argument("--job"); p.add_argument("--runtime", default=str(DEFAULT_RUNTIME))
        if nome == "resume": p.add_argument("--foreground", action="store_true")
        p.set_defaults(func=func)
    r = sub.add_parser("_run", help=argparse.SUPPRESS)
    r.add_argument("--job", required=True); r.add_argument("--runtime", required=True)
    r.set_defaults(func=lambda a: executar(a.job, Path(a.runtime).resolve()))
    return ap


def validar_args(a):
    if a.comando != "start": return
    requeridos = {"secao": ("municipio", "zona", "secao"), "zona": ("municipio", "zona"),
                  "municipio": ("municipio",), "uf": ()}[a.escopo]
    faltam = [x for x in requeridos if not getattr(a, x)]
    if faltam: raise ValueError("Parâmetros ausentes para o escopo: " + ", ".join(faltam))
    if a.max_falhas < 1 or a.max_secoes < 0 or a.intervalo < 0 or a.min_free_gb < 0:
        raise ValueError("Limites operacionais inválidos")


def main(argv=None):
    a = parser().parse_args(argv)
    try:
        validar_args(a)
        return a.func(a)
    except Exception as exc:
        print(f"ERRO: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
