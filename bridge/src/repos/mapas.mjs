/** Mapas gerados. A validação de jogabilidade e de acervo acontece no cliente Gemini. */

import { ErroDeDominio } from "../erros.mjs";
import { apagar, caminhoDeDados, escreverJsonAtomico, existe, lerJsonOuPadrao, listarJson } from "./arquivo.mjs";
import { criarValidador } from "./schemas.mjs";

const arquivo = (mapaId) => caminhoDeDados("mapas", `${mapaId}.json`);

export async function listarMapas() {
  const nomes = await listarJson(caminhoDeDados("mapas"));
  const mapas = await Promise.all(nomes.map((nome) => lerJsonOuPadrao(caminhoDeDados("mapas", nome))));
  return mapas.filter(Boolean);
}

export async function carregarMapa(mapaId) {
  return mapaId ? lerJsonOuPadrao(arquivo(mapaId)) : null;
}

export async function salvarMapa(mapa) {
  const { validar } = await criarValidador();
  const problemas = validar("mapa", mapa);
  if (problemas.length) {
    throw new ErroDeDominio("mapa_invalido", `Mapa fora do contrato: ${problemas.join("; ")}`);
  }
  await escreverJsonAtomico(arquivo(mapa.mapaId), mapa);
  return mapa;
}

/** Apaga o arquivo do mapa. Quem recusa apagar mapa em uso é o núcleo. */
export async function apagarMapa(mapaId) {
  const caminho = arquivo(mapaId);
  if (!(await existe(caminho))) {
    throw new ErroDeDominio("mapa_nao_encontrado", `Não achei o mapa "${mapaId}".`, { status: 404 });
  }
  await apagar(caminho);
  return { mapaId };
}
