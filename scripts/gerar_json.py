#!/usr/bin/env python3
"""Converte dois BUs oficiais para JSON usando artefatos locais hasheados."""
import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path

ELEICOES = {1: 6257, 2: 6258}
PLEITOS = {1: 3220, 2: 3221}


def configurar_dataurnas():
    """Aponta o parser instalado para as especificações do commit vendor fixado."""
    import dataurnas.config as config
    raiz = Path(__file__).resolve().parents[1]
    spec = (raiz / "vendor" / "DataUrnas-BR" / "spec").resolve()
    if not (spec / "v2" / "bu.asn1").is_file():
        raise FileNotFoundError(f"Especificações ASN.1 fixadas não encontradas: {spec}")
    config.SPEC_DIR = spec
    return spec


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


def verificar_hash(caminho, item):
    bruto = Path(caminho).read_bytes()
    h256 = hashlib.sha256(bruto).hexdigest()
    h512 = hashlib.sha512(bruto).hexdigest()
    if h256 != item.get("sha256") or (item.get("sha512") and h512 != item["sha512"]):
        raise ValueError(f"Hash divergente do manifesto: {caminho}")
    if item.get("bytes") is not None and len(bruto) != int(item["bytes"]):
        raise ValueError(f"Tamanho divergente do manifesto: {caminho}")
    return bruto


def candidatos_oficiais(manifesto, turno):
    configurar_dataurnas()
    from dataurnas.downloader.ele2026 import parse_candidatos
    item = next((x for x in manifesto.get("candidatos", []) if int(x.get("turno", 0)) == turno), None)
    if not item or not item.get("arquivo"):
        raise ValueError(f"Documento oficial de candidatos do turno {turno} ausente no manifesto")
    bruto = verificar_hash(item["arquivo"], item)
    doc = json.loads(bruto.decode("utf-8-sig"))
    numeros = {int(x["numero"]) for x in parse_candidatos(doc) if x.get("numero") is not None}
    if not {13, 22}.issubset(numeros):
        raise ValueError(f"Candidatos 13/22 ausentes no documento oficial da eleicao {ELEICOES[turno]}")
    return numeros, {"url": item.get("url"), "arquivo": item["arquivo"],
                     "sha256": item["sha256"], "sha512": item.get("sha512")}


def _normalizar_identidade(valor, largura=None, upper=False):
    if valor is None or isinstance(valor, (dict, list, tuple, set)):
        return None
    texto = str(valor).strip()
    if not texto:
        return None
    if texto.isdigit() and largura:
        texto = texto.zfill(largura)
    return texto.upper() if upper else texto


def validar_identidade_parser(sec, esperado, turno):
    """Valida campos reconhecidos presentes; ausentes preservam compatibilidade."""
    aliases = {
        "uf": ("uf", "uf_bu", "sigla_uf", "unidade_federacao"),
        "municipio_tse": ("municipio_tse", "municipio_bu", "codigo_municipio", "municipio", "cd_municipio"),
        "zona": ("zona", "zona_bu", "numero_zona", "nr_zona"),
        "secao": ("secao", "secao_bu", "numero_secao", "nr_secao"),
        "turno": ("turno", "numero_turno", "nr_turno"),
        "eleicao": ("eleicao", "codigo_eleicao", "id_eleicao"),
        "pleito": ("pleito", "codigo_pleito", "id_pleito"),
    }
    larguras = {"municipio_tse": 5, "zona": 4, "secao": 4}
    verificados = {}
    for campo, nomes in aliases.items():
        presentes = [(nome, sec[nome]) for nome in nomes if nome in sec and sec[nome] not in (None, "")]
        if not presentes:
            continue
        normalizados = {_normalizar_identidade(valor, larguras.get(campo), campo == "uf")
                        for _, valor in presentes}
        if None in normalizados or len(normalizados) != 1:
            raise ValueError(f"Turno {turno}: identidade {campo} ambigua/invalida no parser")
        obtido = normalizados.pop()
        desejado = _normalizar_identidade(esperado[campo], larguras.get(campo), campo == "uf")
        if obtido != desejado:
            raise ValueError(f"Turno {turno}: identidade {campo} divergente ({obtido} != {desejado})")
        verificados[campo] = obtido
    return verificados


