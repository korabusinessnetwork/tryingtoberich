#!/usr/bin/env node
/**
 * A maratona: o F0-6 na metade que não precisa do Roblox.
 *
 * O F0-6 pede "30 minutos de jogo com presente chegando sem parar, olhando o
 * log". As coisas que ele caça — rate limit, vazamento de memória, long-poll
 * órfão — são **da ponte**, e a ponte não precisa do Studio para ser exercida.
 * Este script faz o papel do jogo: abre o long-poll em laço, publica estado a
 * cada 2 segundos, e mede.
 *
 * O que ele NÃO cobre, e por isso não substitui a sessão no Studio: o watchdog
 * de restauração de movimento, o Tween pousando na plataforma e o HUD lendo no
 * celular. Isso é Luau rodando, e é seu.
 *
 * Por que vale existir: o BUG-002 foi exatamente desta família — o rate limit
 * da ponte derrubando o próprio jogo — e só apareceu quando alguém insistiu por
 * tempo suficiente. Insistir é barato quando é um script.
 *
 * Uso: npm run maratona -- --minutos=5 [--presentes-por-minuto=20]
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { RAIZ, apagar, caminhoDeDados } from "../bridge/src/repos/arquivo.mjs";

const executar = promisify(execFile);

const arg = (nome, padrao) => {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? Number(achado.split("=")[1]) : padrao;
};

const MINUTOS = arg("minutos", 5);
const POR_MINUTO = arg("presentes-por-minuto", 20);

/** O piso entre voltas do laço do jogo, espelhando game/src/server/ponte.lua. */
const PISO_ENTRE_VOLTAS_MS = 500;
/** O batimento de estado, espelhando o THROTTLE_ESTADO do Luau. */
const INTERVALO_ESTADO_MS = 2000;

