#!/usr/bin/env node
/**
 * Gate estrutural do painel.
 *
 * `vite build` sozinho não serve como gate: ele só compila o que o `App.jsx`
 * alcança. Componente que ninguém importou ainda — o caso normal enquanto
 * agentes escrevem em paralelo — passa sem ser olhado, e o gate dá verde sem
 * ter validado nada. Guarda que não morde é pior que não ter guarda.
 *
 * Aqui a entrada é gerada na hora, importando TODO componente do diretório.
 * Assim o build compila tudo, incluindo o que ainda não foi fiado no App.
 *
 * Uso: node scripts/verificar-painel.mjs [--silencioso]
 */

import { execFile } from "node:child_process";
import { readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { RAIZ } from "../bridge/src/repos/arquivo.mjs";

const executar = promisify(execFile);
const PAINEL = path.join(RAIZ, "panel");
const COMPONENTES = path.join(PAINEL, "src", "components");
const ENTRADA = path.join(PAINEL, "src", "gate-gerado.jsx");

async function principal() {
  const silencioso = process.argv.includes("--silencioso");

  let arquivos = [];
  try {
    arquivos = (await readdir(COMPONENTES)).filter((f) => f.endsWith(".jsx")).sort();
  } catch {
    console.error("panel/src/components não existe.");
    process.exitCode = 1;
    return;
  }

  // A entrada importa cada componente e referencia o módulo inteiro, para o
  // bundler não descartar como código morto.
  const linhas = arquivos.map((arquivo, i) => `import * as m${i} from "./components/${arquivo}";`);
  const usos = arquivos.map((_, i) => `m${i}`).join(", ");
  const corpo = `${linhas.join("\n")}\nexport const modulos = [${usos}];\n`;

  await writeFile(ENTRADA, corpo, "utf8");

  try {
    await executar("npx", ["vite", "build", "--logLevel", "warn"], {
      cwd: PAINEL,
      env: { ...process.env, KORA_GATE: "1" },
    });
    if (!silencioso) console.log(`painel: ${arquivos.length} componentes compilam, mais o App.`);
  } catch (erro) {
    console.error("O painel não compila:");
    console.error(String(erro.stderr || erro.stdout || erro.message).trim());
    process.exitCode = 1;
  } finally {
    await rm(ENTRADA, { force: true });
  }
}

await principal();
