#!/usr/bin/env node
/**
 * Monta o `KoraStreamGames.exe` — o executável portátil.
 *
 *   npm run empacotar
 *
 * O que sai: `dist/KoraStreamGames/`, com o exe e um LEIA-ME. Nada mais. O
 * `data/` e o `game/` nascem no primeiro duplo clique, ao lado do exe.
 *
 * COMO FUNCIONA, em três peças que o Node já traz de fábrica:
 *
 *   1. **Um arquivo só.** A ponte é dezenas de módulos ESM mais `express`,
 *      `ajv` e o `tiktok-live-connector`. O executável só aceita UM arquivo
 *      CommonJS, então tudo isso é fundido antes (o empacotador que o Vite já
 *      trazia — nenhuma dependência nova de verdade).
 *   2. **O blob.** `node --experimental-sea-config` junta esse arquivo com os
 *      anexos — o painel construído e a semente do `data/`/`game/` — num blob.
 *   3. **A cola.** O `postject` gruda o blob dentro de uma cópia do `node.exe`.
 *      A partir daí aquele exe, ao ser executado, roda o nosso código em vez do
 *      REPL do Node.
 *
 * As duas peças de fora (`rolldown`, `postject`) são MIT, gratuitas e só de
 * desenvolvimento: não vão para a máquina do cliente. Ver ADR-P07.
 *
 * O QUE ESTE SCRIPT NÃO RESOLVE: o exe não é assinado, e o SmartScreen do
 * Windows avisa na primeira execução. Assinatura custa dinheiro e a decisão é
 * do dono — está registrada no ADR-P07, junto com o texto que o cliente vê.
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { RAIZ } from "../bridge/src/repos/arquivo.mjs";

const executar = promisify(execFile);

const BUILD = path.join(RAIZ, "build");
const DESTINO = path.join(RAIZ, "dist", "KoraStreamGames");
const NOME_DO_EXE = process.platform === "win32" ? "KoraStreamGames.exe" : "KoraStreamGames";

/** A palavra que o Node procura dentro do binário para saber onde colar o blob. */
const FUSIVEL = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

const passo = (texto) => console.log(`\n▸ ${texto}`);
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Os arquivos da semente: o que o Git versiona em `data/` e `game/`, mais os
 * gerados que o exe não tem como gerar sozinho.
 *
 * Por que o Git e não uma varredura: o `.gitignore` já sabe distinguir o que é
 * do produto do que é da INSTALAÇÃO — a arte do streamer, o catálogo coletado
 * da live, o dado de sessão. Repetir essa lista aqui seria mantê-la em dois
 * lugares e embutir 65 MB de vídeo e imagem que não são nossos.
 */
export async function listarSemente(raiz = RAIZ) {
  let versionados;
  try {
    const { stdout } = await executar("git", ["ls-files", "-z", "data", "game", ".env.example"], { cwd: raiz, maxBuffer: 32 * 1024 * 1024 });
    versionados = stdout.split("\u0000").filter(Boolean);
  } catch {
    throw new Error("Não consegui listar a semente: este build precisa do `git` no PATH.");
  }

  // Gerados a partir de `docs/`, e o exe não leva `docs/` junto. Sem eles a
  // ponte recusa subir, com a mensagem certa e no lugar mais confuso possível:
  // na máquina do cliente.
  const gerados = ["data/animacoes.json", "data/tokens.json"];

  return [...new Set([...versionados, ...gerados])].sort();
}

/** Todo arquivo de uma pasta, em caminho relativo com barra normal. */
async function varrer(dir, base = dir) {
  const { readdir } = await import("node:fs/promises");
  const saida = [];
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    const cheio = path.join(dir, entrada.name);
    if (entrada.isDirectory()) saida.push(...(await varrer(cheio, base)));
    else saida.push(path.relative(base, cheio).split(path.sep).join("/"));
  }
  return saida.sort();
}

async function fundirEmUmArquivo(saida) {
  const { rolldown } = await import("rolldown");

  const pacote = await rolldown({
    input: path.join(RAIZ, "bridge", "src", "empacotado.mjs"),
    platform: "node",
    // O `bufferutil`, o `utf-8-validate` e o `supports-color` são aceleradores
    // opcionais do `ws` e do `debug`, pedidos dentro de try/catch. Não existem
    // aqui e não vão existir lá; o try/catch cobre, e avisar sobre eles a cada
    // build treina a gente a ignorar aviso de build.
    onwarn(aviso, padrao) {
      if (aviso.code === "UNRESOLVED_IMPORT") return;
      padrao(aviso);
    },
  });

  const { output } = await pacote.write({ format: "cjs", file: saida, codeSplitting: false });
  await pacote.close();
  return output[0].code.length;
}

/**
 * Arranca a assinatura digital da cópia do `node.exe`.
 *
 * O `node.exe` vem assinado pela Node.js Foundation. Colar um blob dentro dele
 * deixa aquela assinatura descrevendo um arquivo que já não existe, e o
 * Windows não lê isso como "sem assinatura": lê como assinatura CORROMPIDA, que
 * é bem pior — é o que antivírus trata como binário adulterado. Um exe
 * simplesmente sem assinatura só toma o aviso normal do SmartScreen.
 *
 * Como se faz: a tabela de certificados é a entrada 4 do diretório de dados do
 * cabeçalho PE, e ela é a única cujo "endereço" é deslocamento de ARQUIVO, não
 * de memória — o bloco fica colado no fim. Zerar a entrada e cortar o fim do
 * arquivo remove a assinatura sem mexer em mais nada.
 *
 * Devolve quantos bytes saíram, ou 0 quando não havia assinatura (Linux, macOS,
 * ou um Node compilado em casa).
 */
