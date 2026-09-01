# 09 — Backlog

Ordem pensada para o Claude Code. Cada bloco é entregável e testável sozinho.
Os três diretórios (`bridge/`, `panel/`, `game/`) têm dono exclusivo e podem ser
construídos em paralelo depois do bloco 0.

## Bloco 0 — Contratos (bloqueante, faz primeiro, sequencial) — **concluído**
- [x] `data/schemas/*.schema.json` — 11 schemas: preset, mapa, look, acervo,
      catálogo, animação, sessão, evento normalizado, resposta de long-poll,
      estado do jogo e os tipos comuns
- [x] `data/acervo.json` com a estrutura do acervo — 6 skybox, 6 texturas e 5
      props, todos `pendente-upload` até serem enviados e aprovados (ADR-004)
- [x] `data/catalogo-presentes.seed.json` com a semente de desenvolvimento,
      marcada `confirmado: false` e cobrindo as cinco faixas
- [x] `.env.example`
- [x] Fixtures de evento da TikTok para teste sem estar ao vivo —
      `data/fixtures/`, com 4 payloads crus e 6 cenários de R4, R5 e F2
- [x] `npm test` valida os contratos: 36 testes, cada regra com o caso válido e
      o caso que ela tem que rejeitar

### Aberto pelo Bloco 0, para os blocos seguintes
- [ ] **Montar o acervo de verdade** (manual, véspera): subir e aprovar as
      imagens no Roblox, preencher `assetId` e mudar `status` para `aprovado`.
      Enquanto isso não acontecer, nenhum mapa pode ir ao ar.
- [x] ~~Conferir a forma do payload cru da TikTok~~ — feito no Bloco 1 contra a
      v2.4.4 instalada. Falta só confirmar numa live real que os campos vêm
      preenchidos como o tipo promete.
- [x] ~~Decidir a intensidade na coalescência~~ — resolvido pelo ADR-012:
      sobe um nível só quando a disputa é contestada.

## Bloco 1 — Ponte (`bridge/`) — **concluído**
- [x] Repositórios JSON com escrita atômica (temp + rename), único lugar com `fs`
- [x] Dois servidores Express em portas separadas: o do jogo (`/jogo/*`, com
      token e rate limit) é o único que o túnel publica; o do painel (`/api/*`)
      não existe naquela porta
- [x] Long-poll: registro, resposta no instante do evento, timeout de 20s,
      limpeza de órfão
- [x] Conector TikTok atrás da interface de evento normalizado, com a forma do
      payload conferida contra a v2.4.4, mais um conector de fixture para rodar
      sem live
- [x] Coleta e merge do catálogo de presentes
- [x] Casamento evento→slot, combo (R4) e combate (ADR-012)
- [x] SSE para o painel
- [x] Cliente Gemini com validação, checagem de jogabilidade e retentativa única
- [x] Cliente Roblox isolado: busca de item gratuito e cache de thumbnail (ADR-011)
- [x] Reconexão com backoff (F6) e detecção de jogo offline (F7)
- [x] 123 testes, incluindo um ponta a ponta que toca um cenário de fixture e
      confere o que sai pelo long-poll

### Aberto pelo Bloco 1
- [ ] **Testar se o HttpService do Studio alcança `127.0.0.1`.** Cinco minutos.
      Se alcançar, o túnel do ADR-002 vira opcional e some com ele a única
      exposição do sistema à internet e um terço do orçamento de latência.
      Ver a questão em aberto no ADR-002.
- [ ] **Medir a latência de verdade** numa live real e registrar em
      `memory/learnings.md`. A ponte já mede a própria fatia e manda no SSE.
- [ ] **Como o HUD mostra o combate** (ADR-012): disputa contestada e empate
      exato são estados novos que o espectador precisa entender na tela.
      Decisão de design do Bloco 2.

## Bloco 2 — Jogo (`game/`) — **concluído**
Construído por 9 agentes em paralelo, em três levas, com dono exclusivo por
arquivo. Relatório da síntese em `validacao-bloco-2.md`, neste diretório.

- [x] Laço de long-poll em Luau com `pcall` e backoff, mais um piso de 0,5s
      entre voltas sem evento, que segura o teto de 500 req/min do HttpService
- [x] Motor de movimento híbrido: física padrão, Tween na tomada de controle,
      watchdog independente de restauração (ADR-005, R11)
- [x] Rastreio de `plataformaReferencia` por colisão real (R9)
- [x] Detector de queda e respawn no checkpoint (R10, ADR-008)
- [x] Construtor de mapa a partir do spec, determinístico pelo mapaId
- [x] **Teste de jogabilidade do mapa:** percorre as plataformas construídas e
      confere que todo salto cabe no pulo, medindo o VÃO entre as bordas e não
      a distância entre centros (ADR-009)
- [x] Índice de animações e as 20 implementações
- [x] Aplicação do look por `HumanoidDescription`, com a cadeia de fallback de
      três degraus (ADR-010)
- [x] **Vestiário no jogo:** busca, equipar, prévia real, salvar look nomeado,
      trancado enquanto a sessão roda (ADR-011). Os dois lados.
- [x] Efeito permanente do personagem, suspenso durante animação de presente
- [x] HUD vertical, com os dois estados do combate na tela (ADR-012)
- [x] Câmera que acompanha e afasta em animação de peso 4 ou 5
- [x] `sessao.lua` amarrando tudo, e `inicio.server.lua` como entrada
- [x] Gate de sintaxe fora do Studio (`npm run luau`) e 141 testes

### Aberto pelo Bloco 2
- [ ] **Rodar dentro do Roblox Studio.** O gate prova que o Luau compila; não
      prova que a torre sobe, que o Tween pousa em cima da plataforma nem que o
      HUD lê no celular. É a validação que falta.
- [ ] **Conferir o teto de 20s do long-poll.** O ADR-002 chama o valor de chute
      inicial: se o Roblox derrubar a conexão antes, ajustar e registrar em
      `memory/learnings.md`.
- [ ] **Som:** `des_ancora` pede som de metal e o `SoundId` está vazio de
      propósito — som no Roblox também é asset com moderação (ADR-004).

## Bloco 3 — Painel (`panel/`)
- [ ] Seletor de modalidade e botão start/stop
- [ ] Editor de preset com os 6 slots
- [ ] Seletor de look: lista os looks salvos com a grade de ícones das peças
- [ ] Seletor de presente com busca, ícone oficial e cor por faixa
- [ ] Seletor de animação com filtro por direção e peso
- [ ] Aviso de vínculo fora da curva (não bloqueante)
- [ ] Gerador de mapa com pré-visualização do spec
- [ ] Monitor ao vivo: eventos, latência medida, contador de não mapeado

## Bloco 4 — Validação
- [ ] Medir latência ponta a ponta e registrar em `memory/learnings.md`
- [ ] Live de teste de 30 minutos sem intervenção
- [ ] Checklist de segurança de `11_SEGURANCA` inteiro verde
- [ ] Checklist da Fase 4 da skill `fundacao-de-projeto`

## Adiado explicitamente
- Times HERÓI × VILÃO
- Espectador com personagem próprio
- Outras modalidades
- Multi-streamer, auth, banco
- Upload automático de asset gerado por IA (ver ADR-004)
