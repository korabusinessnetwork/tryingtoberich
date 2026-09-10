/**
 * A busca do item 1, dos dois lados.
 *
 * O ADR-P05 pede busca por usuário da TikTok, e-mail ou licença **sem o
 * operador dizer qual dos três está digitando**. Isso é uma regra, e uma regra
 * que vale para as duas implementações: a falsa filtra em memória e a real
 * monta um `or=(...)` de PostgREST, e as duas precisam achar as mesmas linhas.
 *
 * O que não dá para testar aqui é o Postgres executando o `ilike`. O que dá, e
 * é onde mora o erro provável, é a URL que a implementação real produz: filtro
 * mal montado com uma vírgula colada de um e-mail vira 400 numa tela que só
 * queria filtrar.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { casaBusca, criarDadosDeExemplo, normalizarTermo } from "../src/dados/exemplo.js";
import { criarDadosDoSupabase, entreAspas, montarFiltroDeBusca } from "../src/dados/supabase.js";

const AGORA = new Date("2026-09-10T12:00:00.000Z");

/* ---------------------------------------------------------------- */
/* A regra, na base falsa                                            */
/* ---------------------------------------------------------------- */

const achar = async (termo) => {
  const dados = criarDadosDeExemplo({ agora: AGORA });
  const { assinantes } = await dados.listarAssinantes({ busca: termo });
  return assinantes.map((a) => a.streamerId);
};

test("acha pelo usuário da TikTok", async () => {
  assert.deepEqual(await achar("livia.parkour"), ["livia-parkour"]);
});

test("acha pelo e-mail", async () => {
  assert.deepEqual(await achar("elena@vertical.mx"), ["elena-vertical"]);
});

test("acha pela chave de licença", async () => {
  assert.deepEqual(await achar("KORA-C904-16FD-B2E3"), ["tower-guy"]);
});

test("acha por um TRECHO da chave, que é o que se cola de um e-mail de suporte", async () => {
  assert.deepEqual(await achar("16FD"), ["tower-guy"]);
});

test("a busca ignora caixa e espaço nas pontas", async () => {
  assert.deepEqual(await achar("  ELENA@VERTICAL.MX  "), ["elena-vertical"]);
});

test("busca vazia devolve todo mundo", async () => {
  const todos = await achar("");
  assert.ok(todos.length >= 7);
});

test("termo que não casa devolve lista vazia, e não a lista inteira", async () => {
  // Filtro que "falha aberto" é pior que filtro que não acha: o operador leria
  // a lista inteira achando que são os resultados da busca dele.
  assert.deepEqual(await achar("zzz-nao-existe"), []);
});

test("um assinante sem @ da TikTok ainda é achado pelo e-mail", async () => {
  assert.deepEqual(await achar("demo@korabusiness.com"), ["kora-demo"]);
});

test("um assinante sem licença não quebra a busca por chave", async () => {
  const dados = criarDadosDeExemplo({ agora: AGORA });
  const { assinantes } = await dados.listarAssinantes({ busca: "KORA-" });
  assert.equal(assinantes.some((a) => a.streamerId === "novo-ainda-sem-instalar"), false);
});

test("casaBusca é pura e responde os três campos", () => {
  const assinante = {
    usuarioTiktok: "duda.sobe",
    email: "duda.sobe@outlook.com",
    licenca: "KORA-4E7C-2255-90AA",
  };
  assert.equal(casaBusca(assinante, "duda"), true);
  assert.equal(casaBusca(assinante, "outlook"), true);
  assert.equal(casaBusca(assinante, "2255"), true);
  assert.equal(casaBusca(assinante, "eduarda"), false);
  assert.equal(normalizarTermo("  ABC  "), "abc");
});

/* ---------------------------------------------------------------- */
/* A mesma regra, na implementação real: a URL que ela monta          */
/* ---------------------------------------------------------------- */

test("o filtro real varre os três campos, e só eles", () => {
  const filtro = montarFiltroDeBusca("livia");
  assert.match(filtro, /usuario_tiktok\.ilike\./);
  assert.match(filtro, /email\.ilike\./);
  assert.match(filtro, /licenca\.ilike\./);
  // `nome` fora de propósito: o ADR-P05 lista três campos, e buscar por nome
  // traria homônimo para uma tela onde o operador está identificando UMA pessoa.
  assert.equal(filtro.includes("nome.ilike"), false);
});

test("busca vazia não produz filtro, para não mandar or=() ao PostgREST", () => {
  assert.equal(montarFiltroDeBusca(""), null);
  assert.equal(montarFiltroDeBusca("   "), null);
  assert.equal(montarFiltroDeBusca(null), null);
});

test("vírgula e parêntese colados de um e-mail não quebram o filtro", () => {
  // Sem aspas no valor, a vírgula viraria separador de condição e o PostgREST
  // responderia 400 na tela do operador.
  const filtro = montarFiltroDeBusca('a,b(c)"d');
  assert.match(filtro, /^\(usuario_tiktok\.ilike\."/);
  assert.equal(entreAspas('a"b'), '"a\\"b"');
  assert.equal(entreAspas("a\\b"), '"a\\\\b"');
});

test("a consulta real pede a VISÃO, porque a busca casa a chave de licença", async () => {
  const chamadas = [];
  const dados = criarDadosDoSupabase({
    url: "https://x.supabase.co",
    chave: "chave-de-servico",
    buscar: async (url) => {
      chamadas.push(url);
      return { ok: true, status: 200, json: async () => [] };
    },
  });

  await dados.listarAssinantes({ busca: "16FD", limite: 10 });

  assert.equal(chamadas.length, 1);
  // A chave mora em `licencas` e o e-mail em `assinantes`: só a visão junta as
  // duas, e é por isso que a lista lê a visão e não a tabela.
  assert.match(chamadas[0], /\/rest\/v1\/ficha_do_assinante\?/);
  assert.match(chamadas[0], /or=\(/);
  assert.match(chamadas[0], /order=criado_em\.desc/);
  // Uma linha a mais que o pedido: é como se sabe que existe página seguinte.
  assert.match(chamadas[0], /limit=11/);
});

test("a chave de serviço vai no cabeçalho, nunca na URL", async () => {
  let visto = null;
  const dados = criarDadosDoSupabase({
    url: "https://x.supabase.co",
    chave: "chave-secreta-de-servico",
    buscar: async (url, opcoes) => {
      visto = { url, opcoes };
      return { ok: true, status: 200, json: async () => [] };
    },
  });

  await dados.listarAssinantes({ busca: "livia" });

  assert.equal(visto.url.includes("chave-secreta-de-servico"), false);
  assert.equal(visto.opcoes.headers.apikey, "chave-secreta-de-servico");
  assert.equal(visto.opcoes.headers.authorization, "Bearer chave-secreta-de-servico");
});
