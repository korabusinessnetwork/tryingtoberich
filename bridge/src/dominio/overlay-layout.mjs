/**
 * O catálogo dos elementos do HUD da live: quem existe, como se chama na tela
 * do streamer, e ONDE ele está hoje sem ninguém ter mexido.
 *
 * Por que isto mora na ponte e não no painel: os números do padrão são o CSS de
 * `http/overlay-hud.mjs`, e duas cópias dos mesmos números divergem caladas —
 * o estúdio desenharia a caixa num lugar, o OBS mostraria em outro, e a única
 * pessoa que descobre isso é o streamer no meio da live. O painel não guarda
 * nenhuma geometria do overlay: ele desenha o que `GET /api/overlay/layout`
 * devolver. `bridge/test/overlay-layout.test.mjs` cruza este arquivo com o CSS
 * servido, para os dois não se afastarem em silêncio.
 *
 * Função pura, sem disco e sem estado: o caminho quente do presente não passa
 * por aqui, e nada aqui pode passar a passar.
 *
 * SISTEMA DE COORDENADAS — a mesma unidade do schema:
 *   x e largura em % da LARGURA do palco 9:16 (1u da página = 1%);
 *   y e altura  em % da ALTURA  do palco     (1u da página = 0,5625%).
 * A origem é o TOPO do palco, não o topo da área do jogo. A página desconta o
 * `?cam=` na hora de aplicar — é isso que faz a caixa cair onde o estúdio
 * mostrou em qualquer cena, e não só na do streamer que salvou.
 */

/** A faixa da cam quando a URL não traz `?cam=`. Igual ao `--cam` do CSS da página. */
export const CAM_PADRAO = 33;

/** 1 unidade do palco (1% da largura) em % da ALTURA dele: 100 / 177,78. */
export const U_EM_Y = 0.5625;

/** Os limites de `escala`, repetidos no schema. O painel prende antes de mandar. */
export const ESCALA_MIN = 0.5;
export const ESCALA_MAX = 2;

/** Converte um `top: Nu` do CSS (medido dentro de `.jogo`) para y em % do palco. */
const doTopoDoJogo = (u) => CAM_PADRAO + u * U_EM_Y;

/** Converte um `bottom: Nu` do CSS para a borda INFERIOR em % do palco. `.jogo` termina no fim do palco. */
const daBaseDoPalco = (u) => 100 - u * U_EM_Y;

/**
 * Os oito contêineres que a página desenha, na ordem em que o estúdio os lista.
 *
 * `largura` e `altura` são o RETÂNGULO APROXIMADO do elemento: as caixas do HUD
 * têm largura de conteúdo, que depende do texto que a live produziu naquele
 * segundo. O estúdio precisa de um retângulo para o streamer arrastar, e um
 * retângulo aproximado é o que existe — o conteúdo real pode ser mais estreito.
 *
 * `ancora` é a ponta pela qual o CSS prende o elemento HOJE. Importa porque
 * quem nasce colado à direita ou à base passa a ser ancorado pela esquerda e
 * pelo topo assim que ganha x/y, e dá um pulo no primeiro arrastar,
 * proporcional à diferença entre a largura real e a do catálogo. O painel avisa
 * quem é assim; ver 02_DESIGN_SYSTEM, seção C.
 */
export const ELEMENTOS_DO_OVERLAY = Object.freeze([
  {
    id: "placar",
    rotulo: "Placar (V / D)",
    descricao: "Vitórias e derrotas da sessão, no canto de cima à esquerda.",
    x: 2.5,
    y: doTopoDoJogo(2),
    largura: 16,
    altura: 4 * U_EM_Y,
    ancora: "esquerda-topo",
  },
  {
    id: "vs",
    rotulo: "Disputa da rodada (VS)",
    descricao: "Quanto subiu contra quanto desceu, com o medidor embaixo.",
    x: 50 - 46 / 2,
    y: doTopoDoJogo(2),
    largura: 46,
    altura: 4 * U_EM_Y,
    ancora: "centro-topo",
  },
  {
    id: "legendaSubida",
    rotulo: "Legenda dos presentes que sobem",
    descricao: "Os presentes de subida do preset no ar, com ícone e quanto cada um vale.",
    x: 2.5,
    y: doTopoDoJogo(9),
    largura: 20,
    altura: 22 * U_EM_Y,
    ancora: "esquerda-topo",
  },
  {
    id: "legendaDescida",
    rotulo: "Legenda dos presentes que descem",
    descricao: "O mesmo, do lado da descida. Nasce colado à direita.",
    x: 100 - 2.5 - 20,
    y: doTopoDoJogo(9),
    largura: 20,
    altura: 22 * U_EM_Y,
    ancora: "direita-topo",
  },
  {
    id: "portal",
    rotulo: "Barra do portal",
    descricao: "A vida do portal do primeiro andar. Só aparece com o portal aberto.",
    x: 2.5,
    y: daBaseDoPalco(14) - 6 * U_EM_Y,
    largura: 40,
    altura: 6 * U_EM_Y,
    ancora: "esquerda-base",
  },
  {
    id: "presente",
    rotulo: "Presente que chegou",
    descricao: "O que o presente fez com a torre. Aparece por 3 segundos e some.",
    x: 2.5,
    y: doTopoDoJogo(46),
    largura: 44,
    altura: 10 * U_EM_Y,
    ancora: "esquerda-topo",
  },
  {
    id: "centro",
    rotulo: "Contagem e fim de rodada",
    descricao: "TOPO! ou CAIU! e a contagem regressiva. Ocupa a largura toda e centraliza o texto.",
    x: 0,
    y: doTopoDoJogo(56),
    largura: 100,
    altura: 21 * U_EM_Y,
    ancora: "faixa-topo",
  },
  {
    id: "seguidor",
    rotulo: "Aviso de seguidor novo",
    descricao: "O follow que acabou de entrar. Nasce colado à direita e à base.",
    x: 100 - 2.5 - 52,
    y: daBaseDoPalco(3) - 7 * U_EM_Y,
    largura: 52,
    altura: 7 * U_EM_Y,
    ancora: "direita-base",
  },
].map((elemento) => Object.freeze(elemento)));

/** Só os ids, na ordem do catálogo. É a lista que o schema fixa. */
export function idsDoOverlay() {
  return ELEMENTOS_DO_OVERLAY.map((elemento) => elemento.id);
}

/**
 * O layout de quem nunca abriu o estúdio: nenhuma exceção, tudo no padrão.
 *
 * Existe como função e não como constante para ninguém guardar a referência e
 * mexer nela por engano — o núcleo publica este objeto no SSE.
 */
export function LAYOUT_VAZIO(streamerId = "local") {
  return { streamerId, atualizadoEm: null, elementos: {} };
}
