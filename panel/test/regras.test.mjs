/**
 * As regras de exibição do painel.
 *
 * Tudo aqui é função pura, sem React e sem rede, e é por isso que dá para
 * testar com `node --test` sem montar componente nenhum. O que estes testes
 * protegem não é formatação: é a regra R3 — **o valor sugere, nunca decide** —
 * e o fato de os avisos avisarem sem bloquear.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  SLOTS,
  avisoDeCurva,
  avisoDeDirecao,
  corDaFaixa,
  faixaDeMoedas,
  formatarDelta,
  formatarLatencia,
  presentesRepetidos,
  saudeDaLatencia,
  slotsDoPreset,
} from "../src/lib/regras.js";

import { faixaDeMoedas as faixaDaPonte } from "../../bridge/src/dominio/regras.mjs";

/* -------------------------------------------------------------- */
/* R3 — faixa                                                      */
/* -------------------------------------------------------------- */

test("a faixa do painel é a mesma da ponte, moeda a moeda", () => {
  // Duplicar a regra em JavaScript dos dois lados é aceitável; divergir não é.
  // O painel coloriria por uma faixa e a ponte ordenaria por outra.
  for (const moedas of [0, 1, 9, 10, 99, 100, 999, 1000, 4999, 5000, 44999]) {
    assert.equal(faixaDeMoedas(moedas), faixaDaPonte(moedas), `${moedas} moedas`);
  }
});

test("as bordas das faixas são as do R3", () => {
  assert.deepEqual(
    [1, 9, 10, 99, 100, 999, 1000, 4999, 5000].map(faixaDeMoedas),
    [1, 1, 2, 2, 3, 3, 4, 4, 5],
  );
});

test("a cor da faixa é variável CSS, nunca hex", () => {
  // O white-label da Fase 3 troca o tokens.css e nada mais. Hex vazando para
  // o componente é o que obrigaria a caçar cor dentro de JSX depois.
  for (const faixa of [1, 2, 3, 4, 5]) {
    assert.equal(corDaFaixa(faixa), `var(--faixa-${faixa})`);
    assert.equal(corDaFaixa(faixa).includes("#"), false);
  }
});

/* -------------------------------------------------------------- */
/* Delta                                                           */
/* -------------------------------------------------------------- */

test("o delta positivo mostra o sinal, que é o que diferencia subida de descida", () => {
  assert.equal(formatarDelta(12), "+12");
  assert.equal(formatarDelta(-8), "-8");
  assert.equal(formatarDelta(200), "+200");
});

/* -------------------------------------------------------------- */
/* R3 — o aviso avisa, não bloqueia                                */
/* -------------------------------------------------------------- */

test("presente barato com delta enorme vira aviso", () => {
  const aviso = avisoDeCurva({ moedas: 1, delta: 100 });
  assert.ok(aviso, "1 moeda movendo 100 plataformas está fora da curva");
  assert.match(aviso, /rajada/, "e o motivo é o que importa: presente barato chega em rajada");
});

test("presente caro com delta minúsculo vira aviso", () => {
  const aviso = avisoDeCurva({ moedas: 29999, delta: 2 });
  assert.ok(aviso);
  assert.match(aviso, /decepcionar/);
});

test("o vínculo dentro da curva não avisa nada", () => {
  assert.equal(avisoDeCurva({ moedas: 1000, delta: 40 }), null);
  assert.equal(avisoDeCurva({ moedas: 1, delta: 2 }), null);
  assert.equal(avisoDeCurva({ moedas: 30, delta: 12 }), null);
});

test("o aviso é sempre TEXTO, nunca um booleano que trave o salvar", () => {
  // R3 e ADR-007: o vínculo é escolha explícita do streamer, e presente de 1
  // moeda que derruba tudo é uma piada boa de live. Se o retorno fosse
  // booleano, a próxima pessoa a mexer transformaria em bloqueio sem perceber.
  const aviso = avisoDeCurva({ moedas: 1, delta: 200 });
  assert.equal(typeof aviso, "string");
  assert.ok(aviso.length > 20, "e o texto diz o porquê, não só que está errado");
});

