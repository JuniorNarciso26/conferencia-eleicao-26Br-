# Motor automático de coleta TSE

O comando `scripts/coleta` cria e opera jobs persistentes de coleta. O alvo pode ser uma seção, uma zona, um município ou uma UF. Cada job mantém configuração, fila, estado, lock, logs e sinal de parada próprios.

## Recursos operacionais

- expansão de zona, município ou UF pelo catálogo oficial de seções do TSE;
- exclusão das seções agregadas, que não possuem pacote próprio;
- fila persistente e ordenada;
- lock exclusivo para impedir duas execuções do mesmo job;
- estado JSON gravado atomicamente;
- execução em segundo plano por padrão;
- checkpoint por seção e retomada idempotente;
- parada segura entre seções;
- backoff e `Retry-After` do coletor;
- limite de falhas e reserva mínima de disco;
- diretório isolado por seção;
- coleta dos dois turnos e de todos os artefatos listados no `aux.json` aceitos pelo coletor: BU, RDV, log e VSC/vota;
- validação de hashes, manifesto, BU e somas antes do marcador `validated.ok`;
- estado `archive_status: pending` para a futura etapa de Google Drive.

## Exemplos

### Uma seção

```bash
scripts/coleta start \
  --escopo secao --uf sp --municipio 71072 --zona 0253 --secao 0010
```

### Todas as seções principais de uma zona

```bash
scripts/coleta start \
  --escopo zona --uf sp --municipio 71072 --zona 0253
```

### Município ou UF

```bash
scripts/coleta start --escopo municipio --uf sp --municipio 71072
scripts/coleta start --escopo uf --uf sp
```

Antes de uma coleta grande, conferir a fila sem baixar:

```bash
scripts/coleta start --escopo zona --uf sp --municipio 71072 --zona 0253 --dry-run
```

Para piloto limitado:

```bash
scripts/coleta start --escopo uf --uf sp --max-secoes 10
```

## Operação

O comando `start` retorna imediatamente e deixa o worker em segundo plano. Para acompanhar o job atual:

```bash
scripts/coleta status
```

Parada segura — o worker conclui a seção em andamento e para antes da próxima:

```bash
scripts/coleta stop
```

Retomada do job atual:

```bash
scripts/coleta resume
```

Também é possível informar `--job ID` em `status`, `stop` e `resume`.

Os dados ficam em:

```text
data/coletas/<uf>-<municipio>-<zona>-<secao>/
├── raw/
│   ├── 1T/
│   ├── 2T/
│   └── candidatos/
├── manifesto_tse.json
├── secao.json
└── validated.ok
```

A operação fica em:

```text
data/motor/jobs/<job-id>/
├── config.json
├── queue.json
├── state.json
├── worker.lock
├── stop.request       # somente quando solicitado
└── logs/
```

## Estados

- `queued` / `starting`: preparado ou iniciando;
- `running`: worker ativo;
- `stopped`: parada segura concluída;
- `completed`: todas as seções validadas;
- `completed_with_errors`: fila concluída com falhas registradas;
- `failed`: limite operacional ou de falhas interrompeu o job;
- `dry_run`: fila calculada sem download.

`archive_pending` conta seções validadas que ainda precisam ser compactadas e enviadas ao armazenamento externo. O motor não apaga dados antes de existir confirmação de upload e hash; essa etapa será adicionada quando o Google Drive for conectado.

## Proteções e limites

Padrões:

- intervalo de 2 segundos entre seções;
- até três falhas antes de interromper;
- reserva mínima de 2 GiB livres;
- downloads atômicos, limites por arquivo/turno e retentativas do coletor existente.

Os parâmetros podem ser ajustados por job com `--intervalo`, `--max-falhas` e `--min-free-gb`. Não reduzir agressivamente o intervalo: respostas 429 e `Retry-After` devem ser respeitadas.

## Testes

```bash
python3 -m compileall -q scripts tests
bash -n scripts/*.sh scripts/coleta
.venv/bin/python -m unittest discover -s tests -v
git diff --check
```
