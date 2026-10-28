# Metodologia

## Objetivo

Comparar dados agregados de Boletins de Urna publicados pelo TSE para um mesmo alvo eleitoral, sem inferir voto individual e sem substituir a apuracao oficial. O alvo e sempre definido por UF, codigo TSE do municipio, zona e secao. O motor tambem consegue expandir zona, municipio ou UF a partir do catalogo oficial de secoes.

## Coleta

Para cada turno, o coletor:

1. baixa o aux limitado a 2 MiB;
2. seleciona o conjunto mais recente com estado `Totalizado` e BU;
3. valida segmentos, nomes simples de arquivo e hashes publicados no aux quando presentes;
4. baixa BU, RDV, log e VSC/vota com limite de 256 MiB por artefato e 1 GiB por turno;
5. calcula SHA-256 e SHA-512 durante streaming em blocos;
6. publica arquivos apenas por substituicao atomica depois de tamanho e hash validos;
7. registra URLs, tamanhos, hashes e erros em manifesto local;
8. baixa e registra separadamente o documento de candidatos, limitado a 20 MiB.

Falhas transitorias usam retentativas limitadas. `Retry-After` e respeitado quando valido e ate 120 segundos. Falha de BU, candidatos, hash ou identidade interrompe a geracao de dados do painel.

## Transformacao

O conversor usa DataUrnas-BR fixado por commit em `dependencies.lock`. Ele relê apenas os caminhos registrados no manifesto e exige correspondencia de tamanho, SHA-256 e SHA-512. Os candidatos esperados precisam existir no documento oficial de candidatos analisado. Nulos tecnicos sao separados dos nulos convencionais.

Campos de identidade retornados pelo parser sao comparados com o pedido e o manifesto:

- UF;
- codigo TSE do municipio;
- zona;
- secao;
- turno;
- eleicao;
- pleito.

Se uma versao do parser nao retornar certo campo, o projeto nao inventa essa validacao. Se retornar campo presente e divergente, a geracao falha.

## Equacoes

- Votos validos = comparecimento - brancos - nulos - nulos tecnicos.
- Variacao de validos = variacao do comparecimento - variacao de brancos - variacao de nulos - variacao de nulos tecnicos.
- Percentual de comparecimento = comparecimento / aptos, quando aptos > 0.
- Conferencia de habilitacao = biometria + biografia + comparecimento sem biometria cadastrada; comparar ao comparecimento geral quando todos os campos existem.

## Geracao do painel

Para uma secao, `scripts/gerar_json.py` grava um JSON unico. Para zona, `scripts/gerar_painel_zona.py` e fail-closed: exige cobertura esperada, marcador `validated.ok`, identidade unica e fechamento aritmetico antes de publicar o JSON de resumo.

O painel carrega arquivos em `web/dados/`, que sao ignorados pelo Git porque podem conter resultado real. O exemplo versionado e somente ficticio.

## Limites

- VSC e coletado e hasheado, mas a assinatura criptografica nao e validada.
- RDV pode ser coletado, mas nao e recontado nesta etapa.
- Hash local nao autentica a publicacao original do TSE.
- A comparacao e por secao; o equipamento fisico pode mudar.
- Secoes agregadas, transito e particularidades do Sistema de Apuracao exigem tratamento proprio.
- Uma anomalia estatistica nao demonstra fraude.
- Ausencia de anomalia nao valida a eleicao ou todo o processo de votacao.

## Expansao responsavel

Antes de ampliar escopo, rode `--dry-run`, confira disco e rede, limite `--max-secoes` quando estiver testando e mantenha intervalo entre secoes. Publique somente pacotes de fonte e documentacao revisada; nao publique `data/`, manifests reais, arquivos BU/RDV/VSC/log ou caminhos internos de operacao.
