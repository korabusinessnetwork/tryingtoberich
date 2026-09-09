#!/usr/bin/env node
/**
 * Vistoria antes da primeira sessão no Roblox Studio (F0-2).
 *
 * Responde uma pergunta que nenhum outro comando respondia: **consigo começar a
 * sessão agora?** O `npm run validar` cuida de contrato e de dado; esta cuida
 * de AMBIENTE — Studio instalado, Rojo instalado, o place montando de verdade,
 * a ponte respondendo.
 *
 * Existe por causa da lição da rodada 4: se responder a uma pergunta exige
 * script descartável, o comando de validação está incompleto. Para saber que
 * não havia bloqueio no F0-2 eu escrevi três descartáveis. Este é o que fica.
 *
 * E ele não morre com o F0-2. O ADR-P04 nomeia o suporte em máquina alheia como
 * o custo dominante do produto — Windows, antivírus, firewall, HttpService
 * desligado. Uma vistoria que NOMEIA o que falta é a semente daquilo.
 *
 * A busca do Studio e do Rojo é a MESMA que o botão do painel usa. Uma segunda
 * implementação divergiria dele e mentiria sobre o que vai acontecer no clique.
 *
 * Nenhum token é impresso: a vistoria diz se existe. Ver CLAUDE.md, Segurança.
 *
 * Uso: npm run vistoria
 */

import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { RAIZ, caminhoDeDados, lerJsonOuPadrao } from "../bridge/src/repos/arquivo.mjs";
import { acharRojo, acharStudio } from "../bridge/src/roblox/estudio.mjs";

const executar = promisify(execFile);

const PROJETO = path.join(RAIZ, "game", "default.project.json");

/** Um item da vistoria. `impede` separa o que trava a sessão do que só atrapalha. */
const itens = [];
const anotar = (ok, titulo, detalhe, { impede = true } = {}) =>
  itens.push({ ok, titulo, detalhe, impede });

// ------------------------------------------------------------- ambiente

function checarStudio() {
  if (process.platform !== "win32") {
    // `acharStudio` procura em LOCALAPPDATA. Dizer "não encontrado" em Linux
    // seria mentira: o Studio não existe para esse sistema.
    return anotar(false, "Roblox Studio", `este sistema é ${process.platform}; o Studio só roda em Windows e macOS`);
  }

  const exe = acharStudio();
  if (!exe) {
    return anotar(false, "Roblox Studio", "não achei em LOCALAPPDATA/Roblox/Versions — instale o Studio e abra uma vez");
  }
  anotar(true, "Roblox Studio", exe);
}

function checarRojo() {
  const exe = acharRojo();
  if (!exe) {
    return anotar(false, "Rojo", "não está no PATH. Instale com:  winget install Rojo.Rojo");
  }
  anotar(true, "Rojo", exe);
}

// ------------------------------------------------------------ o place

/**
 * O achado mais valioso da vistoria: se o place não monta, a sessão morreria no
 * Connect, depois de o streamer já ter aberto tudo. O erro do Rojo vai inteiro
 * para a tela — resumir esconderia justamente o arquivo culpado.
 */
async function checarBuild() {
  const rojo = acharRojo();
  if (!rojo) return anotar(false, "O place monta", "sem Rojo não dá para conferir");

  const saida = path.join(os.tmpdir(), `ksg-vistoria-${process.pid}.rbxlx`);
  try {
    await executar(rojo, ["build", PROJETO, "--output", saida], { cwd: RAIZ });
    const conteudo = await readFile(saida, "utf8");
    const instancias = (conteudo.match(/<Item class=/g) ?? []).length;
    anotar(true, "O place monta", `${instancias} instâncias a partir de game/default.project.json`);
  } catch (erro) {
    anotar(false, "O place monta", `rojo build falhou:\n     ${String(erro.stderr || erro.message).trim()}`);
  } finally {
    // Sai mesmo se o build falhar: o repositório nunca fica com um .rbxlx.
    await rm(saida, { force: true });
  }
}

// ------------------------------------------------------------- a ponte

