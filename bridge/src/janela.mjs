/**
 * Abrir o painel como APLICATIVO, e não como aba de navegador.
 *
 * O painel é um produto que o streamer deixa aberto ao lado da live, não um
 * site que ele visita. Aba de navegador dá barra de endereço, favoritos, as
 * outras vinte abas dele, e um `127.0.0.1:8788` em cima da tela — tudo dizendo
 * "isto é uma página", quando o que a pessoa comprou foi um programa.
 *
 * A solução não custa nada e não traz dependência: todo navegador Chromium tem
 * o modo `--app=URL`, que abre uma janela sem barra nenhuma, com ícone próprio
 * na barra de tarefas. É o mesmo mecanismo por trás dos "aplicativos web"
 * instalados pelo Chrome e pelo Edge.
 *
 * Por que não Electron: traria um Chromium inteiro (uns 200 MB) para exibir
 * uma tela que o navegador JÁ INSTALADO exibe igual. Ver ADR-P07.
 *
 * Se não houver Chromium nenhum, cai no navegador padrão — feio, mas
 * funcionando. Nunca deixa o streamer sem tela.
 */

import { spawn } from "node:child_process";
import path from "node:path";

import { existe } from "./repos/arquivo.mjs";

/**
 * Onde procurar, em ordem de preferência.
 *
 * Chrome primeiro porque é o que a maioria já usa e tem o modo aplicativo mais
 * bem acabado; Edge depois porque é o único que está SEMPRE lá no Windows, e
 * portanto o que garante que a janela apareça na máquina de qualquer cliente.
 */
export function candidatosDeNavegador(plataforma = process.platform, env = process.env) {
  if (plataforma === "win32") {
    const programas = [env["ProgramFiles"], env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter(Boolean);
    const relativos = [
      ["Google", "Chrome", "Application", "chrome.exe"],
      ["Microsoft", "Edge", "Application", "msedge.exe"],
      ["BraveSoftware", "Brave-Browser", "Application", "brave.exe"],
    ];
    // Por navegador e não por pasta: um Chrome no `Program Files (x86)` ganha
    // de um Edge no `Program Files`, que é a ordem de preferência acima.
    return relativos.flatMap((partes) => programas.map((base) => path.join(base, ...partes)));
  }

  if (plataforma === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    ];
  }

  return ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"];
}

/** O primeiro que existir em disco, ou `null`. */
export async function acharNavegador(candidatos = candidatosDeNavegador()) {
  for (const caminho of candidatos) {
    if (await existe(caminho)) return caminho;
  }
  return null;
}

/**
 * Os argumentos da janela.
 *
 * `--user-data-dir` é o que transforma a janela num aplicativo de verdade em
 * vez de um enxerto no navegador do streamer: perfil próprio, ícone próprio na
 * barra de tarefas (não agrupado com as abas dele), e o idioma que ele escolher
 * no painel fica guardado COM o produto, não misturado ao histórico dele.
 *
 * `--no-first-run` e `--no-default-browser-check` existem porque o perfil nasce
 * vazio: sem eles, a primeira abertura vem com as telas de boas-vindas do
 * navegador na frente do painel.
 */
export function argumentosDaJanela(url, perfil) {
  return [
    `--app=${url}`,
    `--user-data-dir=${perfil}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1440,900",
  ];
}

/** O comando do navegador padrão. É o recuo, não o caminho feliz. */
export function comandoDoNavegadorPadrao(url, plataforma = process.platform) {
  //[[ `cmd /c start` e não `explorer`: o explorer devolve código de saída
  // não-zero mesmo quando deu certo, e isso viraria erro falso no log. O ""
  // antes da URL é o título da janela do `start`, que sem ele engole a URL. ]]
  if (plataforma === "win32") return { exe: "cmd", args: ["/c", "start", "", url] };
  return { exe: plataforma === "darwin" ? "open" : "xdg-open", args: [url] };
}

/** Dispara e esquece. Falhar aqui não pode derrubar a ponte: a URL está impressa. */
function soltar(exe, args) {
  try {
    const processo = spawn(exe, args, { stdio: "ignore", detached: true });
    processo.on("error", () => {});
    processo.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Abre o painel. Devolve como foi — `"aplicativo"` ou `"navegador"` — para
 * quem chamou poder dizer isso na tela.
 *
 * `disparar` é injetável para o teste poder conferir O QUE seria executado sem
 * abrir janela nenhuma na máquina de quem roda `npm test`.
 */
export async function abrirPainel(url, { perfil, navegador = null, disparar = soltar } = {}) {
  const chromium = navegador ?? (await acharNavegador());

  if (chromium && perfil && disparar(chromium, argumentosDaJanela(url, perfil))) {
    return "aplicativo";
  }

  const padrao = comandoDoNavegadorPadrao(url);
  disparar(padrao.exe, padrao.args);
  return "navegador";
}
