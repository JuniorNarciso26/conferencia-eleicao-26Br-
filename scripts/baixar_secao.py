#!/usr/bin/env python3
"""Baixa artefatos do TSE com limites, hashes e publicação atômica."""
import argparse
import hashlib
import json
import logging
import os
import re
import tempfile
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE = "https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna"
RESULTADOS = "https://resultados.tse.jus.br/oficial/ele2026"
TURNOS = {1: ("3220", "6257", "04/10/2026"), 2: ("3221", "6258", "25/10/2026")}
TIPOS = {"bu", "busa", "rdv", "log", "vota", "votasa", "vsc", "vscsa"}
MAX_AUX_BYTES = 2 * 1024 * 1024
MAX_CANDIDATOS_BYTES = 20 * 1024 * 1024
MAX_ARQUIVO_BYTES = 256 * 1024 * 1024
MAX_TOTAL_BYTES = 1024 * 1024 * 1024
MAX_ARQUIVOS = 32
CHUNK_BYTES = 64 * 1024
TENTATIVAS = 4
MAX_RETRY_AFTER = 120
SEGMENTO_RE = re.compile(r"^[A-Za-z0-9._~-]{1,160}$")
HASH_RE = re.compile(r"^[0-9a-fA-F]{64}(?:[0-9a-fA-F]{64})?$")
LOG = logging.getLogger("tse")


class LimiteExcedido(ValueError):
    """Resposta excedeu o limite configurado."""


def retry_after_segundos(valor, agora=None):
    """Converte Retry-After válido (segundos ou data HTTP), limitado por política."""
    if not valor:
        return None
    try:
        segundos = int(valor.strip())
    except (TypeError, ValueError):
        try:
            data = parsedate_to_datetime(valor)
            if data.tzinfo is None:
                return None
            base = agora or datetime.now(timezone.utc)
            segundos = max(0, int((data - base).total_seconds()))
        except (TypeError, ValueError, OverflowError):
            return None
    return segundos if 0 <= segundos <= MAX_RETRY_AFTER else None


def _espera_retry(exc, tentativa):
    if isinstance(exc, HTTPError):
        espera = retry_after_segundos(exc.headers.get("Retry-After"))
        if espera is not None:
            return espera
    return min(60, 5 * (tentativa + 1) ** 2)


def _hash_esperado(item):
    """Extrai hash criptográfico publicado no item do aux, quando houver."""
    encontrados = []
    for chave in ("hash", "hs", "sha256", "sha512"):
        valor = item.get(chave)
        if valor not in (None, ""):
            valor = str(valor).strip().lower()
            if not HASH_RE.fullmatch(valor):
                raise ValueError(f"Hash invalido no aux ({chave})")
            encontrados.append(valor)
    if len(set(encontrados)) > 1:
        raise ValueError("Hashes conflitantes no item do aux")
    return encontrados[0] if encontrados else None


def validar_segmento(valor, nome):
    valor = str(valor or "")
    if not SEGMENTO_RE.fullmatch(valor) or valor in (".", ".."):
        raise ValueError(f"Segmento {nome} invalido no aux")
    return valor


def validar_item_aux(item):
    if not isinstance(item, dict):
        raise ValueError("Item de arquivo invalido no aux")
    tipo = str(item.get("tp", "")).lower()
    nome = validar_segmento(item.get("nm"), "nome de arquivo")
    if Path(nome).name != nome or nome.startswith("."):
        raise ValueError("Nome de arquivo inseguro no aux")
    return tipo, nome, _hash_esperado(item)


