#!/usr/bin/env python3
"""Gera um pacote web validado com o resumo e as seções de uma zona eleitoral."""
import argparse
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

CAMPOS_SOMA = (
    "aptos", "comparecimento", "comparecimento_bu",
    "habilitados_biometria", "habilitados_biografia", "comp_sem_biometria",
    "flavio", "lula", "outros", "brancos", "nulos", "nulos_tecnicos",
)
CAMPOS_VOTOS = ("flavio", "lula", "outros", "brancos", "nulos", "nulos_tecnicos")


def gravar_atomico(destino, dados):
    destino = Path(destino)
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporario = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=destino.parent,
            prefix=f".{destino.name}.", suffix=".parcial", delete=False,
        ) as arquivo:
            temporario = Path(arquivo.name)
            json.dump(dados, arquivo, ensure_ascii=False, separators=(",", ":"))
            arquivo.write("\n")
            arquivo.flush()
            os.fsync(arquivo.fileno())
        os.replace(temporario, destino)
        temporario = None
    finally:
        if temporario is not None:
            temporario.unlink(missing_ok=True)


def inteiro(valor, contexto):
    if isinstance(valor, bool) or not isinstance(valor, int) or valor < 0:
        raise ValueError(f"{contexto}: inteiro não negativo esperado")
    return valor


def carregar_secoes(raiz, uf, municipio, zona):
    padrao = f"{uf.lower()}-{municipio}-{zona}-*"
    secoes = []
    vistas = set()
    for pasta in sorted(Path(raiz).glob(padrao)):
        arquivo = pasta / "secao.json"
        validacao = pasta / "validated.ok"
        if not arquivo.is_file() or not validacao.is_file():
            raise ValueError(f"Coleta incompleta: {pasta.name}")
        dados = json.loads(arquivo.read_text(encoding="utf-8"))
        meta = dados.get("meta", {})
        secao = str(meta.get("secao", "")).zfill(4)
        esperado = (uf.upper(), municipio, zona)
        obtido = (str(meta.get("uf", "")).upper(), str(meta.get("codigo_municipio", "")), str(meta.get("zona", "")).zfill(4))
        if obtido != esperado or not secao.isdigit() or secao in vistas:
            raise ValueError(f"Identidade inválida ou duplicada em {arquivo}")
        turnos = {}
        for turno in ("1", "2"):
            origem = dados.get("turnos", {}).get(turno, {})
            limpo = {campo: inteiro(origem.get(campo), f"{secao}/{turno}/{campo}") for campo in CAMPOS_SOMA}
            if sum(limpo[campo] for campo in CAMPOS_VOTOS) != limpo["comparecimento"]:
                raise ValueError(f"{secao}/{turno}: soma dos votos não fecha")
            limpo["numero_interno_urna"] = str(origem.get("numero_interno_urna") or "")
            limpo["modelo_urna"] = str(origem.get("modelo_urna") or "")
            turnos[turno] = limpo
        vistas.add(secao)
        secoes.append({
            "meta": {"uf": uf.upper(), "municipio": str(meta.get("municipio") or municipio),
                     "codigo_municipio": municipio, "zona": zona, "secao": secao,
                     "origem": "TSE (BUs convertidos via DataUrnas-BR)"},
            "turnos": turnos,
        })
    return sorted(secoes, key=lambda item: int(item["meta"]["secao"]))


def consolidar(secoes, uf, municipio, zona):
    turnos = {}
    for turno in ("1", "2"):
        agregado = {campo: sum(item["turnos"][turno][campo] for item in secoes) for campo in CAMPOS_SOMA}
        agregado["numero_interno_urna"] = ""
        agregado["modelo_urna"] = ""
        turnos[turno] = agregado
    return {
        "meta": {"uf": uf.upper(), "municipio": "Sao Paulo" if municipio == "71072" else municipio,
                 "codigo_municipio": municipio, "zona": zona, "secao": "RESUMO",
                 "origem": "Consolidado dos BUs das seções validadas"},
        "turnos": turnos,
    }


def gerar(raiz, destino, uf, municipio, zona, esperado=None):
    secoes = carregar_secoes(raiz, uf, municipio, zona)
    if esperado is not None and len(secoes) != esperado:
        raise ValueError(f"Cobertura incompleta: {len(secoes)}/{esperado} seções")
    if not secoes:
        raise ValueError("Nenhuma seção validada encontrada")
    pacote = {
        "meta": {"uf": uf.upper(), "municipio": municipio, "zona": zona,
                 "total_secoes": len(secoes), "cobertura_completa": esperado is None or len(secoes) == esperado,
                 "gerado_utc": datetime.now(timezone.utc).isoformat()},
        "resumo": consolidar(secoes, uf, municipio, zona),
        "secoes": secoes,
    }
    gravar_atomico(destino, pacote)
    return pacote


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raiz", default="data/coletas")
    parser.add_argument("--saida", default="web/dados/zona_0253.json")
    parser.add_argument("--uf", default="SP")
    parser.add_argument("--municipio", default="71072")
    parser.add_argument("--zona", default="0253")
    parser.add_argument("--esperado", type=int, default=496)
    args = parser.parse_args()
    pacote = gerar(args.raiz, args.saida, args.uf, args.municipio, args.zona, args.esperado)
    print(f"Pacote gerado: {args.saida} ({len(pacote['secoes'])} seções)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
