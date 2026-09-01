/**
 * O lançador de `npm start`.
 *
 * O que se testa aqui é a bufferização de linha, não o spawn. Motivo: `stdout`
 * chega picado em fronteira arbitrária, e o prefixador é o único ponto onde uma
 * linha pode ser partida ao meio. A ponte loga um JSON por linha — partir uma
 * linha transforma log legível em lixo, e isso só apareceria ao vivo.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { criarPrefixador, despirCores, esperarPorta, extrairUrlDoPainel } from "../scripts/subir-tudo.mjs";

test("prefixa linha inteira e devolve uma entrada por linha", () => {
  const prefixar = criarPrefixador("ponte");
  assert.deepEqual(prefixar("a\nb\n"), ["[ponte] a", "[ponte] b"]);
});

test("linha partida entre dois pedaços é remontada, nunca emitida pela metade", () => {
  const prefixar = criarPrefixador("ponte");

  // O pedaço termina no meio do JSON: nada pode sair ainda.
  assert.deepEqual(prefixar('{"evento":"pon'), []);
  assert.deepEqual(prefixar('te_no_ar"}\n'), ['[ponte] {"evento":"ponte_no_ar"}']);
});

test("linha sem quebra final fica retida até a quebra chegar", () => {
  const prefixar = criarPrefixador("painel");
  assert.deepEqual(prefixar("pronto em 382ms"), []);
  assert.deepEqual(prefixar("\n"), ["[painel] pronto em 382ms"]);
});

test("cada processo tem buffer próprio: um não contamina o outro", () => {
  const ponte = criarPrefixador("ponte");
  const painel = criarPrefixador("painel");

  ponte("metade ");
  assert.deepEqual(painel("inteira\n"), ["[painel] inteira"]);
  assert.deepEqual(ponte("da ponte\n"), ["[ponte] metade da ponte"]);
});

test("porta fechada devolve false dentro do prazo, em vez de pendurar", async () => {
  const inicio = Date.now();
  // 9 é porta reservada de descarte: nada escuta nela.
  assert.equal(await esperarPorta(9, "127.0.0.1", 400, 50), false);
  assert.ok(Date.now() - inicio < 5000, "desistiu perto do prazo, não muito depois");
});

/* -------------------------------------------------------------- */
/* A URL que o atalho abre                                         */
/* -------------------------------------------------------------- */

// A linha REAL do Vite. O código ANSI cai no meio da URL, entre o `:` e a
// porta — não só nas pontas. Foi por isso que a extração passou a despir cores
// antes de casar: sem isso a porta sai com lixo no meio e o navegador erra.
const LINHA_DO_VITE = "[painel]   [32m[39m  [1mLocal[22m:   [36mhttp://127.0.0.1:[1m5173[22m/[39m";

test("tira a URL da linha colorida do Vite, com ANSI no meio do número da porta", () => {
  assert.equal(extrairUrlDoPainel(LINHA_DO_VITE), "http://127.0.0.1:5173/");
});

test("pega a porta que o Vite REALMENTE usou, não a 5173 fixa", () => {
  // Com a 5173 ocupada o Vite sobe na seguinte e anuncia a nova. Abrir 5173
  // fixo levaria o navegador para outro processo.
  const linha = LINHA_DO_VITE.replace("5173", "5174");
  assert.equal(extrairUrlDoPainel(linha), "http://127.0.0.1:5174/");
});

test("linha sem URL não devolve nada, e o atalho não abre aba à toa", () => {
  assert.equal(extrairUrlDoPainel("[painel] transformando..."), null);
  assert.equal(extrairUrlDoPainel("[ponte] {\"evento\":\"ponte_no_ar\"}"), null);
});

test("despirCores tira o ANSI e deixa o texto intacto", () => {
  assert.equal(despirCores("[32mverde[39m"), "verde");
  assert.equal(despirCores("sem cor nenhuma"), "sem cor nenhuma");
});
