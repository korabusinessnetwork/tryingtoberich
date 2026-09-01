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
npm test         # 141 testes
npm run validar  # relatório do estado dos contratos e do acervo
npm run luau     # gate de sintaxe do jogo, sem abrir o Studio
npm run gerar    # gera o índice de animações e os tokens visuais

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
**Blocos 0, 1 e 2 concluídos.** Os contratos existem, a ponte funciona ponta a
ponta e o jogo está escrito: long-poll em Luau, movimento híbrido com watchdog,
rastreio de plataforma por colisão, construtor de mapa que se recusa a entregar
torre intransponível, as 20 animações, vestiário, HUD vertical e câmera.

Falta o **Bloco 3** (`panel/`, React + Vite). Ele consome só os contratos e a
API local da ponte. Ver `docs/09_BACKLOG/`.

O Bloco 2 foi construído por 9 agentes em paralelo, com dono exclusivo por
arquivo. O relatório da síntese, com os defeitos que a validação achou, está em
`docs/09_BACKLOG/validacao-bloco-2.md`.

Quatro coisas dependem de alguém agir fora do código:
1. **Nada disto rodou dentro do Roblox ainda.** `npm run luau` prova que os 39
   arquivos compilam; não prova que a torre sobe nem que o HUD lê no celular.
   A primeira sessão no Studio é a validação de verdade.
2. **Nenhum mapa pode ir ao ar** enquanto o acervo não for enviado e aprovado no
   Roblox. `npm run validar` mostra o que falta.
3. **Testar se o HttpService do Studio alcança `127.0.0.1`.** Se alcançar, o
   túnel some — e com ele a única exposição do sistema à internet e um terço do
   orçamento de latência. Ver a questão em aberto no ADR-002.
4. **Confirmar numa live real** que o payload da TikTok vem preenchido como o
   tipo da biblioteca promete. Ver `memory/learnings.md`.
