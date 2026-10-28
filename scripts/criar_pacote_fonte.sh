#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
versao="${1:-}"
if [[ -z "$versao" ]]; then
  echo "Uso: bash scripts/criar_pacote_fonte.sh v0.1.0" >&2
  exit 2
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Arvore Git suja. Crie o commit de release antes de empacotar." >&2
  exit 1
fi

mkdir -p dist
nome="conferencia-eleicao-26Br-${versao}.tar.gz"
git archive --format=tar.gz --prefix="conferencia-eleicao-26Br-${versao}/" -o "dist/$nome" HEAD
sha256sum "dist/$nome" > "dist/$nome.sha256"
echo "dist/$nome"
cat "dist/$nome.sha256"
