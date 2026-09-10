/**
 * As contas da maratona (F0-6, `scripts/maratona.mjs`).
 *
 * A maratona em si é um script que roda contra a ponte de pé — não cabe em
 * teste. O que cabe são as duas contas que produzem os números do relatório, e
 * elas merecem teste porque **um número errado aqui vira uma acusação errada
 * lá**: dizer que o rate limit mordeu quando não mordeu, ou que a latência
 * estourou o orçamento quando não estourou.
 *
 * Foi o que quase aconteceu: a primeira versão do script mediu p95 de 101
 * SEGUNDOS e eu quase reportei que a ponte entregava presente atrasado. A régua
 * é que estava suja — ver `memory/learnings.md`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { RAIZ } from "../bridge/src/repos/arquivo.mjs";
import { percentil, picoPorMinuto } from "../scripts/maratona.mjs";

test("o pico por minuto acha a pior janela, não a média", () => {
  // 100 requisições no primeiro segundo e nada depois: a média por minuto seria
  // baixa e inofensiva, mas o que derruba o jogo é o PICO — foi assim que o
  // BUG-002 aconteceu, com o teste de animação do painel em rajada.
  const rajada = Array.from({ length: 100 }, (_, i) => 1000 + i);
  const espalhado = Array.from({ length: 100 }, (_, i) => 1000 + i * 5000);

  assert.equal(picoPorMinuto(rajada), 100, "a rajada inteira cabe numa janela de 60s");
  assert.equal(picoPorMinuto(espalhado), 12, "espalhado em 5s, cabem 12 por minuto");
});

test("o pico ignora o que ficou fora da janela de 60 segundos", () => {
  const marcas = [0, 1000, 2000, 61_000, 62_000];
  assert.equal(picoPorMinuto(marcas), 3, "os três primeiros; o de 61s abre outra janela");
});

test("o pico de uma lista vazia é zero, não NaN", () => {
  assert.equal(picoPorMinuto([]), 0);
});

test("o percentil não mente com poucas amostras", () => {
  // Com 1 amostra, todo percentil é ela. Um `undefined` aqui viraria "p95 undefined"
  // no relatório, que é pior que não relatar.
  assert.equal(percentil([7], 50), 7);
  assert.equal(percentil([7], 95), 7);
  assert.equal(percentil([], 50), null, "sem amostra, sem número — não zero");
});

test("o percentil ordena antes de cortar", () => {
  const fora = [100, 1, 50, 2, 3];
  assert.equal(percentil(fora, 50), 3, "a mediana de 1,2,3,50,100");
  assert.equal(percentil(fora, 95), 100);
});

test("o percentil nunca estoura o fim da lista", () => {
  // `Math.floor(n * 100 / 100)` daria o índice n, que não existe.
  assert.equal(percentil([1, 2, 3], 100), 3);
});

test("a maratona começa com sessão limpa, senão mede a idade de evento velho", async () => {
  const fonte = await readFile(path.join(RAIZ, "scripts", "maratona.mjs"), "utf8");

  assert.match(fonte, /api\/sessao\/stop/, "para a sessão anterior");
  assert.match(fonte, /api\/sessao\/start/, "e abre uma limpa");
  assert.match(
    fonte,
    /101 segundos|cursor = 0/,
    "e o comentário explica por que — o erro custou uma acusação quase feita",
  );
});

test("coalescer no combate não é contado como perda", async () => {
  // O ADR-012 manda: presente com o boneco ocupado entra no combate e o
  // conjunto sai como UM evento. A primeira versão acusava "só 67 de 228
  // chegaram", que é ler o desenho como defeito.
  const fonte = await readFile(path.join(RAIZ, "scripts", "maratona.mjs"), "utf8");

  assert.match(fonte, /coalescido\(s\) no combate \(ADR-012\)/, "a tela explica a diferença");
  assert.match(fonte, /medidas\.eventos === 0/, "só canal PARADO é problema");
  assert.ok(
    !/eventos < medidas\.presentesInjetados \* 0\.5/.test(fonte),
    "a heurística que confundia coalescência com perda não pode voltar",
  );
});
