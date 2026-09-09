# 02 — Design System

Duas superfícies visuais com regras opostas. Não misturar.

## A. Painel (segunda tela, desktop, durante a live)

Princípio: **densidade e leitura de canto de olho.** O streamer está jogando e
falando. Ele olha o painel por 2 segundos por vez.

- Tema escuro fixo. Fundo próximo de `#111`, superfície `#1B1B1B`.
- Estado sempre visível e colorido: live conectada, jogo online, sessão rodando.
  Verde, âmbar e vermelho, com texto junto, nunca cor sozinha.
- **Os 6 primeiros slots ficam lado a lado, sempre visíveis, sem scroll.** É a
  tela principal. A regra continua literal para os seis, mesmo desde que o
  preset passou a poder ter até 24 (R1, ADR-007, 2026-09-04): a grade é **fixa
  em `repeat(6, minmax(0, 1fr))`**, os cartões comprimem, e a primeira linha
  nunca quebra. Os extras, do 7 em diante, caem em linhas novas abaixo e podem
  rolar — eles são configuração deliberada do streamer, não a leitura de canto
  de olho.
- **Trocar essa grade por `auto-fill` ou `auto-fit` quebra a regra acima.** Com
  o preset cheio a linha reflui sozinha, os seis deixam de estar lado a lado e a
  tela principal só se descobre errada durante a live. Está escrito aqui porque
  é o tipo de "melhoria" que parece óbvia para quem chega depois.
- Alvo de toque e clique com no mínimo 40px. O streamer clica com pressa.
- Nada de animação decorativa. Transição só onde comunica mudança de estado.
- Toda cor de marca vem de variável CSS, nunca literal no componente. Isso é o
  que permite white-label na Fase 3 sem reescrever componente.
- CSS em arquivo separado do JSX (ver `CLAUDE.md`).

## B. HUD do jogo (dentro da live, formato vertical, visto no celular)

Princípio: **legível num vídeo vertical comprimido, em tela de 6 polegadas.**
A referência analisada mostra o padrão que funciona: rótulos curtíssimos e
números enormes.

- Número da plataforma: o maior elemento da tela, com contorno grosso e sombra.
  Precisa ler sobre qualquer fundo de mapa.
- Rótulo de presente com no máximo 8 caracteres. Referência usa `+100`, `WIN`,
  `LIKE`, `SEGUIR`. Seguir isso.
- Nome do doador aparece por 3 segundos e some. Nunca acumula lista.
- HUD ocupa as laterais, não o centro. O centro é onde o boneco fica e onde o
  TikTok põe o comentário.
- Considerar que o TikTok corta as bordas e sobrepõe interface própria na base.
  Nada crítico nos 15% inferiores da tela.
- Contraste sempre com contorno escuro no texto claro. Mapa gerado por IA pode
  ter qualquer paleta de fundo, então o HUD não pode depender do fundo.

## Tokens compartilhados
Faixa de presente (só exibição, ver R3): I cinza, II azul, III roxo, IV laranja,
V dourado. Os mesmos hex no painel e no HUD, definidos uma vez em
`panel/src/styles/tokens.css` e espelhados em `game/src/shared/tokens.lua`.

A fonte dos dois é `data/tokens.json`, e quem espelha é `npm run gerar`. Só o
bloco `estado` vai para as DUAS superfícies — é onde mora `vitoria` (R6), que
aparece no selo "TOPO" do HUD e no aviso do painel: o mesmo estado visto de
dois lugares tem que ser a mesma cor. O bloco `hud` é do jogo e do overlay
do OBS (seção C): são o mesmo HUD, visto de dois lugares — a ponte injeta as
variáveis na página a partir do mesmo `data/tokens.json`.

### Exceção à regra das laterais
O selo de vitória é o único elemento do HUD no centro da tela. Ali a corrida
ACABOU: não há presente chegando para ler nem boneco subindo para acompanhar, e
o que o espectador precisa ver é que a torre foi vencida. É também o único
aviso do HUD sem tempo de tela — ele fica até o streamer reiniciar no painel,
porque é exatamente essa a regra do R6.

## C. Overlay do OBS (por cima da cam e do jogo, formato vertical)

Quase tudo que o espectador lê está aqui, por cima da captura (ADR-015, nota de
2026-09-04). A seção B descreve o que o jogo desenhava; ele guardou **uma coisa
só**, a barra da torre, porque ela precisa andar a cada degrau e no overlay só
andaria a cada estado — de dois em dois segundos.

