# ADR-002 — Ponte por long-poll com túnel Cloudflare

**Status**: Aceito · **Data**: 2026-09-01 · **Decisores**: Matheus Bonato

## Contexto
Escolhido o Roblox (ADR-001), o jogo não pode receber conexão de entrada e não
enxerga `localhost` nem IP privado. O Node que escuta a live roda na máquina do
streamer. Precisamos entregar evento de presente ao jogo em menos de 300ms no
trecho ponte→jogo, sem estourar o teto de 500 requisições por minuto do
HttpService.

## Decisão
**Long-poll sobre HTTPS, exposto por Cloudflare Tunnel nomeado.**
O Roblox chama `GET /jogo/eventos` em laço. A ponte segura a resposta aberta por
até 20 segundos e responde no instante em que um evento casa com um slot.

## Alternativas consideradas
### Polling a cada 500ms
- Prós: trivial de implementar.
- Contras: 120 requisições por minuto em ociosidade, e ainda assim até 500ms de
  atraso médio somado ao resto do orçamento.
- Descartado porque: gasta cota e não resolve a latência.

### MessagingService do Roblox
- Descartado porque: é para comunicação entre servidores Roblox, não recebe nada
  de fora.

### ngrok em vez de Cloudflare Tunnel
- Descartado porque: no tier gratuito a URL muda a cada reinício, o que obrigaria
  a reeditar o Studio antes de cada live. O túnel nomeado da Cloudflare dá URL
  fixa, também gratuito.

## Consequências
### Positivas
- Latência do trecho cai para 100 a 300ms.
- Cerca de 3 requisições por minuto em ociosidade, 0,6% do teto.
- URL fixa, configurada uma vez no Studio.

### Negativas / trade-offs
- A ponte fica exposta na internet. Mitigado: só `/jogo/*` é publicado, com
  `X-Bridge-Token` obrigatório. As rotas do painel nunca saem do `localhost`.
- Depende do túnel estar de pé. Se cair, o jogo fica offline (fluxo F7).
- Timeout de 20s é chute inicial. Se o Roblox derrubar a conexão antes, ajustar.
  Registrar o valor real em `memory/learnings.md`.

## Questão em aberto — 2026-09-01: o túnel pode ser desnecessário

O `CLAUDE.md` diz que o jogo roda no **Roblox Studio**, experiência privada.
Este ADR inteiro existe por causa de uma frase de `memory/restrictions.md`: o
HttpService "não alcança `localhost` nem IP privado". Essa frase é verdadeira
para servidor Roblox publicado, que roda num datacenter. **Para o Studio, que
roda na mesma máquina que a ponte, ela não foi verificada.**

Se o HttpService do Studio alcançar `http://127.0.0.1:8787`, o túnel some, e com
ele:
- a única exposição deste sistema à internet;
- a etapa 4 do caminho crítico, hoje estimada em 50 a 200ms — ou seja, entre um
  terço e um quinto do orçamento inteiro do Princípio nº1;
- a dependência de o túnel estar de pé (fluxo F7).

O long-poll continua sendo o desenho certo de qualquer jeito: quem inicia a
conexão continua sendo o Roblox, e continua não existindo push de fora para
dentro. Muda só por onde a requisição passa.

**Como verificar — atualizado em 2026-09-09, a sonda existe:**

```bash
npm run sondar
```

O comando confere a ponte desta máquina, imprime a sonda Luau já com a porta
certa, e você cola na barra de comandos do Studio. Respondeu, o túnel é
opcional. Deu bloqueio de host, o túnel fica e este ADR continua valendo
inteiro. Ver `docs/09_BACKLOG/fase-0-fixes-minimos.md`, item F0-7, e
`specs/f0-7-sonda-de-localhost.md`.

A rota sondada é `GET /jogo/sonda` — **não** `/saude`, que esta seção sugeriu em
2026-09-01 e nunca chegou a existir. Ela vive dentro de `/jogo/*`, com token e
rate limit como todas as outras: rota aberta responderia a mesma pergunta e
abriria superfície de graça. E é por estar protegida que ela responde melhor —
**um `401` já prova o alcance**, porque para tomar 401 o pacote precisou chegar
aqui. Uma sonda que trate 401 como falha responde "não" a uma pergunta cuja
resposta foi "sim".

O código já funciona dos dois jeitos: a ponte só faz bind em `127.0.0.1`, e o
túnel, quando existe, é um encaminhador na frente. Nada muda em `bridge/`.

## Nota de 2026-09-09 — o chute de 20s tinha um custo escondido

Os 20 segundos continuam sendo chute até alguém medir. O que mudou é que **errar
o chute deixou de ser caro**.

Até esta data, se o Roblox fechasse o long-poll ocioso antes do teto da ponte, o
laço em `game/src/server/ponte.lua` tratava a volta como erro: `definirOnline(false)`
mais `task.wait(backoffAtual)`, com o backoff dobrando **até 30 segundos**. Numa
live quieta isso acontecia a cada volta, e o presente seguinte esperava o
backoff — trinta vezes o orçamento inteiro do princípio nº 1.

O conserto (rodada 3, `specs/f0-4-teto-do-long-poll.md`):

- falha depois de espera longa é classificada como **teto atingido**, sem
  backoff e sem virar offline;
- o jogo passa a pedir `GET /jogo/eventos?teto=<segundos>` abaixo do que
  observou, e as voltas ociosas voltam a fechar em `204` limpo;
- se, já tendo pedido teto menor, a conexão ainda morrer muito além do pedido,
  volta a ser erro de verdade — senão um túnel pendurado ficaria para sempre
  lido como "teto do Roblox", com o painel dizendo "Jogo online".

**Consequência para este ADR:** o valor de `longpollTimeoutMs` deixou de ser
crítico. Ele continua devendo ser medido (F0-4), mas o sistema agora se acomoda
sozinho a um teto menor, e o número aparece num aviso do Output durante uma live
normal, em vez de exigir sessão de teste.

## Notas de implementação
- Ligar HttpService em Game Settings → Security.
- O laço no Luau precisa de `pcall` e backoff. Erro de rede não pode matar o loop.
- A ponte precisa limpar long-polls órfãos, senão vaza conexão numa live longa.
