/**
 * O catálogo de tradução, para quem serve tela FORA do painel.
 *
 * Mesmo desenho do `repos/tokens.mjs`, e pelo mesmo motivo: o painel recebe
 * `catalogo.js` gerado por `npm run gerar`, o jogo recebe `textos.lua`, e o
 * overlay do OBS é HTML servido pela ponte, sem bundler nenhum — ele lê
 * `data/i18n/*.json` direto e injeta os textos na página.
 *
 * Lido uma vez e guardado por idioma: texto muda com `npm run gerar`, não
 * durante a live, e o overlay é aberto pelo OBS uma vez por sessão. Isso
 * também é o que mantém a i18n fora do caminho crítico do presente
 * (`CLAUDE.md`, princípio nº 1) — resolver uma chave é acesso a objeto.
 *
 * Ver ADR-P03.
 */

import { caminhoDeDados, lerJsonOuPadrao } from "./arquivo.mjs";

export const IDIOMAS = ["pt", "es", "en"];
export const IDIOMA_PADRAO = "pt";

const cache = new Map();

/** `pt-BR` vira `pt`; o que não existe cai no padrão. */
export function normalizarIdioma(bruto) {
  const alvo = String(bruto ?? "").trim().toLowerCase().slice(0, 2);
  return IDIOMAS.includes(alvo) ? alvo : IDIOMA_PADRAO;
}

/**
 * O mapa plano de chave para texto do idioma pedido, já com o português por
 * baixo: chave que só existe em PT continua aparecendo traduzida pela metade,
 * em vez de sumir da tela do espectador.
 */
export async function carregarTextos(idiomaBruto) {
  const idioma = normalizarIdioma(idiomaBruto);
  if (cache.has(idioma)) return cache.get(idioma);

  const base = (await lerJsonOuPadrao(caminhoDeDados("i18n", `${IDIOMA_PADRAO}.json`), null))?.chaves ?? {};
  const escolhido =
    idioma === IDIOMA_PADRAO
      ? base
      : ((await lerJsonOuPadrao(caminhoDeDados("i18n", `${idioma}.json`), null))?.chaves ?? {});

  const textos = { ...base, ...escolhido };
  cache.set(idioma, textos);
  return textos;
}

/**
 * Só as chaves de uma superfície, para não injetar o catálogo inteiro numa
 * página que usa uma dúzia de textos. `prefixo` é `hud.` para o overlay.
 */
export function recortar(textos, prefixo) {
  return Object.fromEntries(Object.entries(textos).filter(([chave]) => chave.startsWith(prefixo)));
}

/** Só para teste: o cache é por processo e a live não recarrega catálogo. */
export function limparCache() {
  cache.clear();
}
