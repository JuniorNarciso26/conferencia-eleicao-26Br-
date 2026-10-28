#!/usr/bin/env python3
"""Painel local e somente-leitura para acompanhar o motor de coleta.

Nao publica dados eleitorais nem abre portas de rede: 127.0.0.1 apenas.
"""
from __future__ import annotations

import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "scripts" / "monitor"
JOBS = ROOT / "data" / "motor"
ASSETS = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/style.css": ("style.css", "text/css; charset=utf-8"),
}


def obter_job(runtime: Path, job: str | None = None):
    if job:
        if not re.fullmatch(r"coleta-[A-Za-z0-9_-]+", job):
            raise ValueError("Identificador de job invalido")
        return job
    current = runtime / "current"
    if current.is_symlink():
        name = current.resolve().name
    elif current.is_file():
        name = current.read_text(encoding="utf-8").strip()
    else:
        raise FileNotFoundError("Nenhuma coleta encontrada. Inicie uma coleta primeiro.")
    if not re.fullmatch(r"coleta-[A-Za-z0-9_-]+", name):
        raise ValueError("Identificador de job invalido")
    return name


def ler_estado(runtime: Path, job: str):
    folder = runtime / "jobs" / job
    config = json.loads((folder / "config.json").read_text(encoding="utf-8"))
    state = json.loads((folder / "state.json").read_text(encoding="utf-8"))
    return resumo(config, state)


def inteiro(value):
    try:
        return max(0, int(value))
    except (ValueError, TypeError, OverflowError):
        return 0


def resumo(config, state):
    """Dados estritamente necessarios para o painel; sem caminhos/logs/BUs."""
    total = inteiro(state.get("total", 0))
    completed = min(total, inteiro(state.get("concluidas", 0)))
    ignored = min(max(total - completed, 0), inteiro(state.get("ignoradas", 0)))
    done = completed + ignored
    failed = inteiro(state.get("falhas", 0))
    target = config.get("alvo") or {}
    current = str(state.get("atual") or "")
    if not re.fullmatch(r"[a-z]{2}-[0-9]{5}-[0-9]{4}-[0-9]{4}", current):
        current = ""
    return {
        "job_id": str(config.get("job_id", ""))[:90],
        "status": str(state.get("status", "unknown"))[:40],
        "uf": str(target.get("uf", "")).upper()[:2],
        "municipio": str(target.get("municipio", ""))[:6],
        "zona": str(target.get("zona", ""))[:4],
        "escopo": str(config.get("escopo", ""))[:12],
        "total": total,
        "concluidas": completed,
        "ignoradas": ignored,
        "pendentes": max(0, total - done),
        "falhas": failed,
        "processadas": done,
        "percentual": round(done / total * 100, 2) if total else 0,
        "atual": current,
        "atualizado_utc": str(state.get("atualizado_utc", ""))[:40],
    }


def handler_para(runtime: Path, job: str):
    """Cria handler isolado por servidor; nao exponha este servidor na rede."""
    class Handler(BaseHTTPRequestHandler):
        def responder(self, status, data, content_type):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy",
                "default-src 'none'; script-src 'self'; style-src 'self'; "
                "connect-src 'self'; base-uri 'none'; object-src 'none'")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            host = self.headers.get("Host", "")
            if not re.fullmatch(r"(localhost|127\.0\.0\.1)(:\d{1,5})?", host):
                self.responder(403, b"Forbidden", "text/plain; charset=utf-8")
                return
            if self.path == "/api/status":
                try:
                    payload = ler_estado(runtime, job)
                    self.responder(200, json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                                   "application/json; charset=utf-8")
                except (OSError, ValueError, json.JSONDecodeError):
                    self.responder(503, b'{"erro":"Status da coleta indisponivel"}',
                                   "application/json; charset=utf-8")
            elif self.path in ASSETS:
                filename, mime = ASSETS[self.path]
                try:
                    contents = (STATIC / filename).read_bytes()
                except OSError:
                    self.responder(503, b"Painel indisponivel", "text/plain; charset=utf-8")
                    return
                self.responder(200, contents, mime)
            else:
                self.responder(404, b"Not Found", "text/plain; charset=utf-8")

        def log_message(self, fmt, *args):
            # Nao registrar URLs do usuario nem criar arquivo de log.
            pass
    return Handler


def servir(runtime: Path, job: str | None = None, porta: int = 8765):
    if not 1 <= porta <= 65535:
        raise ValueError("Porta deve estar entre 1 e 65535")
    runtime = runtime.resolve()
    job = obter_job(runtime, job)
    if not (runtime / "jobs" / job / "state.json").is_file():
        raise FileNotFoundError(f"Job nao encontrado: {job}")
    try:
        server = ThreadingHTTPServer(("127.0.0.1", porta), handler_para(runtime, job))
    except OSError as exc:
        raise RuntimeError(f"Nao foi possivel iniciar o painel na porta {porta}: {exc}") from exc
    print(f"Monitor local ativo para {job}")
    print(f"Abra no navegador: http://127.0.0.1:{porta}/")
    print("Para fechar o monitor, pressione Ctrl+C. A coleta continua em segundo plano.")
    try:
        server.serve_forever(poll_interval=0.3)
    except KeyboardInterrupt:
        print("\nMonitor encerrado. O motor de coleta nao foi interrompido.")
    finally:
        server.server_close()
