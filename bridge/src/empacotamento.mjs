/**
 * Onde o produto está morando neste instante.
 *
 * O mesmo código roda de dois jeitos e precisa achar as mesmas coisas nos dois:
 *
 *   - **no repositório**, `node bridge/src/index.mjs`, e a raiz é a pasta do
 *     projeto — três níveis acima deste arquivo;
 *   - **dentro do `KoraStreamGames.exe`**, onde não existe "pasta do projeto":
 *     o código não é um arquivo em disco, é um blob colado no executável, e
 *     `import.meta.url` aponta para um caminho que não existe. A raiz passa a
 *     ser **a pasta onde o exe está**, que é onde o `data/` e o `game/` do
 *     streamer vivem.
 *
 * Esta é a única diferença de comportamento entre as duas formas, e ela mora
 * num arquivo só de propósito: quem lê `RAIZ` (o `repos/arquivo.mjs`, o
 * `roblox/estudio.mjs`, os scripts) não precisa saber que empacotamento existe.
 *
 * Não importa `node:fs`. Ver ADR-003 — quem toca disco é o `repos/arquivo.mjs`.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { isSea, getRawAsset } from "node:sea";

/** Verdadeiro só dentro do executável portátil. */
export const EMPACOTADO = (() => {
  try {
    return isSea();
  } catch {
    return false;
  }
})();

/**
 * A raiz de tudo que é lido e escrito em disco.
 *
 * Empacotado, é a pasta do executável — e é de propósito que o dado fique FORA
 * do exe: `data/` é do streamer, muda a cada live e precisa sobreviver à troca
 * do executável por uma versão nova.
 */
export const RAIZ = EMPACOTADO
  ? path.dirname(process.execPath)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Um arquivo embutido no executável, ou `null` fora dele.
 *
 * Só o que é PROGRAMA entra aqui: o painel já construído e a semente do
 * `data/`/`game/` que o primeiro arranque escreve em disco. Nada que o streamer
 * edite é lido daqui depois do primeiro arranque.
 */
export function embutido(chave) {
  if (!EMPACOTADO) return null;
  try {
    return Buffer.from(getRawAsset(chave));
  } catch {
    return null;
  }
}

/** O índice do que foi embutido, escrito pelo `scripts/empacotar.mjs`. */
export function indiceEmbutido() {
  const bruto = embutido("indice.json");
  return bruto ? JSON.parse(bruto.toString("utf8")) : { painel: [], semente: [] };
}
