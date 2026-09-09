# ADR-P02 — Supabase como fonte da verdade de contas, licenças e telemetria

**Status**: Aceito · **Data**: 2026-09-09 · **Decisores**: Matheus Bonato
**Complementa**: ADR-003 (não revoga)

---

## Contexto

O ADR-003 escolheu JSON em disco atrás de uma camada de repositório, e escreveu
a razão de existir dessa camada: *"trocar JSON por banco é reescrever
`bridge/src/repos/` e nada mais."* Este ADR é a hora marcada ali.

O plano de produto pede assinantes, licença validada no start, faturamento por
webhook, log de ação administrativa imutável e saúde de conexão. Nada disso
cabe em arquivo na máquina de um cliente: o dado é da Kora, não do streamer, e
precisa ser lido de um lugar que o cliente não pode editar.

### A contradição do plano, resolvida aqui

O plano diz as duas coisas:

- Seção 5.1: *"Banco deixa de ser opcional."*
- Seção 8, fora de escopo: *"Banco de dados, enquanto JSON local resolver."*

Não é contradição de verdade, é falta de sujeito. **São dois dados diferentes,
com dois donos diferentes.** A resolução é a linha abaixo.

---

## Decisão

**Supabase, tier gratuito, como fonte da verdade do que é da Kora. JSON em
disco continua sendo a fonte da verdade do que é do streamer.**

| Dado | Onde vive | Dono | Por quê |
|---|---|---|---|
| Conta, licença, plano, idioma | Supabase | Kora | O cliente não pode poder editar a própria licença |
| Telemetria, log de evento, log administrativo | Supabase | Kora | Agregado entre clientes; só serve junto |
| Saúde de conexão | Supabase | Kora | É o alarme de quando o TikTok quebra |
| Espelho de faturamento | Supabase | Lemon Squeezy | Chega por webhook. O console lê e comanda, **não é a fonte da verdade do dinheiro** |
| Preset, mapa, look, acervo | JSON em disco | Streamer | É configuração dele, e o valor "sem lock-in" da `identity.md` diz que é arquivo dele, exportável |
| Estado da partida em execução | JSON em disco / memória | Streamer | Caminho crítico. Ver a regra de latência abaixo |

O `streamerId` que o ADR-003 mandou carregar em todo modelo persistido, hoje
sempre `"local"`, **passa a ser a chave real de tenant** e a coluna de toda
policy de RLS. Foi exatamente para isto que ele foi escrito antes de servir.

---

## A regra que não pode ser quebrada

O princípio nº 1 do `CLAUDE.md` manda, e ele vale acima deste ADR:

> **Nenhuma chamada ao Supabase entra no caminho crítico do evento de presente.**

Concretamente:

- **Licença é validada no start da sessão**, uma vez, e fica em memória pelo
  resto da live. Presente chegando nunca consulta banco.
- **Telemetria e log são fire-and-forget**, como já são os logs de atividade.
  Falha de rede na telemetria não pode derrubar nem atrasar uma live.
- **Queda do Supabase no meio da live não encerra a sessão.** A licença já foi
  validada; a live continua e a telemetria acumula para enviar depois.

Isto é testável e deve virar teste: nenhuma chamada ao cliente Supabase pode
aparecer no caminho que vai do evento normalizado ao long-poll.

---

## Custo

Levantado em 2026-09-09, e o motivo de o ADR poder ser aceito sem decisão de
gasto (regra de custo do `CLAUDE.md`):

| Plano | Preço | Limites | Serve para |
|---|---|---|---|
| **Free** | **US$ 0** | 500 MB de banco, 50.000 MAU, 5 GB de egress, 2 projetos | A Fase 1 inteira e muito além dela. 90 assinantes não chegam perto de nenhum teto |
| Pro | US$ 25/mês | 8 GB, 100.000 MAU, 250 GB de egress, sem pausa | Só quando estourar |

**Gatilho de upgrade, explícito:** passar de 500 MB de banco **ou** de 5 GB de
egress mensal. Nada além disso justifica pagar.

Uma ressalva do tier gratuito: o projeto **pausa após 1 semana de inatividade**.
Não é risco aqui — validação de licença e telemetria batem no banco todo dia em
que alguém der live. Se a base ficar uma semana inteira sem nenhuma live, o
projeto pausado é o menor dos problemas.

---

## Alternativas consideradas

### 1. Continuar só com JSON em disco
- **Prós**: zero dependência, zero conta, é o que já funciona.
- **Descartado porque**: licença guardada na máquina do cliente é licença que o
  cliente edita. E telemetria só existe agregada — arquivo por máquina não
  agrega.

### 2. Banco próprio (Postgres gerenciado, Neon, Turso)
- **Prós**: menos lock-in que Supabase.
- **Descartado porque**: Supabase é o padrão da casa na Kora, o RLS resolve
  multi-tenant sem código de autorização à mão, e o tier gratuito cobre a fase.
  O schema é Postgres puro e exportável, que é a mitigação de lock-in de sempre.

### 3. Faturamento como tabela própria
- **Descartado porque**: com Lemon Squeezy como merchant of record, o dinheiro
  é dado deles. Tratar a nossa cópia como fonte da verdade cria divergência
  silenciosa. Espelho por webhook, e a alteração de plano é chamada na API
  deles — nunca `UPDATE` local.

---

## Consequências

### Positivas
- Licença deixa de ser falsificável pelo cliente.
- Telemetria e saúde de conexão passam a existir. Sem elas o console v1 do
  ADR-P05 não tem o que mostrar.
- O `streamerId` finalmente significa alguma coisa, e o produto vira
  multi-tenant sem reescrever modelo.
- Custo fixo continua US$ 0.

### Negativas / trade-offs
- **Primeira dependência de rede da Kora numa ferramenta que era offline.** É
  contida pela regra de caminho crítico acima, e o start da sessão passa a ter
  um ponto de falha novo que precisa de mensagem de erro decente.
- **Uma conta e uma chave a mais** para configurar. A chave é de serviço e vive
  só no processo Node, nunca no painel — mesma regra da chave do Gemini
  (`CLAUDE.md`, segurança).
- **`bridge/src/repos/` cresce**: passa a ter repositórios de dois substratos.
  A regra de que `fs` só aparece ali continua, e ganha irmã: cliente Supabase
  também só aparece ali.
- LGPD e retenção: telemetria **não** pode carregar identificador persistente
  de espectador. A regra do `CLAUDE.md` — evento guarda tipo de presente e
  valor, não a pessoa — passa a valer para uma tabela remota, onde errar é bem
  mais caro. Ver `docs/11_SEGURANCA`.

---

## Referências
- [ADR-003](./adr-003-json-em-disco.md) — a decisão que este complementa
- [ADR-P05](./adr-p05-console-do-operador.md) — quem consome esta telemetria
- [Supabase Pricing](https://supabase.com/pricing) — conferido em 2026-09-09
- `memory/restrictions.md` — os gatilhos de upgrade registrados
