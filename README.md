# Conferência Eleitoral 2026 — MVP por seção

Auditoria exploratória de Boletins de Urna (BU) publicados pelo TSE. O primeiro recorte é uma única seção: **São Paulo/SP, município TSE 71072, zona 0253, seção 0010**, nos turnos de 04/10/2026 e 25/10/2026.

## O que está pronto

- Painel HTML para comparar aptos, comparecimento, biometria, identificação biográfica, sem biometria, votos Flávio Bolsonaro (22), Lula (13), outros, brancos e nulos.
- Baixador dos arquivos publicados pelo TSE (aux, BU, VSC, RDV e log) dos dois turnos dessa seção.
- Manifesto com URLs originais, status e SHA-256/SHA-512 calculados localmente.
- Conversor que usa o parser ASN.1 do DataUrnas-BR, sem copiar seu código para este repositório.
- Instalação e execução em Ubuntu/VPS, testes locais.
- Painel com dados simulados enquanto os arquivos oficiais não forem coletados.

**Situação atual:** os arquivos reais do TSE ainda não foram baixados e o pipeline não foi testado numa VPS. O código está pronto para essa tentativa. A validação criptográfica das assinaturas VSC e a recontagem RDV não fazem parte deste MVP.

## Instalação na VPS Ubuntu / Debian

    sudo apt update
    sudo apt install -y git python3 python3-venv python3-pip
    git clone https://github.com/JuniorNarciso26/conferencia-eleicao-26Br-.git
    cd conferencia-eleicao-26Br-
    bash scripts/instalar_vps.sh

A instalação cria o ambiente Python local e clona o DataUrnas-BR como dependência, sem modificar o projeto original.

## Download e conversão da seção

    bash scripts/executar_mvp.sh

Ou separadamente:

    .venv/bin/python scripts/baixar_secao.py --uf sp --municipio 71072 --zona 0253 --secao 0010
    .venv/bin/python scripts/gerar_json.py

Quando os dois BUs forem obtidos, será gerado o arquivo local web/dados/secao_real_2026.json. Se o download falhar, o comando retorna erro e não inventa votos.

## Abrir painel

Na VPS:

    .venv/bin/python -m http.server 8502 --bind 127.0.0.1 --directory web

Acesse do seu computador por túnel SSH:

    ssh -L 8502:127.0.0.1:8502 usuario@IP_DA_VPS

Abra http://localhost:8502 no computador local. Para acesso público posterior, configure HTTPS, Nginx e controle de acesso em vez de expor diretamente os arquivos brutos.

O painel tenta carregar automaticamente web/dados/secao_real_2026.json. Caso não exista, mostra a demonstração marcada como **DADOS SIMULADOS**. Dados importados não são automaticamente autenticados.

## Conferência e evolução

Unidade de comparação: UF + município TSE + zona + seção. O equipamento físico pode mudar entre os turnos.

Cálculo do aumento de votos válidos:
- Válidos = comparecimento - brancos - nulos - nulos técnicos.
- Diferença = diferença do comparecimento - diferença de brancos - diferença de nulos - diferença de nulos técnicos.

As categorias biométricas são verificadas contra o comparecimento geral do BU, não necessariamente contra o comparecimento específico do cargo Presidente. Casos especiais são registrados, não interpretados automaticamente como fraude.

Etapas planejadas: uma seção -> zona -> município -> estado -> Brasil. Uma anomalia estatística não constitui prova de fraude, e ausência de anomalias não confirma a segurança de todo o processo eleitoral.

## Estrutura

- web/index.html — painel local.
- web/dados/ — JSON oficial convertido localmente.
- scripts/baixar_secao.py — arquivos TSE da seção.
- scripts/gerar_json.py — conversão ASN.1 dos dois turnos.
- scripts/instalar_vps.sh — instalação de dependências.
- scripts/executar_mvp.sh — download + conversão.
- tests/test_mvp.py — testes básicos sem internet.
- exemplos/dados_simulados.json — amostra fictícia.
- docs/METODOLOGIA.md — limites e próximos marcos.
- data/raw/ — arquivos originais, ignorados pelo Git.

## Fontes

- TSE: https://resultados.tse.jus.br/oficial/
- DataUrnas-BR, por Alisson Linneker: https://github.com/alissonlinneker/DataUrnas-BR
- Roteiro 2º turno: https://github.com/alissonlinneker/DataUrnas-BR/blob/main/docs/roteiro-2turno-2026.md

Projeto independente e não afiliado ao TSE ou ao autor do DataUrnas-BR. Os hashes locais não verificam assinaturas digitais nem a correspondência entre publicação e BUs impressos.
