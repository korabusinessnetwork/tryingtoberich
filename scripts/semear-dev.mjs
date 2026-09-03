#!/usr/bin/env node
/**
 * Instala o preset de exemplo E TUDO O QUE ELE REFERENCIA, para o modo sem live
 * funcionar de primeira. A fonte é data/exemplos/; isto só copia, para não
 * haver duas cópias do mesmo preset versionadas.
 *
 * Instalar só o preset era um estado quebrado por construção: ele aponta para
 * um look e um mapa, e sem os dois o jogo subia pedindo `/jogo/look` e
 * `/jogo/mapa` e recebendo "sem_look" e "sem_mapa" — erro que parece bug de
 * código e é semente incompleta.
 *
 *   npm run semear
 *   npm run ponte -- --cenario=04-combate-de-presentes --preset=escalada-padrao
 */

import { caminhoDeDados, escreverJsonAtomico, lerJson } from "../bridge/src/repos/arquivo.mjs";

const preset = await lerJson(caminhoDeDados("exemplos", "preset-escalada-padrao.json"));
await escreverJsonAtomico(caminhoDeDados("presets", `${preset.presetId}.json`), preset);
console.log(`data/presets/${preset.presetId}.json instalado.`);

/**
 * Instala uma dependência do preset, se ela ainda não existir.
 *
 * Não sobrescreve: um mapa gerado pelo Gemini ou um look montado no vestiário
 * valem mais que o exemplo, e rodar `semear` de novo não pode apagá-los.
 */
async function instalar(rotulo, pasta, arquivoDeExemplo, id) {
  if (!id) return;

  const destino = caminhoDeDados(pasta, `${id}.json`);
  const jaExiste = await lerJson(destino).then(() => true).catch(() => false);
  if (jaExiste) {
    console.log(`data/${pasta}/${id}.json já existe, mantido.`);
    return;
  }

  await escreverJsonAtomico(destino, await lerJson(caminhoDeDados("exemplos", arquivoDeExemplo)));
  console.log(`data/${pasta}/${id}.json instalado (${rotulo} que o preset referencia).`);
}

await instalar("look", "looks", "look-escalador-vulcanico.json", preset.personagem?.lookId);
await instalar("mapa", "mapas", "mapa-torre-vulcanica-01.json", preset.mapaId);

console.log("");
console.log("Os presenteId começam com sem-: são da semente de desenvolvimento,");
console.log("e a primeira coleta numa live real traz os ids de verdade.");
