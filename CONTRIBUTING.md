# Contribuindo

## Antes de abrir um pull request

1. Trabalhe sem incluir dados reais de coleta.
2. Rode os testes offline:

```bash
python3 -m compileall -q scripts tests
bash -n scripts/*.sh scripts/coleta
python3 -m unittest discover -s tests -v
git diff --check
```

3. Confira que `git status --short --ignored` nao mostra arquivos sensiveis prontos para commit.
4. Documente mudancas de metodologia, limites e comportamento do painel.

## O que nao enviar

- arquivos em `data/`;
- `web/dados/*.json` gerado com resultado real;
- BU, RDV, VSC, vota, aux, logs de urna ou manifests reais;
- `.venv/`, `vendor/`, pacotes, backups ou caches;
- credenciais, IPs/caminhos internos, scripts de VPS, systemd ou logs operacionais.

## Padrao de mudanca

- Mantenha o escopo pequeno e testavel.
- Prefira falha fechada quando houver divergencia de identidade, hash ou cobertura.
- Nao amplie alegacoes de auditoria sem validacao correspondente.
- Atualize `README.md` e `docs/METODOLOGIA.md` quando mudar comportamento publico.

## Licenca

Ao contribuir, voce concorda que sua contribuicao sera distribuida sob a licenca MIT do projeto. Dependencias de terceiros preservam suas respectivas licencas.
