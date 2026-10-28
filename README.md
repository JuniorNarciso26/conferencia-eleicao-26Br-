# Conferencia Eleitoral 2026

Laboratorio independente para coletar, registrar e comparar Boletins de Urna (BU) publicados pelo TSE para uma secao, zona, municipio ou UF. O projeto gera arquivos locais verificaveis por hash e um painel HTML servido em `localhost`, sem enviar dados para terceiros.

Este repositorio nao e afiliado ao TSE nem ao DataUrnas-BR. Ele nao valida assinaturas VSC, nao reconta RDV e nao prova fraude ou regularidade eleitoral. Hash local prova integridade do arquivo depois da coleta, nao autenticidade da publicacao original.

## Estado publico

O projeto e distribuido sob a [licenca MIT](LICENSE). O DataUrnas-BR usado como dependencia tambem declara licenca MIT em seu proprio repositorio e permanece uma dependencia independente, fixada por commit neste projeto.

Arquivos reais de coleta, `data/`, `web/dados/*.json`, ambientes virtuais, checkout de dependencias e pacotes locais ficam fora do Git por padrao. O exemplo versionado em `exemplos/dados_simulados.json` e ficticio.

## O que o projeto faz

- baixa aux, BU, RDV, log e VSC/vota publicados pelo TSE para o alvo escolhido;
- registra URL, tamanho, SHA-256 e SHA-512 em manifesto local;
- baixa e hasheia o documento oficial de candidatos usado na conversao;
- converte BU com DataUrnas-BR fixado por commit em `dependencies.lock`;
- valida somas, candidatos e campos de identidade quando o parser fornece esses campos;
- gera JSON para painel local e, no modo zona, exige cobertura esperada antes de publicar o resumo;
- mantem jobs de coleta com fila, estado, lock, logs, parada segura e retomada.

## Requisitos

- Python **3.12**, Linux **x86_64** para executar o motor de coleta homologado (WSL Ubuntu ou VPS). O arquivo `requirements-homologacao.txt` fixa hashes dos artefatos deste ambiente;
- Git;
- acesso HTTPS aos dominios publicos usados pelo TSE e GitHub durante instalacao/coleta;
- espaco em disco proporcional ao escopo.

Limites padrao por turno: aux ate 2 MiB, documento de candidatos ate 20 MiB, cada artefato de urna ate 256 MiB, total do turno ate 1 GiB e ate 32 entradas no aux. O motor exige 2 GiB livres por padrao antes de iniciar uma secao.

## Instalacao no Linux

```bash
sudo apt update
sudo apt install -y git curl
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
uv python install 3.12
git clone https://github.com/JuniorNarciso26/conferencia-eleicao-26Br-.git
cd conferencia-eleicao-26Br-
PYTHON="$(uv python find 3.12)" bash scripts/instalar_vps.sh
```

Se já havia uma instalação com Python 3.14, preserve o ambiente antigo com `mv .venv .venv-backup` antes de executar o instalador. O script recusa ambientes incompatíveis e não modifica os hashes. Você também pode usar um `python3.12` do sistema: `PYTHON=python3.12 bash scripts/instalar_vps.sh`.

O instalador cria `.venv`, baixa o DataUrnas-BR no commit fixado em `dependencies.lock`, instala dependencias com hashes em `requirements-homologacao.txt` e executa os testes. Apesar do nome historico do script, ele deve ser usado em ambiente local isolado; nao configura VPS, systemd, portas publicas ou servidor de producao.

## Instalacao no Windows (WSL)

O coletor com dependências travadas por hash foi homologado para Linux x86_64 e Python 3.12. No Windows, execute `wsl -d Ubuntu` e siga os comandos da seção anterior. A instalação nativa Windows/PowerShell exige hashes específicos das wheels do Windows e ainda não está homologada.

## Coleta de uma secao

```bash
scripts/coleta start --escopo secao --uf sp --municipio 71072 --zona 0253 --secao 0010 --foreground
```

Ou pelo fluxo minimo historico:

```bash
bash scripts/executar_mvp.sh --uf sp --municipio 71072 --zona 0253 --secao 0010
```

## Selecionar zona, municipio ou UF

```bash
scripts/coleta start --escopo zona --uf sp --municipio 71072 --zona 0253 --dry-run
scripts/coleta start --escopo zona --uf sp --municipio 71072 --zona 0253
scripts/coleta start --escopo municipio --uf sp --municipio 71072 --max-secoes 10
scripts/coleta start --escopo uf --uf sp --max-secoes 10
```

Comandos de operacao:

```bash
scripts/coleta status
scripts/coleta stop
scripts/coleta resume
```

### Painel de progresso local

Com uma coleta já iniciada, abra **outro terminal WSL/Ubuntu** na pasta do projeto e execute:

```bash
scripts/coleta painel
```

No navegador do computador, abra `http://127.0.0.1:8765/`. O monitor atualiza automaticamente a cada 2 segundos, exibindo total, concluídas, reaproveitadas, pendentes, falhas e percentual. Para acompanhar um job específico, use `scripts/coleta painel --job ID`.