def carregar_bu(manifesto, turno):
    configurar_dataurnas()
    from dataurnas.downloader.ele2026 import bu_to_rows
    info = next((t for t in manifesto["turnos"] if int(t["turno"]) == turno), None)
    if info is None:
        raise ValueError(f"Turno {turno} ausente no manifesto")
    item = next((a for a in info.get("arquivos", []) if a["tipo"] in ("bu", "busa")), None)
    if item is None:
        raise ValueError(f"BU do turno {turno} nao foi baixado: {info.get('status')}")
    caminho = Path(item["arquivo"])
    bruto = verificar_hash(caminho, item)
    sec, votos = bu_to_rows(bruto, eleicao=ELEICOES[turno], cargo=1)
    if not isinstance(sec, dict):
        raise ValueError(f"Turno {turno}: parser retornou metadados invalidos")
    if not sec.get("tem_presidente") or not votos:
        raise ValueError(f"BU sem votos de Presidente no turno {turno}")
    meta = manifesto["identificacao"]
    esperado = {"uf": meta["uf"], "municipio_tse": meta["municipio_tse"],
                "zona": meta["zona"], "secao": meta["secao"], "turno": turno,
                "eleicao": ELEICOES[turno], "pleito": PLEITOS[turno]}
    identidade = validar_identidade_parser(sec, esperado, turno)
    numeros, candidatos = candidatos_oficiais(manifesto, turno)
    totais = classificar_votos(votos, numeros)
    keys = ("aptos", "comparecimento", "comparecimento_bu",
            "habilitados_biometria", "habilitados_biografia", "comp_sem_biometria")
    out = {k: int(sec[k]) if sec.get(k) is not None else None for k in keys}
    out.update(totais)
    out["numero_interno_urna"] = str(sec.get("numero_interno_urna") or "")
    out["modelo_urna"] = str(sec.get("modelo_urna") or "")
    if out["comparecimento"] is None or sum(totais.values()) != out["comparecimento"]:
        raise ValueError(f"Turno {turno}: soma de votos nao confere com comparecimento")
    bio = [out[k] for k in ("habilitados_biometria", "habilitados_biografia", "comp_sem_biometria")]
    alerta_bio = (all(x is not None for x in bio) and sum(bio) != out["comparecimento_bu"])
    return out, {"turno": turno, "bu": str(caminho), "hash_sha256": item["sha256"],
                 "candidatos": candidatos, "status_download": info["status"],
                 "identidade_parser_verificada": identidade,
                 "aviso_biometria": "Soma da identificacao nao confere com comparecimento geral" if alerta_bio else None}


def gravar_json_atomico(destino, dados):
    destino = Path(destino)
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=destino.parent,
                                         prefix=f".{destino.name}.", suffix=".parcial",
                                         delete=False) as arquivo:
            tmp = Path(arquivo.name)
            json.dump(dados, arquivo, ensure_ascii=False, indent=2)
            arquivo.write("\n")
            arquivo.flush()
            os.fsync(arquivo.fileno())
        os.replace(tmp, destino)
        tmp = None
    finally:
        if tmp is not None:
            tmp.unlink(missing_ok=True)


def gerar_arquivo(manifesto, saida):
    """Valida um manifesto e gera o JSON consolidado da seção."""
    manifesto, saida = Path(manifesto), Path(saida)
    man = json.loads(manifesto.read_text(encoding="utf-8"))
    r1, f1 = carregar_bu(man, 1)
    r2, f2 = carregar_bu(man, 2)
    meta = man["identificacao"]
    out = {"meta": {"uf": meta["uf"], "municipio": "Sao Paulo" if meta["municipio_tse"] == "71072" else meta["municipio_tse"],
                    "codigo_municipio": meta["municipio_tse"], "zona": meta["zona"],
                    "secao": meta["secao"], "origem": "TSE (BUs convertidos via DataUrnas-BR)"},
           "turnos": {"1": r1, "2": r2},
           "proveniencia": {"fontes": [f1, f2],
                            "aviso": "Assinaturas VSC nao verificadas neste MVP"}}
    gravar_json_atomico(saida, out)
    if f1["aviso_biometria"] or f2["aviso_biometria"]:
        print("AVISO: soma das modalidades biometricas difere do comparecimento geral")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifesto", default="data/manifesto_tse.json")
    ap.add_argument("--saida", default="web/dados/secao_real_2026.json")
    a = ap.parse_args()
    gerar_arquivo(a.manifesto, a.saida)
    print("JSON gerado:", Path(a.saida))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
