# Fase 0 — os fixes mínimos da escalada

Ação 4 do plano de produto. A regra de corte é uma só, e é do próprio plano:

> **Só entra aqui o que impede rodar uma live inteira sem travar.**
> Os fixes da escalada servem às 5 lives de prova da Fase 0. Nada além disso.

Tudo que é acabamento, conveniência ou feature nova fica fora, mesmo sendo boa
ideia. A lista está ordenada: os primeiros são pré-requisito dos seguintes.

**Estado da base em 2026-09-09, depois de quatro rodadas do ciclo:** 494 testes
verdes, 7 bugs conhecidos todos corrigidos, Blocos 0 a 3b concluídos, acervo
montado e aprovado. O que falta **não é código quebrado** — é que quase nada
disto jamais rodou fora do teste. Essa é a natureza desta lista.

---

## Bloqueadores duros

Sem estes, não existe live nenhuma. **Sobraram dois**: o F0-1 foi verificado e
está feito, e os dois que restam são a mesma coisa — nunca ninguém abriu o
Studio nem o navegador.

### F0-1 · Montar o acervo de verdade no Roblox — **FEITO**
**Verificado em 2026-09-09** (rodada 4 do ciclo, `specs/f0-1-acervo-ja-esta-pronto.md`):

- **10 skybox**, todos `aprovado`, com `assetId` e as 6 faces preenchidas
- **10 texturas**, todas `aprovado`, com `assetId`
- **5 props** nativos — efeitos do Roblox, nunca precisaram de moderação
- nenhum `pendente-upload`, nenhuma face faltando, nenhum `assetId` repetido
- o mapa real salvo, `mundo-montado`, responde `pode: true`

O dono subiu e aprovou tudo em algum momento, e **este item ficou aqui listado
como bloqueador duro depois de já estar resolvido** — a ponto de as rodadas 1 a
3 planejarem em cima de um bloqueio que não existia.

Confira sozinho, em um comando:

```bash
npm run validar
```

Ele agora relata a prontidão do acervo e de **todos** os mapas salvos, não só a
do exemplo. Era essa ausência que deixava a verdade escondida atrás de leitura
manual de JSON.

**Achado que sobrou desta verificação, e não bloqueia nada hoje:** o painel pode
dessincronizar o `assetId` de um skybox das suas `faces.ft` — a rota de edição
grava um e não toca no outro. Não está acontecendo (os 10 estão coerentes), e a
correção é mudança de comportamento com três saídas possíveis. Registrado em
`memory/decisions.md` para uma rodada própria.

### F0-2 · Rodar dentro do Roblox Studio, pela primeira vez
**Por que bloqueia:** o gate `npm run luau` prova que os 53 arquivos compilam.
Não prova que a torre sobe, que o Tween pousa em cima da plataforma, que o
rastreio de `plataformaReferencia` pega a colisão certa, nem que o HUD lê num
celular. **Todo o Bloco 2 e o 3b são, hoje, código que nunca executou.**
**O que é:** abrir o place, apertar Play, subir a torre, disparar presente pelo
testador do painel e olhar.
**Estimativa:** meio dia, e é aqui que vão aparecer os bugs reais da Fase 0.

**Verificado em 2026-09-09** (rodada 5) que nada impede a sessão: Studio e Rojo
instalados, e o place **monta** — `rojo build` produz 62 instâncias. Antes de
sentar:

```bash
npm run vistoria
```

Ela confere ambiente, place, ponte e acervo, e nomeia o que falta com o comando
que resolve. E o **roteiro** resolve F0-2, F0-7 e F0-4 numa sentada só:
[`roteiro-da-sessao-no-studio.md`](./roteiro-da-sessao-no-studio.md).

### F0-3 · Subir painel e ponte juntos, no navegador
**Por que bloqueia:** a camada de serviços do painel é testada com `fetch`
substituído. **Os dois processos nunca se falaram de verdade.** Se o contrato
estiver torto, a live não começa.
**O que é:** `npm run dev`, abrir o painel, montar um preset, dar start, ver o
SSE chegar.
**Estimativa:** uma hora, se nada estiver errado.

---

## Riscos de travar no meio da live

Estes não impedem começar. Impedem **terminar**, que é pior — quebra na frente
da plateia.

### F0-4 · Confirmar o teto de 20s do long-poll
**Por que trava:** `longpollTimeoutMs` é 20.000 em `bridge/src/config.mjs`, e o
ADR-002 chama esse número de chute inicial. **Se o Roblox derrubar a conexão
antes dos 20s, cada volta do laço vira um erro**, o backoff do lado Luau começa
a crescer, e os presentes atrasam ou somem no meio da live.
**O que é:** deixar o laço rodando 10 minutos sem evento nenhum e olhar se as
voltas fecham limpas em 20s ou morrem antes.
**Estimativa:** 15 minutos, e é o teste mais barato desta lista em relação ao
estrago que evita.

**O estrago já foi consertado** (rodada 3 do ciclo,
`specs/f0-4-teto-do-long-poll.md`). Até 2026-09-09 a volta ociosa cortada pelo
Roblox era tratada como ERRO: o backoff dobrava até **30 segundos**, e o
presente seguinte esperava por ele — trinta vezes o orçamento inteiro do
princípio nº 1, e só com a live quieta, que é quando ninguém olha o painel.

Agora o jogo classifica esse corte como teto, não como erro, e passa a pedir um
teto menor à ponte para as voltas voltarem a fechar em `204` limpo.

**Você não precisa mais de uma sessão de teste dedicada.** Numa live normal, se
o Roblox cortar antes, o Output do Studio traz UMA vez:

