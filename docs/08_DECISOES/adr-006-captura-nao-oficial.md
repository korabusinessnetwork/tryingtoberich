# ADR-006 — Captura de evento de presente por biblioteca não oficial

**Status**: Aceito · **Data**: 2026-09-01 · **Decisores**: Matheus Bonato

## Contexto
A TikTok não oferece API pública de evento de presente para criador comum. O
acesso oficial existe apenas para parceiros de jogo aprovados, com processo de
candidatura. O produto inteiro depende de receber esses eventos.

O caminho usado pelo ecossistema é o `tiktok-live-connector`, que conecta no
websocket do webcast e emite os eventos. É o mesmo componente que o Matheus já
usa no overlay de ranking de engajamento, em produção.

## Decisão
**Usar `tiktok-live-connector` na Fase 1, com o risco assumido e documentado.**
Isolar todo contato com ele em `bridge/src/tiktok/`, atrás de uma interface
interna de evento normalizado.

## Alternativas consideradas
### Candidatura ao programa oficial de parceiro de jogo
- Prós: estável, dentro dos termos, viável comercialmente.
- Contras: processo de aprovação, requisitos de audiência, prazo incerto.
- Descartado **por ora**: é pré-requisito da Fase 3, não da Fase 1.

### Leitura de tela / OCR do painel de presentes
- Descartado porque: frágil, alta latência, e não dá acesso ao valor nem ao id.

## Consequências
### Positivas
- Funciona hoje, sem aprovação, sem custo.
- Componente já validado em produção pelo dono, no overlay existente.

### Negativas / trade-offs
- **Pode quebrar sem aviso** quando a TikTok mudar o protocolo. É o risco
  operacional número 1 do projeto.
- **Está numa zona cinzenta dos termos da TikTok.** Uso pessoal e não comercial
  na Fase 1. Não anunciar como produto enquanto for esse o mecanismo.
- **Bloqueia a Fase 3 como está.** Virar produto para terceiros com um mecanismo
  não oficial expõe o Matheus e os usuários. A Fase 3 depende ou da via oficial
  ou de uma reavaliação formal.

## Mitigação
A interface interna de evento normalizado significa que trocar o conector por
uma via oficial é reescrever um diretório. O resto do sistema não sabe de onde
o evento veio.
