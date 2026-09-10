# 07 — Licença e telemetria (a camada da Kora)

Complementa a seção B do `README.md` deste diretório: são rotas da **superfície
local** (ponte ↔ painel), em `localhost`, na porta do painel. Nada disto é
publicado pelo túnel.

Fonte: **ADR-P02** (o que é da Kora vive no Supabase), **ADR-P08** (a carência),
`data/schemas/licenca.schema.json` e `data/schemas/telemetria.schema.json`.

---

## A regra que molda todo o resto

> Nenhuma chamada ao Supabase entra no caminho crítico do evento de presente.
> — ADR-P02, e acima dele o Princípio nº 1 do `CLAUDE.md`.

Na prática, na ponte:

- A licença é consultada **uma vez**, no arranque, disparada por
  `nucleo.reportarInstalacao()` em `bridge/src/index.mjs` — **depois** de as
  portas abrirem e **sem `await`**. O veredito fica em memória e vale a sessão
  inteira.
- `GET /api/licenca` **não** consulta a Kora. Devolve o veredito já decidido.
  Abrir o painel dez vezes não gera dez consultas.
- Telemetria é **fire-and-forget**: `registrar()` é síncrono, enfileira e volta.
  Nunca espera rede, nunca lança.
- Sem `SUPABASE_URL` e `SUPABASE_ANON_KEY` no `.env`, o produto funciona
  inteiro: a licença fica `indeterminada` e a fila de telemetria nunca sai da
  máquina.

Há teste cobrando isso: `bridge/test/kora-fora-do-caminho.test.mjs` percorre o
caminho do evento de presente com um adaptador de rede que **falha o teste se
for chamado**.

---

## `GET /api/licenca`

Devolve o objeto exatamente na forma de `licenca.schema.json`.

```json
{
  "streamerId": "local",
  "estado": "ativa",
  "chave": "KORA-XXXX-XXXX",
  "plano": "Mensal",
  "validaAte": "2026-10-10T00:00:00.000Z",
  "verificadaEm": "2026-09-10T13:00:00.000Z",
  "carenciaAte": "2026-09-24T13:00:00.000Z",
  "motivo": null,
  "versaoInstalada": "0.1.0",
  "atualizadoEm": "2026-09-10T13:00:00.000Z"
}
```

### `estado`

| Valor | Significa |
|---|---|
| `ativa` | a Kora confirmou agora |
| `expirada` | a Kora disse que venceu |
| `cancelada` | a Kora disse que foi cancelada |
| `sem_licenca` | nunca foi ativada, ou a chave não existe na Kora |
| `indeterminada` | **não deu para perguntar** — vale a carência (ADR-P08) |

### `motivo` — os seis códigos, e são só estes

O painel traduz por código, nunca por frase pronta (ADR-P03): frase pronta
nasceria em português e o funil da Fase 1 é em inglês. Acrescentar um código
aqui é acrescentar uma chave de i18n no painel.

| Código | Quando |
|---|---|
| `sem_chave` | instalação que ninguém ativou. Não é erro |
| `chave_invalida` | a Kora respondeu e não conhece esta chave |
| `licenca_expirada` | a Kora respondeu `expirada` |
| `licenca_cancelada` | a Kora respondeu `cancelada` |
| `kora_indisponivel` | não deu para perguntar, e ainda há carência |
| `carencia_esgotada` | não deu para perguntar, e a carência acabou |

O produto **trava** em `expirada`, `cancelada` e `carencia_esgotada`. Todo o
resto libera — inclusive `indeterminada` e `sem_licenca`. Ver
`liberado()` em `bridge/src/dominio/licenca.mjs`.

---

## `POST /api/licenca`

Corpo: `{ "chave": "..." }`. Devolve a mesma forma do `GET`.

Erros, no contrato de erro de sempre (`{ erro, mensagem }`):

| Status | `erro` | Quando |
|---|---|---|
| 400 | `corpo_invalido` | o corpo não é um objeto |
| 400 | `chave_obrigatoria` | sem `chave`, ou `chave` que não é texto, ou vazia |
| 400 | `chave_malformada` | fora de 8–128 caracteres |

**Chave que a Kora recusa não é erro HTTP.** Volta 200 com
`estado: "sem_licenca"` e `motivo: "chave_invalida"` — é a resposta à pergunta
que o painel fez. E, quando já havia uma licença `ativa` gravada, **o espelho em
disco não é substituído**: o caminho realista aqui é erro de digitação, e um
caractere trocado não pode apagar a licença de quem pagou.

---

## `DELETE /api/licenca`

Esquece a chave **nesta máquina** e apaga `data/licenca.json`. Devolve a mesma
forma, com `estado: "sem_licenca"` e `motivo: "sem_chave"`.

Não cancela assinatura e não fala com a Kora: cancelar é do faturamento, e o
dinheiro é do Lemon Squeezy (ADR-P02). Isto é o botão de "vou instalar na outra
máquina".

---

## Evento do SSE: `licenca`

`GET /api/sessao/stream` passa a emitir `licenca` com o objeto acima, sempre que
o veredito muda: quando o arranque termina de perguntar, e a cada `POST`/`DELETE`.
Ver a lista de eventos na seção B do `README.md`.

---

## Telemetria (ponte → Supabase)

Não tem rota: é saída, não entrada. O envelope está em
`data/schemas/telemetria.schema.json`, e o schema **é a fronteira de
privacidade** — `additionalProperties: false` sobre uma lista curta e fixa é o
que impede um nickname ou id de espectador entrar num payload que sai da
máquina. Evento que não passa na validação é **descartado**, nunca corrigido.

Quatro tipos, e nada além do console v1 (ADR-P05, itens 2 e 6):

| `tipo` | Quando |
|---|---|
| `instalacao` | no arranque. É daqui que saem versão instalada e idioma |
| `conexao` | a sessão de live começou |
| `queda` | a live caiu sozinha — contada na transição, não a cada retentativa do backoff |
| `desconexao` | a sessão foi encerrada |

Campos: `streamerId`, `tipo`, `em`, `versaoInstalada`, `idioma`, `modalidade`,
`motivo`. **Nenhum campo de espectador existe**, nem aqui nem nas colunas do
Postgres (`data/supabase/001-esquema.sql`).

A fila é despachada a cada 30s, tem teto de 200 eventos e descarta o mais velho
quando estoura. Lote recusado volta para a fila e tenta no ciclo seguinte — é o
"a telemetria acumula para enviar depois" do ADR-P02.

**Sem chave de licença nada é enviado.** O RLS recusaria, e é o comportamento
certo: instalação que a Kora não conhece não escreve na base da Kora.

---

## O que a instalação pode fazer no banco

Definido por RLS em `data/supabase/001-esquema.sql`, com a chave da licença
mandada no cabeçalho `X-Kora-Chave`:

| Tabela | `anon` (a instalação) |
|---|---|
| `licencas` | `SELECT` da **própria linha**. Nada mais |
| `telemetria` | `INSERT` em nome do **próprio tenant**. Sem `SELECT` |
| `saude_de_conexao` | nada |

Não existe policy de escrita em `licencas`, e essa ausência é a decisão inteira
do ADR-P02: licença que o cliente edita não é licença. Quem escreve ali é o
webhook do Lemon Squeezy e o console, com a chave de serviço — que nunca chega
perto do produto instalado.
