/**
 * Catálogo de presentes.
 *
 * A fonte de verdade é a própria live: o catálogo real é gravado a cada
 * conexão. A semente versionada existe só para desenvolver sem estar ao vivo e
 * NUNCA é misturada com o real — misturar deixaria id de semente marcado
 * `ativo: false` sujando o seletor do painel para sempre.
 * Ver docs/04_MODELAGEM/catalogo-presentes.md.
 */

import { REGRAS } from "../config.mjs";
import { ErroDeDominio } from "../erros.mjs";
import { caminhoDeDados, escreverJsonAtomico, lerJsonOuPadrao } from "./arquivo.mjs";
import { criarValidador } from "./schemas.mjs";

const ARQUIVO_REAL = caminhoDeDados("catalogo-presentes.json");
const ARQUIVO_SEMENTE = caminhoDeDados("catalogo-presentes.seed.json");

const vazio = () => ({
  streamerId: REGRAS.STREAMER_ID,
  origem: "live",
  confirmado: true,
  atualizadoEm: null,
  presentes: [],
});

/** O catálogo real quando existe; senão a semente, para o painel ter o que mostrar. */
export async function carregarCatalogo() {
  const real = await lerJsonOuPadrao(ARQUIVO_REAL);
  if (real) return real;
  return (await lerJsonOuPadrao(ARQUIVO_SEMENTE)) ?? vazio();
}

/**
 * Merge da coleta com o que já está em disco:
 * item novo entra, item existente tem valor e ícone atualizados, item que
 * sumiu vira `ativo: false` mas não é apagado — preset antigo referencia.
 *
 * `podeDesativar` existe porque "sumiu" só faz sentido contra a MESMA fonte.
 * O painel público da TikTok não conhece os presentes exclusivos de uma sala, e
 * a sala não lista tudo que o painel global lista: deixar uma fonte apagar a
 * outra faria a lista encolher a cada troca, sem ninguém ter mexido em nada.
 */
export function mesclarPresentes(existentes, coletados, agora, { podeDesativar = true } = {}) {
  const porId = new Map(existentes.map((p) => [p.presenteId, p]));

  for (const coletado of coletados) {
    const anterior = porId.get(coletado.presenteId);
    porId.set(coletado.presenteId, { ...anterior, ...coletado, ativo: true, vistoEm: agora });
  }

  if (podeDesativar) {
    const idsColetados = new Set(coletados.map((p) => p.presenteId));
    for (const [id, presente] of porId) {
      if (!idsColetados.has(id)) porId.set(id, { ...presente, ativo: false });
    }
  }

  return [...porId.values()].sort((a, b) => b.moedas - a.moedas || a.nome.localeCompare(b.nome));
}

/**
 * Grava a coleta. `origem` diz de onde ela veio: `live` é a sala, `publico` é o
 * painel de presentes da própria TikTok (ver `tiktok/catalogo-publico.mjs`).
 *
 * As duas são reais e se acumulam no mesmo arquivo, porque os ids são os
 * mesmos da TikTok. A semente é a única que nunca se mistura: os ids dela são
 * inventados, e um `sem-rose` marcado `ativo: false` sujaria o seletor do
 * painel para sempre.
 */
export async function salvarColeta(coletados, agora = new Date().toISOString(), { origem = "live" } = {}) {
  const emDisco = await lerJsonOuPadrao(ARQUIVO_REAL);
  const anterior = emDisco && emDisco.origem !== "semente" ? emDisco : null;

  const catalogo = {
    streamerId: REGRAS.STREAMER_ID,
    origem,
    confirmado: true,
    atualizadoEm: agora,
    presentes: mesclarPresentes(anterior?.presentes ?? [], coletados, agora, {
      podeDesativar: anterior?.origem === origem,
    }),
  };

  const { validar } = await criarValidador();
  const problemas = validar("catalogo-presentes", catalogo);
  if (problemas.length) {
    throw new ErroDeDominio("catalogo_invalido", `Coleta fora do contrato: ${problemas.join("; ")}`);
  }

  await escreverJsonAtomico(ARQUIVO_REAL, catalogo);
  return catalogo;
}
