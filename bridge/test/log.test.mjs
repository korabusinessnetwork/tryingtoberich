/**
 * O log que o painel enxerga.
 *
 * Ele existe porque falha durante a live some: o aviso aparece por um instante
 * e o resto vai para o terminal do Node, atrás da janela do Studio e do OBS.
 *
 * O que este teste protege de verdade é a camada 4 do 11_SEGURANCA. O buffer
 * alimenta uma tela, e tela é o lugar mais fácil de um nickname vazar sem
 * ninguém notar.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { log, logRecente, limparLogRecente, ouvirLog } from "../src/log.mjs";

/** O log é fire-and-forget: ele sai do caminho crítico antes de escrever. */
const depoisDoMicrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

test("nenhum identificador de espectador entra no buffer que o painel lê", async () => {
  limparLogRecente();

  log.erro("presente_falhou", {
    slot: 5,
    presenteId: "sem-galaxy",
    // Tudo abaixo é o que NÃO pode chegar na tela.
    nomeDoador: "theuz",
    nickname: "theuz",
    userId: "0000000000000000001",
    uniqueId: "theuz_oficial",
    profilePictureUrl: "https://exemplo.invalid/p.jpg",
  });
  await depoisDoMicrotask();

  const [linha] = logRecente();
  const serializado = JSON.stringify(linha);

  assert.equal(linha.slot, 5, "o que é diagnóstico fica");
  assert.equal(linha.presenteId, "sem-galaxy");
  for (const proibido of ["theuz", "0000000000000000001", "theuz_oficial", "exemplo.invalid"]) {
    assert.equal(serializado.includes(proibido), false, `vazou: ${proibido}`);
  }
});

test("o teste acima morde: sem higienizar, o nickname passaria", () => {
  // Guarda que nunca acusa passa sempre, e este projeto já foi mordido por isso.
  const cru = JSON.stringify({ nivel: "erro", nomeDoador: "theuz" });
  assert.equal(cru.includes("theuz"), true);
});

test("o buffer tem teto: live de 2 horas não pode virar vazamento de memória", async () => {
  limparLogRecente();
  for (let i = 0; i < 260; i += 1) log.info("evento_repetido", { i });
  await depoisDoMicrotask();

  const linhas = logRecente(1000);
  assert.equal(linhas.length, 200, "o teto do buffer");
  assert.equal(linhas[0].i, 259, "as mais novas primeiro, que é como o painel mostra");
});

test("quem assina o log recebe a linha já higienizada", async () => {
  limparLogRecente();
  const recebidas = [];
  const parar = ouvirLog((linha) => recebidas.push(linha));

  try {
    log.aviso("live_caiu", { motivo: "queda de rede", nomeDoador: "theuz" });
    await depoisDoMicrotask();

    assert.equal(recebidas.length, 1);
    assert.equal(recebidas[0].motivo, "queda de rede");
    assert.equal("nomeDoador" in recebidas[0], false, "o SSE leva a mesma linha do buffer");
  } finally {
    parar();
  }
});

test("ouvinte que quebra não derruba quem estava só tentando logar", async () => {
  limparLogRecente();
  const parar = ouvirLog(() => { throw new Error("ouvinte quebrado"); });

  try {
    log.info("segue_a_vida", { ok: true });
    await depoisDoMicrotask();
    assert.equal(logRecente()[0].evento, "segue_a_vida");
  } finally {
    parar();
  }
});
