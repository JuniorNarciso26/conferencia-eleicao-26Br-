#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v git >/dev/null || { echo "Instale git" >&2; exit 1; }
python3 - <<'PY'
import sys
if sys.version_info < (3, 11):
    raise SystemExit("Python 3.11+ requerido")
PY

read -r nome repositorio commit < <(awk '$1 == "DataUrnas-BR" {print $1, $2, $3}' dependencies.lock)
[[ "$nome" == "DataUrnas-BR" && "$repositorio" == "https://github.com/alissonlinneker/DataUrnas-BR.git" ]] || {
  echo "Entrada DataUrnas-BR inválida em dependencies.lock" >&2; exit 1;
}
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || {
  echo "DataUrnas-BR ainda não possui commit revisado em dependencies.lock; instalação bloqueada." >&2
  exit 1
}

python3 -m venv .venv
mkdir -p vendor web/dados data
if [[ ! -d vendor/DataUrnas-BR/.git ]]; then
  mkdir -p vendor/DataUrnas-BR
  git -C vendor/DataUrnas-BR init
  git -C vendor/DataUrnas-BR remote add origin "$repositorio"
fi
[[ "$(git -C vendor/DataUrnas-BR remote get-url origin)" == "$repositorio" ]] || {
  echo "Origin inesperado em vendor/DataUrnas-BR" >&2; exit 1;
}
# Checkout esparso: o MVP usa somente código, specs ASN.1, metadados e licença.
git -C vendor/DataUrnas-BR sparse-checkout init --cone
git -C vendor/DataUrnas-BR sparse-checkout set src spec pyproject.toml README.md LICENSE
git -C vendor/DataUrnas-BR fetch --depth 1 --filter=blob:none origin "$commit"
git -C vendor/DataUrnas-BR checkout --detach FETCH_HEAD
[[ "$(git -C vendor/DataUrnas-BR rev-parse HEAD)" == "$commit" ]] || exit 1

# Dependências mínimas fixadas e verificadas por hash para a homologação.
.venv/bin/python -m pip install --require-hashes -r requirements-homologacao.txt
# Expõe somente o checkout fixado no ambiente, sem instalar o pacote completo
# nem resolver as dependências pesadas do dashboard que este MVP não usa.
site_packages="$(.venv/bin/python - <<'PY'
import sysconfig
print(sysconfig.get_paths()["purelib"])
PY
)"
printf '%s\n' "$(pwd)/vendor/DataUrnas-BR/src" > "$site_packages/dataurnas_homologacao.pth"
.venv/bin/python - <<'PY'
import dataurnas
from dataurnas.downloader.ele2026 import bu_to_rows, parse_candidatos
assert dataurnas.__version__ == "0.2.2", dataurnas.__version__
assert callable(bu_to_rows) and callable(parse_candidatos)
print("DataUrnas-BR:", dataurnas.__version__)
PY
.venv/bin/python -m unittest discover -s tests -v
echo "Pronto. Execute: bash scripts/executar_mvp.sh"
