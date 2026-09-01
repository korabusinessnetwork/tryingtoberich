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

## R5 — Combate de presentes
> Reescrito pelo ADR-012. A versão anterior enfileirava eventos de slots
> diferentes em três posições e **descartava** o de menor delta quando a fila
> enchia. Descartar presente pago é o pior resultado possível num produto cuja
> proposta é o espectador ver a própria ação virar movimento.

1. **Presente com o boneco livre dispara na hora.** Sem janela de espera na
   entrada: isso somaria centenas de ms a todo presente e gastaria metade do
   orçamento de latência do Princípio nº1.
2. **Presente que chega durante uma animação entra no combate.** As subidas
   somam entre si, as descidas somam entre si, e os dois lados se anulam.
3. Presentes do **mesmo slot** viram um participante só, com os deltas somados.
4. Vence o lado de **maior soma absoluta**, e o boneco anda o **líquido** da
   disputa, nunca o bruto. A animação que toca é a do maior presente do lado
   vencedor: o boneco não pode ser puxado para dois lados (ADR-005).
5. Disputa **contestada**, com presente dos dois lados, sobe **um nível** de
   intensidade, com o mesmo teto de 5 do combo do R4. Combate de um lado só
   mantém a intensidade do slot.
6. **Líquido zero anula o combate.** Nada vai para o jogo — delta 0 não existe
   no contrato — e o painel mostra o empate.
7. O combate fecha quando a animação corrente termina, ou quando ele já está
   aberto há **2 segundos**, o que vier primeiro. Fechando por tempo esgotado, o
   líquido é aplicado com **efeito curto**, sem animação completa.
8. **Nenhum presente é descartado por concorrência.** Todo delta que entrou no
   combate conta no líquido.

Consequência que precisa ser narrada ao vivo: o espectador nem sempre vê a
própria animação. Se ele manda subida e a descida vence, toca a animação do
outro lado. Isso é a mecânica, não uma falha.

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
