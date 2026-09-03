/**
 * Montar um mundo escolhendo as peças, em vez de descrevê-lo para uma IA.
 *
 * O gerador por texto sempre foi um atalho: o streamer descreve, o modelo
 * escolhe do acervo e devolve números. Funciona, e o custo é não saber o que
 * vai sair — metade dos problemas desta semana foi o modelo escolhendo por ele
 * (todo mapa com o mesmo céu, plataformas todas verdes, formato errado).
 *
 * Com a galeria mostrando a foto de cada peça, escolher à mão passou a ser
 * melhor em tudo que importa: é instantâneo, não gasta chamada de IA, não pode
 * falhar por spec inválido e o streamer vê o que está montando.
 *
 * Tudo aqui é função pura. Os números não são escolha: saem de
 * `PADROES_POR_FORMATO`, que é a mesma geometria afinada que o ADR-009 amarra.
 */

import { paletaDeTags } from "../acervo/desenho.mjs";
import { PADRAO_DO_MUNDO, PADROES_POR_FORMATO } from "./regras.mjs";
import { REGRAS } from "../config.mjs";

/** Espelham `mapa.schema.json`. Fora disso o repositório recusa gravar. */
const PLATAFORMAS_MIN = 100;
const PLATAFORMAS_MAX = 5000;

/** Um checkpoint visual a cada 50 degraus, e o marco do topo no último. */
function marcosDe(total) {
  const marcos = [];
  for (let p = 50; p < total; p += 50) marcos.push({ plataforma: p, tipo: "checkpoint_visual" });
  marcos.push({ plataforma: total, tipo: "topo" });
  return marcos;
}

/**
 * O spec do mundo, a partir das peças escolhidas na galeria.
 *
 * `texturas` é uma lista: uma pinta a torre inteira igual, várias revezam
 * degrau a degrau. `props` vem de fora porque é a única escolha que não tem
 * imagem para mostrar — efeito nativo não se fotografa.
 */
export function montarMundo({
  mapaId = "mundo-montado",
  nome = "Mundo montado",
  skybox,
  texturas = [],
  formato = "disco",
  totalPlataformas = PADRAO_DO_MUNDO.totalPlataformas,
  jumpHeight = PADRAO_DO_MUNDO.jumpHeight,
  props = [],
  tagsDaTextura = [],
  tagsDoCeu = [],
} = {}) {
  const padroes = PADROES_POR_FORMATO[formato] ?? PADROES_POR_FORMATO.disco;
  // A faixa é a do contrato (`mapa.schema.json`), não um número solto aqui:
  // spec fora dela seria recusado na gravação, e o streamer veria erro de
  // validação em vez de um mundo.
  const total = Math.max(PLATAFORMAS_MIN, Math.min(PLATAFORMAS_MAX, Math.round(totalPlataformas)));

  return {
    mapaId,
    streamerId: REGRAS.STREAMER_ID,
    nome,
    // "manual" e não "gemini": o contrato distingue os dois, e o histórico de
    // um mapa montado à mão não deve dizer que uma IA o escreveu.
    geradoPor: "manual",
    totalPlataformas: total,
    jumpHeight,
    skyboxAssetId: skybox,
    paleta: paletaDeTags(tagsDaTextura, tagsDoCeu),
    plataformas: {
      formato,
      ...padroes,
      // Uma textura vira string; várias viram lista. O contrato aceita as duas,
      // e mandar sempre lista faria mapa de uma textura parecer de várias — o
      // construtor deixa de tingir quando há mais de uma.
      materialAssetId: texturas.length === 1 ? texturas[0] : texturas,
    },
    props,
    marcos: marcosDe(total),
  };
}
