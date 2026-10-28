#!/usr/bin/env python3
"""Snapshot estático de municípios e zonas do TSE 2026, sem dados de votação."""
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

UFS = ("ac","al","ap","am","ba","ce","df","es","go","ma","mt","ms","mg","pa",
       "pb","pr","pe","pi","rj","rn","rs","ro","rr","sc","sp","se","to")
EA12 = "https://resultados.tse.jus.br/oficial/ele2026/6257/config/mun-e006257-cm.json"
CS = "https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3220/config/{uf}/{uf}-p003220-cs.json"
DESTINO = Path("site/dados/localidades_2026.json")

def baixar(url):
    req = urllib.request.Request(url, headers={
        "User-Agent":"ConferenciaEleitoral2026/1.0 (catalogo publico)",
        "Accept":"application/json"})
    with urllib.request.urlopen(req, timeout=65) as res:
        if int(res.headers.get("Content-Length","0")) > 64*1024*1024:
            raise ValueError("Catálogo muito grande")
        raw = res.read(64*1024*1024+1)
    if len(raw)>64*1024*1024: raise ValueError("Catálogo muito grande")
    return json.loads(raw.decode("utf-8-sig"))

def extrair(doc, uf_esperada=None):
    if not isinstance(doc,dict) or not isinstance(doc.get("abr"),list):
        raise ValueError("Fonte TSE sem abr")
    result={}
    for abr in doc["abr"]:
        uf=str(abr.get("cd","")).lower()
        if uf not in UFS or (uf_esperada and uf != uf_esperada): continue
        cidades=result.setdefault(uf.upper(),{})
        for m in abr.get("mu",[]):
            code=str(m.get("cd","")).zfill(5)
            name=str(m.get("nm","")).strip()
            if not re.fullmatch("[0-9]{5}",code) or not name: continue
            zones=set()
            for z in m.get("zon",[]):
                raw=z.get("cd") if isinstance(z,dict) else z
                s=str(raw or "").zfill(4)
                if re.fullmatch("[0-9]{4}",s) and int(s)>0: zones.add(s)
            if not zones: continue
            if code in cidades:
                if cidades[code]["nome"] != name: raise ValueError("Município duplicado com nomes diferentes")
                zones.update(cidades[code]["zonas"])
            cidades[code]={"codigo":code,"nome":name,"zonas":sorted(zones)}
    return result

def validar(data):
    if set(data)!={u.upper() for u in UFS}: raise ValueError("Catálogo incompleto: UFs")
    nc=sum(len(m) for m in data.values())
    nz=sum(len(m["zonas"]) for uf in data.values() for m in uf.values())
    if nc<5500 or nz<5500: raise ValueError("Catálogo incompleto: "+str((nc,nz)))
    if "0253" not in data["SP"]["71072"]["zonas"]: raise ValueError("Controle SP 71072 Z0253 não confere")
    return nc,nz

def gerar():
    try:
        print("Tentando configuração de municípios EA12",EA12,flush=True)
        data=extrair(baixar(EA12))
        nc,nz=validar(data)
        source=EA12
    except Exception as e:
        print("Fallback para catálogos CS por UF",str(e),flush=True)
        data={}
        for uf in UFS:
            print("Baixando",uf.upper(),flush=True)
            parte=extrair(baixar(CS.format(uf=uf)),uf)
            if uf.upper() not in parte: raise ValueError("UF sem municípios: "+uf)
            data.update(parte)
        nc,nz=validar(data)
        source="https://resultados.tse.jus.br/oficial/ele2026/arquivo-urna/3220/config/"
    out={"versao":1,"eleicao":2026,"fonte":source,
         "gerado_utc":datetime.now(timezone.utc).isoformat(),
         "total_municipios":nc,"total_relacoes_zona":nz,
         "ufs":{uf:sorted(cities.values(),key=lambda c:(c["nome"],c["codigo"]))
                for uf,cities in sorted(data.items())}}
    DESTINO.parent.mkdir(parents=True,exist_ok=True)
    tmp=DESTINO.with_suffix(".tmp")
    tmp.write_text(json.dumps(out,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    tmp.replace(DESTINO)
    print("OK",nc,"municípios;",nz,"vínculos de zonas",flush=True)

if __name__=="__main__":
    try: gerar()
    except Exception as e:
        print("Falha sincronizando catálogo oficial:",e,file=sys.stderr)
        sys.exit(1)
