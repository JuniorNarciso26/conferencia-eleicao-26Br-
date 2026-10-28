# Plataforma colaborativa — GitHub Pages + Cloudflare D1

## O que está implementado nesta fase
- Site público estático em site/index.html.
- Login GitHub OAuth (authorization code + PKCE S256 + state com cookie HttpOnly SameSite=Lax).
- Primeiro login cadastra automaticamente o perfil público GitHub em users.
- Sessões locais de oito horas com hash do token no D1, ticket de uso único por dois minutos.
- APIs GET /api/health, GET /api/auth/github, GET /api/auth/callback, POST /api/auth/ticket, GET /api/me, POST /api/logout.
- Os segredos GitHub não são enviados ao navegador nem salvos no Git.
- Testes offline em cloudflare/tests/auth.test.mjs com simulação do GitHub e D1.

### Ainda não implementado
- Reservar zonas, enviar resultados de seções, revisões independentes e publicar dados no D1.
- Autenticação não transforma um usuário automaticamente em auditor ou administrador.
- Nenhuma coleta real é transmitida: BU, RDV, VSC, logs e dados de eleitores jamais devem ser enviados pelo frontend.
- O backend ainda precisa ser implantado na conta Cloudflare e o GitHub Pages precisa ser habilitado no GitHub.

## Passos para a conta já preparada

Você já criou:
- D1 chamado conferencia-eleitoral com sete tabelas.
- Worker chamado conferencia-eleitoral-api, no endereço https://conferencia-eleitoral-api.junior-ab2.workers.dev
- Binding do D1 chamado DB.
- Aplicativo OAuth GitHub cujo callback é https://conferencia-eleitoral-api.junior-ab2.workers.dev/api/auth/callback
- Variáveis GH_CLIENT_ID (Text) e GH_CLIENT_SECRET (Secret) no Worker.

**Não crie outro D1 nem outro OAuth App.**

### 1. Adicionar duas variáveis de texto no Worker

Cloudflare > Workers & Pages > conferencia-eleitoral-api > Settings > Variables and Secrets.

Adicione (tipo Text):
- SITE_URL = https://juniornarciso26.github.io/conferencia-eleicao-26Br-/
- API_ORIGIN = https://conferencia-eleitoral-api.junior-ab2.workers.dev

Garanta que GH_CLIENT_ID e GH_CLIENT_SECRET continuem presentes. Mantenha GH_CLIENT_SECRET como Secret.

### 2. Publicar a API (modo painel, sem CLI)

Cloudflare > Workers & Pages > conferencia-eleitoral-api > Edit code.

Abra a versão de cloudflare/src/worker.js da branch feature/cloudflare-github-pages-mvp:
https://github.com/JuniorNarciso26/conferencia-eleicao-26Br-/blob/feature/cloudflare-github-pages-mvp/cloudflare/src/worker.js

Copie todo o código. Substitua o teste temporário /api/health no editor Cloudflare e clique em Deploy.

Confirme no navegador:
https://conferencia-eleitoral-api.junior-ab2.workers.dev/api/health

Resposta esperada (resumo):
- ok: true
- database: OK
- tables: 7
- github_configuration: OK
- github_login: IMPLEMENTADO

Caso não apareça, revise os Bindings e as quatro variáveis; não compartilhe o Client Secret.

### 3. Publicar o site GitHub Pages

Depois de aprovar o Pull Request #1 e fazer merge na main:
- GitHub > repositório conferencia-eleicao-26Br- > Settings > Pages.
- Em Build and deployment > Source, selecionar GitHub Actions.
- GitHub > Actions > workflow "Publicar GitHub Pages"; clicar Run workflow na main caso não rode após o merge.
- Abrir: https://juniornarciso26.github.io/conferencia-eleicao-26Br-/

O site não exige instalação para visitantes. Colaboradores poderão entrar com GitHub, e numa etapa futura instalar o coletor e enviar apenas os resultados compilados.

### 4. Testar o login

1. Abrir o GitHub Pages em aba normal do navegador.
2. Clicar "Entrar com GitHub".
3. Autorizar o aplicativo GitHub.
4. O GitHub redireciona para o Worker, e o Worker devolve ao site um ticket de uso único pelo fragmento da URL.
5. O site troca esse ticket por sessão; aparece "Conectado como @seu-login".
6. Abrir D1 > Console, executar SELECT id, login, created_at, last_seen FROM users;
7. Clicar Sair. A sessão é invalidada no D1.

Se usar modo anônimo/janelas diferentes ao iniciar o login, o cookie OAuth de estado pode não corresponder e a autenticação será recusada, como medida de segurança.

## Instalação programática posterior (opcional)
Quem preferir Wrangler deve atualizar cloudflare/wrangler.toml com o ID real de D1 antes do deploy, executar a partir da pasta cloudflare e usar o arquivo de migrações sem recriar o banco. Para este piloto, a instalação via painel acima já utiliza suas tabelas existentes.

