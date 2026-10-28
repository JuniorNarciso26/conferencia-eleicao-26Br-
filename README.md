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

## Envio direto do JSON pelo portal (novo fluxo)

Após gerar o arquivo `site/dados/<uf>_<municipioTSE>_<zona>.json`, o colaborador **não precisa de Git, commit, push nem Pull Request** para entregar os dados. O arquivo permanece em seu computador até ele selecioná-lo no campo de upload na área [Colaboradores](https://juniornarciso26.github.io/conferencia-eleicao-26Br-/desenvolvedores/).

1. Entre com GitHub no portal e reserve a zona por 24 horas.
2. Selecione a UF, município e zona reservados.
3. Escolha o arquivo JSON consolidado e clique **Enviar resultados para revisão**.
4. O navegador valida as seções e transmite lotes de até 20 seções para o Cloudflare Worker. O Worker confere o proprietário da reserva, a zona, os dois turnos e os totais agregados. Se a conexão falhar, selecione o mesmo arquivo para retomar.
5. O registro muda para **Aguardando revisão**. Somente um revisor autorizado pode aprovar e publicar; os resultados aprovados ficam disponíveis na consulta pública via D1.

Os dados são armazenados no D1 por zona, com uma linha por seção, não como um único JSON de tamanho elevado. O SHA-256 do arquivo original é **declarado pelo navegador** para rastreabilidade, mas não é verificado contra os bytes originais no servidor; não comprova origem nem autentica assinatura dos boletins. A aplicação continua sem validação VSC, RDV ou prova automática de integridade da fonte. O JSON precisa conter resumo consistente, cobertura completa e valores dos dois turnos. Não envie os arquivos brutos de urna.

**Requisitos de ativação:** o portal GitHub Pages, sozinho, não consegue gravar dados no D1. É preciso aplicar as migrations `0002_zone_reservations_24h.sql` (caso ainda não aplicadas) e `0003_direct_upload.sql` na mesma base D1, publicar o Worker atualizado e configurar `ADMIN_GITHUB_IDS` com os IDs numéricos GitHub dos revisores. Confira o guia `docs/PLATAFORMA_COLABORATIVA.md`. Até o Worker e as migrations estarem ativos, o portal deve recusar uploads em vez de afirmar que os dados foram entregues.

### Fluxo histórico (opcional)

Os comandos de registro de zona e Pull Request permanecem no repositório para manutenção e auditoria, porém **não são mais exigidos do colaborador**.

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

## Analisar crescimento entre turnos (cenários, não atribuição individual)

Com duas zonas consolidadas no computador, compare o incremento líquido dos votos e a hipótese de distribuição proporcional:

```bash
python3 scripts/analisar_crescimento_turnos.py --arquivos site/dados/zona_0253.json site/dados/sp_71072_0252.json
```

O teste confere a soma das seções, a identidade de comparecimento e mostra cenários matematicamente possíveis, sem inferir quem mudou de voto ou emitir conclusão de fraude. [Metodologia e limitações](docs/MODELO_CRESCIMENTO_TURNOS.md).

## Análise automática na consulta pública

A [consulta pública](https://juniornarciso26.github.io/conferencia-eleicao-26Br-/) calcula automaticamente a variação absoluta e percentual dos indicadores entre os turnos **dentro da zona selecionada**. Além da reconciliação de comparecimento, votos válidos, outros candidatos, brancos e nulos, apresenta uma tabela com o padrão de variação **por seção eleitoral (urna)**, mostrando contagens e percentuais de seções em que cada finalista apresentou a maior variação líquida. Não há comparação entre zonas nem inferência de transferências individuais. Consulte [metodologia e limitações](docs/FORMULA_CRESCIMENTO_CONSULTA.md).
