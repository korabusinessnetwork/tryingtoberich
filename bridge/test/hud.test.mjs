/**
 * O HUD da live para o overlay do OBS (ADR-015): agregados em memória, por
 * sessão. Funções puras — nada de despachante, nada de disco, nada de rede.
 *
 * O que estes testes protegem: o ranking conta quem PAGOU (mapeado ou não), a
 * disputa é da rodada e o resto é da sessão, e nada aqui guarda mais do que o
 * nome que vai para a tela (11_SEGURANCA, camada 4).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  TOPO_DO_RANKING,
  criarHud,
  instantaneoDoHud,
  legendaDoPreset,
  registrarDisputa,
  registrarEmpurrao,
  registrarPresente,
  zerarDisputa,
} from "../src/dominio/hud.mjs";

const presente = (nomeDoador, moedas, repeticoes = 1, presenteNome = "Rose", presenteId = "5655") => ({
  presenteId, presenteNome, moedas, repeticoes, nomeDoador, recebidoEm: 0,
});

const ZERADO = { moedas: 0, ranking: [], topCombo: null, topPresente: null, disputa: { subida: 0, descida: 0 } };

test("o ranking soma moedas × rajada por doador, ordena e corta no topo", () => {
  const hud = criarHud();
  registrarPresente(hud, presente("julin_", 1, 20));
  registrarPresente(hud, presente("raylton", 100));
  registrarPresente(hud, presente("kelvyn", 69));
  registrarPresente(hud, presente("julin_", 100));
  registrarPresente(hud, presente("quarto", 5));

  const { ranking, moedas } = instantaneoDoHud(hud);
  assert.deepEqual(ranking, [
    { nome: "julin_", moedas: 120 },
    { nome: "raylton", moedas: 100 },
    { nome: "kelvyn", moedas: 69 },
  ]);
  assert.equal(ranking.length, TOPO_DO_RANKING, "a referência do dono mostra três");
  assert.equal(moedas, 294, "o total conta todo mundo, inclusive quem ficou fora do topo");
});

test("empate em moedas desempata pelo nome, para a lista não pular de ordem a cada presente", () => {
  const hud = criarHud();
  registrarPresente(hud, presente("bruna", 10));
  registrarPresente(hud, presente("ana", 10));
  assert.deepEqual(instantaneoDoHud(hud).ranking.map((d) => d.nome), ["ana", "bruna"]);
});

test("sem nome, o presente conta no total e não conta no ranking", () => {
  const hud = criarHud();
  registrarPresente(hud, presente(null, 50));
  registrarPresente(hud, presente("   ", 50));
  const foto = instantaneoDoHud(hud);
  assert.equal(foto.moedas, 100);
  assert.deepEqual(foto.ranking, []);
});

test("top combo é a maior rajada (x1 não é combo); top presente é o maior valor unitário", () => {
  const hud = criarHud();
  registrarPresente(hud, presente("kelvyn", 1, 20, "GG", "gg"));
  registrarPresente(hud, presente("raylton", 100, 1, "Coins", "cc"));
  registrarPresente(hud, presente("ana", 500, 1, "Lion", "lion"));
  registrarPresente(hud, presente("bia", 5, 30, "Rose", "rose"));
  // Empate na rajada fica com quem chegou primeiro.
  registrarPresente(hud, presente("caio", 1, 30, "Rose", "rose"));

  const { topCombo, topPresente } = instantaneoDoHud(hud);
  assert.deepEqual(topCombo, { presenteId: "rose", presenteNome: "Rose", nome: "bia", repeticoes: 30 });
  assert.deepEqual(topPresente, { presenteId: "lion", presenteNome: "Lion", nome: "ana", moedas: 500 });
});

test("a disputa da rodada soma as duas pontas — e zera no fim da rodada, sem levar o resto junto", () => {
  const hud = criarHud();
  registrarPresente(hud, presente("ana", 10));
  registrarEmpurrao(hud, 40);
  registrarEmpurrao(hud, -8);
  registrarEmpurrao(hud, 0);
  // Combate entra pelas somas brutas, não pelo líquido (ADR-012).
  registrarDisputa(hud, { somaSubida: 30, somaDescida: 50, liquido: -20 });
  assert.deepEqual(instantaneoDoHud(hud).disputa, { subida: 70, descida: 58 });

  zerarDisputa(hud);
  const depois = instantaneoDoHud(hud);
  assert.deepEqual(depois.disputa, { subida: 0, descida: 0 });
  assert.equal(depois.moedas, 10, "zerar a disputa não apaga a sessão");
});

test("o instantâneo é cópia: mexer nele não mexe no HUD", () => {
  const hud = criarHud();
  registrarPresente(hud, presente("ana", 10, 5));
  const foto = instantaneoDoHud(hud);
  foto.ranking.push({ nome: "intruso", moedas: 999 });
  foto.disputa.subida = 999;
  foto.topCombo.repeticoes = 999;
  assert.deepEqual(instantaneoDoHud(hud).ranking, [{ nome: "ana", moedas: 50 }]);
  assert.deepEqual(instantaneoDoHud(hud).disputa, { subida: 0, descida: 0 });
  assert.equal(instantaneoDoHud(hud).topCombo.repeticoes, 5);
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

test("lixo não quebra: hud nulo, evento nulo, instantâneo de nada", () => {
  assert.deepEqual(instantaneoDoHud(null), ZERADO);
  assert.deepEqual(instantaneoDoHud(criarHud()), ZERADO);
  assert.equal(registrarPresente(null, presente("ana", 1)), null);
  const hud = criarHud();
  registrarPresente(hud, null);
  registrarPresente(hud, { presenteId: "x", moedas: "muito", repeticoes: -3, nomeDoador: 7 });
  registrarDisputa(hud);
  registrarEmpurrao(hud, Number.NaN);
  assert.deepEqual(instantaneoDoHud(hud), ZERADO);
});
