/**
 * Resolução de texto por chave, fora do React.
 *
 * Existe separado do hook porque `lib/regras.js` e `lib/api.js` também têm
 * texto visível e não são componentes — não podem usar hook. O provider empurra
 * o idioma para cá quando ele muda, e essas camadas leem o valor atual.
 *
 * Nada disto entra no caminho crítico do presente: o catálogo é resolvido no
 * import, e `traduzir` é só um acesso a objeto (CLAUDE.md, princípio nº 1).
 */

import { CATALOGO, IDIOMA_PADRAO, IDIOMAS } from "./catalogo.js";

export { IDIOMAS, IDIOMA_PADRAO };

/**
 * Normaliza o que vier: `pt-BR` vira `pt`, `PT` vira `pt`, e o que não existe
 * cai no padrão.
 *
 * Aceitar só o código exato quebraria com `navigator.language`, que devolve
 * `pt-BR` na máquina do dono.
 */
export function normalizarIdioma(bruto) {
  const alvo = String(bruto ?? "").trim().toLowerCase().slice(0, 2);
  return IDIOMAS.includes(alvo) ? alvo : IDIOMA_PADRAO;
}

let idiomaAtual = IDIOMA_PADRAO;

export function definirIdioma(codigo) {
  idiomaAtual = normalizarIdioma(codigo);
  return idiomaAtual;
}

export function idiomaAtivo() {
  return idiomaAtual;
}

/**
 * Detecta o idioma do navegador. Usado só quando a configuração do streamer
 * ainda não tem preferência gravada.
 */
export function idiomaDoNavegador() {
  if (typeof navigator === "undefined") return IDIOMA_PADRAO;
  return normalizarIdioma(navigator.language ?? navigator.languages?.[0]);
}

const interpolar = (texto, params) =>
  texto.replace(/\{(\w+)\}/g, (inteiro, nome) =>
    params[nome] === undefined || params[nome] === null ? inteiro : String(params[nome]),
  );

/**
 * Resolve a chave no idioma ativo.
 *
 * Chave ausente devolve a própria chave, nunca `undefined`. Tela em branco no
 * meio da live é pior que texto feio, e a chave crua diz exatamente o que
 * faltou traduzir. Em desenvolvimento, avisa no console.
 */
export function traduzir(chave, params) {
  const tabela = CATALOGO[idiomaAtual] ?? CATALOGO[IDIOMA_PADRAO];
  let texto = tabela[chave];

  if (texto === undefined && idiomaAtual !== IDIOMA_PADRAO) {
    texto = CATALOGO[IDIOMA_PADRAO][chave];
  }

  if (texto === undefined) {
    if (import.meta.env?.DEV) console.warn(`[i18n] chave sem tradução: ${chave}`);
    return chave;
  }

  return params ? interpolar(texto, params) : texto;
}
