#!/usr/bin/env node
/**
 * F0-7, lado de cá: confere a ponte ANTES de você ir ao Studio.
 *
 * O modo de falha que este comando existe para matar: ir ao Studio, a sonda
 * falhar, e a conclusão sair errada porque a ponte simplesmente não estava no
 * ar. Isso responde "não" a uma pergunta que nem chegou a ser feita — e é a
 * pergunta que o ADR-002 espera desde o Bloco 1.
 *
 * Então: primeiro provamos que a ponte responde nesta máquina, e só depois
 * imprimimos a sonda Luau, já com a porta certa, pronta para colar.
 *
 * Uso: npm run sondar
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { RAIZ } from "../bridge/src/repos/arquivo.mjs";

const SONDA = path.join(RAIZ, "game", "sonda-localhost.lua");

/**
 * A porta e o token, do ambiente.
 *
 * Lê `process.env` primeiro (quem roda com `--env-file=.env` já tem tudo) e cai
 * no `.env` do disco por conveniência. O token nunca é impresso: o `11_SEGURANCA`
 * proíbe, e a sonda no Studio lê o dela do ServerStorage de qualquer forma.
 */
async function ambiente() {
  let porta = process.env.BRIDGE_PORT;
  let token = process.env.BRIDGE_TOKEN;

  if (!porta || !token) {
    try {
      const bruto = await readFile(path.join(RAIZ, ".env"), "utf8");
      for (const linha of bruto.split(/\r?\n/)) {
        const achado = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(linha);
        if (!achado) continue;
        const valor = achado[2].replace(/^["']|["']$/g, "").trim();
        if (achado[1] === "BRIDGE_PORT" && !porta) porta = valor;
        if (achado[1] === "BRIDGE_TOKEN" && !token) token = valor;
      }
    } catch {
      // Sem .env não é erro fatal: a porta cai no padrão e o token vira aviso.
    }
  }

  return { porta: Number.parseInt(porta ?? "8787", 10) || 8787, token: token || null };
}

/** Bate na sonda da ponte com um teto curto: aqui é a mesma máquina. */
async function bater(url, token) {
  const abortar = new AbortController();
  const relogio = setTimeout(() => abortar.abort(), 3000);
  try {
    const resposta = await fetch(url, {
      headers: token ? { "X-Bridge-Token": token } : {},
      signal: abortar.signal,
    });
    return { status: resposta.status, corpo: await resposta.text() };
  } catch (erro) {
    return { erro: erro?.cause?.code ?? erro?.name ?? String(erro) };
  } finally {
    clearTimeout(relogio);
  }
}

const { porta, token } = await ambiente();
const url = `http://127.0.0.1:${porta}/jogo/sonda`;

console.log("");
console.log("SONDA F0-7 — lado da ponte");
console.log(`   ${url}`);
console.log(`   token no ambiente: ${token ? "sim (não será impresso)" : "NÃO"}`);
console.log("");

const resultado = await bater(url, token);

if (resultado.erro) {
  console.error(`A ponte NAO respondeu em 127.0.0.1:${porta} (${resultado.erro}).`);
  console.error("");
  console.error("Suba a ponte antes de ir ao Studio:");
  console.error("   npm run ponte");
  console.error("");
  console.error("Sem isso, a sonda no Studio vai falhar por um motivo que nao e o");
  console.error("da pergunta, e a resposta do F0-7 sai errada.");
  process.exitCode = 1;
} else if (resultado.status === 401) {
  console.error("A ponte respondeu 401: ela ESTA no ar, mas o BRIDGE_TOKEN daqui nao confere.");
  console.error("Ajuste o .env e rode de novo — a sonda do Studio precisa do token certo");
  console.error("para o caso feliz sair 200.");
  process.exitCode = 1;
} else if (resultado.status !== 200) {
  console.error(`A ponte respondeu HTTP ${resultado.status}, e o esperado era 200.`);
  console.error(`   corpo: ${resultado.corpo.slice(0, 200)}`);
  process.exitCode = 1;
} else {
  console.log(`A ponte responde: ${resultado.corpo.trim()}`);
  console.log("");
  console.log("Agora o lado do Studio. Cole a sonda abaixo na barra de comandos");
  console.log("(View -> Command Bar) e aperte Enter:");
  console.log("");
  console.log("--------------------------------------------------------------");

  const luau = await readFile(SONDA, "utf8");
  // A porta real entra no lugar do padrão: sondar a porta errada responde a
  // pergunta errada, e ninguém percebe.
  console.log(luau.replace(/^local PORTA = \d+$/m, `local PORTA = ${porta}`));

  console.log("--------------------------------------------------------------");
  console.log("");
  console.log("Depois, registre a resposta em:");
  console.log("   memory/learnings.md");
  console.log("   docs/09_BACKLOG/fase-0-fixes-minimos.md  (item F0-7)");
  console.log("");
}
