/**
 * Sessões. Efêmeras por definição.
 *
 * Ao encerrar, o detalhe por evento é DESCARTADO e sobra só o resumo agregado
 * (F5 e 11_SEGURANCA, camada 4). O schema recusa arquivo encerrado que ainda
 * carregue eventos, então esquecer de reduzir vira erro de validação.
 */

import { ErroDeDominio } from "../erros.mjs";
import { caminhoDeDados, escreverJsonAtomico, lerJsonOuPadrao, listarJson } from "./arquivo.mjs";
import { criarValidador } from "./schemas.mjs";

const arquivo = (sessaoId) => caminhoDeDados("sessoes", `${sessaoId}.json`);

/** "2026-09-01T20:00:00.000Z" → "2026-09-01T20-00-00" */
export const sessaoIdDe = (data) => data.toISOString().slice(0, 19).replace(/:/g, "-");

export async function listarSessoes() {
  return listarJson(caminhoDeDados("sessoes"));
}

export async function carregarSessao(sessaoId) {
  return lerJsonOuPadrao(arquivo(sessaoId));
}

export async function salvarSessao(sessao) {
  const { validar } = await criarValidador();
  const problemas = validar("sessao", sessao);
  if (problemas.length) {
    throw new ErroDeDominio("sessao_invalida", `Sessão fora do contrato: ${problemas.join("; ")}`);
  }
  await escreverJsonAtomico(arquivo(sessao.sessaoId), sessao);
  return sessao;
}

/** Reduz a sessão ao resumo agregado. Depois disto não há mais dado de espectador em disco. */
export function reduzirAoResumo(sessao, encerradaEm) {
  const eventos = sessao.eventos ?? [];
  const comLatencia = eventos.filter((e) => typeof e.latenciaMs === "number");

  const presentesPorSlot = {};
  for (const evento of eventos) {
    presentesPorSlot[evento.slot] = (presentesPorSlot[evento.slot] ?? 0) + 1;
  }

  const duracaoSegundos = Math.max(
    0,
    Math.round((Date.parse(encerradaEm) - Date.parse(sessao.iniciadaEm)) / 1000),
  );

  const { plataformaReferencia, ...semPosicaoCorrente } = sessao;
  return {
    ...semPosicaoCorrente,
    encerradaEm,
    eventos: [],
    resumo: {
      plataformaMaxima: sessao.plataformaMaxima ?? 0,
      totalPresentes: eventos.length,
      presentesPorSlot,
      latenciaMediaMs: comLatencia.length
        ? Math.round(comLatencia.reduce((soma, e) => soma + e.latenciaMs, 0) / comLatencia.length)
        : null,
      quedasNaturais: sessao.quedasNaturais ?? 0,
      duracaoSegundos,
    },
  };
}
