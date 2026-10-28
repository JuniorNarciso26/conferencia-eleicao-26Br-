# Crescimento de votos entre turnos — modelo de plausibilidade condicional

## Objetivo

Responder, por zona, **quanto cresceram** os votos de cada finalista, **qual parcela do incremento líquido** ficou com cada um e **quais hipóteses** seriam necessárias para interpretar esse resultado. Os dados consolidados dos boletins não identificam eleitores individualmente, trocas reais, intenção de voto ou irregularidades.

Comando no WSL (após atualizar o repositório):

    python3 scripts/analisar_crescimento_turnos.py --arquivos site/dados/zona_0253.json site/dados/sp_71072_0252.json

Para consumir JSON estruturado, acrescente \`--json\`. O programa só lê os arquivos, não altera o banco nem o portal.

## Variáveis

Para cada turno \`t\`:
- \`L_t\`: votos válidos para Lula; \`F_t\`: votos válidos para Flávio;
- \`O_t\`: votos válidos para outros candidatos;
- \`C_t\`: comparecimento;
- \`B_t\`: brancos, nulos e nulos técnicos somados;
- \`A_t\`: eleitores aptos (para conferência, não usados para atribuir origem).

**Identidade exata**, por definição dos campos do coletor:

\`(L₂-L₁) + (F₂-F₁) = (O₁-O₂) + (C₂-C₁) + (B₁-B₂)\`.

A identidade não informa trajetórias individuais. O aumento líquido do comparecimento, por exemplo, não identifica *quais* indivíduos votaram apenas no segundo turno. A queda de brancos/nulos é líquida, sem ligação individual entre as categorias.

Se \`M = (L₂-L₁)+(F₂-F₁) > 0\` e ambos os ganhos forem não negativos, apresentamos:

- **Participação de Lula no incremento líquido:** \`q = (L₂-L₁) / M\`;
- **Participação de Lula entre finalistas no primeiro turno:** \`p = L₁/(L₁+F₁)\`;
- **Cenário proporcional ilustrativo:** \`E_proporcional = M × p\`.

A diferença \`(L₂-L₁)-E_proporcional\` **não é** resíduo de um modelo estatístico validado nem um p-valor. Ele só informa quão diferente a divisão observada foi de uma *hipótese escolhida*, que não é consequência matemática da liderança do primeiro turno. Não há distribuição amostral calibrada nem motivo demonstrado para que eliminados, brancos/nulos ou eleitores que se abstiveram votem proporcionalmente ao eleitorado dos finalistas.

Quando \`M\`, \`ΔL\`, \`ΔF\` e os três componentes de \`M\` são não negativos, o script constrói **um testemunho de balanço agregado** em que os ganhos são distribuídos a partir dos outros candidatos, da diferença líquida de comparecimento e da redução líquida de brancos/nulos, sem exigir troca direta entre finalistas. **Não se trata de estimar ou comprovar essas transferências**, e a construção agregada não garante factibilidade seção a seção. Quando as hipóteses não são satisfeitas, o script indica que esse cenário não foi demonstrado (não que houve fraude ou troca direta).

## Exemplo verificável — SP / São Paulo / zona 0253

Em 496 seções, a base consolidada contém:

- \`L₁ = 39.434\`, \`L₂ = 50.417\` → \`ΔL = 10.983\`;
- \`F₁ = 62.876\`, \`F₂ = 71.146\` → \`ΔF = 8.270\`;
- \`M = 19.253 = 15.202\` de outros candidatos do 1T \`+ 3.708\` de crescimento líquido de comparecimento \`+ 343\` de redução líquida de brancos/nulos;
- \`q = 57,05%\`; \`p = 38,54%\`; cenário proporcional \`E = 7.420,8\` votos a mais para Lula; o observado foi 10.983.

O crescimento percentual do candidato que não liderava no primeiro turno pode ser maior que o do candidato que liderava, e ambos podem aumentar. O exemplo agregado é matematicamente consistente sem troca direta entre finalistas. Isso **não estabelece** de onde vieram os votos no mundo real.

## Evolução estatística quando houver mais zonas

Para avaliar **quão comum** é cada padrão, serão necessárias muitas zonas comparáveis, e não apenas duas. Um modelo futuro de predição fora da amostra (por exemplo, regressão beta-binomial hierárquica para \`q\`, estratificada por município, perfil do primeiro turno e tamanho de seção) deve usar zonas de treinamento e validação separadas, testar a calibração, considerar dependência espacial e comparar cenários alternativos. Sem isso, usar a fórmula binomial com milhões de votos como ensaios independentes criaria probabilidades artificialmente extremas, sem validade para inferir irregularidades.

**Condição de publicação:** validar as fontes e totais TSE de ambas as zonas; registrar hipóteses e limites; não confundir diferença de voto com prova de voto transferido; não calcular um "percentual de fraude" a partir de agregados.
