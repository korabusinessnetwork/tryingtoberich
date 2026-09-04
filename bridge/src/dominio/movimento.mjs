/**
 * A tabela de movimento: quanto a torre anda com CADA presente (ADR-016).
 *
 * Os 6 slots do ADR-007 continuam sendo os presentes ESCOLHIDOS — os que têm
 * animação própria, delta próprio e cooldown próprio. O que muda é o resto do
 * catálogo: em vez de chegar e não fazer nada, todo presente passa a ter um
 * delta, calculado por uma regra do preset (`moedas × multiplicador`) e
 * ajustável presente a presente.
 *
 * Duas coisas mandam no desenho:
 *
 * 1. **A conta é feita FRIA.** O índice nasce quando o preset ou o catálogo
 *    mudam, e o caminho quente só faz `Map.get`. Multiplicação por evento
 *    seria barata, mas a regra tem exceção e a exceção tem busca — e busca por
 *    evento é exatamente o que o Princípio nº1 não perdoa.
 * 2. **O preset guarda a REGRA, não as 670 linhas.** Só o que o streamer mexeu
 *    à mão vira `excecoes`. Presente novo no catálogo da TikTok já nasce com
 *    delta sem ninguém abrir o painel, que era a maior fraqueza de amarrar
 *    jogo a um catálogo que muda sem avisar.
 */

import { REGRAS } from "../config.mjs";
import { aplicarCombo } from "./casamento.mjs";

/**
 * O padrão pedido pelo dono: rosa de 1 moeda sobe 10 andares.
 *
 * As animações são as mais CURTAS que estão ativas em cada direção. Aqui entra
 * o catálogo inteiro, não os 6 escolhidos: cada animação ocupa o canal pelo
 * tempo dela, e o que sobra de tempo vira combate (ADR-012).
 */
export const MOVIMENTO_PADRAO = Object.freeze({
  ativo: true,
  multiplicador: 10,
  animacaoDeSubida: "sub_lanca_raios",
  animacaoDeDescida: "des_punho_impacto",
  intensidade: 2,
});

/** O bloco do preset com os buracos preenchidos. Nulo quando o preset não tem tabela. */
export function movimentoDoPreset(preset) {
  const bloco = preset?.movimento;
  if (!bloco) return null;
  return { ...MOVIMENTO_PADRAO, ...bloco, excecoes: bloco.excecoes ?? [] };
}

/**
 * A regra, sozinha: moedas × multiplicador, arredondado para baixo.
 *
 * Sempre positiva — a regra só sabe SUBIR. Descida é escolha, e escolha vira
 * exceção: ninguém deduz do preço de uma rosa que ela deveria empurrar para
 * baixo.
 */
export function deltaDaRegra(moedas, multiplicador) {
  const valor = Number.isFinite(moedas) ? Math.max(0, Math.trunc(moedas)) : 0;
  const fator = Number.isFinite(multiplicador) ? Math.max(0, Math.trunc(multiplicador)) : 0;
  return valor * fator;
}

/**
 * Índice presenteId → delta, montado uma vez por troca de preset ou catálogo.
 *
 * Zero fica no índice de propósito, e quer dizer "este presente não mexe na
 * torre". Apagar a entrada não daria no mesmo: presente ausente do índice cai
 * na regra pelo valor que veio no evento, e o streamer que zerou um presente
 * quis silenciá-lo, não recalculá-lo.
 */
export function indexarMovimento(preset, catalogo) {
  const bloco = movimentoDoPreset(preset);
  if (!bloco || !bloco.ativo) return null;

  const indice = new Map();
  for (const presente of catalogo?.presentes ?? []) {
    if (typeof presente?.presenteId !== "string") continue;
    indice.set(presente.presenteId, deltaDaRegra(presente.moedas, bloco.multiplicador));
  }
  for (const excecao of bloco.excecoes) {
    if (typeof excecao?.presenteId !== "string" || !Number.isInteger(excecao.delta)) continue;
    indice.set(excecao.presenteId, excecao.delta);
  }

  return { ...bloco, indice };
}

/**
 * Caminho quente. Devolve o disparo, ou null quando o presente não move nada.
 *
 * `slot: null` é o que distingue este disparo do disparo de slot, e ele viaja
 * assim até o log da sessão: o resumo por slot continua sendo sobre os 6.
 *
 * O presente que não está no índice cai na regra pelo valor que veio no
 * próprio evento. É o presente exclusivo da sala, ou o que a TikTok lançou
 * hoje: o catálogo local ainda não o conhece, e ele funciona mesmo assim.
 */
export function casarPorMovimento(evento, tabela) {
  if (!tabela) return null;

  const doIndice = tabela.indice.get(evento.presenteId);
  const base = doIndice ?? deltaDaRegra(evento.moedas, tabela.multiplicador);
  if (!base) return null;

  // R4 é a mesma para os dois caminhos: o delta multiplica pela rajada e a
  // intensidade sobe um nível, com a animação tocando uma vez só.
  const { delta, intensidade } = aplicarCombo(
    { delta: base, intensidade: tabela.intensidade },
    Math.max(1, evento.repeticoes ?? 1),
  );

  return {
    slot: null,
    presenteId: evento.presenteId,
    presenteNome: evento.presenteNome ?? null,
    // A direção é o sinal do delta, como em R2 — a animação segue o delta.
    animacaoId: delta > 0 ? tabela.animacaoDeSubida : tabela.animacaoDeDescida,
    delta,
    intensidade: Math.min(intensidade, REGRAS.INTENSIDADE_MAX),
    // Cooldown é do slot: trava um dos 6 que o streamer escolheu. A tabela é o
    // catálogo inteiro, e travar por presente aqui seria um mapa de timers
    // crescendo dentro do caminho quente.
    cooldownMs: 0,
    nomeDoador: evento.nomeDoador ?? null,
    repeticoes: evento.repeticoes,
    recebidoEm: evento.recebidoEm,
  };
}
