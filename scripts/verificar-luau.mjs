#!/usr/bin/env node
/**
 * Gate de sintaxe do jogo.
 *
 * Não existe Roblox Studio numa esteira, e erro de sintaxe em Luau só aparece
 * quando o Studio carrega o lugar. Luau é superconjunto de Lua 5.1, então
 * escrevendo no subconjunto 5.1 dá para validar tudo com `luac5.1 -p` antes de
 * abrir o Studio.
 *
 * O gate é o próprio parser, e não uma lista de padrões proibidos: toda
 * sintaxe exclusiva de Luau — anotação de tipo, `continue`, `+=`, cast com
 * `::`, interpolação com crase — falha no Lua 5.1 por definição. Uma lista de
 * regex por cima só acrescentaria falso positivo em comentário.
 *
 * O preço é abrir mão dessas construções no jogo. Vale: são 30+ arquivos e
 * cada erro que este gate pega custaria uma viagem ao Studio.
 *
 * Instalar o parser: apt-get install lua5.1
 * Uso: node scripts/verificar-luau.mjs [--silencioso]
 */

import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { RAIZ } from "../bridge/src/repos/arquivo.mjs";

const executar = promisify(execFile);
const DIR = path.join(RAIZ, "game", "src");

async function listarLua(dir) {
  const achados = [];
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) achados.push(...(await listarLua(completo)));
    else if (entrada.name.endsWith(".lua")) achados.push(completo);
  }
  return achados;
}

async function temParser() {
  try {
    await executar("luac5.1", ["-v"]);
    return true;
  } catch {
    return false;
  }
}

async function principal() {
  const silencioso = process.argv.includes("--silencioso");

  if (!(await temParser())) {
    console.error("luac5.1 não está instalado; o gate de sintaxe do jogo não rodou.");
    console.error("  apt-get install lua5.1");
    process.exitCode = 1;
    return;
  }

  const arquivos = (await listarLua(DIR)).sort();
  if (arquivos.length === 0) {
    console.error("Nenhum .lua em game/src. A árvore do jogo sumiu?");
    process.exitCode = 1;
    return;
  }

  const problemas = [];
  for (const arquivo of arquivos) {
    try {
      await executar("luac5.1", ["-p", arquivo]);
    } catch (erro) {
      problemas.push(`${path.relative(RAIZ, arquivo)}: ${String(erro.stderr ?? erro.message).trim()}`);
    }
  }

  if (problemas.length > 0) {
    console.error(`${problemas.length} de ${arquivos.length} arquivo(s) com sintaxe inválida:`);
    for (const problema of problemas) console.error(`  - ${problema}`);
    process.exitCode = 1;
    return;
  }

  if (!silencioso) console.log(`${arquivos.length} arquivos .lua com sintaxe válida.`);
}

await principal();
