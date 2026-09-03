/**
 * As imagens do acervo, desenhadas em código (ADR-004, nota de 2026-09-02).
 *
 * O ADR sempre disse que montar o acervo é trabalho de véspera e que ampliá-lo
 * é a alavanca de variedade. O que ele não resolvia é de ONDE sai a imagem: com
 * um céu e uma textura aprovados, todo mapa gerado sai igual, e não por culpa
 * do modelo — ele escolhe entre um.
 *
 * Geração por IA de imagem é paga (medido: `limit: 0` no tier gratuito do
 * Gemini, nos seis modelos de imagem). Textura e céu, porém, são justamente o
 * tipo de imagem que sai de ruído e gradiente: não precisa de modelo nenhum.
 *
 * **A receita vem das TAGS, não do id.** O acervo é dado; acrescentar uma
 * textura nova é editar `acervo.json`, e nada aqui precisa saber que ela
 * existe. Tag desconhecida cai no neutro em vez de quebrar.
 */

import { escreverPng } from "./png.mjs";

export const LADO_DA_TEXTURA = 512;
export const LADO_DA_FACE = 512;

const hexParaRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const misturar = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/* ---------------------------------------------------------------- */
/* Ruído                                                             */
/* ---------------------------------------------------------------- */

/**
 * Ruído de valor que dá a volta.
 *
 * Textura de plataforma se repete lado a lado o tempo todo: ruído que não
 * fecha na borda vira uma grade visível no chão. Fechar é só tomar o resto da
 * divisão pelo período da grade — a borda direita lê a mesma célula da
 * esquerda.
 */
function criarRuido(semente, periodo) {
  const aleatorio = (x, y) => {
    // Hash inteiro determinístico: mesma semente, mesma imagem, sempre. Um
    // acervo que mudasse de aparência a cada geração seria impossível de curar.
    const px = ((x % periodo) + periodo) % periodo;
    const py = ((y % periodo) + periodo) % periodo;
    let h = Math.imul(px, 374761393) + Math.imul(py, 668265263) + Math.imul(semente, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };

  const suave = (t) => t * t * (3 - 2 * t);

  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = suave(x - x0);
    const ty = suave(y - y0);
    const a = aleatorio(x0, y0);
    const b = aleatorio(x0 + 1, y0);
    const c = aleatorio(x0, y0 + 1);
    const d = aleatorio(x0 + 1, y0 + 1);
    const superior = a + (b - a) * tx;
    const inferior = c + (d - c) * tx;
    return superior + (inferior - superior) * ty;
  };
}

/** Várias oitavas: a primeira dá as manchas grandes, as últimas o granulado. */
function criarFractal(semente, oitavas, celulas) {
  const camadas = [];
  for (let i = 0; i < oitavas; i += 1) {
    camadas.push(criarRuido(semente + i * 7919, celulas << i));
  }

  return (u, v) => {
    let soma = 0;
    let peso = 0;
    for (let i = 0; i < oitavas; i += 1) {
      const escala = celulas << i;
      const amplitude = 1 / (i + 1);
      soma += camadas[i](u * escala, v * escala) * amplitude;
      peso += amplitude;
    }
    return soma / peso;
  };
}

/* ---------------------------------------------------------------- */
/* Vocabulário de tags                                               */
/* ---------------------------------------------------------------- */

/**
 * O que cada tag diz sobre a superfície. Só as tags que o acervo usa hoje — as
 * que faltarem caem no neutro, que é cinza médio granulado.
 *
 * `padrao` decide o desenho por cima do ruído: `veios` risca fendas, `listras`
 * faz chapa de metal, `flocos` espalha pontos, `cristal` faceta, `liso` não põe
 * nada.
 */
