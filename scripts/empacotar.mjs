#!/usr/bin/env node
/**
 * Monta o `KoraStreamGames.exe` — o aplicativo portátil.
 *
 *   npm run empacotar
 *
 * O que sai: `dist/KoraStreamGames.exe`, um arquivo só. Copiar para qualquer
 * pasta e dar duplo clique. O `data/`, o `game/` e o `.env` nascem ao lado dele
 * no primeiro uso.
 *
 * COMO FUNCIONA, em quatro peças:
 *
 *   1. **O painel** é construído pelo Vite, como sempre.
 *   2. **A ponte** — dezenas de módulos ESM mais `express`, `ajv` e o
 *      `tiktok-live-connector` — é fundida num `ponte.cjs` pelo `rolldown`, que
 *      o Vite já trazia. É isso que dispensa levar `node_modules` junto.
 *   3. **O Electron** dá a janela nativa e o runtime. O processo principal é o
 *      `app/principal.cjs`.
 *   4. **O `electron-builder`** junta tudo num executável portátil, com ícone,
 *      nome e versão gravados no binário.
 *
 * Tudo MIT e gratuito, e só de desenvolvimento. Ver ADR-P07.
 *
 * O QUE ESTE SCRIPT NÃO RESOLVE: o exe não é assinado, e o SmartScreen avisa na
 * primeira execução. Assinatura custa dinheiro e a decisão é do dono — está no
 * ADR-P07, junto com o texto que o cliente vê.
 */

import { execFile } from "node:child_process";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { RAIZ } from "../bridge/src/repos/arquivo.mjs";
import { gerarIcone } from "./gerar-icone.mjs";

const executar = promisify(execFile);

const BUILD = path.join(RAIZ, "build");
const APP = path.join(BUILD, "app");
const PROGRAMA = path.join(BUILD, "programa");
const MARCA = path.join(BUILD, "marca");
/** Onde o electron-builder cospe os intermediários dele (`win-unpacked` e cia). */
const PACOTE = path.join(BUILD, "pacote");
/** O que é entregue: o exe e o LEIA-ME, e mais nada. */
const SAIDA = path.join(RAIZ, "dist", "KoraStreamGames");

const passo = (texto) => console.log(`\n▸ ${texto}`);
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Os arquivos da semente: o que o Git versiona em `data/` e `game/`, mais os
 * gerados que o aplicativo não tem como gerar sozinho.
 *
 * Por que o Git e não uma varredura: o `.gitignore` já sabe distinguir o que é
 * do produto do que é da INSTALAÇÃO — a arte do streamer, o catálogo coletado
 * da live, o dado de sessão. Repetir essa lista aqui seria mantê-la em dois
 * lugares e embutir 65 MB de vídeo e imagem que não são nossos.
 */
export async function listarSemente(raiz = RAIZ) {
  let versionados;
  try {
    const { stdout } = await executar("git", ["ls-files", "-z", "data", "game", ".env.example"], {
      cwd: raiz,
      maxBuffer: 32 * 1024 * 1024,
    });
    versionados = stdout.split("\u0000").filter(Boolean);
  } catch {
    throw new Error("Não consegui listar a semente: este build precisa do `git` no PATH.");
  }

  // Gerados a partir de `docs/`, e o aplicativo não leva `docs/` junto. Sem
  // eles a ponte recusa subir, com a mensagem certa e no lugar mais confuso
  // possível: na máquina do cliente.
  const gerados = ["data/animacoes.json", "data/tokens.json"];

  return [...new Set([...versionados, ...gerados])].sort();
}

