# Ledger do ciclo — Kora Stream Games

Uma seção por rodada, mais recente no topo.

**Branch de trabalho:** `claude/camada-de-produto-e-fase-0`, criada e enviada em
2026-09-09 a pedido do dono. Ela carrega as três rodadas do ciclo mais os três
commits do dono que também estavam sem push — a `claude/monta-b1h5fy` remota
estava parada em `8b12de9`. Nada foi enviado para a branch padrão.

## Continuação da rodada 6 — a suíte e os erros da ponte — 2026-09-09
- Sem spec próprio: fechou a pendência da rodada 6 e o item que a rodada 1
  registrou como próximo.
- **A suíte instável foi diagnosticada e corrigida.** Ver a rodada 6 abaixo.
- **Erro da ponte agora traduz**: 25 códigos de frase fixa em PT, ES e EN, sem
  mudança de contrato — a ponte já mandava o código. Os 26 que carregam valor na
  frase continuam em português, com teste mantendo a lista para que seja decisão
  registrada e não esquecimento.
- Commit: `ed61452` na branch `claude/camada-de-produto-e-fase-0`
- Números: 510 testes verdes em três execuções seguidas
- Pendente de decisão: continuam abertas o **ADR-P06** (bloqueia vender), a
  dessincronia `assetId`×`faces.ft` (rodada 4), e agora **traduzir os 26 erros
  com valor na frase**, que exige a ponte mandar `detalhe` estruturado.
- Próximo item recomendado: **a sessão no Studio**, sem mudança. Não sobra item
  de código na Fase 0.

## Rodada 6 — F0-3, painel e ponte juntos — 2026-09-09
- Spec: `specs/f0-3-painel-e-ponte-juntos.md`
- Resultado da review: **aprovado sem ressalvas** — 9 de 9, com evidência de
  tela e não de raciocínio sobre o código
- **Rodada contra a minha própria recomendação.** O ledger da rodada 5 mandava
  parar; conferir mostrou que F0-3 é bloqueador da Fase 0 e precisa de
  navegador, não do Studio.
- **BUG-008 achado e corrigido**, com teste de regressão verificado revertendo o
  arquivo. Os 504 testes passavam — todos estáticos, nenhum renderiza.
- Aprendido: `memory/learnings.md` e `memory/bugs.md`
- Commit: `9320a5f` na branch `claude/camada-de-produto-e-fase-0`
- Números: 505 testes verdes
- **Pendência RESOLVIDA na mesma sessão** (commit `ed61452`). A suíte instável
  tinha nome: `ponta-a-ponta.test.mjs` rodava o laço numa janela de 2600ms
  contra um combate de 2000ms, e ao falhar deixava a sessão aberta — um defeito
  virava três. Janela alargada e `afterEach` fechando a sessão, verificado
  quebrando um assert de propósito (1 falha em vez de 3). E o motivo de eu não
  ter conseguido identificar antes: meu `grep` dos marcadores do node:test
  nunca casou, porque são multibyte.
- Próximo item recomendado: **a sessão no Studio** — F0-2, F0-7 e F0-4, com o
  roteiro em `docs/09_BACKLOG/roteiro-da-sessao-no-studio.md`. Agora sim não
  sobra item de código na Fase 0: F0-1 e F0-3 estão feitos, e F0-5 e F0-6
  acontecem dentro da mesma sessão.

## Rodada 5 — F0-2, a vistoria antes do Studio — 2026-09-09
- Spec: `specs/f0-2-vistoria-antes-do-studio.md`
- Resultado da review: **aprovado sem ressalvas** — 9 de 9, depois de a review
  corrigir uma classificação minha que contrariava o próprio spec (ponte como
  impedimento em vez de aviso) e um assert que perseguia palavra em vez de
  comportamento, pela terceira rodada seguida
- **Nada impede a sessão.** Studio e Rojo instalados, o place monta (62
  instâncias), acervo e mapa prontos. Verificado antes de propor qualquer coisa.
- Aprendido: `memory/learnings.md`
- Commit: `a4168c7` na branch `claude/camada-de-produto-e-fase-0`
- Números: 504 testes verdes (eram 493)
- **Achado da própria vistoria:** a ponte no ar nesta máquina é anterior à
  rodada 2 e responde 404 em `/jogo/sonda`. Um `npm run ponte` resolve.
- Pendente de decisão: nenhuma nova. Continuam abertas o ADR-P06 (bloqueia
  vender) e a dessincronia `assetId`×`faces.ft` (rodada 4).
- Próximo item recomendado: **nenhum item de código.** As três perguntas que
  sobram da Fase 0 — F0-2, F0-7 e F0-4 — são a mesma sessão no Studio, e o
  roteiro está pronto em `docs/09_BACKLOG/roteiro-da-sessao-no-studio.md`.
  Insistir em rodada de código antes disso é construir sobre o que não foi
  medido.

## Rodada 4 — F0-1, o acervo — 2026-09-09
- Spec: `specs/f0-1-acervo-ja-esta-pronto.md`
- Resultado da review: **aprovado sem ressalvas** — 8 de 8 critérios, depois de
  a review derrubar DOIS testes meus (um flake por estado compartilhado, um
  invariante que o sistema não garante)
- **O item já estava feito.** 10 skybox e 10 texturas aprovados, 6 faces cada,
  mapa real com `pode: true`. Estava listado como bloqueador duro, e as rodadas
  1 a 3 planejaram em cima dele.
- Aprendido: `memory/learnings.md`; achado em aberto em `memory/decisions.md`
- Commit: `ef7880e` na branch `claude/camada-de-produto-e-fase-0`
- Números: 493 testes verdes em duas execuções seguidas
- Pendente de decisão: o painel pode dessincronizar `assetId` de `faces.ft` num
  skybox. Não acontece hoje; três saídas registradas em `memory/decisions.md`.
- Próximo item recomendado: **`F0-2`, rodar dentro do Roblox Studio pela
  primeira vez** — é o bloqueador duro que sobrou, e é a mesma sessão que
  responde o F0-7 e o F0-4. Todo o resto da Fase 0 depende dele.

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
- Commit: `9cc91ed`, enviado em `claude/camada-de-produto-e-fase-0`
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
- Commit: `3fb0191`, enviado em `claude/camada-de-produto-e-fase-0`
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
- Commit: `cb165f5`, enviado em `claude/camada-de-produto-e-fase-0`
- Números: 627 chaves × 3 idiomas, 35 arquivos retrofitados, 465 testes verdes
  (eram 451), 3 gates verdes
- Pendente de decisão: **ADR-P06** continua Proposto e bloqueia vender. Não
  bloqueia código.
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