const SUPERFICIE_POR_TAG = {
  rocha: { cor: "#4a3f3a", escura: "#241d1a", aspereza: 1, padrao: "veios", celulas: 6 },
  vulcanico: { cor: "#3a2420", escura: "#150c0a", aspereza: 1, padrao: "veios", brilho: "#ff5a1f", celulas: 6 },
  gelo: { cor: "#bcd8ea", escura: "#7fa8c4", aspereza: 0.35, padrao: "cristal", celulas: 4 },
  metal: { cor: "#8b9199", escura: "#565b61", aspereza: 0.5, padrao: "listras", celulas: 8 },
  industrial: { cor: "#7d838a", escura: "#4a4f55", aspereza: 0.6, padrao: "listras", celulas: 8 },
  madeira: { cor: "#7a5433", escura: "#432c18", aspereza: 0.7, padrao: "veios", celulas: 3 },
  rustico: { cor: "#6d4a2c", escura: "#3b2614", aspereza: 0.8, padrao: "veios", celulas: 3 },
  pedra: { cor: "#6a6a63", escura: "#3c3c37", aspereza: 0.9, padrao: "veios", celulas: 5 },
  verde: { cor: "#4f6b3a", escura: "#2b3d1f", aspereza: 0.8, padrao: "flocos", celulas: 7 },
  umido: { cor: "#46543c", escura: "#232c1d", aspereza: 0.8, padrao: "flocos", celulas: 7 },
  areia: { cor: "#cbb083", escura: "#9c8256", aspereza: 0.45, padrao: "liso", celulas: 10 },
  deserto: { cor: "#c9a86f", escura: "#957842", aspereza: 0.45, padrao: "liso", celulas: 10 },
  claro: { cor: "#c8c8c8", escura: "#8f8f8f", aspereza: 0.4, padrao: "liso", celulas: 6 },
  escuro: { cor: "#2e2e2e", escura: "#141414", aspereza: 1, padrao: "veios", celulas: 6 },

  //[[ Bloco de Minecraft: a textura é PIXELADA, e é só isso que a define.
  //
  // Cor e ruído aqui são quase irrelevantes — o que o olho reconhece é a grade
  // de 16 pixels grandes, sem nenhuma transição suave. Por isso `padrao:
  // "pixel"`, que quantiza a imagem inteira numa grade grosseira depois de
  // desenhada, em vez de mais uma variação de mancha. ]]
  minecraft: { padrao: "pixel", celulas: 16, aspereza: 1 },
  cubico: { padrao: "pixel", celulas: 16, aspereza: 1 },

  //[[ Os blocos. A tag mais específica vem PRIMEIRA no acervo e manda na cor —
  // `minecraft` e `cubico` só dizem "pixelado", sem cor nenhuma, para não
  // puxarem a média para o verde da grama. ]]
  //[[ Os dois tons de cada bloco são BEM separados de propósito.
  //
  // Com cor e escura vizinhas, o degrau de luz some e o bloco sai chapado — o
  // pedregulho virou um cinza liso, indistinguível de parte sem textura. No
  // Minecraft cada bloco tem uma faixa larga entre o pixel mais claro e o mais
  // escuro, e é ela que faz o granulado aparecer de longe. ]]
  grama: { cor: "#8fd048", escura: "#4a7020", padrao: "pixel", celulas: 16, aspereza: 1 },
  terra: { cor: "#9b6f4c", escura: "#5a3d28", padrao: "pixel", celulas: 16, aspereza: 1 },
  pedregulho: { cor: "#9a9a9a", escura: "#4a4a4a", padrao: "pixel", celulas: 16, aspereza: 1 },
  tabua: { cor: "#c49a68", escura: "#6f4f2f", padrao: "pixel", celulas: 16, aspereza: 0.7 },
  tijolo: { cor: "#b06b58", escura: "#5f3730", padrao: "pixel", celulas: 16, aspereza: 0.8 },
  areiado: { cor: "#efe4b0", escura: "#b9a877", padrao: "pixel", celulas: 16, aspereza: 0.5 },
  netherrack: { cor: "#a24242", escura: "#4a1c1c", padrao: "pixel", celulas: 16, aspereza: 1 },
  esmeralda: { cor: "#4bf08a", escura: "#1d7a44", padrao: "pixel", celulas: 16, aspereza: 0.6 },
  diamante: { cor: "#7ff5e2", escura: "#2a8a80", padrao: "pixel", celulas: 16, aspereza: 0.6 },
  ouro: { cor: "#ffe14d", escura: "#a8871f", padrao: "pixel", celulas: 16, aspereza: 0.6 },
};

