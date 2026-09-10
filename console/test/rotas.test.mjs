/**
 * As rotas do console: o salto de HTTP entre o navegador e a camada de dados.
 *
 * Elas existem por causa da chave de serviço, que não pode chegar ao navegador,
 * e é isso que este arquivo defende: o que sai por `/api` é o envelope do
 * contrato e mais nada. Nome do adaptador ligado, sim. URL do projeto e chave,
 * nunca, nem em resposta de erro.
 *
 * O middleware é montado em `/api` pelo Vite, então `req.url` chega SEM o
 * prefixo. O teste monta o pedido do mesmo jeito, senão estaria testando um
 * roteamento que não é o que roda.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { montarRotas } from "../servidor/rotas.js";

/** Um `res` de mentira, com o suficiente para o middleware escrever nele. */
function respostaFalsa() {
  const res = {
    statusCode: 200,
    cabecalhos: {},
    corpo: null,
    setHeader(nome, valor) {
      this.cabecalhos[nome] = valor;
    },
    end(corpo) {
      this.corpo = corpo;
      this.pronto = true;
    },
  };
  return res;
}

async function pedir(rotas, metodo, url, corpo = null) {
  const req = corpo
    ? Object.assign(Readable.from([Buffer.from(JSON.stringify(corpo))]), { method: metodo, url })
    : Object.assign(Readable.from([]), { method: metodo, url });

  const res = respostaFalsa();
  let caiuNoProximo = false;
  await rotas(req, res, () => {
    caiuNoProximo = true;
  });

  return { res, caiuNoProximo, json: res.corpo ? JSON.parse(res.corpo) : null };
}

/** Sem as duas variáveis, a base falsa. É a regra de escolha, e a única. */
const rotas = () => montarRotas({});

test("a lista responde o envelope do contrato", async () => {
  const { res, json } = await pedir(rotas(), "GET", "/assinantes");

  assert.equal(res.statusCode, 200);
  assert.equal(json.ok, true);
  assert.ok(Array.isArray(json.assinantes));
});

test("a busca chega pela querystring e filtra", async () => {
  const { json } = await pedir(rotas(), "GET", "/assinantes?busca=elena%40vertical.mx");

  assert.equal(json.ok, true);
  assert.equal(json.assinantes.length, 1);
  assert.equal(json.assinantes[0].streamerId, "elena-vertical");
});

test("a ficha responde por streamerId", async () => {
  const { json } = await pedir(rotas(), "GET", "/assinantes/tower-guy");

  assert.equal(json.ok, true);
  assert.equal(json.ficha.streamerId, "tower-guy");
  assert.equal(json.ficha.licencaEstado, "expirada");
});

test("a fonte é dita pelo nome, e a chave e a URL nunca saem", async () => {
  const comBanco = montarRotas({
    SUPABASE_URL: "https://projetosecreto.supabase.co",
    SUPABASE_SERVICE_KEY: "chave-de-servico-secreta",
  });
  const { json, res } = await pedir(comBanco, "GET", "/fonte");

  assert.equal(json.fonte, "supabase");
  assert.equal(res.corpo.includes("chave-de-servico-secreta"), false);
  assert.equal(res.corpo.includes("projetosecreto"), false);
});

test("sem configuração, a fonte é o exemplo", async () => {
  const { json } = await pedir(rotas(), "GET", "/fonte");
  assert.equal(json.fonte, "exemplo");
});

test("caminho desconhecido volta para o Vite servir a página", async () => {
  const { caiuNoProximo } = await pedir(rotas(), "GET", "/nao-existe");
  assert.equal(caiuNoProximo, true);
});

test("a resposta do console nunca fica em cache", async () => {
  // Dado vivo guardado em cache é resposta que mente sobre quem está conectado.
  const { res } = await pedir(rotas(), "GET", "/saude");
  assert.equal(res.cabecalhos["cache-control"], "no-store");
});

test("o status HTTP acompanha o motivo, para a aba de rede não mentir", async () => {
  const semBase = montarRotas({
    SUPABASE_URL: "https://x.supabase.co",
    SUPABASE_SERVICE_KEY: "chave",
  });
  // A implementação real está ligada e não há base nenhuma no ar: o `fetch`
  // falha, e o console tem de dizer isso com um status que não seja 200.
  const { res, json } = await pedir(semBase, "GET", "/assinantes");

  assert.equal(json.ok, false);
  assert.notEqual(res.statusCode, 200);
});

test("POST de ação grava no log e devolve a ação gravada", async () => {
  const minhasRotas = rotas();
  const gravada = await pedir(minhasRotas, "POST", "/acoes", {
    acao: "licenca_reemitida",
    streamerId: "duda-sobe",
    detalhe: { motivo: "chave vazada" },
  });

  assert.equal(gravada.json.ok, true);
  assert.equal(gravada.json.acao.acao, "licenca_reemitida");

  const lidas = await pedir(minhasRotas, "GET", "/acoes");
  assert.equal(lidas.json.acoes.length, 1);
  assert.equal(lidas.json.acoes[0].streamerId, "duda-sobe");
});

test("corpo que não é JSON vira pedido inválido, e não derruba o servidor", async () => {
  const req = Object.assign(Readable.from([Buffer.from("isto não é json")]), {
    method: "POST",
    url: "/acoes",
  });
  const res = respostaFalsa();
  await montarRotas({})(req, res, () => {});

  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.corpo).ok, false);
});
