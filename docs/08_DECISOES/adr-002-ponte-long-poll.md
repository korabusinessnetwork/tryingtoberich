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

## Notas de implementação
- Ligar HttpService em Game Settings → Security.
- O laço no Luau precisa de `pcall` e backoff. Erro de rede não pode matar o loop.
- A ponte precisa limpar long-polls órfãos, senão vaza conexão numa live longa.
