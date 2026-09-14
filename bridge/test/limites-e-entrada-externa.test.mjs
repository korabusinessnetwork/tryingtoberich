/**
 * O que chega de fora, e o que cresce sem parar.
 *
 * Dois grupos de correção que compartilham a mesma raiz: confiança em dado que
 * a ponte não produziu. A resposta de uma API pública não contratada
 * (ADR-011), um cabeçalho HTTP, um ip de quem chamou. Ver 11_SEGURANCA,
 * camada 3.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { CacheComTeto } from "../src/cacheComTeto.mjs";
import { interpretarFaixa } from "../src/http/overlay.mjs";
import { limitarTaxa } from "../src/http/guardas.mjs";
import { urlDeImagemConfiavel, ClienteRoblox } from "../src/roblox/catalogo-itens.mjs";
import { ClienteSkins } from "../src/roblox/skins.mjs";
import { RegistroDeLongPoll } from "../src/longpoll/registro.mjs";
import { anotarItemDoAcervo } from "../src/repos/acervo.mjs";

/* ---------------------------------------------------------------- */
/* 3 — a URL da miniatura vem DENTRO da resposta do Roblox           */
/* ---------------------------------------------------------------- */

test("só URL do Roblox, em https, é buscada", () => {
  for (const boa of [
    "https://tr.rbxcdn.com/abc/150/150/Image/Png",
    "https://t5.rbxcdn.com/x.png",
    "https://www.roblox.com/asset/?id=1",
    "https://rbxcdn.com/x.png",
  ]) {
    assert.ok(urlDeImagemConfiavel(boa), `${boa} é do Roblox`);
  }

  for (const ruim of [
    "http://tr.rbxcdn.com/x.png",              // sem TLS
    "https://rbxcdn.com.evil.com/x.png",       // sufixo colado
    "https://evilrbxcdn.com/x.png",            // sem o ponto
    "https://rbxcdn.com@evil.com/x.png",       // userinfo: o host é evil.com
    "http://127.0.0.1:8788/api/sessao/stop",   // a própria ponte
    "http://169.254.169.254/latest/meta-data", // metadados de nuvem
    "file:///etc/passwd",
    "",
    null,
    "nem url é",
  ]) {
    assert.equal(urlDeImagemConfiavel(ruim), false, `${ruim} não pode ser buscada`);
  }
});

test("thumbnail apontando para fora não vira requisição", async () => {
  const visitadas = [];
  const cliente = new ClienteRoblox({
    buscarNaRede: async (url) => {
      visitadas.push(url);
      return {
        ok: true,
        json: async () => ({ data: [{ state: "Completed", imageUrl: "http://127.0.0.1:8788/api/sessao/stop" }] }),
      };
    },
  });

  assert.equal(await cliente.iconeDoItem(123), null, "ícone falha, o vestiário segue");
  assert.equal(visitadas.length, 1, "só a consulta de thumbnail saiu; a URL de fora não foi aberta");
});

/* ---------------------------------------------------------------- */
/* 4 — o cabeçalho Range                                             */
/* ---------------------------------------------------------------- */

test("Range inválido não vira content-length negativo nem NaN", () => {
  assert.deepEqual(interpretarFaixa("bytes=0-99", 1000), { inicio: 0, fim: 99 });
  assert.deepEqual(interpretarFaixa("bytes=0-", 1000), { inicio: 0, fim: 999 });
  assert.deepEqual(interpretarFaixa("bytes=0-999999", 1000), { inicio: 0, fim: 999 }, "pedir demais é normal");
  assert.deepEqual(interpretarFaixa("bytes=-500", 1000), { inicio: 500, fim: 999 }, "os ÚLTIMOS 500");

  for (const ruim of ["bytes=abc-xyz", "bytes=500-100", "bytes=1000-", "bytes=", "", null, "0-99", "bytes=0-99,200-299"]) {
    assert.equal(interpretarFaixa(ruim, 1000), null, `${JSON.stringify(ruim)} deveria virar 416`);
  }
  assert.equal(interpretarFaixa("bytes=0-99", 0), null, "arquivo vazio não tem faixa");
});

/* ---------------------------------------------------------------- */
/* 6 — cache que não cresce para sempre                              */
/* ---------------------------------------------------------------- */

test("o cache descarta o mais antigo ao estourar o teto", () => {
  const cache = new CacheComTeto({ teto: 3, ttlMs: 1000 });
  for (const chave of ["a", "b", "c", "d"]) cache.gravar(chave, chave, 0);

  assert.equal(cache.tamanho, 3);
  assert.equal(cache.ler("a", 0), undefined, "o primeiro saiu");
  assert.equal(cache.ler("d", 0), "d");
});

test("regravar rejuvenesce a chave, senão ela sai antes das mais velhas", () => {
  const cache = new CacheComTeto({ teto: 2, ttlMs: 1000 });
  cache.gravar("a", 1, 0);
  cache.gravar("b", 2, 0);
  cache.gravar("a", 3, 0);
  cache.gravar("c", 4, 0);

  assert.equal(cache.ler("b", 0), undefined, "b virou o mais antigo");
  assert.equal(cache.ler("a", 0), 3);
  assert.equal(cache.ler("c", 0), 4);
});

