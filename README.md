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
npm install     # só ajv, para validar os schemas
npm test        # 36 testes de contrato
npm run validar # relatório do estado dos contratos e do acervo
```

## Três coisas que não são negociáveis
1. **Latência abaixo de 1000ms** do presente até a animação (`CLAUDE.md`).
2. **`fs` só existe em `bridge/src/repos/`** (ADR-003).
3. **O valor do presente sugere, o streamer decide** (ADR-007).

## Estado
Fundação documentada e **Bloco 0 concluído**: os contratos existem, estão
validados e são testáveis sem live e sem Roblox. Zero código de produto.

Os blocos 1 (`bridge/`), 2 (`game/`) e 3 (`panel/`) dependiam só destes
contratos e agora podem ser construídos em paralelo, com dono exclusivo por
diretório. Ver `docs/09_BACKLOG/`.

Duas coisas ficam bloqueadas até alguém agir fora do código:
1. **Nenhum mapa pode ir ao ar** enquanto o acervo não for enviado e aprovado no
   Roblox. `npm run validar` mostra o que falta.
2. **As fixtures de payload cru da TikTok não estão verificadas** contra a
   versão instalada do conector. Ver `memory/learnings.md`.
