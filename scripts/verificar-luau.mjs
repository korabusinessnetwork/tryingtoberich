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
 * Instalar o parser: ver `INSTALAR_PARSER` abaixo — varia por sistema.
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

/**
 * O parser não se chama igual em todo lugar.
 *
 * `luac5.1` é o nome no Debian/Ubuntu. No Windows os binários do LuaBinaries e
 * do Scoop instalam como `luac.exe` ou `luac5.1.exe`, e no macOS o Homebrew usa
 * `luac`. Procurar só por `luac5.1` fazia o gate se declarar indisponível numa
 * máquina que TEM o parser — guarda que não roda é pior que não ter guarda.
 */
const NOMES_DO_PARSER = ["luac5.1", "luac-5.1", "luac53", "luac54", "luac"];

const INSTALAR_PARSER = {
  win32: "winget install DEVCOM.Lua   (o luac 5.4 recusa a mesma sintaxe de Luau que o 5.1)",
  darwin: "brew install lua",
  linux: "apt-get install lua5.1",
};

/** Devolve o nome utilizável do parser, ou null. Exportado: o teste usa o mesmo. */
export async function acharParser() {
  for (const nome of NOMES_DO_PARSER) {
    try {
      await executar(nome, ["-v"]);
      return nome;
    } catch { /* tenta o próximo */ }
  }
  return null;
}

/** A linha de instalação do sistema em que se está, não a do Debian sempre. */
export function comoInstalarParser(plataforma = process.platform) {
  return INSTALAR_PARSER[plataforma] ?? INSTALAR_PARSER.linux;
}

async function principal() {
  const silencioso = process.argv.includes("--silencioso");

  const parser = await acharParser();
  if (!parser) {
    console.error("Parser de Lua não encontrado; o gate de sintaxe do jogo NÃO rodou.");
    console.error(`  procurei por: ${NOMES_DO_PARSER.join(", ")}`);
    console.error(`  instale com: ${comoInstalarParser()}`);
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
      await executar(parser, ["-p", arquivo]);
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
