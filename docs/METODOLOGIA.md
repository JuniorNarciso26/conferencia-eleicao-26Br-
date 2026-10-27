# Metodologia do MVP

## Objetivo
Comparar, sem inferir o voto de pessoas específicas, o mesmo conjunto UF/município/zona/seção em dois turnos da eleição presidencial de 2026.

Alvo inicial: SP/71072/0253/0010. Pleitos TSE 3220 e 3221, eleições federais 6257 e 6258.

## Coleta dos dados originais
O sistema consulta o aux.json de cada pleito e seleciona o último conjunto cuja situação seja Totalizado e que contenha BU. Arquivos listados no conjunto são salvos na pasta data/raw/1T ou data/raw/2T. Um manifesto guarda URLs, tamanhos e hashes calculados localmente.

Arquivos sem BU Totalizado são marcados como ausentes: não há preenchimento artificial.

## Transformação para o painel
O módulo de decodificação ASN.1 é fornecido pelo DataUrnas-BR instalado na VPS. Os números oficiais dos candidatos são obtidos do endpoint de resultados presidenciais do TSE para cada turno. Nulos técnicos são separados dos nulos convencionais.

## Equações
- Votos válidos = comparecimento - brancos - nulos - nulos técnicos.
- Variação de válidos = variação do comparecimento - variação dos brancos - variação dos nulos - variação dos nulos técnicos.
- Percentual de comparecimento = comparecimento / aptos, quando aptos > 0.
- Conferência de habilitação = habilitação biométrica + habilitação biográfica + comparecimento sem biometria cadastrada. Verificar equivalência ao comparecimento geral do BU quando os três campos estão presentes.

## Limitações
- A comparação é por seção, não necessariamente pelo mesmo equipamento físico.
- Seções agregadas, eleição em trânsito e particularidades do Sistema de Apuração requerem tratamento específico.
- A assinatura digital VSC não é validada pelo MVP; os hashes locais preservam a comparação com o arquivo obtido.
- O RDV é coletado quando publicado, mas não é recontado neste MVP.
- O painel não distingue efeitos estatísticos de hipóteses operacionais ou de publicação sem evidência adicional.
- Não é possível concluir sobre fraude a partir apenas de uma seção ou de um padrão estatístico atípico.

## Próximos marcos
1. Confirmar os dois arquivos reais e conferir as identidades aritméticas.
2. Expandir para as seções da mesma zona eleitoral.
3. Reconciliar totais com o resultado oficial da zona.
4. Repetir para município, estado e país, com modelos estatísticos adequados.
