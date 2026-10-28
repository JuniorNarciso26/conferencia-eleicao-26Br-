#!/usr/bin/env python3
"""Registra pacote de zona validado no catálogo do GitHub Pages.

Nao publica os dados nem envia arquivos; apenas atualiza site/dados/catalogo.json.
"""
import argparse
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"site"/"dados"
CATALOG=DATA/"catalogo.json"
LOCALITIES=DATA/"localidades_2026.json"

def ler_json(path):
    if path.stat().st_size>32*1024*1024:
        raise ValueError("Arquivo maior que 32 MiB")
    return json.loads(path.read_text(encoding="utf-8"))

def carregar_entrada(path):
    target=path.resolve()
    if not target.is_file() or target.parent!=DATA.resolve():
        raise ValueError("O pacote precisa existir diretamente em site/dados/")
    match=re.fullmatch(r"([a-z]{2})_([0-9]{5})_([0-9]{4})[.]json",target.name)
    if not match:
        raise ValueError("Nome de arquivo invalido. Use uf_codigoTSE_zona.json (ex.: sp_71072_0252.json)")
    uf,municipio,zona=match.groups()
    pacote=ler_json(target)
    meta=pacote.get("meta") if isinstance(pacote,dict) else None
    if not isinstance(meta,dict) or (meta.get("uf"),str(meta.get("municipio")),str(meta.get("zona"))) != (uf.upper(),municipio,zona):
        raise ValueError("Identificacao da zona divergente do nome do arquivo")
    sections=pacote.get("secoes")
    total=meta.get("total_secoes")
    if (meta.get("cobertura_completa") is not True or not isinstance(total,int) or isinstance(total,bool)
        or not 1<=total<=10000 or not isinstance(sections,list) or len(sections)!=total):
        raise ValueError("Pacote sem cobertura completa ou quantidade de secoes inconsistente")
    seen=set()
    for item in sections:
        if not isinstance(item,dict) or not isinstance(item.get("meta"),dict) or not isinstance(item.get("turnos"),dict):
            raise ValueError("Secao ou turnos invalidos")
        m=item["meta"]; section=str(m.get("secao",""))
        if (m.get("uf"),str(m.get("codigo_municipio")),str(m.get("zona"))) != (uf.upper(),municipio,zona):
            raise ValueError("Secao pertence a outra zona")
        if not re.fullmatch("[0-9]{4}",section) or section in seen:
            raise ValueError("Secao invalida ou duplicada")
        seen.add(section)
        if not isinstance(item["turnos"].get("1"),dict) or not isinstance(item["turnos"].get("2"),dict):
            raise ValueError("Secao sem os dois turnos")
    localidades=ler_json(LOCALITIES)
    cities=localidades.get("ufs",{}).get(uf.upper(),[])
    cidade=next((x for x in cities if x.get("codigo")==municipio),None)
    if not cidade or zona not in cidade.get("zonas",[]):
        raise ValueError("Municipio/codigo TSE/zona nao encontrados no catalogo oficial")
    return {
      "uf":uf.upper(),"municipio_codigo":municipio,"municipio_nome":cidade["nome"],
      "zona":zona,"arquivo":"dados/"+target.name
    }, total

def registrar(path, catalog=CATALOG):
    entry,total=carregar_entrada(path)
    data=ler_json(catalog)
    if not isinstance(data,dict) or data.get("versao")!=1 or not isinstance(data.get("zonas"),list):
        raise ValueError("Catalogo de publicacao invalido")
    entries=data["zonas"]
    key=(entry["uf"],entry["municipio_codigo"],entry["zona"])
    old=next((x for x in entries if
        (x.get("uf"),x.get("municipio_codigo"),str(x.get("zona")).zfill(4))==key),None)
    if old:
        if old["arquivo"]!=entry["arquivo"]:
            raise ValueError("Esta zona ja tem outro pacote publicado/cadastrado: "+old["arquivo"])
        if old["municipio_nome"]!=entry["municipio_nome"]:
            raise ValueError("O nome do municipio diverge do catalogo existente")
        return entry,total,False
    data["zonas"]=[*entries,entry]
    data["zonas"].sort(key=lambda x:(x["uf"],x["municipio_nome"],x["municipio_codigo"],x["zona"]))
    data["atualizado_em"]=datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")
    temp_name=None
    try:
        with tempfile.NamedTemporaryFile("w",encoding="utf-8",dir=catalog.parent,
            prefix=".catalogo-",suffix=".tmp",delete=False) as f:
            temp_name=f.name
            json.dump(data,f,ensure_ascii=False,indent=2)
            f.write("\n");f.flush();os.fsync(f.fileno())
        os.replace(temp_name,catalog)
    finally:
        if temp_name and os.path.exists(temp_name):os.unlink(temp_name)
    return entry,total,True

def main():
    parser=argparse.ArgumentParser(description="Registra zona consolidada no catalogo sem usar JSON como comando")
    parser.add_argument("--arquivo",required=True,help="Caminho do JSON consolidado em site/dados")
    args=parser.parse_args()
    try:
        entry,total,created=registrar(Path(args.arquivo))
        verb="Zona cadastrada" if created else "Zona ja cadastrada (nenhuma alteracao)"
        print(f"{verb}: {entry['uf']} / {entry['municipio_nome']} / {entry['zona']} ({total} secoes)")
        print("Arquivo:",entry["arquivo"])
        print("Proximo passo: envie somente o pacote JSON e site/dados/catalogo.json em um Pull Request.")
    except (OSError,ValueError,KeyError,TypeError,json.JSONDecodeError) as e:
        parser.exit(2,"ERRO: "+str(e)+"\n")

if __name__=="__main__":main()
