#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v git >/dev/null || { echo "Instale git" >&2; exit 1; }
PYTHON_BIN="${PYTHON:-python3}"
command -v "$PYTHON_BIN" >/dev/null || { echo "Python não encontrado: $PYTHON_BIN" >&2; exit 1; }
"$PYTHON_BIN" - <<'PY'
import platform
import sys
if sys.version_info[:2] != (3, 12) or sys.platform != "linux" or platform.machine() not in ("x86_64", "amd64"):
    raise SystemExit(
        f"Ambiente incompatível: Python {sys.version.split()[0]}, {sys.platform}/{platform.machine()}. "
        "O requirements-homologacao.txt está fixado para Python 3.12, Linux x86_64. "
        'Use: PYTHON="$(uv python find 3.12)" bash scripts/instalar_vps.sh'
    )
PY
if [[ -x .venv/bin/python ]]; then
  if ! .venv/bin/python -c 'import sys; sys.exit(0 if sys.version_info[:2] == (3, 12) else 1)' ; then
    echo "Ambiente .venv existente usa Python diferente de 3.12." >&2
    echo "Preserve-o com: mv .venv .venv-backup" >&2
    echo "Depois execute novamente o instalador com PYTHON 3.12." >&2
    exit 1
  fi
fi

read -r nome repositorio commit < <(awk '$1 == "DataUrnas-BR" {print $1, $2, $3}' dependencies.lock)
[[ "$nome" == "DataUrnas-BR" && "$repositorio" == "https://github.com/alissonlinneker/DataUrnas-BR.git" ]] || {
  echo "Entrada DataUrnas-BR inválida em dependencies.lock" >&2; exit 1;
}
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || {
  echo "DataUrnas-BR ainda não possui commit revisado em dependencies.lock; instalação bloqueada." >&2
  exit 1
}

"$PYTHON_BIN" -m venv .venv
mkdir -p vendor web/dados data
if [[ ! -d vendor/DataUrnas-BR/.git ]]; then
  mkdir -p vendor/DataUrnas-BR
  git -C vendor/DataUrnas-BR init
  git -C vendor/DataUrnas-BR remote add origin "$repositorio"
fi
[[ "$(git -C vendor/DataUrnas-BR remote get-url origin)" == "$repositorio" ]] || {
  echo "Origin inesperado em vendor/DataUrnas-BR" >&2; exit 1;
}
# No modo cone, os arquivos da raiz (pyproject.toml, README.md e LICENSE)
# sao incluidos automaticamente. O comando set deve listar apenas diretorios.
git -C vendor/DataUrnas-BR sparse-checkout init --cone
git -C vendor/DataUrnas-BR sparse-checkout set src spec
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
