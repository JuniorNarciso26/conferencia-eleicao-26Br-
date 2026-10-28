#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[ -x .venv/bin/python ] || { echo "Instale primeiro: bash scripts/instalar_vps.sh"; exit 1; }
uf="sp"
municipio="71072"
zona="0253"
secao="0010"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --uf) uf="$2"; shift 2 ;;
    --municipio) municipio="$2"; shift 2 ;;
    --zona) zona="$2"; shift 2 ;;
    --secao) secao="$2"; shift 2 ;;
    -h|--help)
      echo "Uso: bash scripts/executar_mvp.sh [--uf sp] [--municipio 71072] [--zona 0253] [--secao 0010]"
      exit 0
      ;;
    *) echo "Argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done

.venv/bin/python scripts/baixar_secao.py --uf "$uf" --municipio "$municipio" --zona "$zona" --secao "$secao"
.venv/bin/python scripts/gerar_json.py
echo "Para visualizar: bash scripts/run_local.sh"
