/**
 * Como o console escreve número, data e dinheiro.
 *
 * O teste que mais importa aqui é o do dinheiro: **centavo inteiro entra, texto
 * sai, e a divisão por 100 acontece uma vez só, no último instante.** Centavo
 * em ponto flutuante é como centavo some sem ninguém ver, e some devagar, num
 * número que o dono lê achando que confere com o painel da Lemon Squeezy.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  arroba,
  data,
  dinheiro,
  distancia,
  estadoDaLicenca,
  idioma,
  mensagemDeFalha,
  ouVazio,
  VAZIO,
} from "../src/lib/formatar.js";

const AGORA = new Date("2026-09-10T12:00:00.000Z");

test("dinheiro sai de centavo inteiro, sem passar por float", () => {
  assert.match(dinheiro(1_900, "USD"), /19,00/);
  assert.match(dinheiro(19_900, "USD"), /199,00/);
  // O centavo solto sobrevive: é o caso que a divisão errada come.
  assert.match(dinheiro(1, "USD"), /0,01/);
  assert.match(dinheiro(999, "BRL"), /9,99/);
});

test("dinheiro sem valor não vira NaN na tela", () => {
  assert.match(dinheiro(null, "USD"), /0,00/);
  assert.match(dinheiro(undefined, "USD"), /0,00/);
});

test("a moeda vem ao lado, e não é presumida", () => {
  assert.notEqual(dinheiro(1_900, "USD"), dinheiro(1_900, "BRL"));
});

test("distância responde 'esse cliente está vivo'", () => {
  assert.equal(distancia("2026-09-10T11:59:30.000Z", AGORA), "agora");
  assert.equal(distancia("2026-09-10T11:00:00.000Z", AGORA), "há 1 h");
  assert.equal(distancia("2026-09-08T12:00:00.000Z", AGORA), "há 2 d");
  assert.equal(distancia("2026-07-10T12:00:00.000Z", AGORA), "há 2 meses");
  assert.equal(distancia("2026-08-10T12:00:00.000Z", AGORA), "há 1 mês");
});

test("data futura, como validade de licença, não vira 'há -3 dias'", () => {
  assert.match(distancia("2026-09-20T12:00:00.000Z", AGORA), /^em \d+ d$/);
});

test("campo ausente tem uma escrita só na tela inteira", () => {
  assert.equal(distancia(null), VAZIO);
  assert.equal(data(null), VAZIO);
  assert.equal(ouVazio(null), VAZIO);
  assert.equal(ouVazio("   "), VAZIO);
  assert.equal(arroba(null), VAZIO);
  assert.equal(idioma(null), VAZIO);
});

test("data inválida não vira 'Invalid Date' na tela", () => {
  assert.equal(data("isto não é data"), VAZIO);
  assert.equal(distancia("isto não é data"), VAZIO);
});

test("o @ da TikTok é guardado sem arroba e mostrado com ela", () => {
  assert.equal(arroba("livia.parkour"), "@livia.parkour");
});

test("sem licença é neutro, não é erro", () => {
  // Quem comprou e ainda não instalou não tem problema nenhum. Pintar isso de
  // vermelho faria o operador ligar para um cliente que está bem.
  assert.equal(estadoDaLicenca(null).pastilha, "pastilha-neutra");
  assert.equal(estadoDaLicenca("ativa").pastilha, "pastilha-ok");
  assert.equal(estadoDaLicenca("expirada").pastilha, "pastilha-atencao");
  assert.equal(estadoDaLicenca("cancelada").pastilha, "pastilha-erro");
});

test("toda falha do contrato tem frase em português", () => {
  for (const motivo of [
    "console_offline",
    "sem_configuracao",
    "rede",
    "timeout",
    "http",
    "corpo_ilegivel",
    "nao_encontrado",
    "pedido_invalido",
  ]) {
    const frase = mensagemDeFalha(motivo);
    assert.ok(frase.length > 10, `motivo ${motivo} sem frase`);
    assert.equal(frase, mensagemDeFalha(motivo));
  }
  // Motivo que ninguém previu ainda dá uma frase, e não `undefined` na tela.
  assert.ok(mensagemDeFalha("motivo_do_futuro").length > 10);
});

test("o console formata em pt-BR e não pergunta o idioma a ninguém", () => {
  // ADR-P05: português apenas, e nunca traduz. Se algum dia isto virar
  // configurável, é aqui que a decisão está sendo revogada.
  assert.match(data("2026-09-10T12:00:00.000Z"), /^\d{2}\/\d{2}\/\d{4}$/);
  assert.equal(idioma("es"), "Espanhol");
  assert.equal(idioma("en"), "Inglês");
});
