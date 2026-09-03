/**
 * O catálogo de presentes da TikTok sem estar ao vivo.
 *
 * A coleta original só funcionava com a live de pé, e é a live que dá o
 * catálogo mais completo — a sala traz os presentes exclusivos dela. Só que
 * montar preset é trabalho de ANTES da live: exigir estar ao ar para ver a
 * lista de presentes é pedir para configurar no pior momento possível.
 *
 * O painel `gift/list/` da própria TikTok responde sem assinatura, sem cookie e
 * sem `room_id`, devolvendo a lista global. É a mesma API que o site usa para
 * desenhar o painel de presentes, com id, nome, valor em moedas e ícone
 * oficial. Passando `room_id` de uma sala ao vivo ela devolve também os
 * presentes daquela sala.
 *
 * **API pública não contratada**, como a de skins do Roblox e a do catálogo de
 * itens (ADR-011): pode mudar de forma sem aviso. Por isso vive isolada aqui —
 * o `normalizador` já sabe traduzir o formato, e se este endpoint cair a live
 * continua sendo a fonte de verdade.
 *
 * A alternativa paga era assinar a requisição pelo Euler Stream, que exige
 * plano Business. Ver `memory/restrictions.md`: pago é adiado por padrão.
 */

import { log } from "../log.mjs";

const LISTA = "https://webcast.tiktok.com/webcast/gift/list/";

/**
 * O mínimo que a TikTok exige para responder. `aid=1988` é o app id do site;
 * sem ele a resposta vem vazia. O resto identifica um navegador comum.
 */
const PARAMETROS = {
  aid: "1988",
  app_language: "en-US",
  app_name: "tiktok_web",
  device_platform: "web",
};

const NAVEGADOR =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Timeout curto: isto é botão de painel, não caminho crítico de presente. */
const TIMEOUT_MS = 20_000;

/**
 * A lista crua, no formato que `normalizarCatalogo` já entende.
 *
 * `roomId` é opcional de propósito: sem ele vem o catálogo global, que é o que
 * serve para configurar antes da live. Com ele vêm também os presentes
 * exclusivos da sala.
 */
export async function buscarCatalogoPublico({ buscarNaRede = fetch, roomId = null, sinal = null } = {}) {
  const parametros = new URLSearchParams(PARAMETROS);
  if (roomId) parametros.set("room_id", String(roomId));

  const abortador = sinal ? null : AbortSignal.timeout(TIMEOUT_MS);
  const resposta = await buscarNaRede(`${LISTA}?${parametros}`, {
    headers: { "user-agent": NAVEGADOR, referer: "https://www.tiktok.com/" },
    signal: sinal ?? abortador,
  });

  if (!resposta.ok) throw new Error(`a TikTok respondeu ${resposta.status}`);

  const corpo = await resposta.json();

  // `status_code` diferente de 0 é erro de aplicação com HTTP 200 — o padrão
  // das APIs internas da TikTok. Sem esta checagem a lista vazia passaria por
  // "o streamer não tem presentes".
  if (corpo?.status_code !== 0) {
    throw new Error(`a TikTok recusou: status_code ${corpo?.status_code ?? "ausente"}`);
  }

  const presentes = corpo?.data?.gifts ?? [];
  if (!Array.isArray(presentes) || presentes.length === 0) {
    throw new Error("a TikTok devolveu uma lista vazia");
  }

  log.info("catalogo_publico_coletado", { total: presentes.length, comSala: Boolean(roomId) });
  return presentes;
}
