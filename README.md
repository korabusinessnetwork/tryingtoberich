# Kora Stream Games

Motor de jogos interativos para TikTok LIVE. O streamer joga, os espectadores
mandam presentes, e cada presente dispara uma ação no jogo em tempo real.
Fase 1 entrega uma modalidade: **Escalada**.

Projeto da Kora Business Network. Fundação no padrão `fundacao-de-projeto`.

## Por onde começar
1. **`CLAUDE.md`** — a constituição. Princípio nº1 é latência. Leia primeiro.
2. **`docs/00_VISAO/`** — o que é e o que está fora de escopo.
3. **`docs/01_ARQUITETURA/`** — os três processos e o caminho crítico.
4. **`docs/08_DECISOES/`** — os 7 ADRs. ADR-001, 002 e 004 explicam as
   restrições que moldam tudo.
5. **`docs/09_BACKLOG/`** — a ordem de construção.

## Estrutura
```
bridge/   Node.js: live, ponte long-poll, repositórios, Gemini
panel/    React + Vite: painel local do streamer
game/     Roblox / Luau: jogo, animações, HUD
data/     JSON em disco (ADR-003): schemas, acervo, exemplos, fixtures
docs/     00→11, document-first
memory/   identidade, decisões, padrões, aprendizados, restrições, bugs
scripts/  validação dos contratos
test/     testes dos contratos (npm test)
```

## Rodar
```
npm install      # instala a raiz e o workspace bridge/
npm test         # 190 testes
npm run validar  # relatório do estado dos contratos e do acervo
npm run luau     # gate de sintaxe do jogo, sem abrir o Studio
npm run gerar    # gera o índice de animações e os tokens visuais
npm run painel:gate  # gate estrutural do painel: compila os 11 componentes
npm run painel       # abre o painel em http://127.0.0.1:5173

cp .env.example .env   # e preencha BRIDGE_TOKEN
npm run semear         # instala o preset de exemplo em data/presets/
npm run ponte -- --cenario=04-combate-de-presentes --preset=escalada-padrao
```
O último comando sobe a ponte inteira tocando um cenário de fixture em loop,
**sem live e sem Roblox**. É assim que se desenvolve o painel e o jogo.

## Três coisas que não são negociáveis
1. **Latência abaixo de 1000ms** do presente até a animação (`CLAUDE.md`).
2. **`fs` só existe em `bridge/src/repos/`** (ADR-003).
3. **O valor do presente sugere, o streamer decide** (ADR-007).

## Estado
**Blocos 0, 1, 2 e 3 concluídos.** Os três processos existem: os contratos, a
ponte, o jogo e o painel.

Falta o **Bloco 4 — Validação**, que é onde este projeto encontra a realidade:
abrir no Studio, abrir no navegador, medir a latência de verdade e fazer uma
live de teste. Ver `docs/09_BACKLOG/`.

Os blocos 2 e 3 foram construídos por 15 agentes em paralelo, com dono
exclusivo por arquivo. Os relatórios de síntese, com os defeitos que a
validação achou em cada um, estão em `docs/09_BACKLOG/validacao-bloco-2.md` e
`validacao-bloco-3.md`.

Quatro coisas dependem de alguém agir fora do código:
1. **Nada disto rodou de verdade ainda.** `npm run luau` prova que os 39
   arquivos Luau compilam e `npm run painel:gate` que os 11 componentes
   compõem; nenhum dos dois prova que a torre sobe, que o HUD lê no celular ou
   que o painel é legível em 2 segundos. Abrir o Studio e o navegador é a
   validação que falta.
2. **Nenhum mapa pode ir ao ar** enquanto o acervo não for enviado e aprovado no
   Roblox. `npm run validar` mostra o que falta.
3. **Testar se o HttpService do Studio alcança `127.0.0.1`.** Se alcançar, o
   túnel some — e com ele a única exposição do sistema à internet e um terço do
   orçamento de latência. Ver a questão em aberto no ADR-002.
4. **Confirmar numa live real** que o payload da TikTok vem preenchido como o
   tipo da biblioteca promete. Ver `memory/learnings.md`.
