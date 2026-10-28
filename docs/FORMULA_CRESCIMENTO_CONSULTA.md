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


## Histograma ponderado da diferença de crescimento por seção

A página traz o gráfico **Onde a diferença de crescimento foi maior?**, com nove faixas ordenadas de predominância do crescimento de Flávio, passando pelo equilíbrio, até predominância de Lula.

**Métrica por seção em pontos percentuais (p.p.):**

    S = 100 × {[(Lula_2-Lula_1) - (Flávio_2-Flávio_1)] / Comparecimento_1}

Usamos o comparecimento da própria seção no primeiro turno como denominador fixo para reduzir a influência do tamanho da urna. Se S é positivo, o incremento líquido de Lula superou o de Flávio naquela seção; se negativo, ocorreu o inverso. O resultado pode ser positivo mesmo que ambos percam votos (um perde menos). Não significa transferência individual de um candidato ao outro.

**Faixas simétricas:** Flávio ≥20 p.p.; 10–20; 5–10; 2–5; equilíbrio absoluto menor que 2 p.p.; Lula 2–5; 5–10; 10–20; ≥20 p.p. Os cortes de 2, 5, 10 e 20 p.p. são escolhidos para descrever a distribuição, não são limiares calibrados de significância estatística.

A seção **diferença intensa** é definida apenas como magnitude de pelo menos 10 p.p., e mostra o número de urnas e o percentual do comparecimento do primeiro turno representado por elas. Os resultados são apresentados para AMBOS os candidatos.

Os dois modos do gráfico são:

1. **Quantidade de urnas:** cada seção vale uma unidade, independente de tamanho.
2. **Peso dos eleitores:** cada seção contribui com seu comparecimento no primeiro turno. A proporção da faixa é 100 × soma dos comparecimentos das seções na faixa / soma dos comparecimentos nas seções com base maior que zero.

As barras são escaladas à faixa mais larga no modo escolhido; os rótulos sempre mostram a quantidade de urnas e o percentual ponderado, sem confundir as duas unidades. Clicar em uma faixa filtra a tabela de seções existente. O botão **Limpar faixa selecionada** restaura o conjunto, e o filtro anterior de maior variação para cada candidato continua funcionando.

Para a urna do exemplo (Lula +38; Flávio +3; comparecimento inicial 276), a métrica é (38 − 3) ÷ 276 × 100 = **+12,68 p.p.**, faixa **Lula 10–20 p.p.**. Isso não demonstra que 35 votos tenham migrado de um candidato ao outro.

Se uma seção tiver comparecimento inicial zero, ela aparecerá no total de seções mas será identificada como **sem base** e não será atribuída a faixa nem usada na ponderação. Todo o cálculo ocorre no navegador usando o pacote da zona selecionada, sem comparar zonas diferentes e sem alterações no banco D1.

Para avaliar **plausibilidade estatística**, seria necessário formular hipóteses e modelos sobre composição dos votos, variação de comparecimento, heterogeneidade entre seções e dependências territoriais, com validação fora da amostra. Este gráfico é descritivo e não fornece p-valor, atribuição de eleitores ou conclusão de irregularidade.
