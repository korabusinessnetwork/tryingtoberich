/**
 * A porta de entrada do `KoraStreamGames.exe`.
 *
 * O executável portátil não é um produto diferente: é a MESMA ponte e o MESMO
 * painel, com o runtime do Node colado junto e sem nada para instalar. O que
 * este arquivo faz é só o que o `npm start` fazia por fora e ninguém pode pedir
 * ao cliente para fazer na mão:
 *
 *   1. escreve `data/` e `game/` ao lado do exe, se ainda não estiverem lá;
 *   2. cria o `.env` com um `BRIDGE_TOKEN` sorteado na hora — o cliente não tem
 *      `openssl` nem tem por que saber o que é um token;
 *   3. sobe a ponte;
 *   4. abre o painel no navegador.
 *
 * O que ele NÃO faz, de propósito: instalar o Roblox Studio e o Rojo. Os dois
 * são programas de terceiros, com instalador próprio, e sair instalando coisa
 * na máquina do cliente é o que separa um portátil de um instalador. Ficam
 * documentados no `LEIA-ME.txt` que acompanha o exe, e o painel avisa quando
 * falta algum — o botão "Abrir o jogo no Studio" já responde com o comando do
 * `winget` quando não acha o Rojo.
 */

import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import { EMPACOTADO, RAIZ, embutido, indiceEmbutido } from "./empacotamento.mjs";
import { escreverBinarioAtomico, existe, lerBinario } from "./repos/arquivo.mjs";
import { principal } from "./index.mjs";

/**
 * O que é reescrito a cada arranque, e o que só nasce uma vez.
 *
 * A regra é "de quem é o arquivo". Schema, catálogo de tradução, tabela de
 * animações e a fonte do jogo são PROGRAMA: têm que casar com a versão do exe,
 * senão trocar o executável por um novo deixa em disco um schema velho que
 * recusa o dado novo. Preset, acervo e configuração são do STREAMER: nascem com
 * um exemplo e nunca mais são tocados — sobrescrever apagaria o trabalho dele.
 */
const DO_PROGRAMA = [/^game[/]/, /^data[/]schemas[/]/, /^data[/]i18n[/]/, /^data[/](animacoes|tokens)[.]json$/];

export const eDoPrograma = (relativo) => DO_PROGRAMA.some((padrao) => padrao.test(relativo));

/**
 * Escreve a semente ao lado do executável. Devolve o que mudou, para o log.
 *
 * Compara antes de escrever porque a alternativa — reescrever tudo sempre — faz
 * o OneDrive sincronizar 800 KB a cada duplo clique e o antivírus varrer junto.
 */
export async function semear({ indice = indiceEmbutido(), ler = embutido, raiz = RAIZ } = {}) {
  const escritos = [];

  for (const relativo of indice.semente ?? []) {
    const conteudo = ler(`semente/${relativo}`);
    if (!conteudo) continue;

    const destino = path.join(raiz, relativo);
    const jaEsta = await existe(destino);

    if (jaEsta && !eDoPrograma(relativo)) continue;
    if (jaEsta && Buffer.compare(await lerBinario(destino), conteudo) === 0) continue;

    await escreverBinarioAtomico(destino, conteudo);
    escritos.push(relativo);
  }

  return escritos;
}

/**
 * O `.env` do cliente, criado uma vez.
 *
 * O `BRIDGE_TOKEN` é sorteado aqui e não vem no molde: token embutido no
 * executável seria o MESMO em toda instalação, e a única coisa que separa a
 * porta pública do jogo de quem passar por ela é justamente ele. Ver
 * `docs/11_SEGURANCA`.
 */
export function montarEnv(molde, token = randomBytes(32).toString("hex")) {
  return molde.replace(/^BRIDGE_TOKEN=.*$/m, `BRIDGE_TOKEN=${token}`);
}

async function garantirEnv() {
  const destino = path.join(RAIZ, ".env");
  if (await existe(destino)) return false;

  const molde = embutido("semente/.env.example");
  if (!molde) throw new Error("O molde do .env não veio embutido no executável.");

  await escreverBinarioAtomico(destino, Buffer.from(montarEnv(molde.toString("utf8")), "utf8"));
  return true;
}

/** Abre o navegador. Falhar aqui não derruba nada: a URL fica escrita na tela. */
function abrirNavegador(url) {
  const comando =
    process.platform === "win32"
      ? { exe: "cmd", args: ["/c", "start", "", url] }
      : { exe: process.platform === "darwin" ? "open" : "xdg-open", args: [url] };

  try {
    const processo = spawn(comando.exe, comando.args, { stdio: "ignore", detached: true });
    processo.on("error", () => {});
    processo.unref();
  } catch {
    /* a URL já está impressa */
  }
}

/**
 * Segura a janela aberta.
 *
 * Quem abre por duplo clique não tem terminal: se o processo morre, o console
 * some junto e leva a mensagem de erro. Sem isto, uma porta ocupada vira "clico
 * e não acontece nada".
 */
function esperarEnter() {
  console.log("\nPressione Enter para fechar.");
  return new Promise((seguir) => {
    process.stdin.resume();
    process.stdin.once("data", seguir);
    setTimeout(seguir, 120_000).unref();
  });
}

async function arrancar() {
  console.log("Kora Stream Games");
  console.log(`Pasta: ${RAIZ}\n`);

  const escritos = await semear();
  if (escritos.length) console.log(`Arquivos preparados: ${escritos.length}`);

  if (await garantirEnv()) {
    console.log("Criei o .env com um token novo. Ele é desta instalação — não copie para outra máquina.");
  }

  process.loadEnvFile(path.join(RAIZ, ".env"));

  const subiu = await principal();
  if (!subiu) return false;

  const url = `http://${subiu.config.host}:${subiu.config.portaPainel}/`;
  console.log(`\nPainel: ${url}`);
  console.log("Deixe esta janela aberta enquanto estiver ao vivo. Fechar aqui desliga o jogo.");
  abrirNavegador(url);
  return true;
}

//[[ Sem `await` de módulo aqui.
//
// O executável é montado a partir de UM arquivo CommonJS, e CommonJS não tem
// await de topo — o empacotador recusa o build inteiro se este arquivo tiver
// um. Envolver numa função async custa duas linhas e mantém o empacotamento
// capaz de traduzir o módulo sem exceção. ]]
async function arrancarSemExplodir() {
  try {
    if (!(await arrancar())) await esperarEnter();
  } catch (erro) {
    console.error(`\nNão consegui subir: ${erro?.message ?? erro}`);
    process.exitCode = 1;
    await esperarEnter();
  }
}

//[[ Não arranca por ser importado.
//
// Este arquivo exporta `semear` e `montarEnv`, e o teste importa os dois. Sem
// esta guarda o `npm test` subia a ponte de verdade na 8787 por causa de um
// `import` — o que dá EADDRINUSE quando já existe uma rodando, e o motivo fica
// escondido no meio da saída de 500 testes.
//
// `EMPACOTADO ||` porque dentro do exe não há garantia de `process.argv[1]`;
// `chamadaDireta` porque `node bridge/src/empacotado.mjs` é como se ensaia o
// arranque do executável sem montar os 94 MB. ]]
const chamadaDireta = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (EMPACOTADO || chamadaDireta) arrancarSemExplodir();
