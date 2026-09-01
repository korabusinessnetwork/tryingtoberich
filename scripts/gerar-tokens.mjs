#!/usr/bin/env node
/**
 * Espelha data/tokens.json em Luau e em CSS.
 *
 * O `docs/02_DESIGN_SYSTEM` manda os mesmos hex existirem no painel e no HUD,
 * "definidos uma vez". Duas cópias escritas à mão divergem na primeira pressa;
 * um gerador torna "espelhados" literal.
 */

import path from "node:path";

import { RAIZ, caminhoDeDados, escreverJsonAtomico, lerJson } from "../bridge/src/repos/arquivo.mjs";
import { writeFile, mkdir } from "node:fs/promises";

const tokens = await lerJson(caminhoDeDados("tokens.json"));

const luaCor = (hex) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `Color3.fromRGB(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const lua = `--!strict
-- GERADO por scripts/gerar-tokens.mjs a partir de data/tokens.json.
-- Não editar à mão: a fonte é o JSON, e o painel espelha o mesmo arquivo.
-- Ver docs/02_DESIGN_SYSTEM.

local Tokens = {}

Tokens.faixa = {
${Object.entries(tokens.faixas).map(([n, f]) => `\t[${n}] = { nome = "${f.nome}", cor = ${luaCor(f.cor)} },`).join("\n")}
}

Tokens.estado = {
${Object.entries(tokens.estado).map(([k, v]) => `\t${k} = ${luaCor(v)},`).join("\n")}
}

Tokens.hud = {
${Object.entries(tokens.hud).map(([k, v]) => `\t${k} = ${luaCor(v)},`).join("\n")}
}

return Tokens
`;

const css = `/* GERADO por scripts/gerar-tokens.mjs a partir de data/tokens.json.
   Não editar à mão. O HUD do jogo espelha o mesmo arquivo.
   Toda cor de marca vem daqui, nunca literal no componente: é o que permite
   white-label na Fase 3 sem reescrever componente. Ver docs/02_DESIGN_SYSTEM. */

:root {
${Object.entries(tokens.faixas).map(([n, f]) => `  --faixa-${n}: ${f.cor}; /* ${f.descricao} */`).join("\n")}

${Object.entries(tokens.estado).map(([k, v]) => `  --estado-${k}: ${v};`).join("\n")}

${Object.entries(tokens.painel).map(([k, v]) => `  --painel-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${v};`).join("\n")}
}
`;

await mkdir(path.join(RAIZ, "game", "src", "shared"), { recursive: true });
await mkdir(path.join(RAIZ, "panel", "src", "styles"), { recursive: true });
await writeFile(path.join(RAIZ, "game", "src", "shared", "tokens.lua"), lua, "utf8");
await writeFile(path.join(RAIZ, "panel", "src", "styles", "tokens.css"), css, "utf8");

if (!process.argv.includes("--silencioso")) {
  console.log("game/src/shared/tokens.lua e panel/src/styles/tokens.css gerados de data/tokens.json.");
}