async function fundirAPonte(saida) {
  const { rolldown } = await import("rolldown");

  const pacote = await rolldown({
    input: path.join(RAIZ, "bridge", "src", "aplicativo.mjs"),
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
 * O `package.json` que o Electron lê ao abrir.
 *
 * É gerado, e não versionado, porque nome, versão e descrição são os MESMOS do
 * `package.json` da raiz — e um segundo arquivo à mão viraria a versão que
 * ninguém lembra de subir.
 */
async function montarPackageDoApp() {
  const raiz = JSON.parse(await readFile(path.join(RAIZ, "package.json"), "utf8"));

  return {
    name: "kora-stream-games",
    productName: "Kora Stream Games",
    version: raiz.version,
    description: "Painel e ponte do Kora Stream Games.",
    author: "Kora Business Network",
    license: "UNLICENSED",
    private: true,
    main: "principal.cjs",
  };
}

function configDoBuilder() {
  return {
    appId: "network.kora.streamgames",
    productName: "Kora Stream Games",
    copyright: `Copyright © ${new Date().getFullYear()} Kora Business Network`,
    directories: {
      app: path.relative(RAIZ, APP),
      output: path.relative(RAIZ, PACOTE),
      buildResources: path.relative(RAIZ, MARCA),
    },
    //[[ O painel e a semente vão como RECURSO, fora do `app.asar`.
    //
    // Dentro do asar eles até seriam lidos — o Electron remenda o `fs` para
    // isso — mas remendo de `fs` é exatamente o tipo de coisa que funciona até
    // o dia em que não funciona, e o `repos/arquivo.mjs` usa `open`, `stat` e
    // `createReadStream`. Fora do asar é `fs` de verdade, sem surpresa. ]]
    extraResources: [{ from: path.relative(RAIZ, PROGRAMA), to: "programa" }],
    asar: true,
    // Não há dependência nativa: a ponte inteira virou um arquivo.
    npmRebuild: false,
    compression: "maximum",
    win: {
      target: ["portable"],
      icon: path.relative(RAIZ, path.join(MARCA, "icon.ico")),
      // Sem isto o Windows mostra "Electron" nas propriedades do arquivo.
      legalTrademarks: "Kora Business Network",
    },
    portable: { artifactName: "KoraStreamGames.exe" },
  };
}

async function principal() {
  if (process.platform !== "win32") {
    console.log(`Atenção: rodando em ${process.platform}. O aplicativo sai para ESTA plataforma, não para Windows.`);
  }

  await rm(BUILD, { recursive: true, force: true });
  await rm(SAIDA, { recursive: true, force: true });
  for (const dir of [APP, PROGRAMA, MARCA, PACOTE, SAIDA]) await mkdir(dir, { recursive: true });

  passo("Gerando os artefatos (animações, tokens, i18n)");
  for (const script of ["gerar-animacoes.mjs", "gerar-tokens.mjs", "gerar-i18n.mjs"]) {
    await executar(process.execPath, [path.join(RAIZ, "scripts", script), "--silencioso"], { cwd: RAIZ });
  }

  passo("Desenhando o ícone");
  const icone = await gerarIcone(path.join(MARCA, "icon.ico"));
  console.log(`  ${icone.tamanhos.join(", ")} px`);
  await cp(path.join(MARCA, "icon.ico"), path.join(PROGRAMA, "icone.ico"));

  passo("Construindo o painel");
  // O Vite direto, e não `npm run build:painel`: o Node 24 recusa spawnar um
  // `.cmd` sem shell, e com shell os argumentos vão concatenados na linha de
  // comando — que é justamente o que ele deprecou.
  const vite = path.join(RAIZ, "node_modules", "vite", "bin", "vite.js");
  await executar(process.execPath, [vite, "build"], { cwd: path.join(RAIZ, "panel"), maxBuffer: 8 * 1024 * 1024 });
  await cp(path.join(RAIZ, "panel", "dist"), path.join(PROGRAMA, "painel"), { recursive: true });

  passo("Fundindo a ponte num arquivo só");
  console.log(`  ${kb(await fundirAPonte(path.join(APP, "ponte.cjs")))}`);
  await cp(path.join(RAIZ, "app", "principal.cjs"), path.join(APP, "principal.cjs"));

  const pacote = await montarPackageDoApp();
  await writeFile(path.join(APP, "package.json"), `${JSON.stringify(pacote, null, 2)}\n`, "utf8");

  passo("Reunindo a semente");
  const semente = await listarSemente();
  for (const relativo of semente) {
    await cp(path.join(RAIZ, relativo), path.join(PROGRAMA, "semente", relativo));
  }
  console.log(`  ${semente.length} arquivos`);

  passo("Montando o executável (Electron)");
  const { build, Platform } = await import("electron-builder");
  const feitos = await build({
    targets: Platform.WINDOWS.createTarget("portable"),
    config: configDoBuilder(),
    projectDir: RAIZ,
  });

  const cru = feitos.find((arquivo) => arquivo.endsWith(".exe"));
  if (!cru) throw new Error(`O build não produziu um .exe. Saiu: ${feitos.join(", ")}`);

  const exe = path.join(SAIDA, "KoraStreamGames.exe");
  await cp(cru, exe);
  await cp(path.join(RAIZ, "scripts", "modelos", "leia-me-do-portatil.txt"), path.join(SAIDA, "LEIA-ME.txt"));

  console.log(`\n✓ ${path.relative(RAIZ, exe)} — ${mb((await stat(exe)).size)}`);
  console.log("  Um arquivo só. Copie para a máquina do cliente e mande dar duplo clique.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