const SUPERFICIE_NEUTRA = { cor: "#7d7d7d", escura: "#4b4b4b", aspereza: 0.7, padrao: "liso", celulas: 6 };

/**
 * O que cada tag diz sobre o céu: cor no alto, cor no horizonte, o que povoa a
 * abóbada e quanta estrela aparece.
 */
const CEU_POR_TAG = {
  noturno: { alto: "#050914", horizonte: "#141d33", nuvem: "#1d2742", estrelas: 0.9 },
  estrelado: { alto: "#040713", horizonte: "#101a30", nuvem: "#1a2540", estrelas: 1 },
  aurora: { alto: "#04121a", horizonte: "#0d3a3a", nuvem: "#1f7a63", estrelas: 0.7 },
  gelo: { alto: "#173049", horizonte: "#6fa8c8", nuvem: "#9dc6dd", estrelas: 0.2 },
  tempestade: { alto: "#2a2f36", horizonte: "#565d66", nuvem: "#7c848e", estrelas: 0 },
  nublado: { alto: "#3a4048", horizonte: "#767d86", nuvem: "#9aa1a9", estrelas: 0 },
  chuva: { alto: "#242a31", horizonte: "#4d545c", nuvem: "#6e767f", estrelas: 0 },
  diurno: { alto: "#2f7fd0", horizonte: "#bcdcf5", nuvem: "#ffffff", estrelas: 0 },
  claro: { alto: "#3a8ad8", horizonte: "#c9e4f7", nuvem: "#ffffff", estrelas: 0 },
  azul: { alto: "#2b6fc4", horizonte: "#a9d2ef", nuvem: "#f2f8ff", estrelas: 0 },
  deserto: { alto: "#4f8fc6", horizonte: "#e8cf9a", nuvem: "#f7ead0", estrelas: 0 },
  amarelo: { alto: "#5a93c0", horizonte: "#e9d49b", nuvem: "#f8eed4", estrelas: 0 },
  entardecer: { alto: "#1d1233", horizonte: "#ff7a2f", nuvem: "#c94a1e", estrelas: 0.3 },
  vulcanico: { alto: "#170a0a", horizonte: "#c43a12", nuvem: "#7d1f0c", estrelas: 0.2 },
  quente: { alto: "#2a1010", horizonte: "#d4551d", nuvem: "#943010", estrelas: 0.1 },
  frio: { alto: "#12233a", horizonte: "#5d86a8", nuvem: "#8fb0c8", estrelas: 0.4 },
  polar: { alto: "#0a1a2c", horizonte: "#4f7d9e", nuvem: "#88aec6", estrelas: 0.6 },
  dramatico: { alto: "#1a1418", horizonte: "#7a3a2a", nuvem: "#4a2018", estrelas: 0.2 },
  laranja: { alto: "#2a1408", horizonte: "#ff8a3a", nuvem: "#d4551d", estrelas: 0.1 },
  arido: { alto: "#5a93c0", horizonte: "#dcc08a", nuvem: "#f0e2c4", estrelas: 0 },
  calmo: { alto: "#0a1526", horizonte: "#2a4460", nuvem: "#3d5a78", estrelas: 0.5 },
  verde: { alto: "#06131a", horizonte: "#125a48", nuvem: "#2a9a78", estrelas: 0.6 },

  //[[ Céu de Minecraft: azul chapado e nuvem branca em bloco.
  //
  // O céu do jogo não tem gradiente nem nuvem macia — é uma cor só com massas
  // brancas de canto reto flutuando. `pixel` faz a mesma quantização da
  // textura, e é ela que dá a leitura. ]]
  minecraft: { alto: "#79a6ff", horizonte: "#9dc0ff", nuvem: "#ffffff", estrelas: 0, padrao: "pixel" },
  cubico: { alto: "#79a6ff", horizonte: "#9dc0ff", nuvem: "#ffffff", estrelas: 0, padrao: "pixel" },
};

const CEU_NEUTRO = { alto: "#26456b", horizonte: "#8fb4d4", nuvem: "#c9dced", estrelas: 0.2 };

/**
 * Média das receitas que as tags do item pedirem. Nenhuma conhecida = neutro.
 *
 * Cor entra por média, porque somar "vulcanico" com "escuro" tem que dar mais
 * escuro que cada um. Padrão NÃO: a primeira tag conhecida manda, senão
 * "rocha vulcânica" viraria uma média de desenhos que não existe.
 */