O arquivo wrangler.toml usa keep_vars=true para preservar as variáveis e secrets configurados no painel e não inclui credenciais GitHub.

## Limites de segurança
- Não publicar GH_CLIENT_SECRET, tokens da sessão, URL com ticket ou configurações privadas.
- O site usa token de sessão armazenado somente na aba (sessionStorage); evite abrir outras aplicações não confiáveis no mesmo domínio github.io.
- O escopo de autorização GitHub não solicita permissão aos repositórios.
- Uma contribuição futura precisará de validação no servidor, estados de revisão, limites de taxa, autorização por zona e revisão independente antes de entrar na base pública.
- Avaliar periodicamente os limites do Cloudflare Free, e separar staging/produção quando o projeto crescer.


## Navegação após a reorganização (28/10/2026)
- Consulta pública principal: https://juniornarciso26.github.io/conferencia-eleicao-26Br-/
- Login dos colaboradores: https://juniornarciso26.github.io/conferencia-eleicao-26Br-/desenvolvedores/
- O callback OAuth continua apontando à raiz do site, como já configurado em SITE_URL no Worker. Um script na página principal encaminha apenas os fragmentos ticket/login_error para a página de colaboradores. **Não alterar o Client ID, o Secret ou o callback**.
- Consulta carrega exclusivamente pacotes explicitamente listados em site/dados/catalogo.json. O catálogo começa vazio porque ainda não publicamos pacotes de resultados: não há valores fictícios nem um resultado atribuído ao TSE sem fonte.
- Formato de entrada futuro: `{"uf":"SP","municipio_codigo":"71072","municipio_nome":"São Paulo","zona":"0253","arquivo":"dados/zona_0253.json"}`. Só adicionar após revisão e após copiar o arquivo correspondente ao diretório site/dados/.
- O arquivo histórico web/index.html permanece como referência visual, mas não é servido pelo GitHub Pages.

## Guia interativo para novos colaboradores

A área https://juniornarciso26.github.io/conferencia-eleicao-26Br-/desenvolvedores/ oferece o botão **Quero contribuir**.
Ao clicar, o visitante informa UF, município, código TSE do município (diferente do código IBGE) e zona eleitoral. O guia checa o catálogo público para avisar se a zona já foi publicada. Como ainda não há reserva central de zonas, a ausência no catálogo não significa que outro colaborador não esteja trabalhando nela.

O guia prepara:
1. Instalação do coletor para Linux, WSL ou VPS (Git, Python 3.11+).
2. Dry-run para descobrir quantas seções a zona possui.
3. Coleta local dos dois turnos, com acompanhamento do job.
4. Geração de JSON consolidado usando `scripts/gerar_painel_zona.py` com a quantidade esperada informada pelo colaborador; nunca presume 496.
5. Entrada JSON para o catálogo, orientação para fork e Pull Request com revisão.

O portal **não executa comandos**, **não inicia a coleta na nuvem**, **não reserva zonas** e **não envia automaticamente os resultados**. Somente JSON consolidado e revisado deverá ser publicado; não anexar arquivos BU, RDV, VSC, logs nem dados brutos. O login GitHub existente não sofreu mudanças.

## Seleção automática por localidade (TSE 2026)
- O formulário **Quero contribuir** usa o snapshot `site/dados/localidades_2026.json`, derivado de configuração oficial de municípios/zonas do TSE 2026.
- O script `scripts/gerar_catalogo_localidades.py` gera a lista da EA12 e, em caso de formato incompleto, usa os catálogos oficiais de seção CS por UF (o mesmo formato do motor). Valida as 27 UFs, controle SP 71072 / Z0253, quantidade mínima de municípios e vínculos.
- A interface seleciona UF, depois município e zona; o código TSE é preenchido automaticamente. O campo não aceita edição manual.
- Assim que a zona é escolhida, o site consulta `site/dados/catalogo.json`: **publicada** quando existe resultado aprovado e servido no GitHub Pages; **ainda não publicada** quando ausente do catálogo. Este último status **não confirma que não existe coleta local em andamento**. Não há reserva automática por enquanto.
- A base de localidades e o catálogo de resultados são distintos: localidades mostram onde é possível coletar; resultados publicados mostram onde já existe consulta pública.
- Atualizações oficiais do catálogo deverão passar por revisão, e não modificar os BUs ou os arquivos brutos locais.

## Acompanhar a coleta e marcar o trabalho local (28/10/2026)

