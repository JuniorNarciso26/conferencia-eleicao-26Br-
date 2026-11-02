#!/usr/bin/env python3
"""Exporta contagens horárias anônimas dos logs já coletados de uma zona.

O CSV pode ser aberto em site/horarios.html. Cada evento contado corresponde à
mensagem de conclusão de uma votação; nenhuma escolha de candidato é inferida.
"""

import argparse
import csv
import hashlib
import io
import json
import re
import zipfile
from collections import Counter
from pathlib import Path


DATAS = {"1T": "04/10/2026", "2T": "25/10/2026"}
MAX_LOG_TEXT = 64 * 1024 * 1024
MAX_LOG_ZIP = 256 * 1024 * 1024


def sha256_arquivo(caminho):
    digest = hashlib.sha256()
    with caminho.open("rb") as arquivo:
        for bloco in iter(lambda: arquivo.read(1024 * 1024), b""):
            digest.update(bloco)
    return digest.hexdigest()


def ler_log_texto(arquivo):
    if arquivo.stat().st_size > MAX_LOG_ZIP:
        raise ValueError(f"Log comprimido acima do limite: {arquivo}")
    with zipfile.ZipFile(arquivo) as pacote:
        nomes = pacote.namelist()
        if "logd.dat" not in nomes:
            raise ValueError(f"logd.dat ausente: {arquivo}")
        partes = []
        for nome in nomes:
            if nome == "logd.dat":
                if pacote.getinfo(nome).file_size > MAX_LOG_TEXT:
                    raise ValueError(f"Log descompactado acima do limite: {arquivo}")
                partes.append(pacote.read(nome))
            elif nome.endswith(".jez") and "/" not in nome and "\\" not in nome:
                if pacote.getinfo(nome).file_size > MAX_LOG_ZIP:
                    raise ValueError(f"Log interno acima do limite: {arquivo}")
                with zipfile.ZipFile(io.BytesIO(pacote.read(nome))) as anterior:
                    if anterior.namelist() != ["logd.dat"] or anterior.getinfo("logd.dat").file_size > MAX_LOG_TEXT:
                        raise ValueError(f"Estrutura de log interno inesperada: {arquivo} / {nome}")
                    partes.append(anterior.read("logd.dat"))
            else:
                raise ValueError(f"Membro inesperado no pacote de log: {arquivo} / {nome}")
    return [linha for parte in partes for linha in parte.decode("latin-1").splitlines()]


def contar_horas(arquivo, data):
    horas = Counter()
    for linha in ler_log_texto(arquivo):
        campos = linha.split("\t")
        if len(campos) > 4 and campos[0].startswith(data) and campos[4] == "O voto do eleitor foi computado":
            hora = campos[0][11:13]
            if not re.fullmatch(r"\d{2}", hora) or int(hora) > 23:
                raise ValueError(f"Horário inválido em {arquivo}")
            horas[hora] += 1
    return horas


def exportar(raiz, uf, municipio, zona, destino, esperado=None):
    pasta_raiz = Path(raiz)
    secoes = sorted(pasta_raiz.glob(f"{uf.lower()}-{municipio}-{zona}-*"))
    if not secoes or (esperado is not None and len(secoes) != esperado):
        raise ValueError(f"Cobertura da zona incompleta: {len(secoes)} seção(ões), esperado={esperado}")
    linhas = []
    vistos = set()
    totais = Counter()
    for pasta in secoes:
        if not pasta.is_dir() or not (pasta / "validated.ok").is_file():
            raise ValueError(f"Seção não validada: {pasta}")
        dados = json.loads((pasta / "secao.json").read_text(encoding="utf-8"))
        meta = dados.get("meta", {})
        secao = str(meta.get("secao", "")).zfill(4)
        if (str(meta.get("uf", "")).upper(), str(meta.get("codigo_municipio", "")),
            str(meta.get("zona", "")).zfill(4)) != (uf.upper(), municipio, zona):
            raise ValueError(f"Identidade divergente: {pasta}")
        if not re.fullmatch(r"\d{4}", secao) or secao in vistos:
            raise ValueError(f"Seção inválida ou duplicada: {pasta}")
        vistos.add(secao)
        manifesto = json.loads((pasta / "manifesto_tse.json").read_text(encoding="utf-8"))
        for numero, turno in ((1, "1T"), (2, "2T")):
            item = next((t for t in manifesto.get("turnos", []) if t.get("turno") == numero), None)
            if not item or item.get("status") not in ("ok", "parcial"):
                raise ValueError(f"Coleta incompleta: {pasta} / {turno}")
            logs = [a for a in item.get("arquivos", []) if a.get("tipo") == "log"]
            if len(logs) != 1:
                raise ValueError(f"Esperado um log: {pasta} / {turno}")
            log = pasta / "raw" / turno / Path(logs[0]["arquivo"]).name
            if not log.is_file() or sha256_arquivo(log) != logs[0]["sha256"]:
                raise ValueError(f"Log ausente ou hash divergente: {log}")
            horas = contar_horas(log, DATAS[turno])
            total = sum(horas.values())
            comparecimento = dados["turnos"][str(numero)]["comparecimento"]
            if total != comparecimento:
                raise ValueError(f"{pasta.name} / {turno}: log={total}, BU={comparecimento}")
            totais[turno] += total
            linhas.extend({"turno": turno, "secao": secao, "hora": hora,
                           "votacoes_concluidas": count} for hora, count in sorted(horas.items()))
    destino = Path(destino)
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporario = destino.with_name(destino.name + ".part")
    with temporario.open("w", encoding="utf-8-sig", newline="") as arquivo:
        writer = csv.DictWriter(arquivo, delimiter=";",
                                fieldnames=["turno", "secao", "hora", "votacoes_concluidas"])
        writer.writeheader()
        writer.writerows(linhas)
    temporario.replace(destino)
    return len(vistos), dict(totais)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raiz", default="data/coletas")
    parser.add_argument("--uf", required=True)
    parser.add_argument("--municipio", required=True)
    parser.add_argument("--zona", required=True)
    parser.add_argument("--esperado", type=int, help="Número oficial de seções principais para exigir cobertura completa")
    parser.add_argument("--saida", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[a-zA-Z]{2}", args.uf) or not re.fullmatch(r"\d{1,5}", args.municipio) or not re.fullmatch(r"\d{1,4}", args.zona):
        parser.error("UF, município ou zona inválidos")
    if args.esperado is not None and args.esperado < 1:
        parser.error("--esperado deve ser positivo")
    quantidade, totais = exportar(args.raiz, args.uf.upper(), args.municipio.zfill(5),
                                  args.zona.zfill(4), args.saida, args.esperado)
    print(f"{quantidade} seções; {totais}; CSV: {args.saida}")


if __name__ == "__main__":
    main()
