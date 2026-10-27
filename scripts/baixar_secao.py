#!/usr/bin/env python3
"""Baixa BU, RDV, log, VSC e aux do TSE, uma secao em dois turnos."""
import argparse
import hashlib
import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE = "https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna"
TURNOS = {1: ("3220", "04/10/2026"), 2: ("3221", "25/10/2026")}
TIPOS = {"bu", "busa", "rdv", "log", "vota", "votasa", "vsc", "vscsa"}
LOG = logging.getLogger("tse")


def obter(url):
    headers = {"User-Agent": "DataUrnasMVP/0.1", "Accept": "*/*"}
    for i in range(4):
        try:
            with urlopen(Request(url, headers=headers), timeout=50) as response:
                return response.read()
        except HTTPError as exc:
            if exc.code not in (403, 429, 500, 502, 503, 504) or i == 3:
                raise
            espera = min(60, 5 * (i + 1) ** 2)
            LOG.warning("HTTP %s; nova tentativa em %ds", exc.code, espera)
        except (TimeoutError, URLError):
            if i == 3:
                raise
            espera = min(60, 5 * (i + 1) ** 2)
            LOG.warning("Falha de rede; nova tentativa em %ds", espera)
        time.sleep(espera)
    raise RuntimeError("Tentativas esgotadas")


def gravar(destino, bruto, url, tipo):
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_suffix(destino.suffix + ".parcial")
    tmp.write_bytes(bruto)
    tmp.replace(destino)
    return {"tipo": tipo, "arquivo": str(destino), "url": url,
            "bytes": len(bruto), "sha256": hashlib.sha256(bruto).hexdigest(),
            "sha512": hashlib.sha512(bruto).hexdigest()}


def momento(conjunto):
    data, hora = str(conjunto.get("dr", "")), str(conjunto.get("hr", ""))
    return (data[6:] + data[3:5] + data[:2] + hora) if len(data) == 10 else data + hora


def conjunto_totalizado(aux):
    disponiveis = []
    for grupo in aux.get("hashes") or []:
        tipos = {str(a.get("tp", "")).lower() for a in grupo.get("arq") or []}
        if str(grupo.get("st", "")).lower() == "totalizado" and tipos.intersection({"bu", "busa"}):
            disponiveis.append(grupo)
    return max(disponiveis, key=momento) if disponiveis else None


def coletar(turno, uf, municipio, zona, secao, pasta):
    pleito, data = TURNOS[turno]
    raiz = f"{BASE}/{pleito}/dados/{uf}/{municipio}/{zona}/{secao}"
    prefixo = f"p{int(pleito):06d}-{uf}-m{municipio}-z{zona}-s{secao}"
    endereco = f"{raiz}/{prefixo}-aux.json"
    resultado = {"turno": turno, "data": data, "pleito": pleito,
                 "status": "erro", "arquivos": [], "erros": []}
    try:
        bruto = obter(endereco)
        aux = json.loads(bruto.decode("utf-8-sig"))
        resultado["arquivos"].append(gravar(pasta / f"{prefixo}-aux.json", bruto, endereco, "aux"))
        resultado["status_aux"] = aux.get("st")
        resultado["quantidade_conjuntos"] = len(aux.get("hashes") or [])
        grupo = conjunto_totalizado(aux)
        if grupo is None:
            resultado["status"] = "sem_bu_totalizado"
            LOG.warning("Turno %s sem BU Totalizado", turno)
            return resultado
        resultado["hash_conjunto"] = grupo.get("hash")
        for item in grupo.get("arq") or []:
            tipo, nome = str(item.get("tp", "")).lower(), str(item.get("nm", ""))
            if tipo not in TIPOS or not nome or Path(nome).name != nome or nome.startswith("."):
                continue
            url = f"{raiz}/{grupo['hash']}/{nome}"
            try:
                arquivo = gravar(pasta / nome, obter(url), url, tipo)
                resultado["arquivos"].append(arquivo)
                LOG.info("Turno %s: %s (%d bytes)", turno, nome, arquivo["bytes"])
            except Exception as exc:
                resultado["erros"].append(f"{nome}: {type(exc).__name__}: {exc}")
                LOG.warning("Falha: %s", resultado["erros"][-1])
        existe_bu = any(a["tipo"] in ("bu", "busa") for a in resultado["arquivos"])
        resultado["status"] = ("erro_sem_bu" if not existe_bu else
                              "parcial" if resultado["erros"] else "ok")
    except Exception as exc:
        resultado["erros"].append(f"{type(exc).__name__}: {exc}")
        LOG.error("Turno %s: %s", turno, resultado["erros"][-1])
    return resultado


def main():
    ap = argparse.ArgumentParser(description="Baixa BU/RDV/log/VSC de um secao, dois turnos")
    ap.add_argument("--uf", default="sp")
    ap.add_argument("--municipio", default="71072")
    ap.add_argument("--zona", default="0253")
    ap.add_argument("--secao", default="0010")
    ap.add_argument("--out", default="data/raw")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    uf, mun, zona, secao = a.uf.strip().lower(), a.municipio.zfill(5), a.zona.zfill(4), a.secao.zfill(4)
    pasta = Path(a.out)
    res = {"origem": "TSE resultados.tse.jus.br", "coleta_utc": datetime.now(timezone.utc).isoformat(),
           "identificacao": {"uf": uf.upper(), "municipio_tse": mun, "zona": zona, "secao": secao},
           "aviso": "Hashes locais; assinaturas VSC nao verificadas.", "turnos": []}
    for turno in (1, 2):
        res["turnos"].append(coletar(turno, uf, mun, zona, secao, pasta / f"{turno}T"))
    destino = pasta.parent / "manifesto_tse.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Manifesto:", destino)
    for t in res["turnos"]:
        print(f"Turno {t['turno']}: {t['status']} | arquivos: {len(t['arquivos'])}")
    return 0 if all(t["status"] in ("ok", "parcial") and
                    any(a["tipo"] in ("bu", "busa") for a in t["arquivos"])
                    for t in res["turnos"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
