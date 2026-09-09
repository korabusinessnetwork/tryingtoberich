/**
 * O HUD da live para o overlay do OBS (ADR-015): a disputa da rodada e a
 * legenda dos presentes. Funções puras — nada de despachante, disco ou rede.
 *
 * O que estes testes protegem, além do cálculo: que a agregação por DOADOR não
 * volte. Ela existiu, mostrava um ranking de quem mais gastou, e saiu a pedido
 * do dono para a live não correr risco de restrição na TikTok. Com ela foi o
 * único acúmulo de nickname da ponte (11_SEGURANCA, camada 4).
 */

import test from "node:test";
import assert from "node:assert/strict";

import * as hudModule from "../src/dominio/hud.mjs";
import {
  criarHud,
  instantaneoDoHud,
  legendaDoPreset,
  registrarDisputa,
  registrarEmpurrao,
  zerarDisputa,
} from "../src/dominio/hud.mjs";

const ZERADO = { disputa: { subida: 0, descida: 0 } };

test("a disputa da rodada soma as duas pontas, e o combate entra pelas somas brutas", () => {
  const hud = criarHud();
  registrarEmpurrao(hud, 40);
  registrarEmpurrao(hud, -8);
  registrarEmpurrao(hud, 0);
  // Combate entra pelas somas brutas, não pelo líquido (ADR-012): a barra é
  // sobre quanto cada lado brigou, e o líquido já está na torre.
  registrarDisputa(hud, { somaSubida: 30, somaDescida: 50, liquido: -20 });
  assert.deepEqual(instantaneoDoHud(hud).disputa, { subida: 70, descida: 58 });
});

test("zerar a disputa é o fim da rodada, e não apaga mais nada porque não há mais nada", () => {
  const hud = criarHud();
  registrarEmpurrao(hud, 120);
  zerarDisputa(hud);
  assert.deepEqual(instantaneoDoHud(hud), ZERADO);
});

test("o instantâneo é cópia: mexer nele não mexe no HUD", () => {
  const hud = criarHud();
  registrarEmpurrao(hud, 10);
  const foto = instantaneoDoHud(hud);
  foto.disputa.subida = 999;
  assert.deepEqual(instantaneoDoHud(hud).disputa, { subida: 10, descida: 0 });
});

test("o HUD não agrega NADA por doador, e não guarda moeda: é o que tira a live do risco", () => {
  //[[ Guarda de arquitetura, não de cálculo. O ranking por doador, o pote de
  // moedas, o TOP COMBO e o TOP PRESENTE existiram aqui e saíram por decisão do
  // dono. Quem for reimplementar tem que esbarrar neste teste antes, porque a
  // razão não é técnica: é a restrição da live e a camada 4 do 11_SEGURANCA. ]]
  const proibidos = ["registrarPresente", "porDoador", "ranking", "topCombo", "topPresente", "TOPO_DO_RANKING"];
  const exportados = Object.keys(hudModule);
  for (const nome of proibidos) {
    assert.ok(!exportados.includes(nome), `${nome} voltou ao módulo do HUD`);
  }

  // E o instantâneo que vai para o SSE não carrega campo nenhum além da disputa.
  assert.deepEqual(Object.keys(instantaneoDoHud(criarHud())), ["disputa"]);
});

test("a legenda tem um item por slot preenchido, ordenada pela força, com nome e ícone do catálogo", () => {
  const preset = {
    slots: [
      { posicao: 1, presenteId: "1", delta: 2 },
      { posicao: 2, presenteId: "2", delta: -60 },
      { posicao: 3, presenteId: "3", delta: 40 },
    ],
  };
  const catalogo = { presentes: [{ presenteId: "1", nome: "Rose", iconeUrl: "http://x/1.png" }] };

  const legenda = legendaDoPreset(preset, catalogo);
  assert.deepEqual(legenda.map((s) => s.delta), [-60, 40, 2]);
  assert.deepEqual(legenda[2], { posicao: 1, presenteId: "1", nome: "Rose", iconeUrl: "http://x/1.png", delta: 2 });
  // Fora do catálogo: o id vira o nome, e sem ícone — a página mostra o texto.
  assert.deepEqual(legenda[0], { posicao: 2, presenteId: "2", nome: "2", iconeUrl: null, delta: -60 });

  assert.deepEqual(legendaDoPreset(null, null), []);
  assert.deepEqual(legendaDoPreset({ slots: [] }, catalogo), []);
});

test("a legenda esconde só o slot desmarcado, e o slot SEM o campo continua aparecendo (ADR-015)", () => {
  //[[ A retrocompatibilidade em forma de teste.
  //
  // Todo preset gravado antes desta feature não tem `mostrarNoOverlay`. Se a
  // ausência valesse como falso, abrir um preset antigo apagaria a legenda
  // inteira do overlay sem ninguém ter desmarcado nada — e em silêncio, porque
  // a live continuaria funcionando com o boneco reagindo normalmente. ]]
  const preset = {
    slots: [
      { posicao: 1, presenteId: "1", delta: 2, mostrarNoOverlay: true },
      { posicao: 2, presenteId: "2", delta: -60, mostrarNoOverlay: false },
      { posicao: 3, presenteId: "3", delta: 40 },
    ],
  };

  const legenda = legendaDoPreset(preset, { presentes: [] });
  assert.deepEqual(legenda.map((s) => s.posicao), [3, 1], "o desmarcado sai, e a ordem por |delta| fica");
  assert.equal(legenda.some((s) => s.presenteId === "2"), false, "o -60 era o mais forte e mesmo assim não entra");
});

test("a legenda fala do PRESENTE, nunca de quem mandou nem de quanto custou", () => {
  const preset = { slots: [{ posicao: 1, presenteId: "9101", delta: 150 }] };
  const catalogo = {
    presentes: [{ presenteId: "9101", nome: "Universe", iconeUrl: "http://x/u.png", moedas: 44999, faixa: 5 }],
  };
  assert.deepEqual(Object.keys(legendaDoPreset(preset, catalogo)[0]).sort(), [
    "delta", "iconeUrl", "nome", "posicao", "presenteId",
  ]);
});

test("lixo não quebra: hud nulo, entrada inválida, instantâneo de nada", () => {
  assert.deepEqual(instantaneoDoHud(null), ZERADO);
  assert.deepEqual(instantaneoDoHud(criarHud()), ZERADO);
  const hud = criarHud();
  registrarDisputa(hud);
  registrarEmpurrao(hud, Number.NaN);
  registrarEmpurrao(null, 10);
  assert.deepEqual(instantaneoDoHud(hud), ZERADO);
});
