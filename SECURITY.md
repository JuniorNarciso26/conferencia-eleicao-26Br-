# Politica de seguranca

## Escopo

Reporte vulnerabilidades que afetem coleta, validacao, manifestos, integridade dos arquivos, execucao local, empacotamento ou exposicao acidental de dados operacionais.

## Nao publique em issues

- credenciais, tokens, cookies, `.env`, chaves privadas ou certificados;
- IPs privados, caminhos de VPS, nomes de servicos internos ou logs de infraestrutura;
- arquivos BU, RDV, VSC, vota, logs de urna, manifests reais ou conteudo de `data/`;
- dados pessoais ou qualquer material que nao seja claramente publico.

## Como reportar

Abra uma issue com descricao tecnica minima e passos de reproducao usando dados ficticios. Se o achado exigir detalhe sensivel, descreva apenas o impacto e combine um canal privado com o mantenedor antes de enviar o material.

## Boas praticas ao rodar localmente

- execute o painel apenas em `127.0.0.1`;
- nao exponha `python -m http.server` na internet;
- mantenha coletas e arquivos gerados fora do Git;
- confira `git status --ignored` antes de publicar;
- rode os testes e `git diff --check` antes de abrir pull request.
