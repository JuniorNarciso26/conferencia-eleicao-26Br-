#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[ -x .venv/bin/python ] || { echo "Instale primeiro: bash scripts/instalar_vps.sh"; exit 1; }
.venv/bin/python scripts/baixar_secao.py --uf sp --municipio 71072 --zona 0253 --secao 0010
.venv/bin/python scripts/gerar_json.py
echo "Para visualizar: .venv/bin/python -m http.server 8502 --bind 127.0.0.1 --directory web"
