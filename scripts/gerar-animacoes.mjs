#!/usr/bin/env node
/**
 * Gera data/animacoes.json a partir da tabela de
 * docs/03_REGRAS_DE_NEGOCIO/biblioteca-animacoes.md.
 *
 * Por que a partir do doc: o projeto é document-first e a biblioteca já está
 * descrita lá, com id, peso, duração e direção. Escrever o JSON à mão criaria
 * uma segunda verdade que envelhece. O índice Luau do Bloco 2 sai da mesma
 * tabela, então doc, painel e jogo continuam dizendo a mesma coisa.
 *
 * O arquivo é artefato gerado e não é versionado. Rode `npm run gerar`.
 *
 * Uso: node scripts/gerar-animacoes.mjs [--silencioso]
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { RAIZ, caminhoDeDados, escreverJsonAtomico } from "../bridge/src/repos/arquivo.mjs";
import { criarValidador } from "../bridge/src/repos/schemas.mjs";

const DOC = path.join(RAIZ, "docs", "03_REGRAS_DE_NEGOCIO", "biblioteca-animacoes.md");

/** `| \`sub_pulo\` | Pulo | 1 | 0,4s | não | Trail curto | */
const LINHA = /^\|\s*`([a-z_]+)`\s*\|\s*([^|]+?)\s*\|\s*(\d)\s*\|\s*([\d,.]+)\s*s\s*\|\s*(sim|não)\s*\|/;
const SECAO = /^##\s+(Subida|Descida)\b/;

export function extrairAnimacoes(markdown) {
  const animacoes = [];
  let direcao = null;

  for (const linha of markdown.split("\n")) {
    const secao = SECAO.exec(linha);
    if (secao) {
      direcao = secao[1].toLowerCase();
      continue;
    }

    const campos = LINHA.exec(linha);
    if (!campos || !direcao) continue;

    const [, id, nome, peso, duracao, deltaVariavel] = campos;
    animacoes.push({
      id,
      nome,
      direcao,
      pesoVisual: Number.parseInt(peso, 10),
      duracaoBase: Number.parseFloat(duracao.replace(",", ".")),
      aceitaDeltaVariavel: deltaVariavel === "sim",
    });
  }

  return animacoes;
}

async function principal() {
  const silencioso = process.argv.includes("--silencioso");
  const animacoes = extrairAnimacoes(await readFile(DOC, "utf8"));

  if (animacoes.length === 0) {
    console.error(`Nenhuma animação encontrada em ${path.relative(RAIZ, DOC)}. A tabela mudou de formato?`);
    process.exitCode = 1;
    return;
  }

  const indice = { geradoEm: new Date().toISOString(), animacoes };

  const { validar } = await criarValidador();
  const problemas = validar("animacoes", indice);
  if (problemas.length) {
    console.error(`Índice gerado fora do contrato: ${problemas.join("; ")}`);
    process.exitCode = 1;
    return;
  }

  await escreverJsonAtomico(caminhoDeDados("animacoes.json"), indice);

  if (!silencioso) {
    const subida = animacoes.filter((a) => a.direcao === "subida").length;
    console.log(`data/animacoes.json gerado: ${animacoes.length} animações (${subida} de subida, ${animacoes.length - subida} de descida).`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await principal();
