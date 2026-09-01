/**
 * Cache de ícone: o oficial do presente da TikTok e o da peça do vestiário.
 * Baixa uma vez por id e reusa. Fora do caminho crítico, sempre.
 */

import { caminhoDeDados, escreverBinarioAtomico, existe } from "./arquivo.mjs";

const DESTINOS = {
  presente: (id) => ["icones", `${id}.png`],
  item: (id) => ["icones-itens", `${id}.png`],
};

export const caminhoRelativoDoIcone = (tipo, id) => `data/${DESTINOS[tipo](id).join("/")}`;

export async function iconeEmCache(tipo, id) {
  return existe(caminhoDeDados(...DESTINOS[tipo](id)));
}

/** Devolve o caminho relativo do ícone, baixando só se ainda não estiver em cache. */
export async function guardarIcone(tipo, id, buffer) {
  await escreverBinarioAtomico(caminhoDeDados(...DESTINOS[tipo](id)), buffer);
  return caminhoRelativoDoIcone(tipo, id);
}
