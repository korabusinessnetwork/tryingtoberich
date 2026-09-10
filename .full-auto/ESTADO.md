# Estado do Full Automático

status: EXECUTANDO
<!-- valores: EXECUTANDO | AGUARDANDO_MATHEUS | PAUSADO | CONCLUIDO -->

- **Projeto:** Kora Stream Games
- **Plano de origem:** `docs/00_VISAO/plano-de-produto.md` mais a série de ADRs
  em `docs/08_DECISOES` (001 a 016 de fundação, P01 a P08 de produto)
- **Branch:** `claude/camada-de-produto-e-fase-0` (ver D01, não é `full-auto/<slug>`)
- **Início:** 2026-09-10
- **Fase atual:** Fase 2, onda 2 em execução
- **Tarefa atual:** P04 (maestro, trilha ponte), enquanto as frentes console e produto rodam
- **Próximo passo:** esperar as duas frentes da onda 2, integrar uma por vez
  com verificação completa depois de cada merge, e então despachar a onda 3
  (C05 a C08 no console, P04 na ponte)
- **Progresso:** 2 de 17 tarefas concluídas, 7 em andamento

## O que já estava pronto antes desta execução

A leva 1 (duas frentes, antes da skill assumir) entregou e está commitada em
`c0ade35`: a camada da Kora do ADR-P02 na ponte (licença com carência, ADR-P08,
telemetria e saúde de conexão), o SQL com RLS, a aba de licença no painel, e o
conserto dos seis slots vermelhos na instalação limpa. 607 testes verdes.

## Motivo da parada (só se AGUARDANDO_MATHEUS ou PAUSADO)

<vazio>
