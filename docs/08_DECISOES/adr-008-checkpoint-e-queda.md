# ADR-008 — Checkpoint na última plataforma e queda natural sem punição

**Status**: Aceito · **Data**: 2026-09-01 · **Decisores**: Matheus Bonato

## Contexto
Definido que o streamer joga o parkour (ADR-005), aparece a pergunta: ele erra o
pulo e cai. Isso custa progresso?

Se a queda punisse, a live viraria um jogo de habilidade onde o presente é
detalhe. Se a queda não punisse **e** o checkpoint fosse sempre a altura máxima,
o streamer poderia anular qualquer presente de descida pulando no vazio de
propósito, o que rouba do espectador exatamente o que ele pagou.

## Decisão
1. **Queda natural não custa progresso.** O boneco reaparece na última
   plataforma que ele encostou.
2. **Presente de descida redefine o checkpoint.** Ao terminar uma animação de
   descida, a plataforma de destino passa a ser a última plataforma tocada.
3. Consequência direta: **a única forma de perder altura é a plateia.**

## Alternativas consideradas
### Queda natural punindo (cai, perde)
- Prós: mais tensão, run mais valiosa.
- Contras: a live fica refém do erro do streamer, e o presente perde protagonismo.
- Descartado por decisão do dono.

### Checkpoint sempre na altura máxima da sessão
- Descartado porque: torna todo presente de descida cancelável com um pulo no
  vazio. Anula metade da biblioteca de animações e metade da monetização.

## Consequências
### Positivas
- Presente de descida tem peso real. O vilão da live importa.
- Streamer pode arriscar pulo difícil sem medo, o que deixa a jogatina mais solta
  e a live mais divertida de assistir.
- Regra simples de explicar ao vivo em uma frase.

### Negativas / trade-offs
- **A "última plataforma tocada" vira estado crítico do jogo.** Ela precisa ser
  atualizada por colisão real com plataforma, não por proximidade nem por altura.
- Detector de queda precisa de limiar claro (ver R9) para não disparar durante
  um pulo longo legítimo.
- O streamer pode ficar parado numa plataforma alta sem risco nenhum. Isso **não
  pode** virar o comportamento padrão da live: o TikTok penaliza transmissão que
  pareça automatizada. A defesa não é esta regra, é o ADR-009, que garante que o
  mapa é sempre escalável e portanto sempre há o que jogar.

## Notas de implementação
Sequência do respawn: detectar queda → zerar velocidade → posicionar no
checkpoint → zerar velocidade de novo → devolver controle. Mesmo cuidado com
momento residual do ADR-005.
