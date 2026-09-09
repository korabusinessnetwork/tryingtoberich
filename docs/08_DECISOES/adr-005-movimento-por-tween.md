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

### "Ao longo do caminho" é literal

O passo 3 diz **caminho**, não reta. A torre do ADR-009 é uma espiral quadrada:
a reta entre a plataforma 10 e a 110 atravessa o miolo dela, e o boneco chega ao
destino sem ter passado por degrau nenhum — o presente vira teleporte com efeito
por cima. O caminho são os pontos de pouso dos degraus entre origem e destino
(`Plataformas.caminhoEntre`), tocados como uma **corrente de Tweens**.

Duas escolhas dentro disso:

- **Os degraus são amostrados, no máximo 24.** Um presente de 180 plataformas
  não pode virar 180 trechos de 12ms: trecho mais curto que dois frames não
  desenha nada e só custa agendamento. O teto real aperta junto com a duração —
  o efeito curto do ADR-012, de 0,25s, tece 4 trechos. O **destino entra
  sempre**, porque é o único ponto que o contrato com quem pagou exige.
- **A curva saiu do Tween e foi para a duração de cada trecho.** Os pontos são
  equidistantes e cada trecho toca em Linear; quem dá o Quad Out da subida e o
  Quad In da descida é o tempo que cada trecho recebe, pela inversa da curva.
  Encadear Quad por trecho daria um solavanco a cada degrau.

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

## Nota de 2026-09-04 — o efeito viaja junto

Pedido do dono: *"as animações devem seguir o boneco até ele chegar na última
plataforma"*. Elas não seguiam.

Cinco das 32 animações se soldam no personagem e sempre viajaram junto. As
outras 27 montam um pivô **ancorado** na posição de partida e penduram tudo
nele; o passo 3 deste ADR então leva o boneco por Tween e o efeito fica onde
ele estava. Com um presente pequeno isso quase não se via. Com a tabela de
movimento (ADR-016) mandando uma rosa de 1 moeda subir dez andares, e um
presente caro subir centenas, o efeito passou a ficar um prédio inteiro abaixo
do boneco.

Soldar o pivô resolveria o transporte e **mataria o giro**: peça soldada não
aceita CFrame, e o giro é o que faz shuriken ser shuriken. É a mesma troca que
`sub_jato_propulsor` já documentava — ele é o único soldado justamente por não
girar.

A saída foi manter o pivô ancorado e mover o CFrame dele num laço de
`Heartbeat`: posição da raiz mais o deslocamento guardado, vezes rotação e
giro. Um laço só para todos os pivôs, que se desliga quando o último morre. As
peças penduradas vão de graça — elas estão soldadas no pivô, e mover peça
ancorada arrasta o que está soldado nela. `Efeitos.girar` passou a alimentar
esse laço em vez de tweenar, porque uma corrente de Tweens mirando CFrames
absolutos puxaria o efeito de volta para onde o boneco estava.

Quem arma é `movimento.lua`, em volta da chamada da animação. Nenhum dos 32
módulos mudou, que é a regra do `efeitos.lua`: primitiva nova entra lá.

**Emenda do mesmo dia — a folga à frente.** Acompanhar sozinho não bastou: as
animações de subida nascem no PÉ do boneco, porque ficar para trás ERA o efeito
enquanto ninguém acompanhava. Com o pivô seguindo, esse offset zero passou a
desenhar a peça dentro do corpo dele. A direção da viagem viaja junto com a
raiz, e o pivô que nasce com menos de `FOLGA_A_FRENTE` studs de avanço é
empurrado só o que falta para sair do corpo — o desvio lateral que a animação
escolheu fica intacto. A folga é um piso, não uma posição.

**E o limite da torre deixou de engolir o presente.** No topo e no primeiro
andar o delta é comido pelo grampo, e `sessao.lua` tinha um `return` ali: o
presente sumia sem animação nenhuma, justamente onde a plateia está martelando.
Agora o ciclo roda com destino igual à origem — o Tween não sai do lugar, o
efeito toca inteiro e o controle volta no fim. Não é caso especial: é o caso
geral com deslocamento zero.

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
- **O caminho amostrado passa raspando cada degrau, e isso acorda o `Touched`.**
  A referência de plataforma anda junto com a viagem em vez de saltar só no
  fim. Não muda o estado final — a descida ainda fecha por decreto do ADR-008 —,
  mas é notificação a mais durante a animação.