O painel usa somente leitura dos arquivos locais `state.json` e `config.json` e escuta apenas em `127.0.0.1`, sem expor logs, BU, RDV ou credenciais. **O portal GitHub Pages não consulta diretamente o WSL**. Se a coleta estiver numa VPS, use túnel SSH em vez de abrir portas públicas. Fechar o monitor com Ctrl+C não interrompe a coleta.

Os dados ficam em `data/coletas/<uf>-<municipio>-<zona>-<secao>/`. O estado do motor fica em `data/motor/jobs/<job-id>/`. Ambos sao locais e ignorados pelo Git.

## Gerar painel

Para uma secao, o conversor padrao grava `web/dados/secao_real_2026.json`:

```bash
.venv/bin/python scripts/gerar_json.py --manifesto data/manifesto_tse.json --saida web/dados/secao_real_2026.json
```

Para uma zona, use o gerador fail-closed informando a cobertura esperada:

```bash
.venv/bin/python scripts/gerar_painel_zona.py --raiz data/coletas --saida web/dados/zona_0253.json --uf SP --municipio 71072 --zona 0253 --esperado 496
```

## Registrar zona para contribuição

Depois de validar e gerar um pacote completo, por exemplo, `site/dados/sp_71072_0252.json`:

```bash
python3 scripts/registrar_zona.py --arquivo site/dados/sp_71072_0252.json
git status
```

Este comando **não** publica dados na internet. Ele valida o pacote e registra a zona em `site/dados/catalogo.json`. Depois, inclua apenas esses dois JSONs no Pull Request. Um bloco `{"uf":...}` é conteúdo JSON e não um comando de terminal.

## Abrir painel localhost

Linux:

```bash
bash scripts/run_local.sh
```

Windows PowerShell:

```powershell
.\scripts\run_local.ps1
```

Abra `http://127.0.0.1:8502/`. O servidor e apenas local. Nao exponha `python -m http.server` diretamente na internet.

## Metodologia e ressalvas

- Unidade de comparacao: UF, municipio TSE, zona e secao.
- Votos validos = comparecimento - brancos - nulos - nulos tecnicos.
- Categorias biometricas sao comparadas ao comparecimento geral do BU quando disponiveis.
- VSC e coletado e hasheado, mas a assinatura criptografica nao e validada.
- RDV pode ser coletado, mas nao e recontado nesta etapa.
- Secoes agregadas, transito e particularidades do Sistema de Apuracao exigem tratamento proprio.
- Anomalia estatistica nao prova fraude; ausencia de anomalia nao valida todo o processo.

Detalhes estao em `docs/METODOLOGIA.md` e `docs/MOTOR_COLETA.md`.

## Pacote verificavel

Apos revisar a arvore e criar um commit de release, gere um pacote de fonte sem dados locais:

```bash
bash scripts/criar_pacote_fonte.sh v0.1.0
```

O script usa `git archive` sobre o commit atual e grava SHA-256 ao lado do pacote. Ele falha se a arvore estiver suja para evitar pacote diferente do codigo revisado.

## Testes

```bash
python3 -m compileall -q scripts tests
bash -n scripts/*.sh scripts/coleta
python3 -m unittest discover -s tests -v
git diff --check
```

Os testes unitarios nao devem instalar dependencias, acessar o TSE ou fazer downloads reais.

## Como contribuir

Leia `CONTRIBUTING.md` e `SECURITY.md`. Nao envie BUs, RDVs, VSCs, logs de coleta, manifests reais, arquivos de `data/`, credenciais, IPs privados, caminhos de VPS ou prints de paineis internos em issues ou pull requests.

## Fontes

- TSE: https://resultados.tse.jus.br/oficial/
- DataUrnas-BR: https://github.com/alissonlinneker/DataUrnas-BR


## Portal público e login GitHub (em implementação)

O novo site público fica em site/ e será publicado pelo GitHub Pages. A API de login em cloudflare/src/worker.js utiliza Cloudflare Workers, D1 e OAuth GitHub com PKCE. O login e o cadastro automático estão implementados na branch de desenvolvimento; precisam ser publicados no Worker e habilitados no GitHub Pages antes de ficarem acessíveis ao público. Ainda não há upload colaborativo de resultados.

Guia específico da implantação: docs/PLATAFORMA_COLABORATIVA.md.


### Estrutura da navegação pública
- **Página inicial / consulta pública**: a pasta `site/` reúne o painel por UF, município, zona e seção. Visitantes não precisam de GitHub para consultar pacotes de resultados publicados.
- **Área dos colaboradores**: `site/desenvolvedores/index.html` usa GitHub OAuth para identificar quem participa da coleta.
- **Dados publicados**: `site/dados/catalogo.json` contém somente entradas para pacotes efetivamente revisados e tornados públicos; inicialmente o catálogo está vazio. A interface informa indisponibilidade, sem simular resultados.
- **Painel anterior**: o arquivo histórico `web/index.html` permanece preservado.
- O Worker permanece inalterado; `site/auth-redirect.js` encaminha à área dos colaboradores o retorno OAuth configurado para a raiz.
