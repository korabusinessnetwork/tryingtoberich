/**
 * A fronteira com a TikTok. O que este teste protege não é a tradução de
 * campos: é o descarte. O payload cru traz id de conta e avatar do espectador,
 * e nada disso pode atravessar o normalizador (11_SEGURANCA, camada 4).
 */

import test from "node:test";
import assert from "node:assert/strict";

import { normalizarCatalogo, normalizarPresente, sanitizarNome } from "../src/tiktok/normalizador.mjs";
import { ConectorTikTok, ESTADO } from "../src/tiktok/conector.mjs";
import { carregarPayloadCru } from "../src/repos/fixtures.mjs";
import { criarValidador } from "../src/repos/schemas.mjs";

const { validar } = await criarValidador();
const T0 = 1_756_742_591_123;

test("o evento normalizado do Galaxy respeita o contrato", async () => {
  const evento = normalizarPresente(await carregarPayloadCru("gift-galaxy"), T0);

  assert.deepEqual(validar("evento-presente", evento), []);
  assert.equal(evento.presenteId, "5655");
  assert.equal(evento.presenteNome, "Galaxy");
  assert.equal(evento.moedas, 1000);
  assert.equal(evento.repeticoes, 1);
  assert.equal(evento.recebidoEm, T0, "o t0 da latência é a entrada na ponte, não o relógio da TikTok");
});

test("nenhum identificador de espectador atravessa o normalizador", async () => {
  const cru = await carregarPayloadCru("gift-galaxy");
  assert.ok(cru.user.id, "o payload cru TEM o id — é justamente isso que não pode passar");

  const evento = normalizarPresente(cru, T0);
  const serializado = JSON.stringify(evento);

  assert.equal(serializado.includes(cru.user.id), false, "id de conta");
  assert.equal(serializado.includes("avatarThumb"), false, "avatar");
  assert.equal(serializado.includes("msgId"), false, "metadado de mensagem");
  assert.deepEqual(
    Object.keys(evento).sort(),
    ["moedas", "nomeDoador", "presenteId", "presenteNome", "rajadaEncerrada", "recebidoEm", "repeticoes"],
    "o evento tem exatamente os campos do contrato, e nenhum a mais",
  );
});

test("rajada aberta é ignorada; só a fechada vira evento (R4)", async () => {
  const aberta = await carregarPayloadCru("gift-rose-rajada-aberta");
  const fechada = await carregarPayloadCru("gift-rose-rajada-fechada");

  assert.equal(normalizarPresente(aberta, T0), null, "senão a mesma rajada dispara N animações");

  const evento = normalizarPresente(fechada, T0);
  assert.equal(evento.repeticoes, 9);
  assert.equal(evento.rajadaEncerrada, true);
});

test("presente não combável dispara sem esperar rajada", async () => {
  const cru = await carregarPayloadCru("gift-galaxy");
  assert.equal(cru.gift.combo, false);
  assert.notEqual(normalizarPresente({ ...cru, repeatEnd: 0 }, T0), null);
});

test("payload sem id de presente não vira evento", () => {
  assert.equal(normalizarPresente({ gift: { name: "Sem id" } }, T0), null);
  assert.equal(normalizarPresente(null, T0), null);
  assert.equal(normalizarPresente("nem objeto", T0), null);
});

test("o nome do doador é sanitizado antes de virar texto na tela do jogo", () => {
  assert.equal(sanitizarNome("<b>theuz</b>"), "btheuz/b", "rich text do Roblox não pode ser injetado");
  assert.equal(sanitizarNome("  João   da  Silva  "), "João da Silva");
  assert.equal(sanitizarNome("x".repeat(40)).length, 24, "teto do schema e do HUD");
  assert.equal(sanitizarNome("<>"), null);
  assert.equal(sanitizarNome(undefined), null);
});

test("o nome do doador sanitizado continua cabendo no contrato", () => {
  const evento = normalizarPresente(
    { giftId: "1", gift: { name: "Rose", diamondCount: 1, combo: false }, repeatEnd: 1, user: { nickname: "y".repeat(90) } },
    T0,
  );
  assert.deepEqual(validar("evento-presente", evento), []);
});

test("a coleta do catálogo normaliza a sala e deriva a faixa das moedas (R3)", async () => {
  const presentes = normalizarCatalogo(await carregarPayloadCru("sala-presentes-disponiveis"), "2026-09-01T20:00:00Z");

  assert.equal(presentes.length, 3, "o item sem id é ignorado em vez de virar lixo no catálogo");
  assert.deepEqual(
    presentes.map((p) => [p.nome, p.moedas, p.faixa]),
    [["Rose", 1, 1], ["Galaxy", 1000, 4], ["Lion", 29999, 5]],
  );

  assert.deepEqual(
    validar("catalogo-presentes", {
      streamerId: "local", origem: "live", confirmado: true,
      atualizadoEm: "2026-09-01T20:00:00Z", presentes,
    }),
    [],
  );
});

test("a coleta aceita as formas de resposta que a biblioteca já usou", () => {
  const item = { id: "1", name: "Rose", diamondCount: 1, combo: true };
  for (const resposta of [[item], { gifts: [item] }, { giftList: [item] }, { data: [item] }]) {
    assert.equal(normalizarCatalogo(resposta).length, 1, JSON.stringify(resposta).slice(0, 30));
  }
  assert.deepEqual(normalizarCatalogo(null), [], "resposta inesperada não derruba a coleta");
});

test("live que cai reconecta com backoff e não inventa evento (F6)", async () => {
  const estados = [];
  const esperas = [];
  let tentativas = 0;
  let derrubar = null;

  const conector = new ConectorTikTok({
    usuario: "qualquer",
    backoffMs: [10, 20, 40],
    aoEstado: (e) => estados.push(e),
    abrirConexao: async () => {
      tentativas += 1;
      if (tentativas === 1) throw new Error("sala fechada");
      return {
        aoPresente: () => {},
        aoFim: (ouvinte) => { derrubar = ouvinte; },
        listarPresentes: async () => [],
        fechar: async () => {},
      };
    },
  });

  await conector.conectar();
  assert.equal(conector.estado, ESTADO.RECONECTANDO, "falhou, então não fica dizendo que está conectada");
  esperas.push(estados.at(-1).emMs);

  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(conector.estado, ESTADO.CONECTADA, "a segunda tentativa entrou");

  derrubar("queda de rede");
  assert.equal(conector.estado, ESTADO.RECONECTANDO);
  assert.equal(estados.at(-1).emMs, 10, "o backoff reinicia depois de uma conexão bem-sucedida");

  await conector.desconectar();
  assert.equal(conector.estado, ESTADO.DESLIGADA);
});

test("desconectar cancela a reconexão pendente", async () => {
  let tentativas = 0;
  const conector = new ConectorTikTok({
    usuario: "qualquer",
    backoffMs: [10],
    abrirConexao: async () => { tentativas += 1; throw new Error("sempre falha"); },
  });

  await conector.conectar();
  await conector.desconectar();
  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(tentativas, 1, "stop no painel para de tentar de verdade");
});
