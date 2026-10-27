#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v git >/dev/null || { echo "Instale git"; exit 1; }
python3 - <<'PY'
import sys
if sys.version_info < (3, 11):
    raise SystemExit("Python 3.11+ requerido")
PY
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
mkdir -p vendor web/dados data
if [ ! -f vendor/DataUrnas-BR/pyproject.toml ]; then
  git clone --depth 1 https://github.com/alissonlinneker/DataUrnas-BR.git vendor/DataUrnas-BR
else
  echo "Parser DataUrnas-BR ja instalado; sem update automatico"
fi
.venv/bin/python -m pip install -e vendor/DataUrnas-BR
.venv/bin/python -m unittest discover -s tests -v
echo "Pronto. Execute: bash scripts/executar_mvp.sh"
