/**
 * Combate de presentes. Ver ADR-012.
 *
 * Enquanto uma animação está tocando, todo presente que chega entra num
 * combate: as subidas somam entre si, as descidas somam entre si, e os dois
 * lados se anulam. Vence o lado de maior soma absoluta, e o boneco anda o
 * LÍQUIDO da disputa, não o bruto.
 *
 * Tudo aqui é função pura. O despachante cuida do relógio.
 */

import { REGRAS } from "../config.mjs";

/**
 * Presentes do mesmo slot viram um participante só. Se a plateia manda 30 Rose
 * de +2, quem disputa a animação é "slot 1 com +60", não trinta entradas de +2.
 *
 * Quem vem da tabela de movimento (ADR-016) não tem slot, e aí quem agrupa é o
 * PRESENTE. Agrupar todos eles no mesmo balde nulo somaria uma rosa de +10 com
 * um foguete de -3000 e mandaria um participante só, com o delta somado e a
 * animação de um deles — a disputa entre dois presentes de fora dos 6
 * simplesmente não apareceria.
 */
export function agruparPorSlot(disparos) {
  const porSlot = new Map();

  for (const disparo of disparos) {
    const chave = disparo.slot ?? `presente:${disparo.presenteId}`;
    const anterior = porSlot.get(chave);
    if (!anterior) {
      porSlot.set(chave, { ...disparo });
      continue;
    }
    porSlot.set(chave, {
      ...anterior,
      delta: anterior.delta + disparo.delta,
      repeticoes: anterior.repeticoes + disparo.repeticoes,
      intensidade: Math.max(anterior.intensidade, disparo.intensidade),
      // O último doador é quem aparece no HUD: nome antigo em combate longo confunde.
      nomeDoador: disparo.nomeDoador ?? anterior.nomeDoador,
    });
  }

  return [...porSlot.values()];
}

/**
 * Resolve o combate.
 *
 * Devolve `{ anulado: true }` quando os dois lados se cancelam exatamente. Aí
 * o boneco não anda e nenhum evento vai para o jogo — delta 0 não existe no
 * contrato. O painel mostra o empate; é o momento mais divertido da mecânica.
 */
export function resolverCombate(disparos) {
  const participantes = agruparPorSlot(disparos);
  const subida = participantes.filter((p) => p.delta > 0);
  const descida = participantes.filter((p) => p.delta < 0);

  const somaSubida = subida.reduce((soma, p) => soma + p.delta, 0);
  const somaDescida = descida.reduce((soma, p) => soma + p.delta, 0);
  const liquido = somaSubida + somaDescida;
  const contestado = subida.length > 0 && descida.length > 0;

  const disputa = { participantes: participantes.length, somaSubida, somaDescida, liquido, contestado };

  if (liquido === 0) return { anulado: true, disputa };

  // Vence o lado de maior soma absoluta, que é exatamente o sinal do líquido.
  const vencedores = liquido > 0 ? subida : descida;
  const campeao = vencedores.reduce((maior, p) => (Math.abs(p.delta) > Math.abs(maior.delta) ? p : maior));

  return {
    anulado: false,
    disputa,
    disparo: {
      ...campeao,
      delta: liquido,
      // Disputa de verdade sobe um nível, com o mesmo teto do combo do R4.
      intensidade: Math.min(campeao.intensidade + (contestado ? 1 : 0), REGRAS.INTENSIDADE_MAX),
    },
  };
}
