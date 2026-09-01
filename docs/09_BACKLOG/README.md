# 09 — Backlog

Ordem pensada para o Claude Code. Cada bloco é entregável e testável sozinho.
Os três diretórios (`bridge/`, `panel/`, `game/`) têm dono exclusivo e podem ser
construídos em paralelo depois do bloco 0.

## Bloco 0 — Contratos (bloqueante, faz primeiro, sequencial)
- [ ] `data/schemas/*.schema.json` para preset, mapa, catálogo e animação
- [ ] `data/acervo.json` com a estrutura do acervo (pode nascer vazio)
- [ ] `data/catalogo-presentes.seed.json` com a semente de desenvolvimento
- [ ] `.env.example`
- [ ] Fixtures de evento da TikTok para teste sem estar ao vivo

## Bloco 1 — Ponte (`bridge/`)
- [ ] Repositórios JSON com escrita atômica (temp + rename)
- [ ] Servidor Express: `/api/*` em `127.0.0.1`, `/jogo/*` com token
- [ ] Long-poll: registro, resposta, timeout de 20s, limpeza de órfão
- [ ] Conector TikTok atrás da interface de evento normalizado
- [ ] Coleta e merge do catálogo de presentes
- [ ] Casamento evento→slot, combo (R4), coalescência e fila (R5)
- [ ] SSE para o painel
- [ ] Cliente Gemini com validação, checagem de jogabilidade e retentativa única
- [ ] Cliente Roblox isolado: busca de item gratuito e cache de thumbnail (ADR-011)
- [ ] Reconexão com backoff (F6) e detecção de jogo offline (F7)

## Bloco 2 — Jogo (`game/`)
- [ ] Laço de long-poll em Luau com `pcall` e backoff
- [ ] Motor de movimento híbrido: física padrão, Tween na tomada de controle,
      com watchdog de restauração (ADR-005, R11)
- [ ] Rastreio de `plataformaReferencia` por colisão real (R9)
- [ ] Detector de queda e respawn no checkpoint (R10, ADR-008)
- [ ] Construtor de mapa a partir do spec
- [ ] **Teste de jogabilidade do mapa:** percorrer as plataformas e confirmar
      que todo salto cabe no alcance do pulo configurado (ADR-009)
- [ ] Índice de animações e as 20 implementações
- [ ] Aplicação do look por `HumanoidDescription`, com fallback (ADR-010)
- [ ] **Vestiário no jogo:** GUI de busca, equipar, prévia real, salvar look
      nomeado. Bloqueado enquanto a sessão estiver rodando (ADR-011)
- [ ] Efeito permanente do personagem, suspenso durante animação de presente
- [ ] HUD vertical: número da plataforma grande, últimos presentes, doador
- [ ] Câmera que acompanha e afasta em animação de peso 4 ou 5

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
