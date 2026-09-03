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
import { pathToFileURL } from "node:url";

import { writeFile } from "node:fs/promises";

import { RAIZ, caminhoDeDados, escreverJsonAtomico } from "../bridge/src/repos/arquivo.mjs";
import { criarValidador } from "../bridge/src/repos/schemas.mjs";

const DOC = path.join(RAIZ, "docs", "03_REGRAS_DE_NEGOCIO", "biblioteca-animacoes.md");

/** `| \`sub_pulo\` | Pulo | 1 | 0,4s | não | não | Trail curto | */
const LINHA =
  /^\|\s*`([a-z_]+)`\s*\|\s*([^|]+?)\s*\|\s*(\d)\s*\|\s*([\d,.]+)\s*s\s*\|\s*(sim|não)\s*\|\s*(sim|não)\s*\|/;
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

    const [, id, nome, peso, duracao, deltaVariavel, ativa] = campos;
    animacoes.push({
      id,
      nome,
      direcao,
      pesoVisual: Number.parseInt(peso, 10),
      duracaoBase: Number.parseFloat(duracao.replace(",", ".")),
      aceitaDeltaVariavel: deltaVariavel === "sim",
      // Animação aposentada NÃO some da biblioteca. É a mesma regra do presente
      // do catálogo (ver catalogo-presentes.schema.json): preset antigo pode
      // referenciar, e o jogo continua tocando. Quem para de oferecer é o painel.
      ativa: ativa === "sim",
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
  await writeFile(path.join(RAIZ, "game", "src", "shared", "indiceAnimacoes.lua"), montarIndiceLuau(animacoes), "utf8");

  if (!silencioso) {
    const subida = animacoes.filter((a) => a.direcao === "subida").length;
    const ativas = animacoes.filter((a) => a.ativa).length;
    console.log(
      `data/animacoes.json gerado: ${animacoes.length} animações ` +
        `(${subida} de subida, ${animacoes.length - subida} de descida; ${ativas} ativas no painel).`,
    );
  }
}

/**
 * O índice em Luau, gerado da MESMA tabela que produz o JSON.
 *
 * O `04_MODELAGEM` chamava data/animacoes.json de "espelho do índice Luau".
 * Invertemos a direção: os dois são espelho do doc. Assim o painel e o jogo não
 * podem discordar sobre quantas animações existem nem sobre quanto cada uma dura.
 */
function montarIndiceLuau(animacoes) {
  const linhas = animacoes.map((a) =>
    `\t{ id = "${a.id}", nome = "${a.nome}", direcao = "${a.direcao}", ` +
    `pesoVisual = ${a.pesoVisual}, duracaoBase = ${a.duracaoBase}, ` +
    `aceitaDeltaVariavel = ${a.aceitaDeltaVariavel}, ativa = ${a.ativa} },`,
  );

  return `--!strict
-- GERADO por scripts/gerar-animacoes.mjs a partir da tabela de
-- docs/03_REGRAS_DE_NEGOCIO/biblioteca-animacoes.md. Não editar à mão.
--
-- Acrescentar a 21a animação: criar o ModuleScript em game/src/animacoes/,
-- acrescentar a linha na tabela do doc e rodar \`npm run gerar\`. Nada mais muda.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Indice = {}

Indice.metadados = {
${linhas.join("\n")}
}

Indice.porId = {}
for _, meta in ipairs(Indice.metadados) do
\tIndice.porId[meta.id] = meta
end

local cache = {}

--[[
\tCarrega o ModuleScript da animação, uma vez, e confere que os metadados dele
\tbatem com esta tabela. Módulo dizendo uma duração e o índice dizendo outra é
\tbug silencioso: o servidor libera o controle na hora errada.
]]
function Indice.obter(id)
\tif cache[id] then
\t\treturn cache[id]
\tend

\tlocal meta = Indice.porId[id]
\tif not meta then
\t\treturn nil, "animação desconhecida: " .. tostring(id)
\tend

\tlocal pasta = ReplicatedStorage:FindFirstChild("KoraAnimacoes")
\tif not pasta then
\t\treturn nil, "pasta KoraAnimacoes não existe"
\tend

\tlocal modulo = pasta:FindFirstChild(id)
\tif not modulo then
\t\treturn nil, "módulo da animação não encontrado: " .. id
\tend

\tlocal ok, animacao = pcall(require, modulo)
\tif not ok or type(animacao) ~= "table" or type(animacao.executar) ~= "function" then
\t\treturn nil, "módulo inválido: " .. id
\tend

\tif animacao.duracaoBase ~= meta.duracaoBase or animacao.direcao ~= meta.direcao then
\t\twarn(string.format(
\t\t\t"[Kora] %s discorda do índice (duração %s vs %s, direção %s vs %s). Vale o índice.",
\t\t\tid, tostring(animacao.duracaoBase), tostring(meta.duracaoBase),
\t\t\ttostring(animacao.direcao), meta.direcao
\t\t))
\tend

\tcache[id] = animacao
\treturn animacao
end

--[[ Duração em segundos, sempre do índice. É ela que arma o watchdog do R11. ]]
function Indice.duracao(id)
\tlocal meta = Indice.porId[id]
\treturn meta and meta.duracaoBase or 0
end

--[[ Peso visual 4 ou 5 é o gatilho de afastar a câmera. Ver docs/09_BACKLOG. ]]
function Indice.pesoVisual(id)
\tlocal meta = Indice.porId[id]
\treturn meta and meta.pesoVisual or 1
end

return Indice
`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
