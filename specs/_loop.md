# Ledger do ciclo — Kora Stream Games

Uma seção por rodada, mais recente no topo.

## Rodada 3 — F0-4, o teto do long-poll — 2026-09-09
- Spec: `specs/f0-4-teto-do-long-poll.md`
- Resultado da review: **aprovado sem ressalvas** — 12 de 12 critérios, e a
  review recusou a "limitação aceita" que o spec tinha escrito (túnel pendurado
  lido como teto para sempre). Fechada com `pareceTetoDoRoblox`.
- **O item era um bug, não uma medição.** BUG-007 em `memory/bugs.md`: volta
  ociosa cortada pelo Roblox virava erro, o backoff dobrava até 30s, e o
  presente seguinte esperava por ele — trinta vezes o orçamento do princípio
  nº 1, e só com a live quieta.
- Aprendido: `memory/learnings.md` e `memory/bugs.md`
- Commit: `9cc91ed` na branch `claude/monta-b1h5fy` — **sem push** (mesma
  pendência das rodadas 1 e 2)
- Números: 489 testes verdes (eram 478)
- **Pendente de decisão:** a medição continua sendo do dono, mas ficou barata —
  numa live normal o Output do Studio traz UMA vez o teto observado. Se o aviso
  não aparecer numa live inteira, a resposta é que o Roblox aguenta os 20s.
- Próximo item recomendado: **`F0-1`, montar o acervo no Roblox** — é o único
  bloqueador DURO que resta e não tem como ser contornado por código: enquanto
  os assetId estiverem `pendente-upload`, nenhum mapa vai ao ar e não existe
  live nenhuma.

## Rodada 2 — F0-7, a sonda de localhost — 2026-09-09
- Spec: `specs/f0-7-sonda-de-localhost.md`
- Resultado da review: **aprovado sem ressalvas** — 13 de 13 critérios, com um
  desvio anotado no próprio spec (a rota devolve `{ ok, porta }`, sem `versao`)
- Aprendido: `memory/learnings.md`
- Commit: `3fb0191` na branch `claude/monta-b1h5fy` — **sem push** (mesma
  pendência da rodada 1)
- Números: 478 testes verdes (eram 465), 55 arquivos Luau no gate (eram 54)
- **Pendente de decisão — e é o ponto da rodada:** a medição em si exige o
  Roblox Studio e é do dono. Rode `npm run sondar`, cole o Luau na barra de
  comandos do Studio, e registre o resultado em `memory/learnings.md` e no item
  F0-7. **Enquanto isso não acontecer, o ADR-002 continua em aberto e o túnel
  continua obrigatório.**
- Próximo item recomendado: **`F0-4`, confirmar o teto de 20s do long-poll** —
  15 minutos, mesma sessão de Studio do F0-7, e é o teste mais barato da Fase 0
  em relação ao estrago que evita (long-poll morrendo antes do timeout faz o
  presente atrasar ou sumir no meio da live).

## Rodada 1 — i18n por chave (ADR-P03) — 2026-09-09
- Spec: `specs/i18n-por-chave.md`
- Resultado da review: **aprovado sem ressalvas**, depois de o próprio review
  fechar o critério 13, que o build tinha deixado passar (locale cravado)
- Aprendido: `memory/learnings.md` e `memory/patterns.md`
- Commit: `cb165f5` na branch `claude/monta-b1h5fy` — **sem push** (ver pendência)
- Números: 627 chaves × 3 idiomas, 35 arquivos retrofitados, 465 testes verdes
  (eram 451), 3 gates verdes
- Pendente de decisão:
  1. **Push.** A branch de trabalho é a branch padrão do repositório, e tanto o
     `/ciclo` quanto o harness proíbem push na padrão. Decidir: abrir branch de
     trabalho para esta rodada, ou autorizar o push na `claude/monta-b1h5fy`.
  2. **ADR-P06** continua Proposto e bloqueia vender. Não bloqueia código.
- Próximo item recomendado: **`F0-7`, testar se o `HttpService` do Studio
  alcança `127.0.0.1`** — cinco minutos, e é o que decide se o Cloudflare Tunnel
  sai do produto (ADR-P04). Melhor relação custo/benefício aberta no projeto.

### O que ficou aberto dentro do escopo
- **O teto de 8 caracteres do HUD não morde hoje.** O teste existe e olha
  `hud.giftLabel.*`, e nenhuma chave nasceu com esse prefixo — o rótulo de
  presente é montado com o nome que vem da TikTok, não com chave. O teste está
  certo e guarda o dia em que existir; hoje ele não protege nada. Registrado
  para não parecer cobertura que não há.
- **`hud.overlay.pageTitle` em espanhol tem 22 caracteres contra 18 do PT.** É
  o `<title>` do documento, não desenha nada na tela do espectador. A agente
  reportou; aceito.
- **Mensagem de erro que a PONTE gera** continua sem tradução, por escolha do
  spec: traduzi-la exige a ponte devolver código em vez de frase, que é mudança
  de contrato e merece rodada própria.
