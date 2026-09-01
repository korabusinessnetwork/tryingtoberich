# ADR-012 — Combate de presentes: a plateia briga entre si

**Status**: Aceito · **Data**: 2026-09-01 · **Decisores**: Matheus Bonato
**Supersede**: R5.2 e R5.3 de `docs/03_REGRAS_DE_NEGOCIO` (fila de 3 posições
com descarte por delta absoluto)

## Contexto
A documentação da fundação nunca respondeu o que acontece quando vários
presentes chegam praticamente juntos. O R5 resolvia isso como um problema de
**enfileiramento**: eventos de slots diferentes entravam numa fila de três
posições, e com a fila cheia o de maior delta absoluto empurrava o menor para
fora. O presente empurrado simplesmente sumia.

Ao implementar o Bloco 1 essa regra mostrou duas consequências ruins:

1. **Espectador paga e não vê nada.** Descartar presente por concorrência é o
   pior resultado possível num produto cuja proposta é justamente o espectador
   ver a própria ação virar movimento na tela.
2. **Perde a coisa mais interessante que a mecânica permite.** Se um presente
   sobe e outro desce, existe um conflito ali, e conflito é o que faz a plateia
   participar. A fila transformava isso em duas animações em sequência.

O dono corrigiu o desenho: presentes simultâneos não fazem fila, eles **brigam**.

## Decisão
**Enquanto uma animação está tocando, todo presente que chega entra num
combate.** As subidas somam entre si, as descidas somam entre si, e os dois
lados se anulam. Quando o combate fecha, o boneco anda o **líquido** da disputa.

1. Presentes do **mesmo slot** viram um participante só, com os deltas somados.
2. `somaSubida + somaDescida = líquido`. Vence o lado de maior soma absoluta,
   que é exatamente o sinal do líquido.
3. A animação que toca é a do **maior presente do lado vencedor**. Um movimento
   só: o ADR-005 não permite puxar o boneco para dois lados ao mesmo tempo.
4. Disputa **contestada** (presente dos dois lados) sobe **um nível** de
   intensidade, com o mesmo teto de 5 do combo do R4.
5. **Líquido zero anula o combate.** Nenhum evento vai para o jogo — delta 0 não
   existe no contrato — e o painel mostra o empate.
6. O combate fecha quando a animação corrente termina, ou quando ele já está
   aberto há **2 segundos**, o que vier primeiro. Fechando por tempo esgotado, o
   líquido é aplicado com **efeito curto**, sem animação completa, porque efeito
   curto não toma o controle do boneco.
7. **Nenhum presente é descartado por concorrência.** Todo delta que entrou no
   combate conta no líquido.

### O primeiro presente continua disparando na hora
Presente que chega com o boneco livre dispara imediatamente, sem esperar
combate. Abrir uma janela na entrada somaria centenas de milissegundos a **todo**
presente e gastaria metade do orçamento de latência do Princípio nº1 para
resolver um caso raro. Como a animação mais curta da biblioteca tem 0,4s e a
maioria passa de 1s, tudo que é de fato simultâneo cai dentro da animação do
primeiro e entra no combate de qualquer jeito.

Trade-off aceito: dois presentes chegando com poucos milissegundos de diferença
e o boneco livre produzem um movimento e depois o combate, em vez de um combate
só. Na tela isso lê como ação e contra-ataque, que é bom.

## Alternativas consideradas

### Manter a fila de 3 (R5.2 e R5.3)
- Prós: já estava documentada e implementada.
- Contras: descarta presente pago, e reduz o conflito a uma sequência de
  animações independentes.
- Descartado por decisão do dono.

### Combate só entre presentes na mesma janela de 400ms, fila para o resto
- Prós: mais fiel ao texto original do R5.
- Contras: dois modelos concorrendo no mesmo código, e mantém o descarte.
- Descartado por decisão do dono.

### Tocar as duas animações em sequência, para mostrar o combate
- Contras: dobra o tempo em que o streamer fica sem controle e estoura o teto de
  3,5s da biblioteca. Ver R11 e ADR-005.
- Descartado.

### Aplicar o delta bruto do lado vencedor, ignorando o outro lado
- Contras: o presente do lado perdedor não faria diferença nenhuma, o que é o
  mesmo problema do descarte com outro nome.
- Descartado: o líquido é o que dá sentido ao combate.

## Consequências

### Positivas
- **Nenhum presente pago é jogado fora.** Todo delta conta.
- A plateia ganha um jogo dentro do jogo, e o streamer ganha o que narrar.
- O código fica mais simples: some a fila com política de substituição, e a
  coalescência do R5.1 vira um caso particular do agrupamento por slot.
- Um mecanismo só no lugar de dois (coalescência + fila).

### Negativas / trade-offs
- **O espectador nem sempre vê a própria animação.** Se ele manda subida e a
  descida vence, toca a animação do outro lado. Isso é a mecânica, não um bug,
  e precisa ser narrado ao vivo pelo streamer para não parecer falha.
- O contrato do ADR-005 de "presente entrega valor exato" passa a valer sobre o
  **líquido do combate**, não sobre cada presente isolado.
- Empate exato produz zero movimento. É raro e é bom de assistir, mas o painel e
  o HUD precisam mostrar que aconteceu, senão parece travamento.
- Combate longo com muitos participantes concentra bastante deslocamento num
  movimento só. O teto de 2 segundos existe para limitar isso.

## Ligação com o checkpoint (ADR-008)
O ADR-008 diz que presente de descida redefine a plataforma de referência.
Com o combate, **essa regra passa a valer sobre o resultado**, não sobre cada
presente: se o líquido é subida, nenhuma descida do combate move o checkpoint.
Só o que o boneco de fato andou conta.

## Notas de implementação
- `bridge/src/fila/combate.mjs` é função pura: agrupa, soma e resolve.
- `bridge/src/fila/despachante.mjs` cuida do relógio e de quando fechar.
- Cenários `04-combate-de-presentes` e `07-combate-por-tempo-esgotado` em
  `data/fixtures/cenarios/` são a especificação executável desta decisão.
- `COALESCENCIA_MS` sai do `.env`; entra `COMBATE_MAX_MS`, padrão 2000.
