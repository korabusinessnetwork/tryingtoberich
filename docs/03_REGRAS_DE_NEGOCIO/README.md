# 03 — Regras de Negócio

## R1 — Preset e slots
> **Emendada em 2026-09-04 por decisão explícita do dono:** *"por padrão a gente
> usa 6 presentes, mas eu gostaria de colocar um botão para o usuário poder
> adicionar mais presentes e definir o que cada um deles vai fazer, e decidir se
> vai ir pro overlay ou não"*. A R1.2 dizia "não aumentar sem decisão explícita
> do dono"; a decisão é esta. O 6 deixou de ser teto e passou a ser **padrão**.
> Ver ADR-007.

1. Um **preset** é a configuração de uma live. Tem **6 slots por padrão** e no
   máximo **24**.
2. O 6 continua sendo o padrão porque é o que a TikTok exibe como desejos na
   live: o espectador vê seis, e slot que ele não vê quase não dispara. Isso é
   argumento para o padrão, não proibição — passar de 6 é escolha do streamer,
   um presente por vez, e o painel só cria o sétimo quando ele clica. O teto de
   24 é de tela: os 6 primeiros ficam lado a lado e os extras caem em linhas
   abaixo (`02_DESIGN_SYSTEM`, seção A).
3. Um slot pode estar **vazio**, e isso vale igual para os extras. Preset com
   menos de 6 preenchidos é válido; preset com o slot 8 preenchido e o 7 vazio
   também é.
4. Um mesmo presente **não pode** ocupar dois slots do mesmo preset.
5. Uma mesma animação **pode** aparecer em mais de um slot, com deltas
   diferentes. Isso é intencional.
6. **`mostrarNoOverlay`** diz se o presente aparece na legenda do overlay da
   live (ADR-015). **Ausente quer dizer que aparece** — é o que mantém válido
   todo preset salvo antes desta emenda. Fora do overlay o presente continua
   valendo no jogo: casa com o slot, toca a animação e move a torre. O que muda
   é só a tela do espectador.
7. **`posicao` vai de 1 a 24 e é única dentro do preset.** Essa unicidade é
   **regra cruzada**, checada em `bridge/src/dominio/regras.mjs` como a da R1.4,
   e não mais pelo JSON Schema: o schema garantia a posição repetindo um bloco
   por posição, e repetir aquilo 24 vezes seria absurdo. Preset com posição
   repetida é recusado com `posicao_repetida`, antes de chegar ao disco.

## R2 — Composição de um slot
Cada slot preenchido tem:
- `presenteId` — escolhido no catálogo (ver `04_MODELAGEM/catalogo-presentes.md`)
- `animacaoId` — qualquer uma das 20 da biblioteca, sem restrição
- `delta` — inteiro. Positivo sobe, negativo desce. **Sem teto** — a faixa de
  -200 a +200 caiu por decisão do dono quando a torre passou a ter 5000 andares.
  Só o 0 é recusado: presente que não move nada não é presente. Quem grampeia o
  resultado é o jogo, nas pontas da torre, não o painel nem o contrato.
- `intensidade` — 1 a 5. Multiplica escala, duração e densidade de partícula.
- `cooldownMs` — opcional, padrão 0.

**A direção efetiva é o sinal do `delta`, não a animação.** Se o streamer põe uma
animação de subida com delta negativo, o painel avisa que está invertido mas
permite. A animação toca do jeito que é; o boneco vai para onde o delta manda.

## R3 — O valor sugere, nunca decide (nos slots)
> **Emendada em 2026-09-04 pelo ADR-016.** O que está abaixo vale para os slots
> do preset, e só para eles: o vínculo entre presente escolhido, animação e
> delta continua sendo do streamer, um a um. Fora dos slots, o valor decide —
> é a tabela de movimento da R12, em que a conta é a regra e a mão do streamer
> é a exceção.

O valor em moedas do presente **não** determina animação, delta nem intensidade
de um slot. Ele é usado apenas para:
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

## R12 — Tabela de movimento (todo o resto do catálogo)
> Nasceu com o ADR-016, por pedido do dono: *"quero uma página só pra definir a
> subida ou descida por presentes, e já pré-definida com base no valor × 10 —
> doou uma rosa que vale 1 moeda, sobe 10"*. Ela emenda a R3 e não substitui a
> R1: os slots continuam sendo escolha do streamer, um a um.

1. Todo presente do catálogo tem um **delta**, e não só os dos slots. O
   presente fora dos slots deixou de ser descartado.
2. O delta padrão é `moedas × multiplicador`, com **multiplicador 10**: presente
   de 1 moeda sobe 10 andares. Ele é do preset e vale para o catálogo inteiro.
3. **A regra só sobe.** Descida é escolha do streamer e vira exceção — não se
   deduz do preço de uma rosa que ela deveria empurrar para baixo.
4. O preset guarda **a regra e as exceções**, nunca as 670 linhas. Presente novo
   no catálogo da TikTok já nasce com delta, sem ninguém abrir o painel.
5. **Delta 0 é válido aqui** e quer dizer "este presente não mexe na torre". Ele
   volta a ser contado como não mapeado, que é o que sobra do mundo anterior.
   Presente que não custa moeda cai neste caso sozinho.
6. **O slot vence a tabela.** Presente que está num slot dispara com a animação,
   o delta, a intensidade e o cooldown do slot. A tabela responde pelo resto.
7. Quem vem da tabela usa **uma animação por direção**, escolhida no preset, com
   intensidade fixa e sem cooldown. A rajada (R4) vale igual: o delta multiplica
   e a intensidade sobe um nível.
8. No combate (R5), presentes da tabela agrupam por **presente**, não por slot —
   eles não têm slot, e agrupá-los juntos somaria uma rosa com um foguete.
9. A tabela pode ser **desligada** no painel. Desligada, vale a R1 sozinha e o
   jogo volta a ser o do ADR-007.

Consequência que a página precisa mostrar antes da live: com 10 andares por
moeda, um presente de 3.000 moedas anda 30.000 andares numa torre de 1.000. O
jogo grampeia o destino nas pontas (R6) e nada quebra, mas a corrida acaba num
presente só. Por isso a página avisa quantos presentes varrem a torre sozinhos.
