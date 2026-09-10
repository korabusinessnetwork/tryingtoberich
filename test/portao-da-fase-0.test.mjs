/**
 * O número que julga o portão da Fase 0.
 *
 * O plano de produto tem um portão só, e ele decide se o projeto continua:
 *
 * > "Os presentes aumentam de forma visível nas lives com o jogo. Se não
 * > aumentarem, o produto não tem argumento. Para e reavalia."
 *
 * Para responder isso o dono vai olhar o resumo da sessão. E até 2026-09-10 o
 * único número lá era `totalPresentes`, que **não conta presentes** — conta
 * ANIMAÇÕES despachadas. Presente que perde combate (ADR-012), que cai em
 * cooldown ou que coalesce com outro vira um despacho só.
 *
 * A maratona mediu a escala: **228 presentes chegando viraram 66 eventos**, uma
 * subcontagem de 3,5x. E ela erra mais justamente quando o jogo funciona
 * melhor: momento de hype é quando mais presente chega junto, e é quando mais
 * coalesce. Julgar o portão por ali diria "não aumentou" numa live em que
 * aumentou.
 *
 * Estes testes existem para o número certo não se perder de novo.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { Sessao } from "../bridge/src/sessao/sessao.mjs";
import { reduzirAoResumo } from "../bridge/src/repos/sessoes.mjs";
import { criarValidador } from "../bridge/src/repos/schemas.mjs";

const novaSessao = () => new Sessao({ presetId: "escalada-padrao", mapaId: "mundo-montado" });

test("presente recebido conta mesmo sem virar animação nenhuma", () => {
  const sessao = novaSessao();

  // Dez presentes chegam; nenhum é despachado — é o que acontece quando todos
  // caem na mesma janela de combate.
  for (let i = 0; i < 10; i += 1) sessao.registrarRecebido({ moedas: 5 });

  const instantaneo = sessao.instantaneo;
  assert.equal(instantaneo.presentesRecebidos, 10, "a plateia mandou dez");
  assert.equal(instantaneo.eventos.length, 0, "e o jogo não animou nenhum");
});

test("repetição conta como o número de presentes que ela é", () => {
  // Combo (R4): um evento com `repeticoes: 5` é o espectador mandando cinco.
  // Contar como um esconderia justamente a rajada, que é o momento que o portão
  // quer enxergar.
  const sessao = novaSessao();
  sessao.registrarRecebido({ moedas: 10, repeticoes: 5 });

  assert.equal(sessao.instantaneo.presentesRecebidos, 5);
  assert.equal(sessao.instantaneo.moedasRecebidas, 50, "cinco vezes dez moedas");
});

test("moeda inválida não contamina a conta", () => {
  const sessao = novaSessao();
  sessao.registrarRecebido({});
  sessao.registrarRecebido({ moedas: null });
  sessao.registrarRecebido({ moedas: -3 });
  sessao.registrarRecebido({ moedas: "muitas" });

  assert.equal(sessao.instantaneo.presentesRecebidos, 4, "os quatro chegaram");
  assert.equal(sessao.instantaneo.moedasRecebidas, 0, "e nenhum somou moeda inválida");
});

test("o resumo separa presente que CHEGOU de animação que TOCOU", () => {
  const sessao = novaSessao();

  for (let i = 0; i < 8; i += 1) sessao.registrarRecebido({ moedas: 1 });
  // Só dois viraram animação: o resto brigou e coalesceu.
  for (let i = 0; i < 2; i += 1) {
    sessao.registrarDisparo({
      emitidoEm: Date.now(), slot: 1, presenteId: "sem-rose", repeticoes: 1,
      delta: 20, animacaoId: "sub_shuriken_vento", recebidoEm: Date.now(),
    });
  }

  const { resumo } = reduzirAoResumo(sessao.instantaneo, new Date().toISOString());

  assert.equal(resumo.presentesRecebidos, 8, "o número do PORTÃO");
  assert.equal(resumo.totalPresentes, 2, "o número das animações");
  assert.notEqual(resumo.presentesRecebidos, resumo.totalPresentes, "e eles são coisas diferentes");
});

test("o resumo cabe no contrato, e a sessão antiga continua válida", async () => {
  const { validar } = await criarValidador();
  const sessao = novaSessao();
  sessao.registrarRecebido({ moedas: 100, repeticoes: 2 });

  const reduzida = reduzirAoResumo(sessao.instantaneo, new Date().toISOString());
  assert.deepEqual(validar("sessao", reduzida), [], "a sessão nova valida");

  // A raiz do schema é `additionalProperties: false`: os contadores só podem
  // existir dentro de `resumo`. Deixá-los vazar na raiz faria a gravação inteira
  // ser recusada — o BUG-001 outra vez.
  assert.equal(reduzida.presentesRecebidos, undefined, "não vaza para a raiz");
  assert.equal(reduzida.moedasRecebidas, undefined, "nem a moeda");

  // E o que foi gravado antes de 2026-09-10 não tem os campos. O painel lê o
  // histórico inteiro: recusar as antigas apagaria a base de comparação do
  // portão justamente quando ela passa a importar.
  const { presentesRecebidos, moedasRecebidas, ...antiga } = reduzida.resumo;
  assert.deepEqual(validar("sessao", { ...reduzida, resumo: antiga }), [], "a sessão antiga continua válida");
});

test("o schema DIZ que totalPresentes não é o número do portão", async () => {
  // Sem isto escrito no contrato, o próximo a olhar repete o engano. E o engano
  // aqui não é de código: é alguém julgar o portão com o número errado.
  const { ajv } = await criarValidador();
  const schema = ajv.getSchema("https://kora.local/kora-stream-games/sessao.schema.json").schema;
  const resumo = schema.$defs.resumo.properties;

  assert.match(resumo.totalPresentes.description, /ANIMAÇÕES/, "diz o que ele é");
  assert.match(resumo.totalPresentes.description, /presentesRecebidos/, "e para onde mandar quem quer o outro");
  assert.match(resumo.presentesRecebidos.description, /portão da Fase 0/i, "e o outro diz para que serve");
});

// ------------------------------------------- o gráfico "Presentes por slot"

test("o gráfico por slot conta o que CHEGOU, não o que animou", () => {
  const sessao = novaSessao();

  // O slot 1 é o popular: dez presentes chegam, e o combate junta quase tudo.
  for (let i = 0; i < 10; i += 1) sessao.registrarCasado({ slot: 1, repeticoes: 1 });
  // O slot 2 é o tranquilo: três presentes, cada um com o boneco livre.
  for (let i = 0; i < 3; i += 1) sessao.registrarCasado({ slot: 2, repeticoes: 1 });

  // Só um despacho do slot 1 (nove coalesceram) e três do slot 2.
  sessao.registrarDisparo({ emitidoEm: Date.now(), slot: 1, presenteId: "a", repeticoes: 1, delta: 20, animacaoId: "x" });
  for (let i = 0; i < 3; i += 1) {
    sessao.registrarDisparo({ emitidoEm: Date.now(), slot: 2, presenteId: "b", repeticoes: 1, delta: 10, animacaoId: "y" });
  }

  const { resumo } = reduzirAoResumo(sessao.instantaneo, new Date().toISOString());

  assert.equal(resumo.presentesPorSlot["1"], 10, "o slot popular mostra os dez que chegaram");
  assert.equal(resumo.presentesPorSlot["2"], 3);

  // O ponto: por DESPACHO o gráfico se inverteria — slot 1 com 1 barra e slot 2
  // com 3 —, e o streamer tiraria dos slots justamente o presente mais mandado.
  assert.ok(
    resumo.presentesPorSlot["1"] > resumo.presentesPorSlot["2"],
    "a ordem do gráfico tem que refletir a plateia, não a coalescência",
  );
});

test("combo conta as repetições que ele é, também por slot", () => {
  const sessao = novaSessao();
  sessao.registrarCasado({ slot: 3, repeticoes: 6 });

  const { resumo } = reduzirAoResumo(sessao.instantaneo, new Date().toISOString());
  assert.equal(resumo.presentesPorSlot["3"], 6, "seis presentes, não um combo");
});

test("presente da tabela de movimento não entra no gráfico dos slots", () => {
  // ADR-016: ele move a torre mas não ocupa slot. Entrar aqui viraria a chave
  // "null", que o schema recusa, e sujaria a comparação entre os slots.
  const sessao = novaSessao();
  sessao.registrarCasado({ slot: null, repeticoes: 1 });
  sessao.registrarCasado({ slot: 2, repeticoes: 1 });

  const { resumo } = reduzirAoResumo(sessao.instantaneo, new Date().toISOString());
  assert.deepEqual(Object.keys(resumo.presentesPorSlot), ["2"]);
});

test("o contador por slot não vaza para a raiz da sessão gravada", async () => {
  const { validar } = await criarValidador();
  const sessao = novaSessao();
  sessao.registrarCasado({ slot: 1, repeticoes: 2 });

  const reduzida = reduzirAoResumo(sessao.instantaneo, new Date().toISOString());
  assert.equal(reduzida.recebidosPorSlot, undefined, "a raiz é additionalProperties: false");
  assert.deepEqual(validar("sessao", reduzida), []);
});

// -------------------------------- a fiação: despachante → aoCasar → sessão

test("o despachante avisa o casamento ANTES do combate engolir o presente", async () => {
  // O vão entre teste de unidade e realidade. `registrarCasado` tem teste
  // próprio, e `aoCasar` existe no despachante — mas nada garantia que um
  // chamasse o outro com a forma certa. Foi um vão desses que escondeu o
  // BUG-008 atrás de 504 testes verdes.
  const { Despachante } = await import("../bridge/src/fila/despachante.mjs");
  const { indexarAnimacoes } = await import("../bridge/src/repos/animacoes.mjs");
  const { carregarExemplo } = await import("../bridge/src/repos/fixtures.mjs");

  const T0 = 1_756_742_620_000;
  const animacoes = indexarAnimacoes((await carregarExemplo("../animacoes")).animacoes);
  const sessao = novaSessao();

  const despachante = new Despachante({
    animacoes,
    aoCasar: (casado) => {
      if (!casado.deTeste) sessao.registrarCasado(casado);
    },
  });
  despachante.definirPreset({
    presetId: "fiacao", streamerId: "local", nome: "Fiação", modalidade: "escalada",
    slots: [{ posicao: 1, presenteId: "popular", animacaoId: "sub_cometa", delta: 40, intensidade: 3 }],
  });

  // Quatro do mesmo slot em rajada: o primeiro dispara, os três seguintes caem
  // no combate e viram parte de um despacho só. Todos os quatro CHEGARAM.
  for (let i = 0; i < 4; i += 1) {
    despachante.receber(
      { presenteId: "popular", presenteNome: "Popular", repeticoes: 1, recebidoEm: T0 + i * 50 },
      T0 + i * 50,
    );
  }

  const { resumo } = reduzirAoResumo(sessao.instantaneo, new Date().toISOString());
  assert.equal(resumo.presentesPorSlot["1"], 4, "os quatro que chegaram, não o único que animou");
});

test("presente do painel move o boneco mas não entra na estatística", async () => {
  // As duas contagens do resumo precisam concordar sobre o que é plateia.
  // `presentesRecebidos` já ignorava o teste; sem a marca, o gráfico por slot
  // o contaria — e o mesmo resumo diria duas coisas sobre a mesma live.
  const { Despachante } = await import("../bridge/src/fila/despachante.mjs");
  const { indexarAnimacoes } = await import("../bridge/src/repos/animacoes.mjs");
  const { carregarExemplo } = await import("../bridge/src/repos/fixtures.mjs");

  const T0 = 1_756_742_620_000;
  const animacoes = indexarAnimacoes((await carregarExemplo("../animacoes")).animacoes);
  const sessao = novaSessao();

  const despachante = new Despachante({
    animacoes,
    aoCasar: (casado) => {
      if (!casado.deTeste) sessao.registrarCasado(casado);
    },
  });
  despachante.definirPreset({
    presetId: "fiacao", streamerId: "local", nome: "Fiação", modalidade: "escalada",
    slots: [{ posicao: 1, presenteId: "popular", animacaoId: "sub_cometa", delta: 40, intensidade: 3 }],
  });

  despachante.receber(
    { presenteId: "popular", presenteNome: "Popular", repeticoes: 1, recebidoEm: T0, deTeste: true },
    T0,
  );

  const { resumo } = reduzirAoResumo(sessao.instantaneo, new Date().toISOString());
  assert.deepEqual(resumo.presentesPorSlot, {}, "o teste do painel fica fora da conta");
});