def baixar_atomico(url, destino, limite, hash_esperado=None, opener=urlopen, sleeper=time.sleep):
    """Faz streaming limitado para temporário e só então publica o arquivo."""
    destino = Path(destino)
    destino.parent.mkdir(parents=True, exist_ok=True)
    headers = {"User-Agent": "DataUrnasMVP/0.2", "Accept": "*/*"}
    ultimo = None
    for tentativa in range(TENTATIVAS):
        tmp = None
        try:
            with opener(Request(url, headers=headers), timeout=50) as response:
                tamanho = response.headers.get("Content-Length")
                if tamanho is not None:
                    try:
                        declarado = int(tamanho)
                    except ValueError as exc:
                        raise ValueError("Content-Length invalido") from exc
                    if declarado < 0 or declarado > limite:
                        raise LimiteExcedido(f"Content-Length excede {limite} bytes")
                with tempfile.NamedTemporaryFile("wb", dir=destino.parent,
                                                 prefix=f".{destino.name}.", suffix=".parcial",
                                                 delete=False) as arquivo:
                    tmp = Path(arquivo.name)
                    sha256, sha512, total = hashlib.sha256(), hashlib.sha512(), 0
                    while True:
                        bloco = response.read(CHUNK_BYTES)
                        if not bloco:
                            break
                        total += len(bloco)
                        if total > limite:
                            raise LimiteExcedido(f"Resposta excede {limite} bytes")
                        arquivo.write(bloco)
                        sha256.update(bloco)
                        sha512.update(bloco)
                    arquivo.flush()
                    os.fsync(arquivo.fileno())
            h256, h512 = sha256.hexdigest(), sha512.hexdigest()
            if hash_esperado and hash_esperado not in (h256, h512):
                raise ValueError("Hash do arquivo diverge do aux")
            os.replace(tmp, destino)
            tmp = None
            return {"bytes": total, "sha256": h256, "sha512": h512}
        except (HTTPError, URLError, TimeoutError) as exc:
            ultimo = exc
            repetivel = not isinstance(exc, HTTPError) or exc.code in (403, 429, 500, 502, 503, 504)
            if not repetivel or tentativa == TENTATIVAS - 1:
                raise
            espera = _espera_retry(exc, tentativa)
            LOG.warning("Falha HTTP/rede; nova tentativa em %ds", espera)
            sleeper(espera)
        finally:
            if tmp is not None:
                tmp.unlink(missing_ok=True)
    raise RuntimeError("Tentativas esgotadas") from ultimo


def ler_json_limitado(caminho, limite):
    caminho = Path(caminho)
    if caminho.stat().st_size > limite:
        raise LimiteExcedido(f"JSON excede {limite} bytes")
    return json.loads(caminho.read_text(encoding="utf-8-sig"))


