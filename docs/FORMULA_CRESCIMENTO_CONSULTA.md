# Cálculo automático do crescimento entre turnos — consulta pública

Este cálculo está incorporado na página principal do GitHub Pages, sem comandos ou planilhas.

## Ao abrir a página

A seção **Comparação automática · Zonas 0252 e 0253 (São Paulo)** consulta os dois pacotes publicados, usando o catálogo estático para a zona 0253 e a API pública D1 para a zona 0252, quando cada pacote estiver aprovado. A página confere o pacote e exibe uma linha por zona mais um total das duas zonas.

**Não há números eleitorais codificados manualmente na página.** Os totais vêm exclusivamente de \`resumo.turnos[1]\` e \`resumo.turnos[2]\` dos JSONs públicos que passaram na validação do pacote. Caso uma zona não esteja publicada, a API não responda ou as somas não confiram, a tabela não exibe dados não confirmados.

Ao escolher qualquer zona e clicar em **Consultar**, surge o painel **Modelo matemático · crescimento entre turnos**. Ao selecionar uma seção específica, o cálculo é refeito para aquela seção.

## Fórmulas

\`ΔL = L₂ - L₁\`; \`ΔF = F₂ - F₁\`; \`M = ΔL + ΔF\`.

\`M = (O₁ - O₂) + (C₂ - C₁) + (BN₁ - BN₂)\`.

Onde \`L\` = votos para Lula; \`F\` = votos para Flávio; \`O\` = votos dos demais candidatos; \`C\` = comparecimento; \`BN\` = brancos, nulos e nulos técnicos. A reconciliação deve fechar exatamente, senão o pacote é recusado.

Para \`M > 0\`, ambos os candidatos com acréscimos não negativos e finalistas com votos no primeiro turno, o painel calcula:

- \`p = L₁ / (L₁ + F₁)\`: participação de Lula entre os finalistas no primeiro turno.
- \`q = ΔL / M\`: participação de Lula no incremento líquido dos votos dos finalistas.
- \`E = M × p\`: alocação **hipotética proporcional**.
- \`D = ΔL - E\`: diferença entre incremento observado e essa referência ilustrativa.

**\`E\` não é uma estimativa probabilística ou previsão estatisticamente calibrada.** Não existe regra que obrigue eleitores de outros candidatos, brancos, nulos ou ausentes a manter a mesma proporção de votos dos finalistas no primeiro turno. O painel não produz p-valor, probabilidade de fraude, nem estimativa de origem individual dos votos.

## Teste reproduzível

O módulo puro \`site/crescimento.mjs\` é importado por \`site/consulta.js\` e testado com \`site/tests/crescimento.test.mjs\` usando dados reais da Zona 0253 já versionada no repositório. A Zona 0252 é lida dinamicamente pelo navegador no D1, sem precisar transferir o arquivo para o GitHub.

Execute os testes da página com \`node --test site/tests/*.test.mjs\`. Eles não precisam de acesso ao Cloudflare e não alteram os dados.
