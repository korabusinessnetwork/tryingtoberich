#!/usr/bin/env node
/**
 * Diagnóstico da conexão com o Gemini.
 *
 * Existe porque "conectar a API" tem três modos de falhar que dão mensagens
 * parecidas no painel — chave ausente, chave inválida e modelo que não existe
 * mais — e o painel só mostra "gemini_indisponivel". Aqui cada um tem nome.
 *
 * O nome do modelo é o ponto frágil: o Google aposenta modelo, e o código
 * ficaria apontando para um id morto. Este script LISTA o que a chave alcança
 * e diz se o modelo configurado está lá, em vez de descobrir isso na hora em
 * que o streamer clica em gerar.
 *
 * A chave nunca é impressa. Ver CLAUDE.md, Segurança.
 *
 * Uso: node scripts/verificar-gemini.mjs
 */

import path from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { RAIZ } from "../bridge/src/repos/arquivo.mjs";
import { ENDPOINT, MODELO_PADRAO } from "../bridge/src/gemini/cliente.mjs";

const ENV = path.join(RAIZ, ".env");

/** Só o suficiente para conferir que é a chave certa, sem revelá-la. */
const disfarcar = (chave) => `${chave.slice(0, 4)}…${chave.slice(-4)} (${chave.length} caracteres)`;

async function listarModelos(chave) {
  const resposta = await fetch(`${ENDPOINT}?pageSize=200`, { headers: { "x-goog-api-key": chave } });
  const corpo = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    return { erro: corpo?.error?.message ?? `HTTP ${resposta.status}`, status: resposta.status };
  }

  // Só os que servem para o que a ponte faz: gerar conteúdo.
  const modelos = (corpo?.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));

  return { modelos };
}

async function gerarDeTeste(chave, modelo) {
  const resposta = await fetch(`${ENDPOINT}/${modelo}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": chave },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: 'Responda só com o JSON {"ok":true}' }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }),
  });

  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) return { erro: corpo?.error?.message ?? `HTTP ${resposta.status}` };
  return { texto: corpo?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "" };
}

async function principal() {
  if (!existsSync(ENV)) {
    console.error("Falta o .env na raiz. Copie de .env.example.");
    process.exitCode = 1;
    return;
  }
  process.loadEnvFile(ENV);

  const chave = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!chave) {
    console.error("GEMINI_API_KEY está vazia no .env.");
    console.error("  Pegue uma chave gratuita em: https://aistudio.google.com/apikey");
    console.error("  E preencha a linha:  GEMINI_API_KEY=...");
    process.exitCode = 1;
    return;
  }

  console.log(`Chave  : ${disfarcar(chave)}`);
  console.log(`Modelo : ${MODELO_PADRAO} (configurado em bridge/src/gemini/cliente.mjs)`);
  console.log("");

  const { modelos, erro, status } = await listarModelos(chave);
  if (erro) {
    console.error(`A chave não foi aceita: ${erro}`);
    if (status === 400) console.error("  Chave inválida ou revogada. Gere outra em https://aistudio.google.com/apikey");
    if (status === 403) console.error("  A chave existe mas não tem permissão para a Generative Language API.");
    process.exitCode = 1;
    return;
  }

  console.log(`A chave alcança ${modelos.length} modelo(s) de geração.`);

  if (!modelos.includes(MODELO_PADRAO)) {
    console.error("");
    console.error(`O modelo configurado (${MODELO_PADRAO}) NÃO está na lista da sua chave.`);
    console.error("  Foi aposentado ou não está liberado. Candidatos parecidos:");
    for (const m of modelos.filter((m) => m.includes("flash")).slice(0, 8)) console.error(`    ${m}`);
    console.error("  Troque MODELO_PADRAO em bridge/src/gemini/cliente.mjs.");
    process.exitCode = 1;
    return;
  }

  const { texto, erro: erroGeracao } = await gerarDeTeste(chave, MODELO_PADRAO);
  if (erroGeracao) {
    console.error(`O modelo existe, mas a geração falhou: ${erroGeracao}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Ida e volta OK. O modelo respondeu: ${texto.trim().slice(0, 80)}`);
  console.log("");
  console.log("A ponte consegue falar com o Gemini.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
