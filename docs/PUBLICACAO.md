# Revisao para publicacao

## Auditoria desta fase

- Arquivos rastreados: revisados via Git.
- Arquivos novos nao ignorados: revisados via `git ls-files --others --exclude-standard`.
- Dados locais: `data/`, `web/dados/*.json`, `.venv/` e `vendor/` permanecem ignorados.
- Documentacao operacional de VPS: movida para backup fora do repositorio e nao deve ser publicada.
- Segredos: nenhum arquivo de credencial foi identificado na arvore publica revisada.

## Checklist antes de publicar

1. Confirmar se o nome do repositorio remoto e a branch de release estao corretos.
2. Fazer um commit de release e gerar pacote por `scripts/criar_pacote_fonte.sh`.
3. Confirmar que nenhum arquivo de coleta real entrou no pacote.

## Licencas verificadas

- Projeto principal: MIT License no arquivo `LICENSE`.
- DataUrnas-BR local: MIT License no arquivo `vendor/DataUrnas-BR/LICENSE`; o vendor continua ignorado e deve ser obtido pelo instalador a partir do commit fixado.

## Checklist final

```bash
git status --short --ignored
grep -RInE 'password|passwd|senha|secret|token|api[_-]?key|bearer|authorization|private[_ -]?key|72\.60\.|/root/|/opt/|systemctl|systemd|caddy' README.md docs scripts tests web .github dependencies.lock requirements-homologacao.txt exemplos --exclude-dir=__pycache__
python3 -m compileall -q scripts tests
bash -n scripts/*.sh scripts/coleta
python3 -m unittest discover -s tests -v
git diff --check
```

Use o resultado do `grep` como lista de revisao, nao como veredito automatico: textos como "voto secreto" podem ser falsos positivos aceitaveis.