test("vencido some do mapa, não só do valor devolvido", () => {
  const cache = new CacheComTeto({ teto: 10, ttlMs: 100 });
  cache.gravar("a", 1, 0);
  assert.equal(cache.ler("a", 50), 1);
  assert.equal(cache.ler("a", 100), undefined);
  assert.equal(cache.tamanho, 0, "a CHAVE também saiu");
});

test("mil nicks diferentes não deixam mil restos na memória", async () => {
  const cliente = new ClienteSkins({
    teto: 50,
    buscarNaRede: async (url) => ({
      ok: true,
      json: async () => (String(url).includes("usernames")
        ? { data: [{ id: 42 }] }
        : { playerAvatarType: "R15", assets: [], data: [] }),
    }),
  });

  for (let i = 0; i < 500; i += 1) await cliente.buscarSkin(`nick${i}`);
  assert.ok(await cliente.buscarSkin("nick499"), "o mais recente continua lá");
});

/* ---------------------------------------------------------------- */
/* 5 — o userId que vem da resposta do Roblox                        */
/* ---------------------------------------------------------------- */

test("userId que não é inteiro não entra na URL seguinte", async () => {
  for (const idEstranho of ["1/../../algo", "42", 4.2, null, -1, { id: 1 }]) {
    const visitadas = [];
    const cliente = new ClienteSkins({
      buscarNaRede: async (url) => {
        visitadas.push(String(url));
        return { ok: true, json: async () => ({ data: [{ id: idEstranho }] }) };
      },
    });

    assert.equal(await cliente.resolverNick("alguem"), null, `${JSON.stringify(idEstranho)} não é userId`);
    assert.equal(visitadas.length, 1, "parou na primeira chamada");
  }
});

/* ---------------------------------------------------------------- */
/* 7 — esperas de long-poll seguradas ao mesmo tempo                 */
/* ---------------------------------------------------------------- */

test("o long-poll não segura conexão sem teto", () => {
  const registro = new RegistroDeLongPoll({ timeoutMs: 60_000, agora: () => 1000 });
  const respostas = [];

  const fingirResposta = () => {
    const r = {
      encerrada: false,
      status(codigo) { r.codigo = codigo; return r; },
      end() { r.encerrada = true; },
      json() { r.encerrada = true; },
      on() {},
    };
    respostas.push(r);
    return r;
  };

  for (let i = 0; i < 100; i += 1) registro.registrar(fingirResposta(), { desde: 0 });

  assert.ok(registro.pendentes <= 32, `segurou ${registro.pendentes}, o teto é 32`);
  assert.ok(respostas[0].encerrada, "a MAIS ANTIGA foi dispensada com 204");
  assert.equal(respostas[0].codigo, 204, "204 é a resposta normal de timeout: o Roblox pergunta de novo");
  assert.ok(!respostas.at(-1).encerrada, "a mais recente continua esperando");

  registro.fecharTodos();
});

/* ---------------------------------------------------------------- */
/* 8 — janelas de rate limit que nunca saíam do mapa                 */
/* ---------------------------------------------------------------- */

test("ip que passa uma vez e some não fica no mapa para sempre", () => {
  let relogio = 0;
  const guarda = limitarTaxa({ porMinuto: 60, agora: () => relogio });

  const chamar = (ip) => {
    let respondeu = null;
    guarda(
      { ip, path: "/jogo/eventos", method: "GET" },
      { status: (c) => ({ json: () => { respondeu = c; } }) },
      () => { respondeu = 200; },
    );
    return respondeu;
  };

  for (let i = 0; i < 500; i += 1) assert.equal(chamar(`10.0.0.${i}`), 200);
  assert.equal(guarda.janelasAbertas, 500, "dentro do minuto, todas as janelas são legítimas");

  // Passado o minuto, a varredura tira todas e o ip de novo entra limpo.
  relogio += 61_000;
  assert.equal(chamar("10.0.0.0"), 200, "janela vencida não conta contra ninguém");
  assert.equal(guarda.janelasAbertas, 1, "as 499 que sumiram saíram do mapa; sem a varredura ficariam 500");

  // E o limite continua valendo para quem insiste de verdade.
  for (let i = 0; i < 60; i += 1) chamar("10.0.0.0");
  assert.equal(chamar("10.0.0.0"), 429, "abuso continua sendo barrado");
});

/* ---------------------------------------------------------------- */
/* 10 — status de moderação do acervo                                */
/* ---------------------------------------------------------------- */

test("status de moderação desconhecido é recusado com motivo legível", async () => {
  await assert.rejects(
    () => anotarItemDoAcervo("texturas", "textura_gelo", { status: "quase-aprovado" }),
    (erro) => {
      assert.equal(erro.codigo, "status_invalido");
      assert.equal(erro.status, 400);
      assert.match(erro.message, /aprovado/, "a mensagem diz quais valem");
      return true;
    },
  );
});
