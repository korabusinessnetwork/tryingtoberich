/**
 * O prompt não pode ensinar o modelo a violar as regras.
 *
 * Isto existe por um bug real: o exemplo dentro do prompt mostrava
 * `jumpHeight: 7.2` com `variacaoHorizontal: 9`, quando o alcance horizontal do
 * pulo para esse jumpHeight é 6,07. O modelo copiava o exemplo e o próprio
 * validador da ponte rejeitava o mapa — duas vezes, e o streamer via
 * "o Gemini devolveu um mapa fora das regras" sem que a culpa fosse do Gemini.
 *
 * A causa foi deriva: `problemasDeJogabilidade` ganhou o teto de ALCANCE
 * (ADR-009.2) depois, e o prompt continuou anunciando só o de geometria.
 * Este teste amarra os dois lados para não desencostarem de novo.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { FORMATO, SYSTEM } from "../src/gemini/prompt.mjs";
import { alcanceHorizontalDoPulo, problemasDeJogabilidade } from "../src/dominio/regras.mjs";

/** O exemplo tem placeholders `<...>` onde o id do acervo entra. */
const exemplo = () => JSON.parse(FORMATO.replace(/"<[^>]*>"/g, '"x"'));

test("o exemplo do prompt passa nas MESMAS regras que validam a resposta", () => {
  assert.deepEqual(problemasDeJogabilidade(exemplo()), []);
});

test("o exemplo respeita o teto de alcance, que é o mais apertado dos dois", () => {
  const mapa = exemplo();
  const alcance = alcanceHorizontalDoPulo(mapa.jumpHeight);

  assert.ok(
    mapa.plataformas.variacaoHorizontal <= alcance,
    `exemplo tem variacaoHorizontal ${mapa.plataformas.variacaoHorizontal} e o alcance é ${alcance.toFixed(2)}`,
  );
});

test("o texto do prompt ANUNCIA o teto de alcance, não só o de geometria", () => {
  // Sem isto o modelo satisfaz a regra que recebeu e mesmo assim é rejeitado.
  assert.match(SYSTEM, /alcance do pulo/i);
  assert.match(SYSTEM, /MENOR dos dois/i);

  // E os números da tabela têm que ser os que o código calcula, não copiados.
  for (const jumpHeight of [7, 9, 12]) {
    assert.ok(
      SYSTEM.includes(alcanceHorizontalDoPulo(jumpHeight).toFixed(1)),
      `a tabela do prompt não traz o alcance de jumpHeight ${jumpHeight}`,
    );
  }
});
