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

/**
 * O histórico que o painel lista, da mais recente para a mais antiga.
 *
 * Devolve o arquivo SEM o array `eventos`. Não é economia de banda: sessão
 * encerrada já teve o detalhe descartado (F5), mas a que a ponte persistiu em
 * segundo plano e nunca foi encerrada — queda do Node no meio da live — ainda
 * tem o detalhe por evento em disco. Ele não serve para nada numa lista de
 * histórico, e o que não sai daqui não aparece em tela nenhuma.
 *
 * `sessaoId` é a data ISO com os dois-pontos trocados, então ordenar por nome
 * é ordenar por tempo, sem parsear nada.
 */
export async function listarResumos() {
  const nomes = (await listarSessoes()).sort().reverse();
  const arquivos = await Promise.all(nomes.map((nome) => lerJsonOuPadrao(caminhoDeDados("sessoes", nome))));

  return arquivos.filter(Boolean).map(({ eventos, ...resto }) => ({
    ...resto,
    // Interrompida: existe em disco, nunca foi encerrada. O painel precisa
    // distinguir isso de uma live que terminou no Stop.
    interrompida: !resto.encerradaEm,
    eventosRegistrados: (eventos ?? []).length,
  }));
}

export async function salvarSessao(sessao) {
  const { validar } = await criarValidador();
  const problemas = validar("sessao", sessao);
  if (problemas.length) {
    throw new ErroDeDominio("sessao_invalida", `Sessão fora do contrato: ${problemas.join("; ")}`, {
      detalhe: { problemas: problemas.join("; ") },
    });
  }
  await escreverJsonAtomico(arquivo(sessao.sessaoId), sessao);
  return sessao;
}

/** Reduz a sessão ao resumo agregado. Depois disto não há mais dado de espectador em disco. */
export function reduzirAoResumo(sessao, encerradaEm) {
  const eventos = sessao.eventos ?? [];
  const comLatencia = eventos.filter((e) => typeof e.latenciaMs === "number");

  //[[ Presentes CHEGADOS por slot, não animações tocadas.
  //
  // O painel desenha isto como gráfico de barras comparativo, e o streamer
  // decide por ali quais presentes ficam nos 6 slots. Contar despacho
  // distorcia a comparação de forma DESIGUAL — presente popular chega em
  // rajada, coalesce mais (ADR-012), e a barra dele encolhia mais que a dos
  // outros, a ponto de reordenar o gráfico.
  //
  // A reserva pelos eventos existe para sessão que ficou em memória de antes
  // desta mudança: melhor o número antigo que nenhum. ]]
  let presentesPorSlot = { ...(sessao.recebidosPorSlot ?? {}) };
  if (Object.keys(presentesPorSlot).length === 0) {
    for (const evento of eventos) {
      // Presente da tabela de movimento (ADR-016) não ocupa slot: conta no
      // total e fica fora deste mapa, que é sobre os slots escolhidos. Sem
      // esta linha ele viraria a chave "null", que o schema recusa.
      if (evento.slot == null) continue;
      presentesPorSlot[evento.slot] = (presentesPorSlot[evento.slot] ?? 0) + 1;
    }
  }

  const duracaoSegundos = Math.max(
    0,
    Math.round((Date.parse(encerradaEm) - Date.parse(sessao.iniciadaEm)) / 1000),
  );

  //[[ Os contadores saem da RAIZ e vão só para o resumo.
  //
  // O schema da sessão é `additionalProperties: false`. Deixar
  // `presentesRecebidos` e `moedasRecebidas` vazarem no spread faria o arquivo
  // inteiro ser recusado na gravação — exatamente o BUG-001, em que dois campos
  // novos derrubavam o payload todo e a rota respondia sucesso mesmo assim. ]]
  const { plataformaReferencia, presentesRecebidos, moedasRecebidas, recebidosPorSlot, ...semPosicaoCorrente } = sessao;
  return {
    ...semPosicaoCorrente,
    encerradaEm,
    eventos: [],
    resumo: {
      plataformaMaxima: sessao.plataformaMaxima ?? 0,
      // ANIMAÇÕES tocadas. Ver a descrição no schema: não é o número do portão.
      totalPresentes: eventos.length,
      // PRESENTES chegados. É este que responde "os presentes aumentaram?".
      presentesRecebidos: presentesRecebidos ?? 0,
      moedasRecebidas: moedasRecebidas ?? 0,
      presentesPorSlot,
      latenciaMediaMs: comLatencia.length
        ? Math.round(comLatencia.reduce((soma, e) => soma + e.latenciaMs, 0) / comLatencia.length)
        : null,
      quedasNaturais: sessao.quedasNaturais ?? 0,
      duracaoSegundos,
    },
  };
}