- Uma seção na área de colaboradores orienta abrir um segundo terminal Ubuntu/WSL e executar `scripts/coleta painel`, depois visitar `http://127.0.0.1:8765/`. O painel atualiza a cada 2 segundos, e encerrar o painel não encerra a coleta.
- Ao selecionar UF, município e zona, o portal continua consultando o catálogo **dos resultados publicados**. Uma zona ausente desse catálogo **não é necessariamente livre**: outra pessoa pode estar coletando.
- O botão **Já estou coletando esta zona** permite ao usuário registrar uma **anotação no armazenamento deste navegador**. Ao selecionar novamente a mesma zona no mesmo navegador, o portal informa **EM COLETA NESTE NAVEGADOR (anotação manual)**. O botão **Retirar marcação local** desfaz esse registro.
- A anotação não detecta automaticamente um job aberto no WSL, não verifica o progresso real, não expira automaticamente, não está associada a uma sessão GitHub e não é visível para outros colaboradores. É necessária uma solução de reserva/status no Cloudflare D1 para sinalização **compartilhada**. O colaborador deve retirar a marcação ao terminar ou abandonar a coleta.
- Se os resultados forem publicados, o status **PUBLICADO** tem prioridade na interface, mesmo que a marcação local ainda exista.

## Reserva de zona no D1 por 24 horas — integração (versão 2026-10-28)

A partir deste upgrade, as zonas passam a ter **reserva compartilhada**, vinculada à conta GitHub autenticada.

**Regra:** ao reservar uma zona válida (UF/código TSE/zona), uma linha em `zone_reservations` guarda `user_id`, login público do GitHub, `reserved_at` e `expires_at` (Unix epoch UTC). Prazo imutável de **86.400 segundos a partir da confirmação da reserva**. Uma conta só pode reservar uma zona por vez e não consegue renovar o prazo clicando novamente. A exclusividade é garantida por PRIMARY KEY da zona e índice UNIQUE parcial por usuário.

O status é consultado em tempo real no Worker por `GET /api/zones/reservation?uf=SP&municipio=71072&zona=0252`. Enquanto está ativa, todos veem `Reservada por @login até data/hora`. **No segundo exato da expiração, uma reserva não enviada é tratada como disponível**; nenhuma tarefa agendada é necessária. A linha expirada é apagada ao chegar uma nova solicitação de reserva. O colaborador pode liberar antes com `POST /api/zones/release` (somente proprietário).

Se o colaborador abrir um Pull Request antes do vencimento, poderá registrar seu número no portal via `POST /api/zones/submit`. O Worker confere via GitHub API: PR aberto, para `main`, autor GitHub igual à conta autenticada e arquivos `site/dados/<uf>_<codigo>_<zona>.json` e `site/dados/catalogo.json`. Nesse caso o estado vira `submitted` (em revisão) e **não é liberado após 24 horas**, pois houve entrega válida para revisão. O merge/publicação do PR segue o fluxo atual de revisão manual, não há upload automático no Worker. Para PR rejeitado ou encerrado sem publicação, a liberação exige intervenção operacional futura; esta versão não possui painel administrativo.

**Importante: atualização não instala o banco e Worker automaticamente.** O GitHub Pages pode ser publicado antes da API; nesse caso o portal deve indicar que não consegue confirmar reservas e bloquear novas reservas. Para ativar na conta Cloudflare atual:

1. No Cloudflare, abra **D1 > conferencia-eleitoral > Console** e execute o arquivo `cloudflare/migrations/0002_zone_reservations_24h.sql` (apenas a nova tabela e índices; **não execute novamente 0001_schema.sql nem recrie a base**).
2. Publique a nova versão do Worker contendo **`cloudflare/src/worker.js` e `cloudflare/src/reservas.js`**. Pelo Wrangler, preencha o UUID real do D1 em seu ambiente/arquivo de configuração e faça deploy para o Worker existente. Preserve `GH_CLIENT_ID`, `GH_CLIENT_SECRET`, `SITE_URL`, `API_ORIGIN` e o binding `DB`. Não publicar secrets no GitHub.
3. Teste `GET https://conferencia-eleitoral-api.junior-ab2.workers.dev/api/zones/reservation?uf=SP&municipio=71072&zona=0252` (deve retornar `{"ok":true,"zone":"SP-71072-0252","status":"available"}` antes da reserva).
4. No portal dos colaboradores, entre com GitHub, escolha a zona disponível, clique em **Reservar esta zona por 24 horas** e confirme a identificação, prazo e exclusividade em outro navegador.

Não apague a tabela `zones` existente: ela permanece no banco para a futura publicação direta, sem uso neste fluxo. Os dados de urna continuam exclusivamente no WSL/VPS do colaborador até o PR revisado.

## Registrar pacote de zona no catálogo sem copiar JSON bruto para terminal

Após `scripts/gerar_painel_zona.py` gerar o pacote validado em `site/dados/<uf>_<codigoTSE>_<zona>.json`, o comando `python3 scripts/registrar_zona.py --arquivo site/dados/sp_71072_0252.json` acrescenta automaticamente a entrada a `site/dados/catalogo.json`. O script confere identidade da zona, catálogo oficial de localidades, cobertura completa e presença de dois turnos; falha se já existir um pacote diferente para essa zona. É idempotente e altera somente `catalogo.json`, sem publicar dados nem enviar arquivos.
O painel do colaborador passou a oferecer **um comando terminal real**, em vez de um bloco JSON, para evitar `Command 'uf:' not found`. Para publicar, enviar via PR exclusivamente o JSON consolidado e o catálogo atualizado.
