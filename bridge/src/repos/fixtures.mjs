/** Fixtures do Bloco 0, para rodar a ponte sem live. Só desenvolvimento. */

import { caminhoDeDados, lerJson, lerJsonOuPadrao, listarJson } from "./arquivo.mjs";

export async function listarCenarios() {
  return listarJson(caminhoDeDados("fixtures", "cenarios"));
}

export async function carregarCenario(nome) {
  const arquivo = nome.endsWith(".json") ? nome : `${nome}.json`;
  return lerJsonOuPadrao(caminhoDeDados("fixtures", "cenarios", arquivo));
}

export async function carregarPayloadCru(nome) {
  return lerJson(caminhoDeDados("fixtures", "tiktok-cru", `${nome}.json`));
}

export async function carregarExemplo(nome) {
  return lerJson(caminhoDeDados("exemplos", `${nome}.json`));
}
