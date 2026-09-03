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


## Nota de implementação — 2026-09-02: dois formatos, duas regras opostas

O `plataformas.formato` existia no contrato desde o começo com um valor só
(`"disco"`), previsto como alavanca de variedade. Ele ganhou o segundo:

| formato | como se sobe | a regra |
|---|---|---|
| `disco` | degraus separados, o jogador **pula** o vão | o vão não pode passar do alcance do pulo, e o passo tem que ser maior que o raio |
| `laje` | lajes largas encostadas, o jogador **anda** | não pode sobrar vão, e o passo tem que ser pelo menos meia-laje |

**As duas são matematicamente opostas**, e é isso que torna a coisa perigosa:
rodar a regra do disco num mapa de laje reprova todo mapa de laje por
"plataformas se cobrem" — que na laje é justamente o objetivo. Por isso a
bifurcação aparece nas três camadas, pela mesma chave:

- `bridge/src/dominio/regras.mjs` — valida o spec antes de gravar
- `game/src/server/jogabilidade.lua` — valida o spec e a torre construída
- `game/src/server/construtorMapa.lua` — constrói a forma

E no prompt: `REGRAS_DE_PLATAFORMA` tem uma receita por formato, com o exemplo
numérico correspondente. Mandar a receita errada não daria erro de tipo nem de
sintaxe: daria um spec reprovado nas duas tentativas, com o streamer lendo
"não consegui gerar" sem motivo aparente. `bridge/test/prompt-coerente.test.mjs`
confere cada exemplo contra a regra do próprio formato.

**Assimetria de propósito:** os números da laje passam TAMBÉM na regra do
disco, porque a regra do disco nunca exigiu vão — ela proíbe o degrau cobrir o
anterior, e degrau encostado é escada legítima. O contrário não vale: os
números do disco reprovam como laje, com "caminho partido". Forçar simetria
reverteria aquela decisão por acidente.

**Largura da laje:** sai do próprio fundo (`raioBase × 2 × 2,2`), não de um
campo novo. O fundo já é obrigado a alcançar a laje seguinte; a largura é só
leitura visual, e um campo a mais seria mais um número para o streamer afinar
sem ganho de regra. A laje é girada para acompanhar a volta do quadrado —
sem isso, nas duas laterais ela sairia atravessada, larga no sentido de andar.


## Correção — 2026-09-02: a passarela TILA, e a primeira regra dela estava errada

A regra da `laje` nasceu pedindo só **"sem vão"**. Ela aprovava um spec que o
jogo construía intransponível, e nenhuma checagem pegava — porque todas mediam
o VÃO, e vão negativo era justamente o objetivo.

O que a torre construída fazia, com fundo 24 e passo 20:

```
pares que se sobrepõem no fundo: 59 de 59
folga vertical entre uma laje e a de cima: 1.00 stud
```

Cada laje enterrava 4 studs na seguinte. Na faixa de sobreposição a folga entre
o topo de uma e a barriga da outra é `espacamentoVertical - espessura` = 1 stud,
e o boneco tem 5: ele fica DENTRO da laje de cima e a física o expulsa. É o
mesmo estrago do spawn no andar 500, por outro caminho.

**Sobreposição e vão são o mesmo eixo, e só um valor serve nos dois sentidos:**

    2 * raioBase == variacaoHorizontal,  com variacaoRaio == 0

Por isso `variacaoRaio` também tem que ser zero. Sorteando o fundo, uma ponta
abre buraco e a outra enterra — não existe valor que sirva. Passarela é feita de
laje IGUAL, e é isso que faz dela um caminho em vez de uma pilha.

A regra vale nas três camadas (`regras.mjs`, `jogabilidade.lua`, prompt) e o
mapa que estava em disco foi corrigido de `raioBase 12 / variacaoRaio 0.1` para
`raioBase 10 / variacaoRaio 0`.

**Lição que ficou no teste:** validar o spec não é validar a torre. O teste novo
reproduz a geometria como o construtor a monta e pergunta outra coisa — sobra
faixa em que o jogador fica DEBAIXO da próxima laje? Spec correto com torre
quebrada já aconteceu duas vezes neste ADR.


## Correção — 2026-09-02 (2ª): a passarela é de ANDAR, e não dá a volta

Duas coisas estavam erradas na `laje`, e as duas vieram de eu ter inventado o
formato em vez de perguntar o que ele era.

**A peça.** Ela era uma laje larga, 2,2 vezes mais larga que funda, girada para
acompanhar o percurso. Não é: é o **mesmo degrau quadrado da escada**. O que
distingue os dois formatos não é a peça, é o caminho e o jeito de subir.

**O caminho.** Ela dava a volta no quadrado, como o disco. Não dá: ela **sobe
no lugar, indo e voltando**, oito degraus para cada lado. Sem caracol.

E a subida deixou de ser de pular:

    espacamentoVertical == ESPESSURA_DO_DEGRAU (2)

Com a subida igual à espessura, um degrau **apoia** no anterior em vez de
flutuar acima dele. Foi a fresta entre os dois — 1 stud, com um boneco de 5 —
que prendeu o jogador na primeira versão. Igual à espessura não sobra fresta, e
o Roblox sobe degrau desse tamanho **andando**.

Os dois formatos passaram a ser mutuamente exclusivos pelo eixo vertical:

| | subida | como se sobe |
|---|---|---|
| `disco` | ≥ 3 | pulando o vão |
| `laje` | == 2 | andando, degrau colado |

O piso de 3 do disco vivia no `minimum` do schema; desceu para `regras.mjs`,
onde o motivo cabe junto do número — o schema não sabe qual formato está
validando.

**Por que vaivém e não rampa reta:** mil degraus de 20 studs em linha reta dão
20 mil studs, longe demais da origem para o Roblox posicionar com precisão. O
vaivém cabe numa faixa de 160 studs e sobe 2 mil. É a mesma razão que fez o
disco andar num quadrado em vez de numa reta.

**A onda é triangular, não senoide.** A senoide anda devagar perto da crista, e
ali os degraus se amontoariam num tropeço. Na triangular o avanço é o mesmo em
todo degrau, e é isso que faz os quadrados encaixarem exato do começo ao fim.


## Nota — 2026-09-02: o número em cima do degrau

Cada degrau passou a levar o próprio número escrito na face de cima, e o último
diz **FINAL** em vez do número.

É leitura de progresso sem depender do HUD. Num vídeo vertical o boneco ocupa o
meio da tela, e o que o espectador lê primeiro é o chão embaixo dele — a barra
de meta fica no topo, longe do olho no momento do pulo. E "FINAL" existe porque
`1000` não se distingue de `999` de relance, justamente quando distinguir mais
importa.

Três decisões que valem estar escritas:

- **`MaxDistance`.** Uma `SurfaceGui` mais um `TextLabel` por degrau, numa torre
  de 5000, são **10 mil instâncias** — em cima dos 5000 Part e 5000 Texture que
  já existiam. Sem limite de distância todas desenhariam texto o tempo todo; com
  ele o Roblox só renderiza as perto da câmera, e 160 studs já pega mais degraus
  do que cabem na tela. **As instâncias continuam existindo**: se o
  carregamento da torre ficar lento, é aqui que se corta.
- **`LightInfluence = 0`.** Sem isso o número escurece junto com o mapa, e some
  justamente nos temas noturnos — que são metade do acervo.
- **Branco com contorno preto grosso.** A textura embaixo pode ser clara
  (areia, diamante) ou escura (netherrack, rocha vulcânica), e o número precisa
  ser legível nos dois sem saber qual é.
