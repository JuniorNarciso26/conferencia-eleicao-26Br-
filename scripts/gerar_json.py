#!/usr/bin/env python3
"""Converte dois BUs oficiais para JSON do MVP usando o parser do DataUrnas-BR."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

ELEICOES = {1: 6257, 2: 6258}


def classificar_votos(votos, candidatos_validos):
    total = {"flavio": 0, "lula": 0, "outros": 0,
             "brancos": 0, "nulos": 0, "nulos_tecnicos": 0}
    for voto in votos:
        tipo = str(voto.get("tipo_voto") or "").lower()
        codigo = voto.get("numero")
        numero = int(codigo) if codigo is not None else None
        qt = int(voto.get("votos") or 0)
        if qt < 0:
            raise ValueError("Votos negativos no BU")
        if tipo == "branco":
            total["brancos"] += qt
        elif tipo == "nulo":
            total["nulos"] += qt
        elif tipo == "nominal":
            if numero not in candidatos_validos:
                total["nulos_tecnicos"] += qt
            elif numero == 13:
                total["lula"] += qt
            elif numero == 22:
                total["flavio"] += qt
            else:
                total["outros"] += qt
        elif tipo == "legenda":
            total["outros"] += qt
        else:
            raise ValueError(f"Tipo de voto inesperado: {tipo}")
    return total


def candidatos_oficiais(eleicao):
    from dataurnas.downloader.ele2026 import parse_candidatos
    url = f"https://resultados.tse.jus.br/oficial/ele2026/{eleicao}/dados/br/br-c0001-e{eleicao:06d}-u.json"
    with urlopen(Request(url, headers={"User-Agent": "DataUrnasMVP/0.1"}), timeout=50) as r:
        doc = json.load(r)
    numeros = {int(x["numero"]) for x in parse_candidatos(doc) if x.get("numero") is not None}
    if not {13, 22}.issubset(numeros):
        raise ValueError(f"Candidatos 13/22 ausentes no resultado oficial da eleicao {eleicao}")
    return numeros, url


def carregar_bu(manifesto, turno):
    from dataurnas.downloader.ele2026 import bu_to_rows
    info = next((t for t in manifesto["turnos"] if t["turno"] == turno), None)
    if info is None:
        raise ValueError(f"Turno {turno} ausente no manifesto")
    item = next((a for a in info.get("arquivos", []) if a["tipo"] in ("bu", "busa")), None)
    if item is None:
        raise ValueError(f"BU do turno {turno} nao foi baixado: {info.get('status')}")
    caminho = Path(item["arquivo"])
    bruto = caminho.read_bytes()
    if hashlib.sha256(bruto).hexdigest() != item["sha256"]:
        raise ValueError(f"Hash divergente do manifesto: {caminho}")
    sec, votos = bu_to_rows(bruto, eleicao=ELEICOES[turno], cargo=1)
    if not sec.get("tem_presidente") or not votos:
        raise ValueError(f"BU sem votos de Presidente no turno {turno}")
    numeros, url = candidatos_oficiais(ELEICOES[turno])
    totais = classificar_votos(votos, numeros)
    keys = ("aptos", "comparecimento", "comparecimento_bu",
            "habilitados_biometria", "habilitados_biografia", "comp_sem_biometria")
    out = {k: int(sec[k]) if sec.get(k) is not None else None for k in keys}
    out.update(totais)
    out["numero_interno_urna"] = str(sec.get("numero_interno_urna") or "")
    out["modelo_urna"] = str(sec.get("modelo_urna") or "")
    if sum(totais.values()) != out["comparecimento"]:
        raise ValueError(f"Turno {turno}: soma de votos nao confere com comparecimento")
    bio = [out[k] for k in ("habilitados_biometria", "habilitados_biografia", "comp_sem_biometria")]
    alerta_bio = (all(x is not None for x in bio) and sum(bio) != out["comparecimento_bu"])
    return out, {"turno": turno, "bu": str(caminho), "hash_sha256": item["sha256"],
                 "candidatos_fonte": url, "status_download": info["status"],
                 "aviso_biometria": "Soma da identificacao nao confere com comparecimento geral" if alerta_bio else None}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifesto", default="data/manifesto_tse.json")
    ap.add_argument("--saida", default="web/dados/secao_real_2026.json")
    a = ap.parse_args()
    man = json.loads(Path(a.manifesto).read_text(encoding="utf-8"))
    r1, f1 = carregar_bu(man, 1)
    r2, f2 = carregar_bu(man, 2)
    meta = man["identificacao"]
    out = {"meta": {"uf": meta["uf"], "municipio": "Sao Paulo" if meta["municipio_tse"] == "71072" else meta["municipio_tse"],
                    "codigo_municipio": meta["municipio_tse"], "zona": meta["zona"],
                    "secao": meta["secao"], "origem": "TSE (Boletins de Urna convertidos via DataUrnas-BR)"},
           "turnos": {"1": r1, "2": r2},
           "proveniencia": {"fontes": [f1, f2], "aviso": "Assinaturas VSC nao verificadas neste MVP"}}
    destino = Path(a.saida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print("JSON gerado:", destino)
    if f1["aviso_biometria"] or f2["aviso_biometria"]:
        print("AVISO: soma das modalidades biometricas difere do comparecimento geral")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
