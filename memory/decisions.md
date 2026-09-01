# Decisões — Kora Stream Games

> Índice rápido. O registro completo de cada decisão está em `docs/08_DECISOES/`.

| ADR | Decisão | Status | Data |
|---|---|---|---|
| ADR-001 | Roblox como motor do jogo, e não engine web | Aceito | 2026-09-01 |
| ADR-002 | Ponte por long-poll com túnel Cloudflare | Aceito | 2026-09-01 |
| ADR-003 | JSON em disco atrás de camada de repositório | Aceito | 2026-09-01 |
| ADR-004 | Gemini gera layout e escolhe asset, nunca cria asset | Aceito | 2026-09-01 |
| ADR-005 | Movimento híbrido: física para o jogador, Tween para o presente | Aceito | 2026-09-01 |
| ADR-006 | tiktok-live-connector não oficial, com risco assumido | Aceito | 2026-09-01 |
| ADR-007 | Seis slots com vínculo livre presente↔animação | Aceito | 2026-09-01 |
| ADR-008 | Checkpoint na última plataforma, queda natural sem punição | Aceito | 2026-09-01 |
| ADR-009 | Mapa 100% escalável sem presente (anti live robotizada) | Aceito | 2026-09-01 |
| ADR-010 | Personagem por composição gratuita, roupa paga adiada | Aceito | 2026-09-01 |
| ADR-011 | Vestiário híbrido: monta no jogo, escolhe no painel | Aceito | 2026-09-01 |

## Decisões pendentes
- **Roupa clássica própria (80 Robux por upload).** Adiada por padrão pela regra
  de custo. O campo `roupaCustomizada` já existe no schema. Decisão do dono.
- Formato de captura na live: janela do Roblox recortada no TikTok Studio,
  igual ao fluxo atual do Matheus. Confirmar se o overlay de ranking existente
  convive na mesma cena do OBS.
- Se o painel e a ponte viram um processo só ou continuam separados na Fase 2.
