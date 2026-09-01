/**
 * O despachante contra os 6 cenários do Bloco 0.
 *
 * Os cenários são a especificação executável de R4, R5 e F2: se a
 * implementação e a fixture discordarem, uma das duas está errada e a
 * discussão acontece aqui, não ao vivo.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { Despachante } from "../src/fila/despachante.mjs";
import { indexarAnimacoes } from "../src/repos/animacoes.mjs";
import { carregarCenario, listarCenarios } from "../src/repos/fixtures.mjs";
import { carregarExemplo } from "../src/repos/fixtures.mjs";
import { aplicarCombo, casar, indexarSlots } from "../src/dominio/casamento.mjs";

const T0 = 1_756_742_620_000;
const preset = await carregarExemplo("preset-escalada-padrao");
const animacoes = indexarAnimacoes((await carregarExemplo("../animacoes")).animacoes ?? []);

/** Roda um cenário inteiro e devolve tudo que saiu: disparos, descartes, não mapeados. */
function rodar(cenario, { ateMs = 4000 } = {}) {
  const disparos = [];
  const descartados = [];
  const naoMapeados = [];

  const anulados = [];
  const despachante = new Despachante({
    combateMaxMs: cenario.combateMaxMs ?? 2000,
    animacoes,
    aoDespachar: (d) => disparos.push({ ...d, emMs: d.emitidoEm - T0 }),
    aoDescartar: (d) => descartados.push(d),
    aoNaoMapeado: (d) => naoMapeados.push(d),
    aoAnular: (d) => anulados.push(d),
  });
  despachante.definirPreset(preset);

  const entradas = [...cenario.entrada].sort((a, b) => a.emMs - b.emMs);
  let disputa = null;

  // Um passo por milissegundo em que algo pode acontecer: entradas mais o
  // relógio, para o `avancar` do timer ser exercido do mesmo jeito que em produção.
  const instantes = new Set([...entradas.map((e) => e.emMs), ...Array.from({ length: ateMs / 10 + 1 }, (_, i) => i * 10)]);

  for (const emMs of [...instantes].sort((a, b) => a - b)) {
    const agora = T0 + emMs;
    despachante.avancar(agora);
    for (const entrada of entradas.filter((e) => e.emMs === emMs)) {
      despachante.receber(entrada.evento, agora);
    }
  }

  disputa = disparos.find((d) => d.disputa)?.disputa ?? null;
  return { disparos, descartados, naoMapeados, anulados, disputa };
}

const resumir = (d) => ({
  emMs: d.emMs, slot: d.slot, animacaoId: d.animacaoId,
  delta: d.delta, intensidade: d.intensidade, efeitoCurto: d.efeitoCurto,
});

test("os 7 cenários de regra continuam existindo", async () => {
  assert.equal((await listarCenarios()).length, 7);
});

for (const arquivo of await listarCenarios()) {
  const cenario = await carregarCenario(arquivo);

  test(`cenário ${cenario.cenario} (${cenario.regra}): ${cenario.descricao.split(".")[0]}`, () => {
    const { disparos, descartados, naoMapeados, anulados, disputa } = rodar(cenario);

    assert.deepEqual(
      disparos.map(resumir),
      cenario.esperado.disparos.map((d) => ({ efeitoCurto: false, ...d })),
      "disparos",
    );

    assert.deepEqual(
      naoMapeados.map((n) => ({ presenteNome: n.presenteNome, moedas: n.moedas, contagem: n.contagem })),
      cenario.esperado.naoMapeados,
      "não mapeados",
    );

    if (cenario.esperado.disputa) {
      assert.deepEqual(disputa, cenario.esperado.disputa, "disputa");
    }

    assert.deepEqual(
      descartados.map((d) => ({ slot: d.slot, delta: d.delta })),
      cenario.esperado.descartados.map((d) => ({ slot: d.slot, delta: d.delta })),
      "descartados",
    );

    assert.equal(anulados.length, cenario.esperado.anulados?.length ?? 0, "anulados");
  });
}