test("delta zero e entrada inválida não geram aviso", () => {
  // Delta 0 é recusado pelo schema antes de chegar aqui; o aviso não é o lugar
  // de reclamar disso, senão o streamer vê dois erros para o mesmo problema.
  assert.equal(avisoDeCurva({ moedas: 1, delta: 0 }), null);
  assert.equal(avisoDeCurva({ moedas: null, delta: 10 }), null);
  assert.equal(avisoDeCurva({}), null);
});

/* -------------------------------------------------------------- */
/* R2 — a direção é o sinal do delta                               */
/* -------------------------------------------------------------- */

test("animação de subida com delta negativo avisa, e vice-versa", () => {
  const subida = { direcao: "subida" };
  const descida = { direcao: "descida" };

  assert.match(avisoDeDirecao({ animacao: subida, delta: -10 }), /desce enquanto o efeito sobe/);
  assert.match(avisoDeDirecao({ animacao: descida, delta: 10 }), /sobe enquanto o efeito desce/);
  assert.equal(avisoDeDirecao({ animacao: subida, delta: 10 }), null);
  assert.equal(avisoDeDirecao({ animacao: descida, delta: -10 }), null);
});

/* -------------------------------------------------------------- */
/* R1 — seis slots, e slot vazio é válido                          */
/* -------------------------------------------------------------- */

test("o preset sempre tem 6 posições, mesmo vazio", () => {
  assert.equal(SLOTS, 6);
  assert.equal(slotsDoPreset(null).length, 6);
  assert.equal(slotsDoPreset({ slots: [] }).length, 6);
  assert.ok(slotsDoPreset(null).every((s) => s.vazio));
});

test("as posições preenchidas ficam no lugar certo, e o resto vem vazio", () => {
  const preset = { slots: [{ posicao: 3, presenteId: "sem-galaxy", delta: 40 }] };
  const slots = slotsDoPreset(preset);

  assert.equal(slots.length, 6);
  assert.equal(slots[2].presenteId, "sem-galaxy", "posição 3 é o índice 2");
  assert.ok(slots[0].vazio && slots[5].vazio);
  assert.deepEqual(slots.map((s) => s.posicao), [1, 2, 3, 4, 5, 6]);
});

test("presente repetido em dois slots é detectado antes de a ponte recusar (R1.4)", () => {
  const preset = {
    slots: [
      { posicao: 1, presenteId: "sem-rose" },
      { posicao: 2, presenteId: "sem-galaxy" },
      { posicao: 4, presenteId: "sem-rose" },
    ],
  };
  assert.deepEqual(presentesRepetidos(preset), ["sem-rose"]);
  assert.deepEqual(presentesRepetidos({ slots: [] }), []);
  assert.deepEqual(presentesRepetidos(null), []);
});

/* -------------------------------------------------------------- */
/* Princípio nº1 — a latência na tela                              */
/* -------------------------------------------------------------- */

test("a saúde da latência segue o orçamento do Princípio nº1", () => {
  // Alvo de 600ms, teto de 1000ms. É o número que decide se o produto funciona:
  // acima disso o espectador não associa o efeito ao próprio presente.
  assert.equal(saudeDaLatencia(320), "ok");
  assert.equal(saudeDaLatencia(600), "ok");
  assert.equal(saudeDaLatencia(601), "atencao");
  assert.equal(saudeDaLatencia(1000), "atencao");
  assert.equal(saudeDaLatencia(1001), "erro");
  assert.equal(saudeDaLatencia(null), "desconhecida");
});

test("latência ausente vira travessão, não NaN na tela do streamer", () => {
  assert.equal(formatarLatencia(620), "620ms");
  assert.equal(formatarLatencia(619.6), "620ms");
  assert.equal(formatarLatencia(null), "—");
  assert.equal(formatarLatencia(undefined), "—");
});
