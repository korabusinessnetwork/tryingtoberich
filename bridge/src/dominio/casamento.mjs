/**
 * Casamento evento→slot. É o coração do caminho quente: roda a cada presente
 * e não pode tocar disco, rede nem relógio de parede.
 *
 * O motor no Roblox é burro de propósito (ADR-007): ele recebe
 * {animacaoId, delta, intensidade} e executa. Quem sabe o que é presente e
 * quanto vale é só este módulo — e mesmo aqui o valor não decide nada (R3).
 */

import { REGRAS } from "../config.mjs";

/** Índice presenteId → slot, montado uma vez quando o preset ativo muda. */
export function indexarSlots(preset) {
  return new Map((preset?.slots ?? []).map((slot) => [slot.presenteId, slot]));
}

/**
 * R4 — o delta do slot é multiplicado pelas repetições e a intensidade sobe UM
 * nível, com teto em 5. A animação toca uma vez só: tocar N animações para N
 * repetições trava a tela e quebra a latência das próximas.
 */
export function aplicarCombo(slot, repeticoes) {
  const repetido = repeticoes > 1;
  return {
    delta: slot.delta * repeticoes,
    intensidade: repetido
      ? Math.min(slot.intensidade + 1, REGRAS.INTENSIDADE_MAX)
      : slot.intensidade,
  };
}

/**
 * Devolve o disparo pronto, ou null quando o presente não está em nenhum slot.
 * Presente fora dos 6 não faz nada, nem o mais caro do catálogo (F2.4, R3).
 */
export function casar(evento, indice) {
  const slot = indice.get(evento.presenteId);
  if (!slot) return null;

  const { delta, intensidade } = aplicarCombo(slot, evento.repeticoes);
  return {
    slot: slot.posicao,
    presenteId: evento.presenteId,
    presenteNome: evento.presenteNome ?? null,
    animacaoId: slot.animacaoId,
    delta,
    intensidade,
    cooldownMs: slot.cooldownMs ?? 0,
    nomeDoador: evento.nomeDoador ?? null,
    repeticoes: evento.repeticoes,
    recebidoEm: evento.recebidoEm,
  };
}