export function removerAssinatura(binario) {
  if (binario.length < 0x40 || binario.readUInt16LE(0) !== 0x5a4d) return { binario, removidos: 0 };

  const pe = binario.readUInt32LE(0x3c);
  if (pe + 24 > binario.length || binario.readUInt32LE(pe) !== 0x00004550) return { binario, removidos: 0 };

  // 0x20b é PE32+ (64 bits), que tem 16 bytes a mais de cabeçalho opcional.
  const opcional = pe + 24;
  const diretorios = opcional + (binario.readUInt16LE(opcional) === 0x20b ? 112 : 96);
  const entrada = diretorios + 4 * 8;
  if (entrada + 8 > binario.length) return { binario, removidos: 0 };

  const inicio = binario.readUInt32LE(entrada);
  const tamanho = binario.readUInt32LE(entrada + 4);
  if (!inicio || !tamanho || inicio + tamanho > binario.length) return { binario, removidos: 0 };

  binario.writeUInt32LE(0, entrada);
  binario.writeUInt32LE(0, entrada + 4);
  return { binario: binario.subarray(0, inicio), removidos: tamanho };
}

async function principal() {
  if (process.platform !== "win32") {
    console.log(`Atenção: rodando em ${process.platform}. O executável sai para ESTA plataforma, não para Windows.`);
  }

  await rm(BUILD, { recursive: true, force: true });
  await rm(DESTINO, { recursive: true, force: true });
  await mkdir(BUILD, { recursive: true });
  await mkdir(DESTINO, { recursive: true });

  passo("Gerando os artefatos (animações, tokens, i18n)");
  for (const script of ["gerar-animacoes.mjs", "gerar-tokens.mjs", "gerar-i18n.mjs"]) {
    await executar(process.execPath, [path.join(RAIZ, "scripts", script), "--silencioso"], { cwd: RAIZ });
  }

  passo("Construindo o painel");
  // O Vite direto, e não `npm run build:painel`: o Node 24 recusa spawnar um
  // `.cmd` sem shell, e com shell os argumentos vão concatenados na linha de
  // comando — que é justamente o que ele deprecou. O caminho do binário é o
  // mesmo que o `scripts/verificar-painel.mjs` já usa.
  const vite = path.join(RAIZ, "node_modules", "vite", "bin", "vite.js");
  await executar(process.execPath, [vite, "build"], { cwd: path.join(RAIZ, "panel"), maxBuffer: 8 * 1024 * 1024 });

  passo("Fundindo a ponte num arquivo só");
  const entrada = path.join(BUILD, "ponte.cjs");
  console.log(`  ${kb(await fundirEmUmArquivo(entrada))}`);

  passo("Reunindo o que vai embutido");
  const doPainel = await varrer(path.join(RAIZ, "panel", "dist"));
  const daSemente = await listarSemente();

  const anexos = { "indice.json": path.join(BUILD, "indice.json") };
  for (const relativo of doPainel) anexos[`painel/${relativo}`] = path.join(RAIZ, "panel", "dist", relativo);
  for (const relativo of daSemente) anexos[`semente/${relativo}`] = path.join(RAIZ, relativo);

  await writeFile(path.join(BUILD, "indice.json"), JSON.stringify({ painel: doPainel, semente: daSemente }, null, 2), "utf8");
  console.log(`  painel: ${doPainel.length} arquivos | semente: ${daSemente.length} arquivos`);

  passo("Montando o blob");
  const blob = path.join(BUILD, "kora.blob");
  await writeFile(
    path.join(BUILD, "sea.json"),
    JSON.stringify({ main: entrada, output: blob, disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false, assets: anexos }, null, 2),
    "utf8",
  );
  await executar(process.execPath, ["--experimental-sea-config", path.join(BUILD, "sea.json")], { cwd: RAIZ, maxBuffer: 32 * 1024 * 1024 });
  console.log(`  ${mb((await stat(blob)).size)}`);

  passo("Colando o blob numa cópia do Node");
  const exe = path.join(DESTINO, NOME_DO_EXE);
  const { binario, removidos } = removerAssinatura(await readFile(process.execPath));
  await writeFile(exe, binario);
  console.log(removidos ? `  assinatura do Node removida (${kb(removidos)})` : "  sem assinatura para remover");

  const { inject } = await import("postject");
  await inject(exe, "NODE_SEA_BLOB", await readFile(blob), { sentinelFuse: FUSIVEL, machoSegmentName: "NODE_SEA", overwrite: true });

  await writeFile(path.join(DESTINO, "LEIA-ME.txt"), await montarLeiaMe(), "utf8");

  console.log(`\n✓ ${path.relative(RAIZ, exe)} — ${mb((await stat(exe)).size)}`);
  console.log("  Copie a pasta inteira para a máquina do cliente e mande dar duplo clique no exe.");
}

const montarLeiaMe = () => readFile(path.join(RAIZ, "scripts", "modelos", "leia-me-do-portatil.txt"), "utf8");

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
