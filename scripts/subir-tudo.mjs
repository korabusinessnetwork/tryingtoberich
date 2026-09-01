#!/usr/bin/env node
/**
 * Sobe o produto inteiro com um comando: `npm start`.
 *
 * Por que existe: a ponte e o painel são dois processos, e subir na mão custa
 * dois terminais e a lembrança de rodar `npm run gerar` antes. Esquecer o
 * gerar não dá erro bonito — a ponte recusa subir por falta de
 * data/animacoes.json, que é artefato gerado e não versionado.
 *
 * A ORDEM IMPORTA. O painel encaminha /api para a ponte (panel/vite.config.js).
 * Vite subindo primeiro serve uma tela que responde 502 em toda chamada até a
 * ponte acordar, e o sintoma parece bug do painel. Então: gera, sobe a ponte,
 * ESPERA a porta do painel aceitar conexão, e só aí chama o Vite.
 *
 * Sem dependência nova: `concurrently` resolveria, mas o projeto é bootstrap
 * gratuito e isto são 40 linhas de node:child_process. Ver CLAUDE.md, Custo.
 *
 * Uso: node scripts/subir-tudo.mjs [--abrir]
 */

import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { RAIZ } from "../bridge/src/repos/arquivo.mjs";

const executar = promisify(execFile);
const ENV = path.join(RAIZ, ".env");
const VITE = path.join(RAIZ, "node_modules", "vite", "bin", "vite.js");

/**
 * Prefixa cada linha com o nome do processo que a escreveu.
 *
 * Guarda o resto entre chamadas de propósito: `stdout` chega em pedaços que
 * não respeitam a quebra de linha, e prefixar o pedaço cru parte a linha no
 * meio. A ponte loga JSON por linha; JSON partido ao meio não é lido por nada.
 */
export function criarPrefixador(rotulo) {
  let resto = "";

  return (pedaco) => {
    const linhas = (resto + pedaco).split("\n");
    resto = linhas.pop() ?? "";
    return linhas.map((linha) => `[${rotulo}] ${linha}`);
  };
}

/**
 * A URL que o Vite anuncia ao subir.
 *
 * Extraída da saída dele, e não fixada em 5173, porque quando a 5173 está
 * ocupada o Vite sobe na seguinte e ANUNCIA a nova. Abrir 5173 fixo levaria o
 * navegador para a porta errada — ou para o painel de outra coisa.
 */
export function extrairUrlDoPainel(linha) {
  const achado = /(https?:\/\/[^\s]*?:\d+\/?)(?:\s|$)/.exec(despirCores(linha));
  return achado ? achado[1] : null;
}

/** O Vite colore a saída, e o código ANSI entra no meio da URL. */
export function despirCores(texto) {
  // eslint-disable-next-line no-control-regex
  return texto.replace(/\[[0-9;]*m/g, "");
}

/** Espera a porta aceitar conexão. Resolve para false se estourar o prazo. */
export function esperarPorta(porta, host, prazoMs = 20000, intervaloMs = 150) {
  const limite = Date.now() + prazoMs;

  return new Promise((resolve) => {
    const tentar = () => {
      const socket = net.connect({ port: porta, host });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() >= limite) return resolve(false);
        setTimeout(tentar, intervaloMs);
      });
    };
    tentar();
  });
}

const filhos = new Map();
let encerrando = false;

function acompanhar(rotulo, processo, aoVerLinha = null) {
  filhos.set(rotulo, processo);

  for (const fluxo of ["stdout", "stderr"]) {
    const prefixar = criarPrefixador(rotulo);
    processo[fluxo].setEncoding("utf8");
    processo[fluxo].on("data", (pedaco) => {
      for (const linha of prefixar(pedaco)) {
        console.log(linha);
        aoVerLinha?.(linha);
      }
    });
  }

  processo.on("exit", (codigo) => {
    filhos.delete(rotulo);
    if (encerrando) return;
    console.log(`[kora] ${rotulo} saiu (código ${codigo}). Derrubando o resto.`);
    encerrar(codigo ?? 1);
  });
}

/**
 * `child.kill()` no Windows não alcança os netos, e o Vite tem netos (rolldown,
 * esbuild). Neto sobrevivente segura a porta e o `npm start` seguinte falha com
 * EADDRINUSE sem dizer por quê. `taskkill /T` mata a árvore.
 */
