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

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import net from "node:net";
import path from "node:path";

import { ErroDeDominio } from "../erros.mjs";
import { RAIZ } from "../repos/arquivo.mjs";

/** Porta padrão do `rojo serve`. É por ela que o plugin no Studio conecta. */
const PORTA_ROJO = 34872;
const PROJETO = path.join(RAIZ, "game", "default.project.json");

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

export async function abrirNoStudio() {
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

  let rojo = "ausente";
  if (await portaOcupada(PORTA_ROJO)) {
    // Já tem servidor de pé. Subir outro só daria erro de porta ocupada.
    rojo = "ja_rodando";
  } else {
    const executavel = acharRojo();
    if (executavel) {
      // Filho normal, não destacado: quando a ponte cai, o rojo cai junto. Um
      // servidor órfão segurando a 34872 faria o próximo clique dizer
      // "ja_rodando" apontando para um projeto que já não é este.
      const processo = spawn(executavel, ["serve", PROJETO], { cwd: RAIZ, stdio: "ignore" });
      processo.on("error", () => {});
      rojo = "iniciado";
    }
  }

  // Destacado, ao contrário do rojo: derrubar a ponte não pode fechar o Studio
  // com trabalho aberto dentro.
  const processo = spawn(studio, [], { detached: true, stdio: "ignore" });
  processo.on("error", () => {});
  processo.unref();

  return { studio: path.basename(studio), rojo, portaRojo: PORTA_ROJO };
}
