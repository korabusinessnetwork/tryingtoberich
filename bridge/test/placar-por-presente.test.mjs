/**
 * Presente que mexe no placar (ADR-007, lista separada dos 6 slots).
 *
 * Ele NÃO anima o boneco: encerra a rodada, como chegar ao topo ou cair no
 * primeiro andar. Por isso sai pelo canal de comando, o mesmo do "reiniciar" —
 * não tem delta e não casa com slot.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { Despachante } from "../src/fila/despachante.mjs";
import { indexarPlacar } from "../src/dominio/casamento.mjs";
import { presentesRepetidos } from "../src/dominio/regras.mjs";
import { indexarAnimacoes } from "../src/repos/animacoes.mjs";
import { carregarExemplo } from "../src/repos/fixtures.mjs";

const T0 = 1_756_742_620_000;
const animacoes = indexarAnimacoes((await carregarExemplo("../animacoes")).animacoes);

const preset = {
  slots: [{ posicao: 1, presenteId: "rose", animacaoId: "sub_pulo", delta: 1, intensidade: 1, cooldownMs: 0 }],
  placar: [
    { presenteId: "leao", efeito: "vitoria" },
    { presenteId: "tubarao", efeito: "derrota" },
  ],
};

const criar = () => {
  const despachados = [];
  const comandos = [];
  const despachante = new Despachante({
    animacoes,
    aoDespachar: (d) => despachados.push(d),
    aoComando: (c) => comandos.push(c),
  });
  despachante.definirPreset(preset);
  return { despachante, despachados, comandos };
};

const presente = (presenteId) => ({ presenteId, presenteNome: presenteId, repeticoes: 1, recebidoEm: T0 });

test("presente de placar vira COMANDO, nunca animação", () => {
  const { despachante, despachados, comandos } = criar();
  const resultado = despachante.receber(presente("leao"), T0);

  assert.equal(resultado.tipo, "placar");
  assert.equal(resultado.efeito, "vitoria");
  assert.equal(despachados.length, 0, "não anima o boneco");
  assert.equal(comandos.length, 1);
  assert.equal(comandos[0].tipo, "vitoria");
});

test("derrota sai pelo mesmo caminho, só muda o tipo", () => {
  const { despachante, comandos } = criar();
  despachante.receber(presente("tubarao"), T0);
  assert.equal(comandos[0].tipo, "derrota");
});

test("o comando usa o MESMO cursor das animações", () => {
  // Cursor separado faria o `?desde=` do Roblox reprocessar ou pular: comando e
  // presente viajam no mesmo envelope, e a ordem entre eles importa.
  const { despachante, despachados, comandos } = criar();

  despachante.receber(presente("rose"), T0);
  despachante.receber(presente("leao"), T0 + 1);

  assert.equal(despachados[0].id, 1);
  assert.equal(comandos[0].id, 2, "o comando continua a contagem, não recomeça");
});

test("presente de placar NÃO espera o combate nem o cooldown", () => {
  // Ele não disputa canal: não anima, não tem delta para somar. Segurá-lo num
  // combate atrasaria o momento mais alto da live por uma animação que nem vai
  // tocar.
  const { despachante, comandos } = criar();

  // Ocupa o boneco com uma animação em curso.
  despachante.receber(presente("rose"), T0);
  // No mesmo instante, com o canal ocupado, o de placar sai mesmo assim.
  const resultado = despachante.receber(presente("leao"), T0 + 10);

  assert.equal(resultado.tipo, "placar");
  assert.equal(comandos.length, 1, "saiu na hora, sem entrar em combate");
});

test("presente fora das duas listas continua não mapeado", () => {
  const { despachante, comandos, despachados } = criar();
  const resultado = despachante.receber(presente("desconhecido"), T0);

  assert.equal(resultado.tipo, "nao_mapeado");
  assert.equal(comandos.length, 0);
  assert.equal(despachados.length, 0);
});

test("o mesmo presente em slot E placar é recusado pela R1.4", () => {
  // Seria ambíguo: anima ou encerra a rodada? A resposta dependeria da ordem em
  // que o código consultasse as listas, que é o pior tipo de regra.
  const ambiguo = { ...preset, placar: [...preset.placar, { presenteId: "rose", efeito: "vitoria" }] };
  assert.deepEqual(presentesRepetidos(ambiguo), ["rose"]);

  assert.deepEqual(presentesRepetidos(preset), [], "o preset bem formado passa");
});

test("indexarPlacar aguenta preset sem a lista", () => {
  assert.equal(indexarPlacar({}).size, 0);
  assert.equal(indexarPlacar(null).size, 0);
  assert.equal(indexarPlacar(preset).get("leao"), "vitoria");
});
