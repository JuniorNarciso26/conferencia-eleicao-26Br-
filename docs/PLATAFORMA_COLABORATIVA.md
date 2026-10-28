# Plataforma colaborativa — fase inicial

Arquitetura aprovada:
- GitHub Pages: site público de consulta e convite a colaboradores, acessível sem instalação nem login.
- Cloudflare Workers + D1: futura API para cadastro/login GitHub, reservas de zonas, persistência e revisão de resultados.
- Máquina do colaborador: roda scripts de coleta e conversão já existentes, sem enviar BU, RDV, VSC, arquivos de log ou documentos pessoais.
- Só enviar resultados agregados por seção/turno, metadados de identificação e hashes SHA-256 dos BUs como referências de proveniência.
- Nunca tratar dados enviados como resultados oficiais automaticamente; validar identidade da seção, somas e correspondência com TSE antes de publicar.

## Escopo desta branch
Esta branch contém o esquema inicial de banco D1, configuração exemplificativa Wrangler, workflow do GitHub Pages e site público de apresentação. **O backend OAuth, os endpoints de upload e a sincronização do coletor ainda precisam de implementação e testes.** Não há coleta real nem base D1 criada nesta etapa.

## Preparar a conta Cloudflare
1. Criar conta gratuita em https://dash.cloudflare.com/
2. Instalar Node.js e usar npx wrangler login na pasta cloudflare.
3. Criar banco: npx wrangler d1 create conferencia-eleitoral.
4. Preencher database_id em cloudflare/wrangler.toml.
5. Aplicar migração: npx wrangler d1 migrations apply conferencia-eleitoral --remote.
6. Criar OAuth App do GitHub (Settings > Developer settings > OAuth Apps) com callback apontando para o futuro Worker.
7. Configurar GH_CLIENT_ID, ADMIN_GITHUB_IDS; guardar GH_CLIENT_SECRET somente como segredo da Cloudflare, nunca no Git.
8. Implementar e testar Worker, validação e login antes de qualquer deploy público da API.

## Publicar GitHub Pages
1. Revisar esta branch e fazer merge na main.
2. Em Settings > Pages, selecionar GitHub Actions.
3. Executar workflow Publicar GitHub Pages, que publica somente site/.
4. Endereço esperado após habilitação: https://juniornarciso26.github.io/conferencia-eleicao-26Br-/

## Cuidados
- Não publicar tokens, dados da VPS, IPs privados ou arquivos TSE brutos no GitHub Pages.
- Reservar tarefas com expiração e permitir revalidação independente.
- Retenção, proteção contra abuso, rate limiting, suporte a erros e CORS estrito são pré-requisitos do backend.
- Conferir custo e limites atuais do plano gratuito antes do uso público.