function combinar(tags, vocabulario, neutro) {
  const achadas = (tags ?? []).map((t) => vocabulario[t]).filter(Boolean);
  if (achadas.length === 0) {
    return {
      cor: hexParaRgb(neutro.cor ?? "#7d7d7d"),
      escura: hexParaRgb(neutro.escura ?? "#4b4b4b"),
      alto: neutro.alto ? hexParaRgb(neutro.alto) : null,
      horizonte: neutro.horizonte ? hexParaRgb(neutro.horizonte) : null,
      nuvem: neutro.nuvem ? hexParaRgb(neutro.nuvem) : null,
      brilho: null,
      aspereza: neutro.aspereza ?? 0.7,
      estrelas: neutro.estrelas ?? 0,
      padrao: neutro.padrao ?? "liso",
      celulas: neutro.celulas ?? 6,
    };
  }

  //[[ Média PESADA pela ordem das tags, não simples.
  //
  // No acervo a tag mais forte vem primeiro: "noturno, estrelado, frio, azul,
  // calmo". Com média simples, `azul` — que no vocabulário é azul de dia —
  // clareava a noite até virar fim de tarde, e o céu noturno saía com cara de
  // entardecer. Peso 1, 1/2, 1/3 deixa as primeiras mandarem e as últimas
  // apenas temperarem. ]]
  const peso = (indice) => 1 / (indice + 1);

  const mediaDeCor = (campo, reserva) => {
    let soma = [0, 0, 0];
    let total = 0;
    achadas.forEach((receita, indice) => {
      if (typeof receita[campo] !== "string") return;
      const cor = hexParaRgb(receita[campo]);
      const p = peso(indice);
      soma = [soma[0] + cor[0] * p, soma[1] + cor[1] * p, soma[2] + cor[2] * p];
      total += p;
    });
    if (total === 0) return reserva ? hexParaRgb(reserva) : null;
    return [soma[0] / total, soma[1] / total, soma[2] / total];
  };

  const mediaDeNumero = (campo, padrao) => {
    let soma = 0;
    let total = 0;
    achadas.forEach((receita, indice) => {
      if (typeof receita[campo] !== "number") return;
      soma += receita[campo] * peso(indice);
      total += peso(indice);
    });
    return total === 0 ? padrao : soma / total;
  };

  return {
    cor: mediaDeCor("cor", neutro.cor),
    escura: mediaDeCor("escura", neutro.escura),
    alto: mediaDeCor("alto", neutro.alto),
    horizonte: mediaDeCor("horizonte", neutro.horizonte),
    nuvem: mediaDeCor("nuvem", neutro.nuvem),
    brilho: achadas.find((r) => r.brilho)?.brilho ?? null,
    aspereza: mediaDeNumero("aspereza", neutro.aspereza ?? 0.7),
    estrelas: mediaDeNumero("estrelas", neutro.estrelas ?? 0),
    padrao: achadas.find((r) => r.padrao)?.padrao ?? neutro.padrao ?? "liso",
    celulas: Math.max(2, Math.round(mediaDeNumero("celulas", neutro.celulas ?? 6))),
  };
}

const paraHex = (rgb) =>
  "#" + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");

/**
 * A paleta de um mundo montado à mão, a partir das peças escolhidas.
 *
 * O mesmo vocabulário que desenha as imagens serve para tingir a torre: a cor
 * da textura vira a primária, a versão escura dela a secundária, e a nuvem do
 * céu vira o destaque — que é a cor dos checkpoints e do marco do topo.
 *
 * Sai daqui e não de uma tabela nova porque a paleta TEM que combinar com o que
 * o streamer vê na galeria. Duas fontes de cor divergiriam na primeira
 * afinação, e o mapa sairia com destaque de um tema e chão de outro.
 */
export function paletaDeTags(tagsDaTextura, tagsDoCeu) {
  const superficie = combinar(tagsDaTextura, SUPERFICIE_POR_TAG, SUPERFICIE_NEUTRA);
  const ceu = combinar(tagsDoCeu, CEU_POR_TAG, CEU_NEUTRO);
  return {
    primaria: paraHex(superficie.cor),
    secundaria: paraHex(superficie.escura),
    destaque: paraHex(ceu.nuvem ?? hexParaRgb(CEU_NEUTRO.nuvem)),
  };
}

