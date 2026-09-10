#!/usr/bin/env node
/**
 * Espelha `data/tokens.json` em `console/src/styles/tokens.css`.
 *
 * O console usa os mesmos tokens do produto (contrato da onda 2, seção 5), para
 * não nascer um segundo design system. Copiar os hex à mão é como as duas
 * superfícies divergem na primeira pressa, então aqui também é gerado.
 *
 * Por que existe um gerador só do console em vez de reusar
 * `scripts/gerar-tokens.mjs`: aquele arquivo é da raiz, e a frente do console
 * não altera arquivo compartilhado. O certo é ele passar a escrever os três
 * destinos e este sumir, e isso está pedido no relatório da onda. Enquanto não
 * some, `test/tokens.test.mjs` compara o CSS gerado com o JSON e acusa a
 * divergência, que é o risco real de ter dois geradores.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");

/** Fonte única dos tokens visuais. O console lê, nunca escreve. */
export const CAMINHO_DO_JSON = path.join(RAIZ, "data", "tokens.json");
export const CAMINHO_DO_CSS = path.join(AQUI, "..", "src", "styles", "tokens.css");

/** `textoPrimario` vira `--painel-texto-primario`, igual ao gerador da raiz. */
const emKebab = (chave) => chave.replace(/[A-Z]/g, (letra) => `-${letra.toLowerCase()}`);

export function montarCss(tokens) {
  const faixas = Object.entries(tokens.faixas)
    .map(([n, faixa]) => `  --faixa-${n}: ${faixa.cor}; /* ${faixa.descricao} */`)
    .join("\n");

  const estado = Object.entries(tokens.estado)
    .map(([chave, cor]) => `  --estado-${chave}: ${cor};`)
    .join("\n");

  const painel = Object.entries(tokens.painel)
    .map(([chave, cor]) => `  --painel-${emKebab(chave)}: ${cor};`)
    .join("\n");

  return `/* GERADO por console/scripts/gerar-tokens.mjs a partir de data/tokens.json.
   Não editar à mão. O painel e o HUD do jogo espelham o mesmo arquivo.
   Ver docs/02_DESIGN_SYSTEM e o contrato da onda 2, seção 5. */

:root {
${faixas}

${estado}

${painel}
}
`;
}

export async function gerar() {
  const tokens = JSON.parse(await readFile(CAMINHO_DO_JSON, "utf8"));
  const css = montarCss(tokens);
  await mkdir(path.dirname(CAMINHO_DO_CSS), { recursive: true });
  await writeFile(CAMINHO_DO_CSS, css, "utf8");
  return css;
}

// Só gera quando é chamado como programa. Importado pelo teste, não escreve nada.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await gerar();
  if (!process.argv.includes("--silencioso")) {
    console.log("console/src/styles/tokens.css gerado de data/tokens.json.");
  }
}
