/**
 * O teto do long-poll (F0-4, `specs/f0-4-teto-do-long-poll.md`).
 *
 * O que estes testes protegem não é a medição — essa exige Studio e é do dono.
 * É o conserto: até 2026-09-09, uma volta ociosa cortada pelo Roblox era tratada
 * como ERRO, e o backoff dobrava até 30 segundos. Um presente que chegasse
 * naquela janela esperava por ela — trinta vezes o orçamento inteiro do
 * princípio nº 1, e só com a live quieta, que é quando ninguém olha o painel.
 *
 * É o mesmo formato do BUG-002: um mecanismo de proteção derrubando o próprio
 * jogo.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { RAIZ } from "../bridge/src/repos/arquivo.mjs";
import { RegistroDeLongPoll } from "../bridge/src/longpoll/registro.mjs";
import { carregarConfig } from "../bridge/src/config.mjs";

const ponte = await readFile(path.join(RAIZ, "game", "src", "server", "ponte.lua"), "utf8");

/** Extrai `Nome = valor` de um módulo Luau, para comparar número com número. */
const constanteLuau = (fonte, nome) => {
  const achado = new RegExp(`${nome}\\s*=\\s*([\\d.]+)`).exec(fonte);
  return achado ? Number.parseFloat(achado[1]) : null;
};

/** Resposta falsa, só com o que o registro usa. */
function respostaFalsa() {
  const gravado = { status: null, corpo: null, encerrada: false };
  return {
    gravado,
    on() {},
    status(codigo) {
      gravado.status = codigo;
      return this;
    },
    json(corpo) {
      gravado.corpo = corpo;
      gravado.encerrada = true;
      return this;
    },
    end() {
      gravado.encerrada = true;
      return this;
    },
  };
}

// ------------------------------------------- o contrato entre as linguagens

test("o teto esperado no Luau é o mesmo longpollTimeoutMs da ponte", () => {
  // A lição do BUG-001: constante duplicada em duas linguagens só é contrato se
  // algum teste ler os DOIS lados. Se alguém mexer no LONGPOLL_TIMEOUT_MS e
  // esquecer do Luau, a classificação de teto passa a usar a fração errada e o
  // conserto desta rodada silenciosamente para de funcionar.
  const config = carregarConfig({ BRIDGE_TOKEN: "t".repeat(32) });
  const noLuau = constanteLuau(ponte, "TETO_DA_PONTE");

  assert.ok(noLuau, "TETO_DA_PONTE precisa existir em game/src/server/ponte.lua");
  assert.equal(
    noLuau * 1000,
    config.longpollTimeoutMs,
    `o Luau espera ${noLuau}s e a ponte segura ${config.longpollTimeoutMs}ms`,
  );
});

// --------------------------------------------------- o clamp do teto pedido

test("sem o parâmetro teto, a ponte segura exatamente o que sempre segurou", () => {
  const agendados = [];
  const registro = new RegistroDeLongPoll({ timeoutMs: 20_000 });
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => {
    agendados.push(ms);
    return { unref() {} };
  };
  try {
    registro.registrar(respostaFalsa(), { desde: 0 });
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }

  assert.deepEqual(agendados, [20_000], "o padrão não pode ter mudado");
});

test("o teto pedido é honrado, e nunca passa do teto da própria ponte", () => {
  const casos = [
    { pedido: 8, esperado: 8_000, porque: "pedido válido abaixo do teto" },
    { pedido: 999, esperado: 20_000, porque: "cliente não faz a ponte segurar além do que ela decidiu" },
    { pedido: 0.1, esperado: 1_000, porque: "abaixo de 1s viraria polling livre contra o rate limit" },
    { pedido: 0, esperado: 20_000, porque: "zero cai no padrão" },
    { pedido: -5, esperado: 20_000, porque: "negativo cai no padrão" },
    { pedido: "abc", esperado: 20_000, porque: "texto cai no padrão" },
    { pedido: undefined, esperado: 20_000, porque: "ausente cai no padrão" },
  ];

  for (const caso of casos) {
    const agendados = [];
    const registro = new RegistroDeLongPoll({ timeoutMs: 20_000 });
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (fn, ms) => {
      agendados.push(ms);
      return { unref() {} };
    };
    try {
      registro.registrar(respostaFalsa(), { desde: 0, tetoSegundos: caso.pedido });
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }

    assert.equal(agendados[0], caso.esperado, `teto=${caso.pedido}: ${caso.porque}`);
  }
});

// ------------------------------------------------ a classificação no Luau

