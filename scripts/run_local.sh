#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
PYTHON="${PYTHON:-.venv/bin/python}"
if [[ ! -x "$PYTHON" ]]; then
  PYTHON="$(command -v python3 || true)"
fi
if [[ -z "$PYTHON" ]]; then
  echo "Python nao encontrado. Instale Python 3.11+ ou execute scripts/instalar_vps.sh." >&2
  exit 1
fi

exec "$PYTHON" -m http.server 8502 --bind 127.0.0.1 --directory web