function matarArvore(processo) {
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(processo.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    processo.kill("SIGTERM");
  }
}

/**
 * Abre a URL no navegador padrão.
 *
 * `cmd /c start` e não `explorer`: o explorer devolve código de saída não-zero
 * mesmo quando deu certo, e isso viraria erro falso no log.
 */
function abrirNavegador(url) {
  const comando = process.platform === "win32"
    ? { exe: "cmd", args: ["/c", "start", "", url] }
    : { exe: process.platform === "darwin" ? "open" : "xdg-open", args: [url] };

  const processo = spawn(comando.exe, comando.args, { stdio: "ignore", detached: true });
  processo.on("error", () => console.log(`[kora] não consegui abrir o navegador. Abra à mão: ${url}`));
  processo.unref();
}

function encerrar(codigo) {
  if (encerrando) return;
  encerrando = true;
  for (const processo of filhos.values()) matarArvore(processo);
  setTimeout(() => process.exit(codigo), 300);
}

async function principal() {
  if (!existsSync(ENV)) {
    console.error("Falta o .env na raiz. A ponte sobe com --env-file=.env e morre sem ele.");
    console.error("Crie a partir do modelo e preencha o BRIDGE_TOKEN com 32 bytes aleatórios:");
    console.error("  cp .env.example .env");
    console.error('  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exitCode = 1;
    return;
  }

  process.loadEnvFile(ENV);
  const host = process.env.BRIDGE_HOST ?? "127.0.0.1";
  const portaJogo = Number(process.env.BRIDGE_PORT ?? 8787);
  const portaPainel = Number(process.env.PAINEL_PORT ?? 8788);

  // Porta ocupada quase sempre é sobra de um start anterior que não desligou
  // limpo. Sem esta checagem o sintoma é um EADDRINUSE cru vindo da ponte, que
  // não diz que a culpa é de um processo velho ainda vivo.
  for (const [nome, porta] of [["do jogo", portaJogo], ["do painel", portaPainel]]) {
    if (await esperarPorta(porta, host, 0)) {
      console.error(`A porta ${nome} (${host}:${porta}) já está ocupada — provavelmente sobra de um start anterior.`);
      console.error(process.platform === "win32"
        ? `  Veja quem é:  netstat -ano | findstr :${porta}
  E derrube:    taskkill /PID <pid> /T /F`
        : `  Veja quem é:  lsof -i :${porta}
  E derrube:    kill <pid>`);
      process.exitCode = 1;
      return;
    }
  }

  // Artefatos gerados. Baratos, e rodar sempre mantém doc, jogo e painel
  // dizendo a mesma coisa sobre a biblioteca de animações.
  console.log("[kora] gerando artefatos...");
  try {
    await executar(process.execPath, [path.join(RAIZ, "scripts", "gerar-animacoes.mjs"), "--silencioso"], { cwd: RAIZ });
    await executar(process.execPath, [path.join(RAIZ, "scripts", "gerar-tokens.mjs"), "--silencioso"], { cwd: RAIZ });
  } catch (erro) {
    console.error(`[kora] falha ao gerar: ${erro.stderr || erro.message}`);
    process.exitCode = 1;
    return;
  }

  process.on("SIGINT", () => encerrar(0));
  process.on("SIGTERM", () => encerrar(0));

  console.log("[kora] subindo a ponte...");
  acompanhar("ponte", spawn(process.execPath, ["--env-file=.env", path.join("bridge", "src", "index.mjs")], { cwd: RAIZ }));

  if (!(await esperarPorta(portaPainel, host))) {
    console.error(`[kora] a ponte não abriu ${host}:${portaPainel} a tempo. Não vou subir o painel em cima de proxy morto.`);
    encerrar(1);
    return;
  }

  if (encerrando) return;

  console.log("[kora] ponte no ar. Subindo o painel...");

  // `--abrir` é do atalho da área de trabalho, não do uso no terminal: quem
  // roda `npm start` para depurar não quer uma aba nova a cada reinício.
  const abrir = process.argv.includes("--abrir");
  let jaAbriu = false;

  acompanhar("painel", spawn(process.execPath, [VITE], { cwd: path.join(RAIZ, "panel") }), (linha) => {
    if (!abrir || jaAbriu) return;
    const url = extrairUrlDoPainel(linha);
    if (!url) return;
    jaAbriu = true;
    console.log(`[kora] abrindo ${url}`);
    abrirNavegador(url);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
