#!/usr/bin/env node
/**
 * Desenha o acervo em disco, sem subir nada.
 *
 * Existe porque publicar manda a imagem para a SUA conta do Roblox, e de lá ela
 * não sai sozinha: asset criado fica no seu inventário para sempre. Ver antes
 * de subir é a diferença entre curar o acervo e entulhá-lo.
 *
 *   npm run acervo:previa
 *
 * Não toca no `acervo.json` e não fala com o Roblox.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { desenharCeu, desenharTextura } from "../bridge/src/acervo/desenho.mjs";
import { carregarAcervo } from "../bridge/src/repos/acervo.mjs";
import { RAIZ } from "../bridge/src/repos/arquivo.mjs";

const PASTA = path.join(RAIZ, "data", "acervo-previa");

export async function gerarPrevia() {
  const acervo = await carregarAcervo();
  await mkdir(PASTA, { recursive: true });

  const feitos = [];
  for (const [colecao, desenhar] of [["texturas", desenharTextura], ["skybox", desenharCeu]]) {
    for (const item of acervo[colecao] ?? []) {
      const png = desenhar(item);
      const arquivo = path.join(PASTA, `${item.id}.png`);
      await writeFile(arquivo, png);
      feitos.push({ colecao, id: item.id, arquivo, bytes: png.length, assetId: item.assetId });
    }
  }
  return { pasta: PASTA, feitos };
}

// `pathToFileURL`: no Windows `process.argv[1]` vem como C:\... e a comparação
// direta com `import.meta.url` nunca casa — o script rodava e não fazia nada.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { pasta, feitos } = await gerarPrevia();

  console.log(`\nAcervo desenhado em ${pasta}\n`);
  for (const f of feitos) {
    const situacao = Number.isInteger(f.assetId) ? `já subido (${f.assetId})` : "ainda não subido";
    console.log(`  ${f.id.padEnd(30)} ${String(Math.round(f.bytes / 1024)).padStart(4)} KB   ${situacao}`);
  }
  console.log(
    "\nAbra a pasta e olhe. Gostou? Painel → Configurar → Acervo → "
      + '"Gerar e subir o que falta".\nPrecisa de ROBLOX_API_KEY no .env (ver instalação.md §8.1).\n',
  );
}