- A tela tem dois andares, cam em cima e jogo embaixo, e o corte é da CENA —
  vai na URL (`?cam=33`), não no preset.
- **Sobre a cam não se desenha nada.** A proporção da cam muda de cena para
  cena, e um `?cam=` errado punha caixa em cima do rosto do streamer. Com a cam
  livre, errar o parâmetro desloca o conjunto e nunca cobre a pessoa.
- No jogo, de cima para baixo: placar e barra `VS` na primeira faixa; legenda
  dos presentes logo abaixo (positivos à esquerda, negativos à direita, ícone e
  delta); portal no rodapé à esquerda; presente que chegou no meio à esquerda;
  contagem e resultado no centro; aviso de seguidor no canto inferior direito.
  A barra da torre fica na lateral direita, mas quem a desenha é o JOGO. O centro fica livre para o boneco,
  menos no fim de rodada, quando a corrida acabou (mesma exceção da seção B).
- **Essas posições são o PADRÃO, não a lei.** Desde o Estúdio de Overlay
  (ADR-015, nota de 2026-09-04) o streamer move cada um dos oito elementos —
  `placar`, `vs`, `legendaSubida`, `legendaDescida`, `portal`, `presente`,
  `centro` e `seguidor` — pelo painel. O que está escrito acima é onde eles
  nascem, e é para onde voltam quando o ajuste é apagado. A cena de cada
  streamer deixa livre um canto diferente da tela; a ordem de leitura descrita
  aqui continua sendo a recomendação, e a régua para julgar um layout novo.
- **A coordenada é do palco, em porcentagem, pelo canto superior esquerdo.**
  `x` e `y` de 0 a 100 sobre o palco 9:16 inteiro, `escala` de 0,5 a 2. Não é
  pixel e não é `--u`: o palco muda de tamanho com a janela, e o layout salvo
  precisa cair no mesmo ponto da TELA em qualquer captura.
- **Mover um elemento o ancora pela ESQUERDA e pelo TOPO.** `legendaDescida`,
  `portal` e `seguidor` nascem colados à direita ou à base — é o que os mantém
  alinhados com a borda enquanto o conteúdo cresce. No primeiro arrastar eles
  trocam de âncora e dão um pulo, do tamanho da diferença entre a largura real
  do conteúdo e a da caixa desenhada no Estúdio. Não é bug: é o preço de
  posicionar à mão, e aparece na hora, na tela onde se está arrastando.
- **A faixa da cam aparece sombreada no Estúdio, e caixa em cima dela é
  avisada.** A regra de não desenhar sobre a cam vale igual depois de o layout
  virar do streamer — mais ainda, porque agora é possível violá-la com um
  arrastar. O aviso não bloqueia salvar: quem sabe que a cena tem a webcam
  menor do que o `?cam=` pode querer aquele espaço.
- **A legenda mostra só o que está marcado**, não todo slot do preset
  (`mostrarNoOverlay`, R1.6). Ela é uma faixa horizontal desenhada para meia
  dúzia de ícones; com o preset podendo ir a 24 (R1), mandar todos para lá
  transborda a faixa e cobre o boneco, que é o que o espectador precisa ver.
  Slot fora da legenda continua valendo no jogo — muda a tela, não a mecânica.
- **Nada de doador e nada de moeda.** Ranking, pote de moedas, maior combo e
  maior presente existiram e saíram: a live não pode correr risco de restrição.
  O que aparece é o PRESENTE e o que ele faz com a torre.
- Rótulos curtíssimos e números grandes, texto claro com contorno escuro —
  como na seção B. Nada crítico nos 15% inferiores.
- Tamanhos numa unidade de PALCO (`--u`, 1% da largura de um palco 9:16),
  não em `vw`. A fonte "Link" do LIVE Studio renderiza a página em paisagem
  (16:9) e o item é esticado para preencher a cena vertical: com `vw`, tudo
  saía 3× mais estreito que alto. A página mede a janela, monta o palco 9:16
  pela altura e, se a janela for mais larga que isso, pré-estica em X para o
  estique da fonte devolver a proporção certa. Em fonte 9:16 (OBS com
  1080×1920) nada muda. `?esticar=nao` desliga.
- Nenhuma cor literal: a página recebe os tokens injetados (`--faixa-N`,
  `--estado-*`, `--hud-*`, `--painel-*`). Medalhas do ranking usam as faixas —
  ouro é a V, prata é a I, bronze é a IV — para não abrir uma paleta nova.
