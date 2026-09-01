/** Looks do vestiário. Montados dentro do jogo, escolhidos no painel (ADR-011). */

import { ErroDeDominio } from "../erros.mjs";
import { caminhoDeDados, escreverJsonAtomico, lerJsonOuPadrao, listarJson } from "./arquivo.mjs";
import { criarValidador } from "./schemas.mjs";

const arquivo = (lookId) => caminhoDeDados("looks", `${lookId}.json`);

export async function listarLooks() {
  const nomes = await listarJson(caminhoDeDados("looks"));
  const looks = await Promise.all(nomes.map((nome) => lerJsonOuPadrao(caminhoDeDados("looks", nome))));
  return looks.filter(Boolean);
}

export async function carregarLook(lookId) {
  return lookId ? lerJsonOuPadrao(arquivo(lookId)) : null;
}

export async function salvarLook(look) {
  const { validar } = await criarValidador();
  const problemas = validar("look", look);
  if (problemas.length) {
    throw new ErroDeDominio("look_invalido", `Look fora do contrato: ${problemas.join("; ")}`);
  }
  const comCarimbo = { ...look, atualizadoEm: new Date().toISOString() };
  await escreverJsonAtomico(arquivo(look.lookId), comCarimbo);
  return comCarimbo;
}
