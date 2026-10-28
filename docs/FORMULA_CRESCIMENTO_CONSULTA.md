# Cálculo automático da diferença de votos por urna — consulta pública

Este painel funciona inteiramente na [consulta pública](https://juniornarciso26.github.io/conferencia-eleicao-26Br-/), usando os pacotes previamente publicados. Nenhum comando é necessário para visualizar cálculos.

## Objetivo

Pergunta: **O que explica a diferença de votos entre o primeiro e o segundo turno?**

A análise é **por zona selecionada e por seção eleitoral (urna)**, sem comparar zonas distintas. A tabela de comparação existente preserva os dois turnos e a diferença absoluta, acrescentando a coluna de **variação percentual** para cada indicador, quando o denominador no 1º turno é diferente de zero.

\`variação % = 100 × (valor no 2º turno − valor no 1º turno) / valor no 1º turno\`.

Para taxas (ex.: comparecimento em %), a diferença continua expressa em **pontos percentuais (p.p.)**; não se mistura com a variação percentual relativa. O cálculo não divide por zero, apresentando \`—\` nesses casos.

## Reconciliação contábil

Para cada turno \`t\`:
- \`L_t\` = votos de Lula; \`F_t\` = votos de Flávio; \`O_t\` = votos dos demais candidatos.
- \`C_t\` = comparecimento; \`BN_t\` = brancos, nulos de urna e nulos técnicos; \`V_t\` = votos válidos.

As duas identidades verificáveis são:

\`V₂−V₁ = (C₂−C₁) + (BN₁−BN₂)\`.

\`(L₂−L₁) + (F₂−F₁) = (O₁−O₂) + (V₂−V₁)\`.

O sistema valida todas as seções e seus resumos antes de mostrar os resultados. **Essas expressões decompõem diferenças líquidas; não identificam a origem dos votos individuais.** Os componentes podem ser negativos em qualquer zona e não são necessariamente grupos disjuntos de eleitores.

Quando os dois finalistas aumentam seus totais, também se mostra a parcela de cada um no incremento líquido dos dois finalistas:

\`participação_L = (L₂−L₁) / [(L₂−L₁) + (F₂−F₁)]\`.

Essa proporção não deve ser confundida com intenção de voto, probabilidade de transferência ou evidência de irregularidade.

## Padrão por seção eleitoral

O quadro **Padrão de variação por seção eleitoral (urna)** calcula, para todas as seções do pacote:

- \`Δ Lula\`, \`Δ Lula (%)\`, \`Δ Flávio\`, \`Δ Flávio (%)\`;
- \`Δ comparecimento\` e \`Δ votos válidos\`;
- qual candidato teve a **maior variação líquida** em votos absolutos, incluindo casos em que houve queda de ambos.

A área informa contagens e percentuais sobre o número total de seções: maior variação para cada finalista, variações iguais e seções onde ambos cresceram. O filtro permite inspecionar todos os registros, sem descartar as seções em sentido contrário. Uma seção pode aparecer como “maior variação” mesmo que seja apenas uma queda menor; isso **não prova transferência de voto, padrão estatístico improvável, nem irregularidade**.

## Exemplo da Zona 0252

Com os valores visíveis no resumo público: \`Lula: 31.977 → 40.758 (+8.781 / +27,46%)\`, \`Flávio: 38.173 → 42.754 (+4.581 / +12,00%)\`, \`Votos válidos: 79.527 → 83.512 (+3.985 / +5,01%)\`.

A reconciliação se fecha: \`13.362 = 9.377 + 2.875 + 1.110\`. Esses totais são ilustrativos desta zona; a página não os mantém codificados, mas os calcula ao carregar o pacote.

## Limites e próximos testes

Mesmo um mesmo sinal em muitas urnas não demonstra que votos “migraram” de um candidato para outro: agregados por urna não identificam indivíduos. Para avaliar se um padrão é incomum, será preciso estabelecer hipóteses explícitas, incorporar heterogeneidade e dependência entre seções, calibrar modelos com dados fora da amostra e testar explicações alternativas. Esta versão não calcula p-valores nem métricas de fraude.

**Código fonte:** \`site/crescimento.mjs\` e \`site/consulta.js\`. **Testes:** \`node --test site/tests/*.test.mjs\`. Não requer mudança na API, no Worker ou nas tabelas D1.