test("falha depois de espera longa NÃO dispara backoff nem marca offline", () => {
  // O coração da rodada. Se esta classificação sumir, o backoff de 30s volta.
  const ramo = /if pareceTetoDoRoblox\(decorrido\) then([\s\S]*?)else([\s\S]*?)end/.exec(ponte);
  assert.ok(ramo, "o laço precisa separar teto de erro de verdade");

  const comoTeto = ramo[1];
  const comoErro = ramo[2];

  assert.ok(!/task\.wait\(backoffAtual\)/.test(comoTeto), "teto atingido não pode esperar o backoff");
  assert.ok(!/backoffAtual \* 2/.test(comoTeto), "teto atingido não pode multiplicar o backoff");
  assert.ok(!/definirOnline\(false/.test(comoTeto), "conexão ociosa fechada não é prova de ponte caída");
  assert.match(comoTeto, /registrarTeto/, "e precisa registrar o número, que é o que responde F0-4");

  // O outro ramo tem que continuar sendo o de hoje, senão o conserto virou
  // um buraco: erro de verdade sem backoff floda a ponte.
  assert.match(comoErro, /definirOnline\(false/, "erro de verdade continua marcando offline");
  assert.match(comoErro, /task\.wait\(backoffAtual\)/, "erro de verdade continua com backoff");
  assert.match(comoErro, /backoffAtual \* 2/, "e continua dobrando");
});

test("ponte pendurada volta a ser ERRO depois que a negociação já pediu teto menor", () => {
  // A única perda de observabilidade que o conserto do backoff introduziria:
  // sem isto, um túnel pendurado seria lido como teto do Roblox para sempre, e
  // o painel diria "Jogo online" com a live morta.
  const fn = /local function pareceTetoDoRoblox\(decorrido\)([\s\S]*?)\nend/.exec(ponte);
  assert.ok(fn, "pareceTetoDoRoblox precisa existir");

  assert.match(fn[1], /if pedido == nil then\s+return true/, "antes da negociação, não há como separar — assume teto");
  assert.match(fn[1], /decorrido <= pedido \* 1\.5/, "depois dela, durar muito além do pedido é a ponte não honrando");
  assert.match(fn[1], /return false/, "e nesse caso volta a ser erro de verdade");
});

test("a fração que separa teto de erro deixa erro rápido de fora", () => {
  const fracao = constanteLuau(ponte, "FRACAO_PARA_SER_TETO");
  const teto = constanteLuau(ponte, "TETO_DA_PONTE");

  assert.ok(fracao > 0 && fracao < 1, "a fração precisa estar entre 0 e 1");

  // Erro real de rede — recusado, host desconhecido, token — volta em
  // milissegundos. A linha precisa ficar MUITO acima disso, senão um erro
  // legítimo passa por teto e o jogo fica "online" com a ponte morta.
  assert.ok(
    teto * fracao >= 5,
    `a linha está em ${teto * fracao}s — abaixo de 5s um erro lento viraria teto por engano`,
  );
});

test("o pedido de teto fica ABAIXO do observado, senão o Roblox corta de novo", () => {
  const folga = constanteLuau(ponte, "FOLGA_ABAIXO_DO_TETO");
  assert.ok(folga > 0 && folga < 1, "a folga precisa encolher o pedido, não aumentá-lo");
  assert.match(ponte, /tetoObservado \* FOLGA_ABAIXO_DO_TETO/, "o pedido sai do teto observado");
  assert.match(ponte, /"&teto=" \.\. tostring\(pedido\)/, "e vira o parâmetro da requisição");
});

test("sem teto observado, a requisição sai como sempre saiu", () => {
  const pedido = /local function tetoPedido\(\)([\s\S]*?)\nend/.exec(ponte);
  assert.ok(pedido, "tetoPedido precisa existir");
  assert.match(pedido[1], /if tetoObservado == nil then\s+return nil/, "sem número observado, não há pedido");

  const sufixo = /local function sufixoDeTeto\(\)([\s\S]*?)\nend/.exec(ponte);
  assert.ok(sufixo, "sufixoDeTeto precisa existir");
  assert.match(
    sufixo[1],
    /if pedido == nil then\s+return ""/,
    "na primeira volta não há número, e o padrão da ponte é o certo",
  );
});

test("o aviso do teto sai UMA vez, com o número", () => {
  const registrar = /local function registrarTeto\(decorrido\)([\s\S]*?)\nend/.exec(ponte);
  assert.ok(registrar, "registrarTeto precisa existir");
  assert.match(registrar[1], /if tetoRelatado then\s*\n\s*return/, "repetir a cada volta viraria ruído na live");
  assert.match(registrar[1], /F0-4/, "o aviso precisa dizer a qual item ele responde");
  assert.match(registrar[1], /memory\/learnings\.md/, "e onde anotar o número");
});

// ------------------------------------------------------- o que não mudou

test("volta que entregou evento continua sem espera nenhuma", () => {
  // Princípio nº 1: o piso só morde quando não havia o que entregar. Se esta
  // condição mudar, todo presente ganha meio segundo de atraso.
  assert.match(
    ponte,
    /if rodando and not entregou then/,
    "o piso continua condicionado a NÃO ter entregue evento",
  );
});

test("o piso entre voltas continua valendo para a volta que terminou em teto", () => {
  // Sem isso, uma ponte que feche na hora faria o laço girar livre e estourar
  // as ~500 req/min do HttpService — que é o BUG-002 de novo.
  const laco = ponte.slice(ponte.indexOf("local function cicloEventos"));
  const posTeto = laco.indexOf("registrarTeto(decorrido)");
  const posPiso = laco.indexOf("if rodando and not entregou then");
  assert.ok(posTeto > 0 && posPiso > posTeto, "o piso vem depois da classificação, no mesmo laço");
  assert.ok(!/entregou = true/.test(laco.slice(posTeto, posTeto + 400)), "teto não marca evento entregue");
});
