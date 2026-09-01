/**
 * O combate de presentes (ADR-012). A plateia briga entre si: subidas somam,
 * descidas somam, e os dois lados se anulam.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { agruparPorSlot, resolverCombate } from "../src/fila/combate.mjs";
import { Despachante } from "../src/fila/despachante.mjs";
import { indexarAnimacoes } from "../src/repos/animacoes.mjs";
import { carregarExemplo } from "../src/repos/fixtures.mjs";

const T0 = 1_756_742_620_000;
const animacoes = indexarAnimacoes((await carregarExemplo("../animacoes")).animacoes);

const disparo = (slot, animacaoId, delta, intensidade = 1) => ({
  slot, animacaoId, delta, intensidade, repeticoes: 1, cooldownMs: 0,
  presenteId: `p${slot}`, presenteNome: `P${slot}`, nomeDoador: null, recebidoEm: T0,
});

test("presentes do mesmo slot viram um participante só, com os deltas somados", () => {
  const agrupado = agruparPorSlot([
    disparo(1, "sub_pulo", 2),
    disparo(1, "sub_pulo", 2),
    disparo(1, "sub_pulo", 2),
  ]);
  assert.equal(agrupado.length, 1);
  assert.equal(agrupado[0].delta, 6);
  assert.equal(agrupado[0].repeticoes, 3);
});

test("as subidas somam entre si e as descidas também", () => {
  const { disputa } = resolverCombate([
    disparo(1, "sub_pulo", 2),
    disparo(3, "sub_foguete", 12),
    disparo(4, "des_chumbo", -8),
  ]);
  assert.equal(disputa.somaSubida, 14);
  assert.equal(disputa.somaDescida, -8);
  assert.equal(disputa.liquido, 6);
});

test("vence o lado de maior soma absoluta e o boneco anda o líquido, não o bruto", () => {
  const { disparo: resultado, disputa } = resolverCombate([
    disparo(5, "sub_cometa", 40, 3),
    disparo(6, "des_buraco_negro", -60, 5),
  ]);
  assert.equal(disputa.liquido, -20);
  assert.equal(resultado.delta, -20, "anda 20 para baixo, não 60");
  assert.equal(resultado.animacaoId, "des_buraco_negro", "a animação é a do maior presente do lado vencedor");
});

test("uma subida pode virar o jogo contra uma descida maior", () => {
  const { disparo: resultado } = resolverCombate([
    disparo(6, "des_buraco_negro", -60, 5),
    disparo(5, "sub_cometa", 40, 3),
    disparo(3, "sub_foguete", 30, 2),
  ]);
  assert.equal(resultado.delta, 10, "70 de subida contra 60 de descida");
  assert.equal(resultado.animacaoId, "sub_cometa", "o maior presente do lado que venceu");
});

test("disputa contestada sobe um nível de intensidade, com teto em 5", () => {
  const soSubida = resolverCombate([disparo(5, "sub_cometa", 40, 3), disparo(3, "sub_foguete", 12, 2)]);
  assert.equal(soSubida.disparo.intensidade, 3, "sem descida não houve disputa");

  const contestada = resolverCombate([disparo(5, "sub_cometa", 40, 3), disparo(4, "des_chumbo", -8, 2)]);
  assert.equal(contestada.disparo.intensidade, 4, "disputa de verdade sobe um nível");

  const noTeto = resolverCombate([disparo(6, "des_buraco_negro", -60, 5), disparo(5, "sub_cometa", 40, 3)]);
  assert.equal(noTeto.disparo.intensidade, 5, "o teto continua sendo 5");
});

test("empate exato anula o combate e nada vai para o jogo", () => {
  const resultado = resolverCombate([
    disparo(5, "sub_cometa", 40, 3),
    disparo(4, "des_chumbo", -40, 2),
  ]);
  assert.equal(resultado.anulado, true);
  assert.equal(resultado.disparo, undefined, "delta 0 não existe no contrato com o jogo");
  assert.equal(resultado.disputa.liquido, 0);
});

test("o despachante avisa o painel do empate e não despacha nada", () => {
  const disparos = [];
  const anulados = [];
  const despachante = new Despachante({ animacoes, aoDespachar: (d) => disparos.push(d), aoAnular: (d) => anulados.push(d) });
  despachante.definirPreset({
    presetId: "empate", streamerId: "local", nome: "Empate", modalidade: "escalada",
    slots: [
      { posicao: 1, presenteId: "sobe", animacaoId: "sub_cometa", delta: 40, intensidade: 3 },
      { posicao: 2, presenteId: "desce", animacaoId: "des_chumbo", delta: -40, intensidade: 2 },
    ],
  });

  // O primeiro chega com o boneco livre e dispara; os dois seguintes se anulam.
  despachante.receber({ presenteId: "sobe", presenteNome: "Sobe", repeticoes: 1, recebidoEm: T0 }, T0);
  despachante.receber({ presenteId: "sobe", presenteNome: "Sobe", repeticoes: 1, recebidoEm: T0 + 100 }, T0 + 100);
  despachante.receber({ presenteId: "desce", presenteNome: "Desce", repeticoes: 1, recebidoEm: T0 + 150 }, T0 + 150);

  despachante.avancar(T0 + 1600);
  assert.equal(disparos.length, 1, "só o primeiro, que pegou o boneco livre");
  assert.equal(anulados.length, 1);
  assert.equal(anulados[0].liquido, 0);
});

test("nenhum presente é descartado por concorrência: todos entram no líquido", () => {
  const disparos = [];
  const descartados = [];
  const despachante = new Despachante({ animacoes, aoDespachar: (d) => disparos.push(d), aoDescartar: (d) => descartados.push(d) });
  despachante.definirPreset({
    presetId: "muitos", streamerId: "local", nome: "Muitos", modalidade: "escalada",
    slots: Array.from({ length: 6 }, (_, i) => ({
      posicao: i + 1, presenteId: `p${i + 1}`, animacaoId: "sub_pulo", delta: i + 1, intensidade: 1,
    })),
  });

  despachante.receber({ presenteId: "p6", presenteNome: "P6", repeticoes: 1, recebidoEm: T0 }, T0);
  for (let i = 1; i <= 5; i += 1) {
    despachante.receber({ presenteId: `p${i}`, presenteNome: `P${i}`, repeticoes: 1, recebidoEm: T0 + i * 10 }, T0 + i * 10);
  }
  const [segundo] = despachante.avancar(T0 + 400);

  assert.deepEqual(descartados, [], "a fila de 3 do R5 descartava presente; o combate não descarta nenhum");
  assert.equal(segundo.delta, 1 + 2 + 3 + 4 + 5, "os cinco entraram no líquido");
});

test("o empate chega ao JOGO, não só ao painel", async () => {
  // Regressão de um descasamento real entre agentes: o HUD escutava
  // COMBATE_ANULADO e a ponte só publicava no SSE do painel. A feature inteira
  // estava morta, sem erro em lugar nenhum — e empate sem nada na tela lê como
  // travamento no exato momento em que mais gente mandou presente.
  const { Nucleo } = await import("../src/nucleo.mjs");
  const { criarValidador } = await import("../src/repos/schemas.mjs");
  const { validar } = await criarValidador();

  const nucleo = new Nucleo({
    config: { token: "z".repeat(32), portaJogo: 0, portaPainel: 0, host: "127.0.0.1",
      usuarioTiktok: "", chaveGemini: "", longpollTimeoutMs: 300, combateMaxMs: 2000 },
  });
  await nucleo.carregarAnimacoesNaMemoria();

  const entregues = [];
  const resposta = {
    status: () => ({ json: (corpo) => entregues.push(corpo), end: () => {} }),
    on: () => {},
  };

  // O jogo precisa estar em long-poll: com ele offline, evento é descartado (F7).
  nucleo.longpoll.registrar(resposta, { desde: 0 });

  nucleo.longpoll.publicar([{
    id: 7, somaSubida: 40, somaDescida: -40, participantes: 2,
    emitidoEm: Date.now(), tipoDeEntrada: "anulado",
  }]);

  assert.equal(entregues.length, 1, "o empate saiu pelo long-poll");
  assert.deepEqual(entregues[0].eventos, [], "não move o boneco: delta 0 não existe no contrato");
  assert.equal(entregues[0].anulados[0].participantes, 2);
  assert.deepEqual(validar("evento-jogo", entregues[0]), [], "e o envelope respeita o schema");

  nucleo.longpoll.fecharTodos();
});
