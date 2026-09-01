# ADR-005 — Movimento híbrido: física para o jogador, Tween para o presente

**Status**: Aceito · **Data**: 2026-09-01 · **Decisores**: Matheus Bonato
**Revisa**: primeira versão deste ADR assumia, errado, que o boneco se movia
apenas por presente. O streamer joga o parkour com controle normal.

## Contexto
O streamer controla o boneco jogando parkour de verdade: anda, pula, erra o pulo
e cai. Ao mesmo tempo, presentes empurram o boneco dezenas ou centenas de
plataformas para cima ou para baixo, em segundos.

São dois regimes de movimento incompatíveis no mesmo personagem. Física dá o
controle e a imprevisibilidade que fazem o parkour ser jogo. Física a 100
plataformas por segundo produz atravessamento de parte, destino não
determinístico e travamento em quina.

## Decisão
**Física é o estado padrão. O presente é uma tomada de controle temporária.**

Ciclo do presente:
1. Cancelar o movimento atual: zerar `AssemblyLinearVelocity` e
   `AssemblyAngularVelocity`.
2. Ancorar o `HumanoidRootPart` e desabilitar o controle do jogador.
3. `TweenService` ao longo do caminho até a plataforma destino.
4. Ao terminar: posicionar em cima da plataforma, zerar velocidade de novo,
   desancorar, devolver o controle.

O passo 4 zera a velocidade de novo de propósito. Sem isso, o momento residual
do Tween lança o boneco no primeiro frame após desancorar.

## Alternativas consideradas
### Só Tween, boneco sem controle do jogador
- Descartado porque: o streamer joga. Era o modelo errado da primeira versão.

### Só física, presente vira impulso
- Prós: transição perfeita, nenhuma tomada de controle.
- Contras: destino imprevisível. Um presente de "+30 plataformas" precisa
  entregar 30, não "por volta de 30". E impulso forte atravessa geometria.
- Descartado porque: quebra o contrato com o espectador, que pagou por um valor.

### Esperar o jogador aterrissar antes de aplicar o presente
- Descartado por decisão do dono: arranca do ar na hora. Esperar até 1s
  consumiria todo o orçamento de latência do Princípio nº1.

## Consequências
### Positivas
- Parkour é jogo de verdade, com erro e acerto do streamer.
- Presente entrega valor exato, sempre.
- A curva do Tween continua sendo ferramenta de expressão por animação.

### Negativas / trade-offs
- **A troca de regime é o ponto mais frágil do jogo.** Velocidade residual,
  ancoragem presa e colisão perdida são todos bugs que nascem aqui.
- **Watchdog obrigatório.** Se uma animação der erro no meio, o personagem fica
  ancorado para sempre e a live morre. Todo `executar` roda dentro de `pcall`,
  com um timer independente que força a restauração em `duracaoBase + 1s`,
  aconteça o que acontecer.
- Durante a animação o streamer não controla nada. Aceito pelo dono. Como
  nenhuma animação passa de 3,5s, o bloqueio máximo é curto.
- Presente que chega **durante** outra animação não reinicia o ciclo: entra na
  fila de coalescência (R5).
