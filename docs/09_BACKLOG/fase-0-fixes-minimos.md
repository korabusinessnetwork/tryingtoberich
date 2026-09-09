# Fase 0 — os fixes mínimos da escalada

Ação 4 do plano de produto. A regra de corte é uma só, e é do próprio plano:

> **Só entra aqui o que impede rodar uma live inteira sem travar.**
> Os fixes da escalada servem às 5 lives de prova da Fase 0. Nada além disso.

Tudo que é acabamento, conveniência ou feature nova fica fora, mesmo sendo boa
ideia. A lista está ordenada: os primeiros são pré-requisito dos seguintes.

**Estado da base em 2026-09-09:** 451 testes verdes, 6 bugs conhecidos todos
corrigidos, Blocos 0 a 3b concluídos. O que falta **não é código quebrado** — é
que quase nada disto jamais rodou fora do teste. Essa é a natureza desta lista.

---

## Bloqueadores duros

Sem estes, não existe live nenhuma.

### F0-1 · Montar o acervo de verdade no Roblox
**Por que bloqueia:** enquanto os `assetId` de `data/acervo.json` estiverem
`pendente-upload`, **nenhum mapa pode ir ao ar** (ADR-004). Não há como rodar
uma live sem mapa.
**O que é:** subir as imagens (6 skybox, 6 texturas, 5 props), esperar a
moderação da Roblox, preencher `assetId` e mudar `status` para `aprovado`. A
tela do acervo no painel já existe para isso, e o schema recusa o arquivo
inteiro se um id cair no item errado.
**Quem faz:** dono. É moderação de plataforma, não código.
**Estimativa:** uma tarde, mais o tempo da fila de moderação.

### F0-2 · Rodar dentro do Roblox Studio, pela primeira vez
**Por que bloqueia:** o gate `npm run luau` prova que os 53 arquivos compilam.
Não prova que a torre sobe, que o Tween pousa em cima da plataforma, que o
rastreio de `plataformaReferencia` pega a colisão certa, nem que o HUD lê num
celular. **Todo o Bloco 2 e o 3b são, hoje, código que nunca executou.**
**O que é:** abrir o place, apertar Play, subir a torre, disparar presente pelo
testador do painel e olhar.
**Estimativa:** meio dia, e é aqui que vão aparecer os bugs reais da Fase 0.

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