def gravar_json_atomico(destino, dados):
    destino = Path(destino)
    destino.parent.mkdir(parents=True, exist_ok=True)
    bruto = (json.dumps(dados, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    tmp = None
    try:
        with tempfile.NamedTemporaryFile("wb", dir=destino.parent,
                                         prefix=f".{destino.name}.", suffix=".parcial",
                                         delete=False) as arquivo:
            tmp = Path(arquivo.name)
            arquivo.write(bruto)
            arquivo.flush()
            os.fsync(arquivo.fileno())
        os.replace(tmp, destino)
        tmp = None
    finally:
        if tmp is not None:
            tmp.unlink(missing_ok=True)


def registrar(destino, url, tipo, metadados, hash_aux=None):
    item = {"tipo": tipo, "arquivo": str(destino), "url": url, **metadados}
    if hash_aux:
        item["hash_aux"] = hash_aux
    return item


def momento(conjunto):
    data, hora = str(conjunto.get("dr", "")), str(conjunto.get("hr", ""))
    return (data[6:] + data[3:5] + data[:2] + hora) if len(data) == 10 else data + hora


def conjunto_totalizado(aux):
    disponiveis = []
    for grupo in aux.get("hashes") or []:
        tipos = {str(a.get("tp", "")).lower() for a in grupo.get("arq") or [] if isinstance(a, dict)}
        if str(grupo.get("st", "")).lower() == "totalizado" and tipos.intersection({"bu", "busa"}):
            disponiveis.append(grupo)
    return max(disponiveis, key=momento) if disponiveis else None


def coletar_candidatos(turno, eleicao, pasta):
    nome = f"br-c0001-e{int(eleicao):06d}-u.json"
    url = f"{RESULTADOS}/{eleicao}/dados/br/{nome}"
    destino = pasta / nome
    meta = baixar_atomico(url, destino, MAX_CANDIDATOS_BYTES)
    return registrar(destino, url, "candidatos", meta)


def coletar(turno, uf, municipio, zona, secao, pasta):
    pleito, eleicao, data = TURNOS[turno]
    raiz = f"{BASE}/{pleito}/dados/{uf}/{municipio}/{zona}/{secao}"
    prefixo = f"p{int(pleito):06d}-{uf}-m{municipio}-z{zona}-s{secao}"
    endereco = f"{raiz}/{prefixo}-aux.json"
    resultado = {"turno": turno, "data": data, "pleito": pleito, "eleicao": eleicao,
                 "status": "erro", "arquivos": [], "erros": []}
    try:
        aux_destino = pasta / f"{prefixo}-aux.json"
        meta = baixar_atomico(endereco, aux_destino, MAX_AUX_BYTES)
        resultado["arquivos"].append(registrar(aux_destino, endereco, "aux", meta))
        aux = ler_json_limitado(aux_destino, MAX_AUX_BYTES)
        resultado["status_aux"] = aux.get("st")
        resultado["quantidade_conjuntos"] = len(aux.get("hashes") or [])
        grupo = conjunto_totalizado(aux)
        if grupo is None:
            resultado["status"] = "sem_bu_totalizado"
            return resultado
        segmento_hash = validar_segmento(grupo.get("hash"), "hash do conjunto")
        resultado["hash_conjunto"] = segmento_hash
        itens = grupo.get("arq") or []
        if len(itens) > MAX_ARQUIVOS:
            raise LimiteExcedido(f"Aux lista mais de {MAX_ARQUIVOS} arquivos")
        total = sum(a["bytes"] for a in resultado["arquivos"])
        for item in itens:
            tipo, nome, hash_aux = validar_item_aux(item)
            if tipo not in TIPOS:
                continue
            url = f"{raiz}/{segmento_hash}/{nome}"
            try:
                restante = MAX_TOTAL_BYTES - total
                if restante <= 0:
                    raise LimiteExcedido("Limite total do turno excedido")
                limite = min(MAX_ARQUIVO_BYTES, restante)
                destino = pasta / nome
                meta = baixar_atomico(url, destino, limite, hash_aux)
                total += meta["bytes"]
                resultado["arquivos"].append(registrar(destino, url, tipo, meta, hash_aux))
            except Exception as exc:  # coleta parcial deve registrar cada falha
                resultado["erros"].append(f"{nome}: {type(exc).__name__}: {exc}")
        existe_bu = any(a["tipo"] in ("bu", "busa") for a in resultado["arquivos"])
        resultado["status"] = "erro_sem_bu" if not existe_bu else "parcial" if resultado["erros"] else "ok"
    except Exception as exc:
        resultado["erros"].append(f"{type(exc).__name__}: {exc}")
        LOG.error("Turno %s: %s", turno, resultado["erros"][-1])
    return resultado


def main():
    ap = argparse.ArgumentParser(description="Baixa BU/RDV/log/VSC de uma secao, dois turnos")
    ap.add_argument("--uf", default="sp")
    ap.add_argument("--municipio", default="71072")
    ap.add_argument("--zona", default="0253")
    ap.add_argument("--secao", default="0010")
    ap.add_argument("--out", default="data/raw")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    uf, mun, zona, secao = a.uf.strip().lower(), a.municipio.zfill(5), a.zona.zfill(4), a.secao.zfill(4)
    for valor, nome in ((uf, "uf"), (mun, "municipio"), (zona, "zona"), (secao, "secao")):
        validar_segmento(valor, nome)
    pasta = Path(a.out)
    res = {"origem": "TSE resultados.tse.jus.br", "coleta_utc": datetime.now(timezone.utc).isoformat(),
           "limites_bytes": {"aux": MAX_AUX_BYTES, "candidatos": MAX_CANDIDATOS_BYTES,
                              "arquivo": MAX_ARQUIVO_BYTES, "total_por_turno": MAX_TOTAL_BYTES},
           "identificacao": {"uf": uf.upper(), "municipio_tse": mun, "zona": zona, "secao": secao},
           "aviso": "Hashes locais; assinaturas VSC nao verificadas.", "candidatos": [], "turnos": []}
    for turno in (1, 2):
        pleito, eleicao, _ = TURNOS[turno]
        try:
            res["candidatos"].append({"turno": turno, "eleicao": eleicao,
                                      **coletar_candidatos(turno, eleicao, pasta / "candidatos")})
        except Exception as exc:
            res["candidatos"].append({"turno": turno, "eleicao": eleicao, "status": "erro",
                                      "erro": f"{type(exc).__name__}: {exc}"})
        res["turnos"].append(coletar(turno, uf, mun, zona, secao, pasta / f"{turno}T"))
    destino = pasta.parent / "manifesto_tse.json"
    gravar_json_atomico(destino, res)
    print("Manifesto:", destino)
    for t in res["turnos"]:
        print(f"Turno {t['turno']}: {t['status']} | arquivos: {len(t['arquivos'])}")
    candidatos_ok = all(c.get("sha256") for c in res["candidatos"])
    urnas_ok = all(t["status"] in ("ok", "parcial") and
                   any(a["tipo"] in ("bu", "busa") for a in t["arquivos"])
                   for t in res["turnos"])
    return 0 if candidatos_ok and urnas_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