/** Semente estável a partir do id: a mesma peça sai igual toda vez. */
function sementeDoId(id) {
  let h = 2166136261;
  for (const caractere of String(id)) {
    h ^= caractere.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ---------------------------------------------------------------- */
/* Textura                                                           */
/* ---------------------------------------------------------------- */

/** Um PNG quadrado que se repete sem emenda, para a face da plataforma. */
export function desenharTextura(item, { lado = LADO_DA_TEXTURA } = {}) {
  const receita = combinar(item.tags, SUPERFICIE_POR_TAG, SUPERFICIE_NEUTRA);
  const semente = sementeDoId(item.id);
  const base = criarFractal(semente, 4, receita.celulas);
  const detalhe = criarFractal(semente + 4001, 2, receita.celulas * 4);
  const brilho = receita.brilho ? hexParaRgb(receita.brilho) : null;

  //[[ `pixel` amostra em GRADE, não por pixel.
  //
  // Um bloco de Minecraft é 16x16 pixels grandes, sem transição nenhuma. Se o
  // ruído fosse lido em cada pixel da imagem e quantizado depois, sobraria
  // gradiente dentro de cada quadradinho e a leitura se perderia. Amostrar o
  // centro da célula e pintar a célula inteira com aquela cor é o que faz a
  // textura ser de bloco, e não de pedra desfocada. ]]
  const emGrade = receita.padrao === "pixel";
  const grade = Math.max(4, receita.celulas);

  return escreverPng(lado, lado, (x, y) => {
    let u = x / lado;
    let v = y / lado;
    if (emGrade) {
      u = (Math.floor(u * grade) + 0.5) / grade;
      v = (Math.floor(v * grade) + 0.5) / grade;
    }

    const n = base(u, v);
    const g = detalhe(u, v);

    //[[ O bloco tem POUCOS tons, e bem separados.
    //
    // A mistura contínua entre a cor e a escura mantém tudo perto do meio: o
    // pedregulho saiu um cinza chapado, indistinguível de uma parte sem textura
    // nenhuma. Textura de Minecraft é o contrário — três ou quatro degraus de
    // luz, cada pixel caindo em um deles, e é o salto entre eles que faz o
    // bloco ser lido como bloco.
    //
    // Os degraus vão ALÉM das duas cores da receita (de -0.15 a 1.15) porque
    // o extremo é justamente o que dá o granulado; ficar entre elas devolveria
    // o chapado por outro caminho. ]]
    if (receita.padrao === "pixel") {
      const TONS = 4;
      const bruto = n * 0.7 + g * 0.3;
      const degrau = Math.min(TONS - 1, Math.max(0, Math.floor(bruto * TONS)));
      const t = -0.15 + (degrau / (TONS - 1)) * 1.3;
      return misturar(receita.escura, receita.cor, t);
    }

    let cor = misturar(receita.escura, receita.cor, n * 0.75 + g * 0.25 * receita.aspereza);

    if (receita.padrao === "veios") {
      // Fenda: onde o ruído passa perto do meio, escurece forte. Dá borda de
      // rocha quebrada sem precisar desenhar linha nenhuma.
      const fenda = 1 - Math.min(1, Math.abs(n - 0.5) * 9);
      cor = misturar(cor, receita.escura, fenda * 0.85);
      if (brilho && fenda > 0.72) cor = misturar(cor, brilho, (fenda - 0.72) * 3.2);
    } else if (receita.padrao === "listras") {
      const chapa = (Math.floor(u * 8) + Math.floor(v * 8)) % 2 === 0 ? 1.06 : 0.94;
      cor = [cor[0] * chapa, cor[1] * chapa, cor[2] * chapa];
    } else if (receita.padrao === "cristal") {
      const faceta = Math.abs(Math.sin((u + n * 0.35) * Math.PI * 8));
      cor = misturar(cor, [255, 255, 255], faceta * 0.22);
    } else if (receita.padrao === "flocos") {
      if (g > 0.68) cor = misturar(cor, receita.cor, (g - 0.68) * 2.4);
    }

    return cor;
  });
}

/* ---------------------------------------------------------------- */
/* Céu                                                               */
/* ---------------------------------------------------------------- */

/**
 * UMA imagem de céu, para as seis faces.
 *
 * O jogo põe a mesma imagem nas seis (`construtorMapa.lua`, `aplicarCeu`), e
 * essa restrição manda no desenho: **não pode haver linha de horizonte**. Um
 * gradiente de baixo para cima, que é o jeito óbvio de desenhar céu, apareceria
 * também no teto e no chão da caixa, com a mesma listra clara em seis lugares
 * — e o céu vira um cubo visível.
 *
 * O que funciona nas seis faces é ambiência: cor de fundo, massas de nuvem
 * grandes e estrelas, tudo dando a volta na borda. A cor de horizonte da
 * receita entra como brilho difuso, não como faixa, para o tema continuar
 * legível (vulcânico ainda é laranja, polar ainda é azul).
 *
 * O céu de seis faces distintas — com nuvem atravessando a quina — precisaria
 * de seis assetIds por item, e o acervo guarda um. Fica anotado como próximo
 * passo, não como dívida escondida.
 */
export function desenharCeu(item, { lado = LADO_DA_FACE } = {}) {
  const receita = combinar(item.tags, CEU_POR_TAG, CEU_NEUTRO);
  const semente = sementeDoId(item.id);
  const massa = criarFractal(semente, 4, 3);
  const detalhe = criarFractal(semente + 3301, 3, 8);
  const estrela = criarRuido(semente + 991, lado);

  const alto = receita.alto ?? hexParaRgb(CEU_NEUTRO.alto);
  const horizonte = receita.horizonte ?? hexParaRgb(CEU_NEUTRO.horizonte);
  const corDaNuvem = receita.nuvem ?? hexParaRgb(CEU_NEUTRO.nuvem);

  // Céu de bloco: mesma amostragem em grade da textura. A nuvem do Minecraft
  // tem canto reto, e canto reto é o que a grade produz.
  const emGrade = receita.padrao === "pixel";
  const grade = 32;

  return escreverPng(lado, lado, (x, y) => {
    let u = x / lado;
    let v = y / lado;
    if (emGrade) {
      u = (Math.floor(u * grade) + 0.5) / grade;
      v = (Math.floor(v * grade) + 0.5) / grade;
    }

    const n = massa(u, v);
    const g = detalhe(u, v);

    //[[ Céu de bloco não tem meio-tom.
    //
    // No Minecraft a nuvem é branca chapada, com borda reta, e o azul atrás é
    // uma cor só. Misturar a nuvem por gradiente — que é o certo para os
    // outros céus — dava manchas azuladas indistinguíveis de ruído, e o céu
    // saía "sujo" em vez de cúbico. Aqui é liga-desliga, e o limiar é alto
    // para a nuvem ser rara e reconhecível. ]]
    if (emGrade) {
      const nuvemCheia = n > 0.68 && g > 0.52;
      return nuvemCheia ? corDaNuvem : misturar(alto, horizonte, n * 0.35);
    }

    // Fundo: a cor do alto puxada para a do horizonte onde a massa é densa.
    // É o que dá profundidade sem desenhar faixa nenhuma.
    let cor = misturar(alto, horizonte, Math.pow(n, 1.8) * 0.75);

    // A nuvem só aparece acima de um limiar: abaixo dele fica céu limpo, e é
    // esse contraste que faz parecer nuvem em vez de mancha.
    if (n > 0.55) cor = misturar(cor, corDaNuvem, Math.min(1, (n - 0.55) * 2.2) * (0.55 + g * 0.45));

    if (receita.estrelas > 0) {
      const cintilo = estrela(x, y);
      if (cintilo > 0.9955) {
        // Estrela some atrás de nuvem, como na vida real.
        const atras = Math.max(0, 1 - Math.max(0, n - 0.55) * 3);
        cor = misturar(cor, [255, 255, 240], ((cintilo - 0.9955) / 0.0045) * receita.estrelas * atras);
      }
    }

    return cor;
  });
}
