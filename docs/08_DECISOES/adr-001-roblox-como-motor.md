# ADR-001 — Roblox como motor do jogo

**Status**: Aceito · **Data**: 2026-09-01 · **Decisores**: Matheus Bonato

## Contexto
O jogo precisa rodar durante uma live de TikTok, capturado pelo TikTok Studio,
reagindo a presentes em tempo real, com mapa trocável e visual customizado.
Duas opções reais: Roblox (Luau) ou uma engine web (Three.js) rodando no
navegador.

A engine web tinha vantagem técnica clara: WebSocket bidirecional com o Node
local, latência abaixo de 100ms, nenhum limite de asset, e reaproveitamento
direto da stack que o Matheus já roda no overlay de ranking (Node +
tiktok-live-connector + WebSocket).

## Decisão
**Usar Roblox / Luau**, com experiência privada.

## Alternativas consideradas
### Three.js no navegador
- Prós: latência mínima, WebSocket direto, asset gerado por IA sem moderação,
  controle total do render, mesma stack do overlay existente.
- Contras: física, câmera, avatar e biblioteca de assets teriam que ser
  construídos do zero; o streamer sai do ambiente onde já produz conteúdo; o
  público de TikTok reconhece o visual Roblox e isso é parte da proposta.
- Descartado porque: decisão do dono, que já faz live de Roblox e quer manter o
  formato reconhecível.

### Roblox com polling de intervalo fixo
- Descartado porque: 1 a 2s de latência mata o Princípio nº1. Ver ADR-002.

## Consequências
### Positivas
- Física, câmera, humanoid e catálogo de assets prontos.
- Continuidade com a produção atual do streamer.
- Visual reconhecível pelo público-alvo.

### Negativas / trade-offs
- **O HttpService só faz requisição de saída.** Toda a arquitetura de rede é
  ditada por isso. Mitigado em ADR-002.
- **Asset visual passa por moderação.** Impede imagem gerada por IA em tempo
  real. Mitigado em ADR-004.
- Latência total sobe de ~150ms (web) para ~600ms (Roblox). Ainda dentro do teto
  de 1000ms, mas o orçamento fica apertado. Medir na primeira live.
- Trocar de mapa exige reentrar na experiência.
- Reaproveitamento zero de código do overlay existente no lado do jogo. A ponte,
  essa sim, é reaproveitável quase inteira.

## Notas
Se a latência medida na primeira live passar consistentemente de 1000ms, este
ADR deve ser reaberto. A alternativa web continua registrada aqui para isso.