> `[Ponte] F0-4: o Roblox fecha o long-poll em ~Xs, antes dos 20s da ponte.`

Esse `X` é a resposta. Anote em `memory/learnings.md` e aqui. Se o aviso **não**
aparecer numa live inteira, a resposta é que o Roblox aguenta os 20s e o chute
inicial do ADR-002 estava certo — registre isso também.

### F0-5 · Vitória e reinício, no Studio
**Por que trava:** a regra R6 existe em três processos — o jogo detecta por
colisão, o HUD mostra o selo "TOPO", o painel decide e a ordem volta pelo
long-poll (ADR-013) — e **nunca rodou junta**. Se o reinício não devolver o
boneco ao pé da torre, a live acaba ali: o streamer fica preso no topo, sem
partida, ao vivo.
**O que é:** vencer a torre no Studio e clicar reiniciar no painel.
**Estimativa:** 30 minutos, depende de F0-2.

### F0-6 · Uma corrida longa sem intervenção
**Por que trava:** rate limit, vazamento de memória, laço de long-poll órfão e
watchdog de restauração de movimento só aparecem no tempo. O BUG-002 — o rate
limit da ponte derrubando o próprio jogo — foi exatamente esse tipo de coisa, e
só apareceu quando alguém insistiu.
**O que é:** 30 minutos de jogo com presente de fixture chegando sem parar,
olhando o log da ponte.
**Estimativa:** 30 minutos de relógio, e é o ensaio geral.

---

## Medições que decidem coisa

Não são fixes. São os números que fecham (ou reabrem) decisões já tomadas, e por
isso pertencem à Fase 0.

### F0-7 · O `HttpService` do Studio alcança `127.0.0.1`?
**O que decide:** se sim, **o Cloudflare Tunnel some do produto**. Vai junto a
única exposição do sistema à internet, o passo mais frágil do futuro instalador
(ADR-P04) e cerca de um terço do orçamento de latência. Está aberto desde o
Bloco 1 e agora vale para todo cliente, não só para o dono.
**Estimativa:** cinco minutos. Melhor relação custo/benefício do projeto inteiro.

**A sonda está pronta** (rodada 2 do ciclo, `specs/f0-7-sonda-de-localhost.md`).
O procedimento inteiro:

```bash
npm run sondar
```

Ele confere a ponte desta máquina primeiro — sem isso, o teste no Studio falha
por um motivo que não é o da pergunta e a resposta sai errada — e imprime a
sonda Luau já com a porta certa. Cole o que ele imprimir na **barra de comandos
do Studio** (View → Command Bar) e leia o Output.

A sonda separa as quatro causas que se parecem: `HttpService` desligado, ponte
fora do ar, token errado, e Studio realmente bloqueado. **Um `401` é resposta
POSITIVA** — para tomar 401 o pacote precisou chegar na ponte.

**Onde registrar a resposta, nos dois lugares:**
- `memory/learnings.md` — o resultado e o que ele decide
- este item, trocando o título por SIM ou NÃO

Se a resposta for SIM, o ADR-002 reabre para tirar o túnel do caminho, e o
ADR-P04 perde o passo mais frágil do instalador.

### F0-8 · Medir a latência ponta a ponta numa live real
**O que decide:** é a condição de reabertura do ADR-001 **e** do ADR-P01. Acima
de 1000ms de forma consistente, a decisão de motor volta à mesa. A ponte já mede
a própria fatia e manda no SSE; falta o pedaço do Roblox e uma live de verdade.
**Onde registrar:** `memory/learnings.md`.

---

## Antes de começar: decidir o que fazer com o trabalho em curso

Há trabalho não commitado na árvore — o **Estúdio de Overlay** (`EstudioDeOverlay`
no painel, `overlay-layout` na ponte, `torre.client.lua` no jogo) e a remoção de
`hud.client.lua`. Os 451 testes passam com ele dentro, mas ele **não está na
lista de bloqueadores acima**, o que quer dizer que a Fase 0 não precisa dele.

Decisão do dono, antes do F0-2: **terminar e commitar, ou guardar num branch.**
Entrar na Fase 0 com meia feature na árvore é o jeito mais fácil de não saber se
um bug da live veio da escalada ou do que estava pela metade.

---

## Explicitamente fora da Fase 0

Registrado para não voltar como "só faltou isso":

- **Som do `des_ancora`.** `SoundId` está vazio de propósito: som também é asset
  com moderação (ADR-004). Live roda sem som de presente.
- **Troca de preset ao vivo grava só o último preset no resumo.** O arquivo de
  sessão guarda um `presetId` e o schema não tem lugar para lista. A troca fica
  na linha `preset_trocado_ao_vivo` do log. Só incomoda depois da live, não
  durante.
- **Upload automático de asset gerado por IA.** Adiado no ADR-004, e continua.
- **Qualquer coisa de produto**: licença, Supabase, i18n, instalador, console.
  Tudo isso é Fase 1 e não pode encostar na Fase 0 — o plano é explícito de que
  a Fase 0 custa zero e não constrói produto.

---

## Portão de saída da Fase 0

Do plano, sem alteração:

> **Os presentes aumentam de forma visível nas lives com o jogo.** Se não
> aumentarem, o produto não tem argumento. Para e reavalia, não avança por
> teimosia.

O que precisa estar registrado para o portão ser julgável:

- Presentes por live, **antes e depois**, nas 5 lives.
- As 5 lives gravadas — os clipes são o material de venda da Fase 2.
- A latência medida do F0-8, em `memory/learnings.md`.
