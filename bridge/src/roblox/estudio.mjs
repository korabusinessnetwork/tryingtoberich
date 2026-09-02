/**
 * Abre o jogo no Roblox Studio, a partir de um botão do painel.
 *
 * O fluxo é o do `game/README.md`: o Rojo serve os arquivos e o Studio conecta
 * pelo plugin. O botão faz as duas partes que são mecânicas — subir o `rojo
 * serve` e abrir o Studio — e deixa para o streamer só o Connect e o Play.
 *
 * NADA aqui aceita entrada do painel. O caminho do projeto é fixo e o binário
 * é procurado na instalação do Roblox. É rota que executa processo local: o
 * dia em que ela receber um parâmetro do navegador vira execução arbitrária.
 */

import { execFile, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { promisify } from "node:util";
import net from "node:net";
import path from "node:path";

import { ErroDeDominio } from "../erros.mjs";
import { RAIZ } from "../repos/arquivo.mjs";

/** Porta padrão do `rojo serve`. É por ela que o plugin no Studio conecta. */
const PORTA_ROJO = 34872;

/** O executável do Studio, dentro da instalação do Roblox. */
export function acharStudio(localAppData = process.env.LOCALAPPDATA) {
  if (!localAppData) return null;

  const versoes = path.join(localAppData, "Roblox", "Versions");
  if (!existsSync(versoes)) return null;

  for (const versao of readdirSync(versoes)) {
    const exe = path.join(versoes, versao, "RobloxStudioBeta.exe");
    if (existsSync(exe)) return exe;
  }
  return null;
}

/**
 * O `rojo` no PATH.
 *
 * Procurado à mão, extensão por extensão, porque `spawn` sem shell no Windows
 * não resolve `.cmd` nem `.bat` — foi assim que o gate do painel morria com
 * ENOENT. E com shell, o PATH entraria numa linha de comando interpretada.
 */
export function acharRojo(pathDoSistema = process.env.PATH ?? "", plataforma = process.platform) {
  const extensoes = plataforma === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];

  for (const pasta of pathDoSistema.split(path.delimiter).filter(Boolean)) {
    for (const extensao of extensoes) {
      const candidato = path.join(pasta, `rojo${extensao}`);
      if (existsSync(candidato)) return candidato;
    }
  }
  return null;
}

/** Alguém já está servindo na porta do Rojo? */
function portaOcupada(porta) {
  return new Promise((resolve) => {
    const socket = net.connect({ port: porta, host: "127.0.0.1" });
    socket.setTimeout(400);
    const fechar = (resultado) => {
      socket.destroy();
      resolve(resultado);
    };
    socket.once("connect", () => fechar(true));
    socket.once("timeout", () => fechar(false));
    socket.once("error", () => fechar(false));
  });
}

const executar = promisify(execFile);
const PROJETO_BASE = path.join(RAIZ, "game", "default.project.json");

/**
 * Torna os `$path` do projeto Rojo absolutos.
 *
 * Sem isto o projeto gerado teria que morar em `game/` para os caminhos
 * relativos resolverem — e aí um arquivo COM O TOKEN DENTRO nasceria dentro do
 * repositório, a um `git add -A` distante de ser publicado. Com caminho
 * absoluto, o projeto e o place vivem na pasta temporária do sistema.
 */
export function absolutizarCaminhos(no, base) {
  if (!no || typeof no !== "object") return;

  if (typeof no.$path === "string") no.$path = path.resolve(base, no.$path);
  for (const filho of Object.values(no)) absolutizarCaminhos(filho, base);
}

/**
 * Monta um place `.rbxlx` já pronto para dar Play.
 *
 * É o que transforma "abre o Studio" em "abre o jogo". Os dois passos manuais
 * do `game/README` entram aqui:
 *
 *  - `ServerStorage.KoraConfig` com a URL e o token, que o `configuracao.lua`
 *    lê. Antes, o streamer criava a Folder e os dois StringValue na mão, uma
 *    vez por lugar, e errar um nome dava "falta configurar a ponte".
 *  - `HttpService.HttpEnabled`, sem o qual o long-poll não sai do lugar.
 *
 * O arquivo carrega o token, então nasce na pasta temporária do sistema e nunca
 * no repositório. Ver 11_SEGURANCA.
 */