/** O token do ambiente, sem nunca revelá-lo. */
async function ambienteDaPonte() {
  let porta = process.env.BRIDGE_PORT;
  let token = process.env.BRIDGE_TOKEN;

  if (!porta || !token) {
    try {
      const bruto = await readFile(path.join(RAIZ, ".env"), "utf8");
      for (const linha of bruto.split(/\r?\n/)) {
        const achado = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(linha);
        if (!achado) continue;
        const valor = achado[2].replace(/^["']|["']$/g, "").trim();
        if (achado[1] === "BRIDGE_PORT" && !porta) porta = valor;
        if (achado[1] === "BRIDGE_TOKEN" && !token) token = valor;
      }
    } catch {
      // Sem .env, a porta cai no padrão e o token vira aviso.
    }
  }
  return { porta: Number.parseInt(porta ?? "8787", 10) || 8787, token: token || null };
}

async function checarPonte() {
  const { porta, token } = await ambienteDaPonte();

  if (!token) {
    // Também aviso: editar o .env não exige nada além de um editor.
    anotar(false, "Token da ponte", "BRIDGE_TOKEN não está no ambiente nem no .env", { impede: false });
  } else {
    anotar(true, "Token da ponte", "configurado (não será impresso)");
  }

  const abortar = new AbortController();
  const relogio = setTimeout(() => abortar.abort(), 3000);
  try {
    const resposta = await fetch(`http://127.0.0.1:${porta}/jogo/sonda`, {
      headers: token ? { "X-Bridge-Token": token } : {},
      signal: abortar.signal,
    });

    //[[ Tudo que é da ponte entra como AVISO, nunca como impedimento.
    //
    // A pergunta desta vistoria é "consigo COMEÇAR a sessão?", e a ponte se
    // resolve sem sair da cadeira: um `npm run ponte` e pronto. O que impede
    // começar é o que exige instalar coisa ou consertar o place.
    //
    // Continua aparecendo em destaque porque descobrir isso DEPOIS de abrir o
    // Studio custa a sessão do mesmo jeito. ]]
    if (resposta.status === 200) {
      anotar(true, "Ponte no ar", `responde em 127.0.0.1:${porta}`);
    } else if (resposta.status === 401) {
      anotar(false, "Ponte no ar", `está no ar em ${porta}, mas o token do .env não confere`, { impede: false });
    } else if (resposta.status === 404) {
      anotar(
        false,
        "Ponte no ar",
        `respondeu 404 em ${porta}: é uma ponte ANTIGA, de antes de /jogo/sonda existir. Reinicie com  npm run ponte`,
        { impede: false },
      );
    } else {
      anotar(false, "Ponte no ar", `respondeu HTTP ${resposta.status} em ${porta}`, { impede: false });
    }
  } catch {
    // Aviso, não impedimento: dá para abrir o Studio agora e subir a ponte
    // depois. O que não dá é esperar o jogo reagir sem ela.
    anotar(false, "Ponte no ar", `não respondeu em 127.0.0.1:${porta}. Suba com:  npm run ponte`, { impede: false });
  } finally {
    clearTimeout(relogio);
  }
}

// ------------------------------------------------------------- o acervo

async function checarAcervo() {
  const acervo = await lerJsonOuPadrao(caminhoDeDados("acervo.json"), null);
  if (!acervo) return anotar(false, "Acervo", "não achei data/acervo.json");

  const contar = (colecao) =>
    (acervo[colecao] ?? []).filter((i) => i.status === "aprovado" && i.assetId !== null).length;

  const skybox = contar("skybox");
  const texturas = contar("texturas");

  if (skybox > 0 && texturas > 0) {
    anotar(true, "Acervo", `${skybox} skybox e ${texturas} texturas aprovados`);
  } else {
    anotar(false, "Acervo", "sem skybox ou textura aprovada — nenhum mapa vai ao ar (ADR-004). Veja npm run validar");
  }
}

// -------------------------------------------------------------- saída

async function principal() {
  console.log("");
  console.log("VISTORIA — dá para começar a sessão no Studio?");
  console.log("");

  checarStudio();
  checarRojo();
  console.log("  (montando o place para conferir, leva alguns segundos…)");
  await checarBuild();
  await checarPonte();
  await checarAcervo();

  console.log("");
  for (const item of itens) {
    const marca = item.ok ? "✓" : item.impede ? "✗" : "!";
    console.log(`  ${marca} ${item.titulo}`);
    console.log(`     ${item.detalhe}`);
  }

  const impedimentos = itens.filter((i) => !i.ok && i.impede);
  const avisos = itens.filter((i) => !i.ok && !i.impede);

  console.log("");
  if (impedimentos.length === 0) {
    console.log("Tudo pronto. O roteiro da sessão está em");
    console.log("   docs/09_BACKLOG/roteiro-da-sessao-no-studio.md");
    if (avisos.length > 0) {
      console.log("");
      console.log(`Antes, resolva ${avisos.length} aviso(s) marcado(s) com !`);
      console.log("Dá para abrir o Studio assim, mas o jogo não vai reagir a presente nenhum.");
    }
  } else {
    console.log(`${impedimentos.length} coisa(s) impedem começar:`);
    for (const item of impedimentos) console.log(`   - ${item.titulo}`);
    process.exitCode = 1;
  }
  console.log("");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await principal();

export { checarAcervo, checarBuild, checarPonte, checarRojo, checarStudio, itens };
