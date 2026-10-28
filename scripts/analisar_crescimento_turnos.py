#!/usr/bin/env python3
"""Conferencia neutra de crescimento entre turnos em zonas eleitorais.

O modelo separa identidades matematicas dos contrafactuais condicionais.
Nao identifica como individuos votaram, nao estima fraude e nao atribui
origem individual aos votos. Usa apenas pacotes consolidados por secao.
"""
import argparse
import json
from pathlib import Path

CAMPOS = (
    "aptos", "comparecimento", "flavio", "lula", "outros",
    "brancos", "nulos", "nulos_tecnicos",
)
VOTOS = ("flavio", "lula", "outros", "brancos", "nulos", "nulos_tecnicos")


def _inteiros(turno):
    if not isinstance(turno, dict):
        raise ValueError("Turno ausente ou invalido")
    for campo in CAMPOS:
        valor = turno.get(campo)
        if not isinstance(valor, int) or isinstance(valor, bool) or valor < 0:
            raise ValueError("Valor invalido em " + campo)
    if turno["comparecimento"] != sum(turno[c] for c in VOTOS):
        raise ValueError("Soma de votos diferente do comparecimento")
    if turno["comparecimento"] > turno["aptos"]:
        raise ValueError("Comparecimento superior aos aptos")


def _outros_nao_validos(t):
    return t["brancos"] + t["nulos"] + t["nulos_tecnicos"]


def _alocacao_exemplo(fontes, destinos):
    """Um testemunho matematico de viabilidade agregada, NAO fluxo real."""
    restantes = dict(fontes)
    plano = {}
    for destino, quantidade in destinos.items():
        plano[destino] = {}
        for fonte in fontes:
            if quantidade <= 0:
                break
            alocado = min(quantidade, restantes[fonte])
            if alocado:
                plano[destino][fonte] = alocado
                restantes[fonte] -= alocado
                quantidade -= alocado
        if quantidade:
            raise ValueError("Fontes insuficientes no cenario simplificado")
    return plano


def analisar_pacote(pacote):
    if not isinstance(pacote, dict) or not isinstance(pacote.get("meta"), dict):
        raise ValueError("Pacote consolidado invalido")
    meta = pacote["meta"]
    if meta.get("cobertura_completa") is not True:
        raise ValueError("Pacote sem cobertura completa")
    secoes = pacote.get("secoes")
    total = meta.get("total_secoes")
    if not isinstance(secoes, list) or not isinstance(total, int) or isinstance(total, bool) or len(secoes) != total or total < 1:
        raise ValueError("Contagem de secoes inconsistente")
    resumo = pacote.get("resumo", {})
    turnos = resumo.get("turnos", {}) if isinstance(resumo, dict) else {}
    um, dois = turnos.get("1"), turnos.get("2")
    for t in (um, dois):
        _inteiros(t)
    zone_id = (meta.get("uf"), str(meta.get("municipio")), str(meta.get("zona")).zfill(4))
    vistos = set()
    acumulado = {"1": {campo: 0 for campo in CAMPOS}, "2": {campo: 0 for campo in CAMPOS}}
    quedas = {"lula": 0, "flavio": 0}
    for secao in secoes:
        sm = secao.get("meta", {}) if isinstance(secao, dict) else {}
        chave = str(sm.get("secao", ""))
        if (sm.get("uf"), str(sm.get("codigo_municipio")), str(sm.get("zona")).zfill(4)) != zone_id:
            raise ValueError("Secao pertence a outra zona")
        if not chave.isdigit() or len(chave) != 4 or chave in vistos:
            raise ValueError("Secao invalida ou duplicada")
        vistos.add(chave)
        st = secao.get("turnos", {})
        for turno in ("1", "2"):
            t = st.get(turno) if isinstance(st, dict) else None
            _inteiros(t)
            for campo in CAMPOS:
                acumulado[turno][campo] += t[campo]
        for candidato in quedas:
            if st["2"][candidato] < st["1"][candidato]:
                quedas[candidato] += 1
    for turno, valores in (("1", um), ("2", dois)):
        if any(acumulado[turno][campo] != valores[campo] for campo in CAMPOS):
            raise ValueError("Resumo difere da soma das secoes")
    delta_l = dois["lula"] - um["lula"]
    delta_f = dois["flavio"] - um["flavio"]
    delta_comp = dois["comparecimento"] - um["comparecimento"]
    delta_outros = um["outros"] - dois["outros"]
    delta_bn = _outros_nao_validos(um) - _outros_nao_validos(dois)
    total_ganho = delta_l + delta_f
    entradas = delta_outros + delta_comp + delta_bn
    if entradas != total_ganho:
        raise ValueError("Identidade contábil entre turnos nao satisfeita")
    finalistas_1 = um["lula"] + um["flavio"]
    finalistas_2 = dois["lula"] + dois["flavio"]
    share_1 = um["lula"] / finalistas_1 if finalistas_1 else None
    share_2 = dois["lula"] / finalistas_2 if finalistas_2 else None
    percentual_incremental = (
        delta_l / total_ganho if total_ganho > 0 and delta_l >= 0 and delta_f >= 0 else None
    )
    # Referencia mecanica: se a soma dos acrescimos fosse distribuida
    # conforme a participacao entre finalistas no primeiro turno.
    # NAO e previsao estatistica, porque nao existe base para independencia
    # ou comportamento igual de votos de terceiros, brancos/nulos e ausentes.
    esperado_prop = (total_ganho * share_1 if percentual_incremental is not None and share_1 is not None else None)
    fontes = {
        "votos_outros_1t_menos_2t": delta_outros,
        "comparecimento_liquido": delta_comp,
        "reducao_brancos_nulos": delta_bn,
    }
    hipotese_possivel = (
        delta_l >= 0 and delta_f >= 0 and
        all(n >= 0 for n in fontes.values()) and total_ganho == sum(fontes.values())
    )
    exemplo = (
        _alocacao_exemplo(fontes, {"lula": delta_l, "flavio": delta_f})
        if hipotese_possivel else None
    )
    return {
        "zona": "-".join(zone_id),
        "secoes_conferidas": total,
        "primeiro_turno": {campo: um[campo] for campo in CAMPOS},
        "segundo_turno": {campo: dois[campo] for campo in CAMPOS},
        "diferencas": {
            "lula": delta_l, "flavio": delta_f,
            "comparecimento": delta_comp,
            "outros": dois["outros"] - um["outros"],
            "brancos_nulos": -delta_bn,
        },
        "reconciliacao": {
            "incremento_finalistas": total_ganho,
            "componentes_contabeis": fontes,
            "diferenca_reconciliacao": total_ganho - entradas,
        },
        "participacoes": {
            "lula_entre_finalistas_1t": share_1,
            "lula_entre_finalistas_2t": share_2,
            "lula_no_incremento_liquido": percentual_incremental,
            "lula_incremento_proporcional_hipotetico": esperado_prop,
            "desvio_do_cenario_proporcional": (
                delta_l - esperado_prop if esperado_prop is not None else None
            ),
        },
        "secoes_com_queda": quedas,
        "cenario_sem_migracao_direta_entre_finalistas": {
            "viavel_nesta_construcao_agregada": hipotese_possivel,
            "exemplo_de_alocacao_liquida_hipotetica": exemplo,
            "aviso": (
                "Exemplo agregado de balanco liquido; nao revela transferencias "
                "individuais e nao garante viabilidade secao a secao."
            ),
        },
        "limite_inferencia": (
            "O voto e secreto. Dados agregados de dois turnos nao identificam "
            "a origem dos votos, taxa individual de transferencia ou fraude."
        ),
    }