async function ambiente() {
  let porta = process.env.BRIDGE_PORT;
  let portaPainel = process.env.PAINEL_PORT;
  let token = process.env.BRIDGE_TOKEN;

  if (!porta || !token || !portaPainel) {
    try {
      const bruto = await readFile(path.join(RAIZ, ".env"), "utf8");
      for (const linha of bruto.split(/\r?\n/)) {
        const achado = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(linha);
        if (!achado) continue;
        const valor = achado[2].replace(/^["']|["']$/g, "").trim();
        if (achado[1] === "BRIDGE_PORT" && !porta) porta = valor;
        if (achado[1] === "PAINEL_PORT" && !portaPainel) portaPainel = valor;
        if (achado[1] === "BRIDGE_TOKEN" && !token) token = valor;
      }
    } catch {
      /* padrões abaixo */
    }
  }
  return {
    porta: Number.parseInt(porta ?? "8787", 10) || 8787,
    portaPainel: Number.parseInt(portaPainel ?? "8788", 10) || 8788,
    token,
  };
}

/** A memória do processo da ponte, para ver se ela cresce sem parar. */
async function memoriaDaPonte(porta) {
  try {
    const { stdout: net } = await executar("netstat", ["-ano"]);
    const linha = net.split(/\r?\n/).find((l) => l.includes(`:${porta}`) && l.includes("LISTENING"));
    const pid = linha?.trim().split(/\s+/).pop();
    if (!pid) return null;

    const { stdout } = await executar("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]);
    const kb = /"([\d.,]+) K"/.exec(stdout)?.[1];
    return kb ? { pid, mb: Math.round(Number(kb.replace(/[.,]/g, "")) / 1024) } : null;
  } catch {
    return null;
  }
}

const medidas = {
  voltas: 0,
  eventos: 0,
  respostas204: 0,
  respostas429: 0,
  errosDeRede: 0,
  estadosEnviados: 0,
  estadosRecusados: 0,
  presentesInjetados: 0,
  latencias: [],
  requisicoes: [],
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const agora = () => Date.now();

/** Marca cada requisição para poder contar quantas cabem numa janela de 60s. */
const marcar = () => medidas.requisicoes.push(agora());

/** O laço do long-poll, no mesmo desenho do Luau: piso só quando não entregou. */
async function laçoDoJogo(base, token, ate) {
  let cursor = 0;

  while (agora() < ate) {
    const comecou = agora();
    let entregou = false;
    medidas.voltas += 1;
    marcar();

    try {
      const resposta = await fetch(`${base}/jogo/eventos?desde=${cursor}`, {
        headers: { "X-Bridge-Token": token },
        signal: AbortSignal.timeout(30_000),
      });

      if (resposta.status === 204) {
        medidas.respostas204 += 1;
      } else if (resposta.status === 429) {
        medidas.respostas429 += 1;
      } else if (resposta.status === 200) {
        const corpo = await resposta.json();
        if (Number.isInteger(corpo.cursor)) cursor = corpo.cursor;
        for (const evento of corpo.eventos ?? []) {
          medidas.eventos += 1;
          entregou = true;
          if (Number.isFinite(evento.emitidoEm)) medidas.latencias.push(agora() - evento.emitidoEm);
        }
      }
    } catch {
      medidas.errosDeRede += 1;
    }

    if (!entregou) {
      const decorrido = agora() - comecou;
      if (decorrido < PISO_ENTRE_VOLTAS_MS) await dormir(PISO_ENTRE_VOLTAS_MS - decorrido);
    }
  }
}

/** O batimento de estado do jogo: 30 por minuto, como o Luau faz. */
async function laçoDeEstado(base, token, ate) {
  let plataforma = 0;

  while (agora() < ate) {
    plataforma = (plataforma + 1) % 400;
    marcar();
    try {
      const resposta = await fetch(`${base}/jogo/estado`, {
        method: "POST",
        headers: { "X-Bridge-Token": token, "content-type": "application/json" },
        body: JSON.stringify({
          plataformaReferencia: plataforma,
          plataformaMaxima: 400,
          emAnimacao: false,
          totalPlataformas: 400,
          sessaoAtiva: true,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (resposta.status === 200) medidas.estadosEnviados += 1;
      else medidas.estadosRecusados += 1;
    } catch {
      medidas.errosDeRede += 1;
    }
    await dormir(INTERVALO_ESTADO_MS);
  }
}

/** A plateia: presente entrando pelo mesmo caminho de um de verdade. */
async function laçoDaPlateia(basePainel, ate, slots) {
  const intervalo = Math.max(200, Math.round(60_000 / POR_MINUTO));

  while (agora() < ate) {
    const slot = slots[medidas.presentesInjetados % slots.length];
    try {
      const resposta = await fetch(`${basePainel}/api/teste/presentes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ presentes: [{ presenteId: slot, repeticoes: 1 }] }),
        signal: AbortSignal.timeout(10_000),
      });
      if (resposta.ok) medidas.presentesInjetados += 1;
    } catch {
      /* a plateia falhando não é o que se está medindo */
    }
    await dormir(intervalo);
  }
}

const percentil = (lista, p) => {
  if (lista.length === 0) return null;
  const ordenada = [...lista].sort((a, b) => a - b);
  return ordenada[Math.min(ordenada.length - 1, Math.floor((ordenada.length * p) / 100))];
};

/** O pico de requisições em qualquer janela de 60 segundos. */
function picoPorMinuto(marcas) {
  let pico = 0;
  for (let i = 0; i < marcas.length; i += 1) {
    let j = i;
    while (j < marcas.length && marcas[j] - marcas[i] < 60_000) j += 1;
    pico = Math.max(pico, j - i);
  }
  return pico;
}

async function principal() {
  const { porta, portaPainel, token } = await ambiente();
  const base = `http://127.0.0.1:${porta}`;
  const basePainel = `http://127.0.0.1:${portaPainel}`;

  if (!token) {
    console.error("BRIDGE_TOKEN não está no ambiente nem no .env.");
    process.exitCode = 1;
    return;
  }

  const sessao = await fetch(`${basePainel}/api/sessao`).then((r) => r.json()).catch(() => null);
  if (!sessao) {
    console.error(`A ponte não respondeu em ${basePainel}. Suba com:  npm run ponte`);
    process.exitCode = 1;
    return;
  }

  const preset = await fetch(`${basePainel}/api/presets`).then((r) => r.json()).catch(() => null);
  const slots = (preset?.presets?.[0]?.slots ?? []).map((s) => s.presenteId).filter(Boolean);
  if (slots.length === 0) {
    console.error("Nenhum preset com slot preenchido. A plateia não teria o que mandar.");
    process.exitCode = 1;
    return;
  }

  //[[ Sessão nova, sempre, e a razão é uma medição que quase virou boato.
  //
  // A primeira versão entrava com `cursor = 0` numa ponte que já tinha rodado
  // uma maratona antes. O long-poll então entregava os eventos GUARDADOS da
  // rodada anterior, e como `emitidoEm` é marcado no DESPACHO, a idade deles
  // entrava na conta: p95 de 101 segundos, máxima de 111.
  //
  // Eu quase reportei "a ponte entrega presente 100 segundos atrasado". Era a
  // régua que estava suja, não a ponte. Começar de sessão limpa é o que faz o
  // número medir o que ele diz medir. ]]
  await fetch(`${basePainel}/api/sessao/stop`, { method: "POST" }).catch(() => null);
  const nova = await fetch(`${basePainel}/api/sessao/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ presetId: preset.presets[0].presetId }),
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  if (!nova) {
    console.error("Não consegui abrir uma sessão limpa. Sem isso a latência medida é a de eventos velhos.");
    process.exitCode = 1;
    return;
  }

  const antes = await memoriaDaPonte(porta);
  const ate = agora() + MINUTOS * 60_000;

  console.log("");
  console.log(`MARATONA — ${MINUTOS} min, ${POR_MINUTO} presentes/min, ${slots.length} slots`);
  console.log(`   ponte em ${base} · memória inicial ${antes ? `${antes.mb} MB (pid ${antes.pid})` : "não medida"}`);
  console.log("   (o jogo é simulado; o Luau continua sendo trabalho do Studio)");
  console.log("");

  await Promise.all([
    laçoDoJogo(base, token, ate),
    laçoDeEstado(base, token, ate),
    laçoDaPlateia(basePainel, ate, slots),
  ]);

  //[[ A maratona fecha a sessão que abriu e APAGA o arquivo.
  //
  // `data/sessoes/` é o histórico de lives do streamer, que o painel mostra na
  // página Histórico. Uma sessão de teste ali é ruído no dado dele — e uma
  // ferramenta de diagnóstico que suja o que diagnostica não presta. ]]
  const fim = await fetch(`${basePainel}/api/sessao/stop`, { method: "POST" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (fim?.sessaoId) {
    await apagar(caminhoDeDados("sessoes", `${fim.sessaoId}.json`)).catch(() => null);
  }

  const depois = await memoriaDaPonte(porta);
  const pico = picoPorMinuto(medidas.requisicoes);

  console.log("RESULTADO");
  console.log(`  voltas do long-poll        ${medidas.voltas}`);
  console.log(`  eventos entregues          ${medidas.eventos} (de ${medidas.presentesInjetados} presentes injetados)`);
  if (medidas.presentesInjetados > medidas.eventos) {
    // Não é perda: é o combate do ADR-012 juntando o que chegou com o boneco
    // ocupado. Dizer isso na tela evita a leitura errada que eu mesmo fiz.
    console.log(`     ${medidas.presentesInjetados - medidas.eventos} coalescido(s) no combate (ADR-012), não perdidos`);
  }
  console.log(`  respostas 204 (sem evento) ${medidas.respostas204}`);
  console.log(`  estado publicado           ${medidas.estadosEnviados} ok, ${medidas.estadosRecusados} recusado(s)`);
  console.log("");
  console.log(`  pico de requisições/min    ${pico}  (teto do HttpService: ~500; da ponte: 300)`);
  console.log(`  respostas 429              ${medidas.respostas429}`);
  console.log(`  erros de rede              ${medidas.errosDeRede}`);
  console.log("");

  if (medidas.latencias.length > 0) {
    console.log(`  latência da PONTE, do evento à entrega (${medidas.latencias.length} amostras)`);
    console.log(`     mediana  ${percentil(medidas.latencias, 50)} ms`);
    console.log(`     p95      ${percentil(medidas.latencias, 95)} ms`);
    console.log(`     máxima   ${Math.max(...medidas.latencias)} ms`);
    console.log("     (é a fatia da ponte; o orçamento inteiro até o frame é 1000ms)");
    console.log("");
  }

  if (antes && depois) {
    const delta = depois.mb - antes.mb;
    console.log(`  memória da ponte           ${antes.mb} MB → ${depois.mb} MB (${delta >= 0 ? "+" : ""}${delta} MB)`);
    console.log("");
  }

  const problemas = [];
  if (medidas.respostas429 > 0) problemas.push(`${medidas.respostas429} resposta(s) 429 — o rate limit mordeu o jogo (BUG-002)`);
  if (pico > 300) problemas.push(`pico de ${pico} req/min acima do teto de 300 da ponte`);
  if (medidas.errosDeRede > 0) problemas.push(`${medidas.errosDeRede} erro(s) de rede`);
  if (medidas.estadosRecusados > 0) problemas.push(`${medidas.estadosRecusados} estado(s) recusado(s) — schema divergente (BUG-001)`);
  //[[ Entregar MENOS eventos que presentes recebidos é o desenho, não defeito.
  //
  // O ADR-012 manda: presente que chega com o boneco ocupado não vira animação
  // própria — ele entra no combate, briga com os outros da janela, e o conjunto
  // sai como UM evento. A 120 presentes por minuto, com animação de 1 a 2
  // segundos, a maioria coalesce. É exatamente o que deve acontecer.
  //
  // A primeira versão deste script tratava isso como perda e acusava
  // "só 67 de 228 chegaram". Acusação errada: o número certo de eventos não é
  // o número de presentes, é o número de janelas de animação.
  //
  // O que É defeito: nenhum evento chegar, que significa o canal parado. ]]
  if (medidas.presentesInjetados > 0 && medidas.eventos === 0) {
    problemas.push(`nenhum dos ${medidas.presentesInjetados} presentes chegou ao jogo — o canal está parado`);
  }

  if (problemas.length === 0) {
    console.log("Nada travou. A metade da ponte do F0-6 está de pé.");
    console.log("Falta a metade do Luau: o Studio, com o roteiro em");
    console.log("   docs/09_BACKLOG/roteiro-da-sessao-no-studio.md");
  } else {
    console.log(`${problemas.length} problema(s):`);
    for (const p of problemas) console.log(`   - ${p}`);
    process.exitCode = 1;
  }
  console.log("");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await principal();

export { picoPorMinuto, percentil };
