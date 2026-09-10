# 08 — Decisões (ADRs)

Toda decisão de arquitetura vira ADR. Nenhuma decisão relevante fica implícita
no código. Use `adr-000-template.md` para criar a próxima.

| ADR | Título | Status |
|---|---|---|
| [001](./adr-001-roblox-como-motor.md) | Roblox como motor do jogo | Aceito |
| [002](./adr-002-ponte-long-poll.md) | Ponte por long-poll com túnel Cloudflare | Aceito |
| [003](./adr-003-json-em-disco.md) | JSON em disco atrás de repositório | Aceito |
| [004](./adr-004-teto-de-asset-gemini.md) | Gemini gera layout, não asset | Aceito |
| [005](./adr-005-movimento-por-tween.md) | Movimento híbrido: física + Tween | Aceito |
| [006](./adr-006-captura-nao-oficial.md) | Captura de evento não oficial | Aceito |
| [007](./adr-007-seis-slots.md) | Seis slots com vínculo livre. Nota de 2026-09-04: seis viraram o PADRÃO, até 24, e cada slot decide se aparece na legenda do overlay | Aceito |
| [008](./adr-008-checkpoint-e-queda.md) | Checkpoint e queda natural sem punição | Aceito |
| [009](./adr-009-mapa-escalavel-sem-presente.md) | Mapa 100% escalável sem presente | Aceito |
| [010](./adr-010-personagem-personalizado.md) | Personagem por composição gratuita | Aceito |
| [011](./adr-011-vestiario-hibrido.md) | Vestiário híbrido: monta no jogo, escolhe no painel | Aceito |
| [012](./adr-012-combate-de-presentes.md) | Combate de presentes: a plateia briga entre si | Aceito |
| [013](./adr-013-comando-pelo-long-poll.md) | Ordem do painel para o jogo pelo mesmo long-poll | Aceito |
| [014](./adr-014-cutscene-no-overlay.md) | Cutscene de fim de rodada no overlay do OBS, escolhida no preset | Aceito |
| [015](./adr-015-hud-da-live-no-overlay.md) | O HUD da live vive no overlay do OBS, alimentado pela ponte | Aceito |
| [016](./adr-016-tabela-de-movimento.md) | Todo presente move a torre: tabela pré-calculada por valor (moedas × 10), com os slots por cima | Aceito |

## Série P — camada de produto

**A série está fechada: os oito estão aceitos.** O P06 era o último em aberto e
foi decidido em 2026-09-10.

Decisões sobre transformar a fundação acima em algo que outro streamer compra e
usa sozinho. Abertas pelo `docs/00_VISAO/plano-de-produto.md` em 2026-09-09. A
série numérica continua valendo inteira: nenhuma decisão da série P revoga uma
decisão de fundação.

| ADR | Título | Status |
|---|---|---|
| [P01](./adr-p01-motor-do-produto.md) | Motor do produto: manter Roblox | Aceito |
| [P02](./adr-p02-supabase-fonte-da-verdade.md) | Supabase como fonte da verdade de contas, licenças e telemetria (complementa ADR-003) | Aceito |
| [P03](./adr-p03-i18n-por-chave.md) | i18n por chave em PT/ES/EN, funil só em inglês na Fase 1 | Aceito |
| [P04](./adr-p04-distribuicao-em-roblox.md) | Distribuição: o cliente roda no Roblox Studio dele | Aceito |
| [P05](./adr-p05-console-do-operador.md) | Console do operador: a fronteira do v1, congelada em 6 itens | Aceito |
| [P06](./adr-p06-uso-comercial-da-captura.md) | Uso comercial da captura não oficial (estende ADR-006) | Aceito, com cinco mitigações obrigatórias |
| [P07](./adr-p07-executavel-portatil.md) | Um programa de verdade (Electron), portátil primeiro; o instalador do P04 vem depois | Aceito |
| [P08](./adr-p08-carencia-de-licenca.md) | Carência de 14 dias: licença ativa que não pôde ser reconfirmada continua valendo | Aceito |
