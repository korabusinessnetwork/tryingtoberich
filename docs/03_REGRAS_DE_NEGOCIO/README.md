# 03 — Regras de Negócio

## R1 — Preset e slots
1. Um **preset** é a configuração de uma live. Tem exatamente **6 slots**.
2. O número 6 vem do painel de desejos da TikTok. É regra de produto, não
   limitação técnica. Não aumentar sem decisão explícita do dono.
3. Um slot pode estar **vazio**. Preset com menos de 6 preenchidos é válido.
4. Um mesmo presente **não pode** ocupar dois slots do mesmo preset.
5. Uma mesma animação **pode** aparecer em mais de um slot, com deltas
   diferentes. Isso é intencional.

## R2 — Composição de um slot
Cada slot preenchido tem:
- `presenteId` — escolhido no catálogo (ver `04_MODELAGEM/catalogo-presentes.md`)
- `animacaoId` — qualquer uma das 20 da biblioteca, sem restrição
- `delta` — inteiro. Positivo sobe, negativo desce. Faixa aceita: -200 a +200.
- `intensidade` — 1 a 5. Multiplica escala, duração e densidade de partícula.
- `cooldownMs` — opcional, padrão 0.

**A direção efetiva é o sinal do `delta`, não a animação.** Se o streamer põe uma
animação de subida com delta negativo, o painel avisa que está invertido mas
permite. A animação toca do jeito que é; o boneco vai para onde o delta manda.

## R3 — O valor sugere, nunca decide
O valor em moedas do presente **não** determina animação, delta nem intensidade.
Ele é usado apenas para:
- ordenar o catálogo no painel;
- colorir o presente por faixa na interface;
- exibir aviso quando o vínculo foge muito da curva (ex.: presente de 1 moeda
  com delta de +100). Aviso, não bloqueio.

Faixas usadas **só para exibição**:

| Faixa | Moedas | Cor sugerida |
|---|---|---|
| I | 1 a 9 | cinza |
| II | 10 a 99 | azul |
| III | 100 a 999 | roxo |
| IV | 1000 a 4999 | laranja |
| V | 5000 ou mais | dourado |

## R4 — Multiplicador de combo
A TikTok envia presentes repetíveis em rajada (`repeatCount`). Regra:
- O `delta` do slot é multiplicado por `repeatCount`.
- A animação toca **uma vez**, com intensidade elevada em um nível (teto 5).
- Nunca tocar N animações para N repetições. Isso trava a tela e quebra a
  latência das próximas.

## R5 — Rajada e coalescência
Se chegarem eventos enquanto uma animação está tocando:
1. Eventos do **mesmo slot** dentro da janela de coalescência (padrão 400ms)
   somam os deltas e contam como um disparo só.
2. Eventos de **slots diferentes** entram numa fila com no máximo 3 posições.
3. Fila cheia: o evento de **maior delta absoluto** substitui o menor da fila.
   Nada de descartar o mais novo só por ser o mais novo.
4. A fila nunca segura evento por mais de 2 segundos. Passou disso, aplica o
   delta sem animação completa (só o efeito curto de impacto).

> **Em aberto (2026-09-01):** a regra 1 manda somar delta e disparar uma vez, e
> não diz nada sobre intensidade. A fixture `03-rajada-mesmo-slot` segue a
> leitura literal e mantém a intensidade do slot. Se coalescência também devesse
> subir um nível como o combo do R4, esta regra precisa dizer isso e o `esperado`
> da fixture muda junto. Decisão do dono.

## R6 — Limites do tabuleiro
- Plataforma mínima é 0. Delta negativo que passaria de 0 para o boneco em 0.
- Plataforma máxima é o tamanho do mapa gerado. Chegar no topo dispara o evento
  de vitória e **não** reinicia sozinho: o streamer decide no painel.

## R9 — Plataforma de referência e checkpoint
O streamer joga o parkour com controle normal (ADR-005). Isso muda quem sabe
onde o boneco está.

1. **A fonte de verdade é o jogo, não a ponte.** A ponte nunca acumula
   plataforma. Ela envia `delta` e o Roblox calcula o destino.
2. `plataformaReferencia` = a última plataforma que o personagem **encostou**,
   detectada por colisão real (`Touched` na plataforma), nunca por altura nem
   por proximidade.
3. Todo `delta` de presente é aplicado sobre `plataformaReferencia`, não sobre
   onde o boneco está no ar naquele instante.
4. `plataformaMaxima` da sessão é só estatística. Não é usada como destino.

## R10 — Queda natural
1. Cair não custa progresso. O boneco reaparece em `plataformaReferencia`.
2. Queda é detectada quando o personagem fica abaixo de
   `plataformaReferencia - 2 plataformas` em altura **e** com velocidade
   vertical negativa por mais de 0,4s. O limiar evita disparo em pulo longo.
3. **Presente de descida redefine `plataformaReferencia`.** Ao terminar uma
   animação de descida, a plataforma de destino vira a nova referência, mesmo
   que o boneco ainda não tenha encostado nela. Sem isso, o streamer anula o
   presente do espectador pulando no vazio. Ver ADR-008.
4. Presente de subida **não** redefine referência por decreto: a referência
   atualiza normalmente quando o boneco encosta na plataforma de destino.

## R11 — Tomada de controle durante a animação
1. Presente que chega com o streamer no ar **interrompe o pulo na hora**. Não
   espera aterrissar. Ver ADR-005.
2. Durante a animação o streamer não controla o boneco. Bloqueio máximo é 3,5s,
   o teto de duração da biblioteca.
3. **Watchdog obrigatório:** timer independente força a restauração do controle
   em `duracaoBase + 1s`. Animação com erro no meio não pode deixar o
   personagem ancorado. Isso mataria a live.
4. Restauração sempre zera velocidade linear e angular antes de desancorar.

## R7 — Sessão
- Uma sessão começa no start do painel e termina no stop. Ela guarda: preset
  usado, mapa usado, hora de início, e o log de eventos aplicados.
- Trocar de preset no meio da sessão é permitido e vale a partir do próximo
  evento. Não recalcula nada retroativo.
- Fim da sessão descarta todo dado de espectador. Ver `11_SEGURANCA`.

## R8 — Desconexão
- Se a ponte perde a live, ela tenta reconectar com backoff (1s, 2s, 4s, 8s,
  teto de 30s) e avisa o painel. O jogo continua no estado em que está.
- Se o Roblox para de fazer long-poll por mais de 60s, a ponte marca o jogo como
  offline no painel e passa a descartar evento em vez de acumular.
