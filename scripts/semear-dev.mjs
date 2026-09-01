#!/usr/bin/env node
/**
 * Copia o preset de exemplo para data/presets/, para o modo sem live funcionar
 * de primeira. Existe para não haver duas cópias do mesmo preset versionadas:
 * a fonte é data/exemplos/, isto só instala.
 *
 *   npm run semear
 *   npm run ponte -- --cenario=04-combate-de-presentes --preset=escalada-padrao
 */

import { caminhoDeDados, escreverJsonAtomico, lerJson } from "../bridge/src/repos/arquivo.mjs";

const preset = await lerJson(caminhoDeDados("exemplos", "preset-escalada-padrao.json"));
await escreverJsonAtomico(caminhoDeDados("presets", `${preset.presetId}.json`), preset);

console.log(`data/presets/${preset.presetId}.json instalado a partir do exemplo.`);
console.log("Os presenteId começam com sem-: são da semente de desenvolvimento,");
console.log("e a primeira coleta numa live real traz os ids de verdade.");
