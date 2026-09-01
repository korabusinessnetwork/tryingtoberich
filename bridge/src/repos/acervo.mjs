/** Acervo pré-aprovado. Só o que está aprovado pode ser oferecido ao Gemini (ADR-004). */

import { caminhoDeDados, lerJsonOuPadrao } from "./arquivo.mjs";

const VAZIO = { skybox: [], texturas: [], props: [] };

export async function carregarAcervo() {
  return (await lerJsonOuPadrao(caminhoDeDados("acervo.json"))) ?? VAZIO;
}

/** O subconjunto que entra no prompt: item pendente de moderação nunca é oferecido. */
export function acervoOferecivel(acervo) {
  const aprovados = (itens) => itens.filter((i) => i.status === "aprovado" && i.assetId !== null);
  return {
    skybox: aprovados(acervo.skybox),
    texturas: aprovados(acervo.texturas),
    props: acervo.props,
  };
}