async function montarPlace({ urlDaPonte, token }) {
  const projeto = JSON.parse(await readFile(PROJETO_BASE, "utf8"));
  absolutizarCaminhos(projeto.tree, path.dirname(PROJETO_BASE));

  projeto.tree.ServerStorage = {
    $className: "ServerStorage",
    KoraConfig: {
      $className: "Folder",
      UrlDaPonte: { $className: "StringValue", $properties: { Value: urlDaPonte } },
      Token: { $className: "StringValue", $properties: { Value: token } },
    },
  };
  projeto.tree.HttpService = { $className: "HttpService", $properties: { HttpEnabled: true } };

  const pasta = await fsMkdtemp();
  const arquivoDoProjeto = path.join(pasta, "kora.project.json");
  const place = path.join(pasta, "KoraStreamGames.rbxlx");

  await writeFile(arquivoDoProjeto, JSON.stringify(projeto, null, 2), "utf8");
  await executar(acharRojo(), ["build", arquivoDoProjeto, "--output", place], { cwd: pasta });

  return { place, projeto: arquivoDoProjeto };
}

async function fsMkdtemp() {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(path.join(os.tmpdir(), "kora-place-"));
}

export async function abrirNoStudio({ urlDaPonte, token } = {}) {
  if (process.platform !== "win32") {
    throw new ErroDeDominio("studio_indisponivel", "Abrir o Studio pelo painel só está implementado no Windows.", { status: 501 });
  }

  const studio = acharStudio();
  if (!studio) {
    throw new ErroDeDominio(
      "studio_nao_encontrado",
      "Não achei o RobloxStudioBeta.exe na instalação do Roblox. O Studio está instalado nesta máquina?",
      { status: 412 },
    );
  }

  // Sem Rojo não há como montar o place, e abrir o Studio vazio não ajuda:
  // seria uma janela em branco e a impressão de que o botão não funcionou.
  if (!acharRojo()) {
    throw new ErroDeDominio(
      "rojo_nao_encontrado",
      "O Rojo não está instalado. No Windows: winget install Rojo.Rojo — e abra um terminal novo depois.",
      { status: 412 },
    );
  }

  let montado = null;
  try {
    montado = await montarPlace({ urlDaPonte, token });
  } catch (erro) {
    throw new ErroDeDominio(
      "place_nao_montado",
      `O Rojo não conseguiu montar o lugar: ${String(erro.stderr || erro.message).trim()}`,
      { status: 500 },
    );
  }

  // O Studio abre o .rbxlx direto. Destacado de propósito: derrubar a ponte não
  // pode fechar o Studio com trabalho aberto dentro.
  const processo = spawn(studio, [montado.place], { detached: true, stdio: "ignore" });
  processo.on("error", () => {});
  processo.unref();

  /*
   * O `rojo serve` recebe o MESMO projeto do place, não o `default.project.json`.
   *
   * Isto foi um bug de verdade: servir o projeto base significava que o place
   * aberto tinha `ServerStorage.KoraConfig` e o que o Rojo sincronizava não
   * tinha. Dar Connect depois de abrir reconciliava por cima, e o jogo subia
   * dizendo "ponte não configurada" — com o arquivo do place correto no disco.
   * O resultado dependia de o streamer ter clicado em Connect ou não, que é o
   * pior tipo de bug: intermitente e culpa do usuário na aparência.
   */
  let rojo = "ja_rodando";
  if (!(await portaOcupada(PORTA_ROJO))) {
    // Filho normal, não destacado: quando a ponte cai, o rojo cai junto. Um
    // servidor órfão segurando a 34872 apontaria para outro projeto.
    const servidor = spawn(acharRojo(), ["serve", montado.projeto], { cwd: path.dirname(montado.projeto), stdio: "ignore" });
    servidor.on("error", () => {});
    rojo = "iniciado";
  }

  return { studio: path.basename(studio), place: montado.place, rojo, portaRojo: PORTA_ROJO };
}
