/**
 * O transporte da chamada ao Gemini: retentativa e teto de espera.
 *
 * Testado porque foi medido contra a API de verdade: o MESMO prompt devolveu
 * 503 e, logo depois, 200. Sem retentativa, esse 503 virava geração falhada na
 * cara do streamer — que não teria como saber que bastava clicar de novo.
 *
 * O outro lado importa igual: 400 e 404 são erro nosso (chave inválida, modelo
 * aposentado) e insistir neles só gasta tempo devolvendo a mesma resposta.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { chamarGemini } from "../src/gemini/cliente.mjs";

const resposta = (status, corpo = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corpo,
  text: async () => JSON.stringify(corpo),
});

const textoOk = { candidates: [{ content: { parts: [{ text: '{"mapaId":"m1"}' }] } }] };

const argumentos = { chave: "k", modelo: "m", system: "s", usuario: "u" };

test("503 seguido de 200: insiste e devolve o texto, em vez de falhar", async () => {
  const vistos = [];
  const buscar = async () => {
    vistos.push(1);
    return vistos.length === 1 ? resposta(503) : resposta(200, textoOk);
  };

  assert.equal(await chamarGemini({ ...argumentos, buscar }), '{"mapaId":"m1"}');
  assert.equal(vistos.length, 2, "insistiu exatamente uma vez");
});

test("chave inválida (400) não é insistida: a resposta seria a mesma", async () => {
  let chamadas = 0;
  const buscar = async () => {
    chamadas += 1;
    return resposta(400, { error: { message: "API key not valid" } });
  };

  await assert.rejects(() => chamarGemini({ ...argumentos, buscar }), /respondeu 400/);
  assert.equal(chamadas, 1, "uma só: insistir em erro nosso é só demora");
});

test("modelo aposentado (404) também para de primeira", async () => {
  let chamadas = 0;
  const buscar = async () => {
    chamadas += 1;
    return resposta(404, { error: { message: "no longer available" } });
  };

  await assert.rejects(() => chamarGemini({ ...argumentos, buscar }), /respondeu 404/);
  assert.equal(chamadas, 1);
});

test("503 sempre: desiste com mensagem clara, não fica preso em laço", async () => {
  let chamadas = 0;
  const buscar = async () => {
    chamadas += 1;
    return resposta(503);
  };

  await assert.rejects(() => chamarGemini({ ...argumentos, buscar }), /respondeu 503/);
  assert.equal(chamadas, 3, "três tentativas no total, e para");
});

test("queda de rede é transitória e também é insistida", async () => {
  let chamadas = 0;
  const buscar = async () => {
    chamadas += 1;
    if (chamadas === 1) throw new Error("fetch failed");
    return resposta(200, textoOk);
  };

  assert.equal(await chamarGemini({ ...argumentos, buscar }), '{"mapaId":"m1"}');
  assert.equal(chamadas, 2);
});

test("a requisição leva o system_instruction, o modo JSON e um sinal de timeout", async () => {
  // As asserções ficam DEPOIS da chamada, nunca dentro do `buscar`: o catch da
  // retentativa trata qualquer exceção como queda de rede, então uma asserção
  // que falhasse lá dentro seria engolida e viraria três tentativas silenciosas.
  let visto = null;
  const buscar = async (url, opcoes) => {
    visto = { url, opcoes, corpo: JSON.parse(opcoes.body) };
    return resposta(200, textoOk);
  };

  await chamarGemini({ ...argumentos, buscar });

  // O host é `generativelanguage`, não "gemini" — e o modelo entra no CAMINHO,
  // não no corpo. Trocar o modelo por um id morto é o erro mais provável aqui.
  assert.match(visto.url, /generativelanguage\.googleapis\.com/);
  assert.ok(visto.url.endsWith("/m:generateContent"), visto.url);
  assert.equal(visto.opcoes.headers["x-goog-api-key"], "k");
  assert.ok(visto.opcoes.signal, "sem sinal, o fetch espera para sempre");
  assert.equal(visto.corpo.system_instruction.parts[0].text, "s");
  assert.equal(visto.corpo.generationConfig.responseMimeType, "application/json");
});