def texto(resultados):
    for r in resultados:
        d = r["diferencas"]
        a = r["participacoes"]
        c = r["reconciliacao"]
        print(f"\n{r['zona']}  |  {r['secoes_conferidas']} secoes verificadas")
        print(f"Variacao de votos: Lula {d['lula']:+,}; Flavio {d['flavio']:+,}")
        print(f"Comparecimento: {d['comparecimento']:+,}; "
              f"outros candidatos {d['outros']:+,}; "
              f"brancos/nulos {d['brancos_nulos']:+,}")
        print(f"Reconciliacao: {c['incremento_finalistas']:,} "
              f"= {c['componentes_contabeis']['votos_outros_1t_menos_2t']:,} (outros) "
              f"+ {c['componentes_contabeis']['comparecimento_liquido']:,} (comparecimento) "
              f"+ {c['componentes_contabeis']['reducao_brancos_nulos']:,} (brancos/nulos)")
        if a["lula_no_incremento_liquido"] is not None:
            print(f"Lula: {100*a['lula_entre_finalistas_1t']:.2f}% dos votos nos finalistas no 1T; "
                  f"{100*a['lula_no_incremento_liquido']:.2f}% do incremento liquido.")
            print(f"Referencia mecanica proporcional: {a['lula_incremento_proporcional_hipotetico']:,.1f} "
                  f"votos adicionais para Lula; observado: {d['lula']:,}.")
        print("Quedas por secao:", r["secoes_com_queda"])
        plano = r["cenario_sem_migracao_direta_entre_finalistas"]
        print("Balanco agregado sem troca direta entre finalistas, nesta construcao:",
              "POSSIVEL" if plano["viavel_nesta_construcao_agregada"] else "NAO DEMONSTRADO")
        if plano["exemplo_de_alocacao_liquida_hipotetica"] is not None:
            print("Exemplo hipotetico, NAO trajetorias reais:",
                  json.dumps(plano["exemplo_de_alocacao_liquida_hipotetica"],ensure_ascii=False))
    print("\nIMPORTANTE: aumento maior para um candidato nao prova irregularidade. "
          "O cenario proporcional e apenas uma referencia, nao uma previsao nem "
          "um teste estatistico de fraude. Dados agregados nao revelam a origem individual de votos.")


def main():
    p=argparse.ArgumentParser(description="Modelo descritivo e contrafactual de crescimento entre turnos")
    p.add_argument("--arquivos",type=Path,nargs="+",required=True,help="JSONs consolidados das zonas (ex.: 0253 e 0252)")
    p.add_argument("--json",action="store_true",help="Emitir resultado estruturado em vez do resumo")
    args=p.parse_args()
    try:
        resultados=[analisar_pacote(json.loads(f.read_text(encoding="utf-8"))) for f in args.arquivos]
    except (OSError,ValueError,TypeError,KeyError,json.JSONDecodeError) as e:
        p.exit(2,"ERRO de validacao: "+str(e)+"\n")
    if args.json:
        print(json.dumps({"zonas":resultados},ensure_ascii=False,indent=2))
    else:
        texto(resultados)


if __name__=="__main__":
    main()