test("R4: o delta multiplica pelas repetições e a intensidade sobe um nível", () => {
  const slot = { posicao: 1, presenteId: "sem-rose", animacaoId: "sub_pulo", delta: 2, intensidade: 1 };
  assert.deepEqual(aplicarCombo(slot, 9), { delta: 18, intensidade: 2 });
  assert.deepEqual(aplicarCombo(slot, 1), { delta: 2, intensidade: 1 }, "sem combo, intensidade não muda");
});

test("R4: a intensidade do combo tem teto em 5", () => {
  const slot = { posicao: 6, presenteId: "sem-lion", animacaoId: "des_buraco_negro", delta: -60, intensidade: 5 };
  assert.deepEqual(aplicarCombo(slot, 3), { delta: -180, intensidade: 5 });
});

test("F2.4: presente fora dos 6 slots não casa, nem o mais caro do catálogo", () => {
  const indice = indexarSlots(preset);
  const caro = { presenteId: "sem-tiktok-universe", presenteNome: "TikTok Universe", moedas: 44999, repeticoes: 1, recebidoEm: T0 };
  assert.equal(casar(caro, indice), null);
});

test("o combate NÃO atrasa o primeiro presente", () => {
  const disparos = [];
  const despachante = new Despachante({ animacoes, aoDespachar: (d) => disparos.push(d) });
  despachante.definirPreset(preset);

  despachante.receber(
    { presenteId: "sem-galaxy", presenteNome: "Galaxy", repeticoes: 1, recebidoEm: T0 },
    T0,
  );

  assert.equal(disparos.length, 1, "com o boneco livre, o evento dispara no mesmo instante");
  assert.equal(disparos[0].emitidoEm, T0, "zero atraso: o combate só existe durante animação");
});

test("cooldown do slot descarta o repique em vez de enfileirar", () => {
  const disparos = [];
  const descartados = [];
  const despachante = new Despachante({ animacoes, aoDespachar: (d) => disparos.push(d), aoDescartar: (d) => descartados.push(d) });

  // Cooldown maior que a animação, senão o teste mediria o canal ocupado e não o cooldown.
  despachante.definirPreset({
    ...preset,
    slots: [{ posicao: 1, presenteId: "sem-rose", animacaoId: "sub_pulo", delta: 2, intensidade: 1, cooldownMs: 3000 }],
  });

  const evento = (em) => ({ presenteId: "sem-rose", presenteNome: "Rose", repeticoes: 1, recebidoEm: em });
  despachante.receber(evento(T0), T0);

  // 500ms: o sub_pulo (0,4s) já acabou, mas o cooldown de 3s ainda corre.
  despachante.avancar(T0 + 500);
  despachante.receber(evento(T0 + 500), T0 + 500);
  assert.equal(disparos.length, 1, "dentro do cooldown o repique não dispara");
  assert.equal(descartados.at(-1).motivo, "cooldown");
  assert.equal(despachante.estado.combate, null, "e também não fica preso num combate esperando");

  despachante.receber(evento(T0 + 3000), T0 + 3000);
  assert.equal(disparos.length, 2, "passado o cooldown, volta a disparar");
});

test("o jogo informando que saiu da animação libera a fila antes do previsto (R9)", () => {
  const disparos = [];
  const despachante = new Despachante({ animacoes, aoDespachar: (d) => disparos.push(d) });
  despachante.definirPreset(preset);

  despachante.receber({ presenteId: "sem-galaxy", presenteNome: "Galaxy", repeticoes: 1, recebidoEm: T0 }, T0);
  despachante.receber({ presenteId: "sem-rose", presenteNome: "Rose", repeticoes: 1, recebidoEm: T0 + 50 }, T0 + 50);
  assert.equal(disparos.length, 1, "o segundo entrou no combate porque o cometa está tocando");

  despachante.informarEstadoDoJogo({ emAnimacao: false }, T0 + 200);
  despachante.avancar(T0 + 200);
  assert.equal(disparos.length, 2, "o jogo é dono do estado: se ele diz que acabou, a fila anda");
});
