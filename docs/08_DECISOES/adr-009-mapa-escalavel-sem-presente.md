# ADR-009 — O mapa é 100% escalável sem nenhum presente

**Status**: Aceito · **Data**: 2026-09-01 · **Decisores**: Matheus Bonato

## Contexto
O TikTok penaliza live que pareça automatizada: tela estática, ausência de
presença humana, conteúdo que roda sozinho. Alcance cai e a transmissão pode ser
encerrada. Uma live onde o streamer fica parado esperando presente cai nessa
descrição, mesmo com o boneco se movendo sozinho de vez em quando.

Isso não é preferência de ritmo. É requisito de plataforma, e ele manda no
design do mapa.

A primeira versão do gerador de mapa deixava o Gemini escolher
`espacamentoVertical` entre 8 e 20 studs. O pulo padrão do Roblox alcança cerca
de 7,2 studs de altura (`Humanoid.JumpHeight` default). **Boa parte dos mapas
gerados seria intransponível sem presente**, produzindo exatamente a live
robotizada que precisamos evitar.

## Decisão
**Todo mapa gerado precisa ser escalável do início ao topo usando apenas o
controle do jogador, sem nenhum presente.**

Regras derivadas:
1. `espacamentoVertical` nunca passa de `jumpHeight * 0,7`. Com o pulo padrão de
   7,2, o teto é **5 studs**. A margem de 30% cobre latência de input, borda de
   plataforma e erro de posicionamento.
2. `variacaoHorizontal` nunca passa da distância horizontal alcançável naquele
   mesmo pulo, com a mesma margem.
3. `jumpHeight` vira campo do spec do mapa. Mapa que quer ser mais aberto sobe o
   pulo do personagem, e o teto de espaçamento sobe junto, sempre pela fórmula.
4. A validação do spec **rejeita** o mapa que violar isso. Não corrige, não
   arredonda: rejeita e pede outro.
5. O presente **acelera ou atrapalha**, nunca é o meio de locomoção.

## Alternativas consideradas
### Deixar trechos intransponíveis de propósito, para forçar presente
- Prós: pressiona a plateia a doar.
- Contras: cria tempo morto obrigatório, que é precisamente o que a plataforma
  penaliza, e transforma a live num pedido de doação em vez de um jogo.
- Descartado porque: contraria o requisito de plataforma e piora a live.

### Confiar no Gemini para gerar espaçamento jogável
- Descartado porque: o modelo não simula física. Ele produz número plausível,
  não número jogável. Faixa dura no prompt mais validação no código.

## Consequências
### Positivas
- A live tem jogatina contínua de verdade, com o streamer ativo o tempo todo.
- Presente vira tempero e não muleta, o que torna a run mais interessante de
  assistir.
- O mapa é sempre terminável, mesmo com plateia parada.

### Negativas / trade-offs
- Reduz a variedade de layout: nada de saltos dramáticos entre plataformas.
  A variedade vem de paleta, props, ritmo e formato, não de distância.
- `jumpHeight` no spec significa que o personagem muda de física entre mapas.
  Testar cada valor novo antes de usar ao vivo.
- Exige um teste de jogabilidade automatizado no construtor de mapa: percorrer
  as plataformas e conferir que cada salto cabe no alcance. Ver backlog.
