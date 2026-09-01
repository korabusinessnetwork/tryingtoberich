/**
 * As duas superfícies HTTP, com o servidor de verdade numa porta efêmera.
 *
 * O que este teste protege é o checklist de `docs/11_SEGURANCA`: token exigido
 * em `/jogo/*`, `/api/*` fora do alcance de quem não é localhost, rate limit, e
 * contrato de erro sem stack trace.
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { criarAppDoJogo, criarAppDoPainel } from "../src/http/servidor.mjs";
import { limitarTaxa } from "../src/http/guardas.mjs";
import { Nucleo } from "../src/nucleo.mjs";
import { REGRAS } from "../src/config.mjs";

const TOKEN = "t".repeat(32);

const config = {
  token: TOKEN, portaJogo: 0, portaPainel: 0, host: "127.0.0.1",
  usuarioTiktok: "", chaveGemini: "",
  longpollTimeoutMs: 150, combateMaxMs: 2000,
};

/** Duas portas de propósito: é o que impede o túnel de alcançar o painel. */
let base;
let basePainel;
let servidorDoJogo;
let servidorDoPainel;
let nucleo;

const escutar = (app) =>
  new Promise((resolve) => {
    const servidor = app.listen(0, "127.0.0.1", () => resolve(servidor));
  });

before(async () => {
  nucleo = new Nucleo({ config });
  await nucleo.carregarAnimacoesNaMemoria();
  servidorDoJogo = await escutar(criarAppDoJogo(nucleo, { token: TOKEN }));
  servidorDoPainel = await escutar(criarAppDoPainel(nucleo));
  base = `http://127.0.0.1:${servidorDoJogo.address().port}`;
  basePainel = `http://127.0.0.1:${servidorDoPainel.address().port}`;
});

after(() => {
  nucleo.longpoll.fecharTodos();
  servidorDoJogo.close();
  servidorDoPainel.close();
});

const comToken = { "x-bridge-token": TOKEN };

/* ---------------------------------------------------------------- */
/* Superfície pública                                                */
/* ---------------------------------------------------------------- */

test("sem X-Bridge-Token, /jogo responde 401", async () => {
  const resposta = await fetch(`${base}/jogo/mapa`);
  assert.equal(resposta.status, 401);
  assert.deepEqual(await resposta.json(), {
    erro: "token_invalido",
    mensagem: "Requisição sem X-Bridge-Token válido.",
  });
});

test("com token errado, /jogo também responde 401", async () => {
  const resposta = await fetch(`${base}/jogo/mapa`, { headers: { "x-bridge-token": "x".repeat(32) } });
  assert.equal(resposta.status, 401);
});

test("token de tamanho diferente não passa nem por acidente", async () => {
  const resposta = await fetch(`${base}/jogo/mapa`, { headers: { "x-bridge-token": "t" } });
  assert.equal(resposta.status, 401);
});

test("o long-poll segura a resposta e devolve 204 no timeout", async () => {
  const antes = Date.now();
  const resposta = await fetch(`${base}/jogo/eventos?desde=0`, { headers: comToken });
  const decorrido = Date.now() - antes;

  assert.equal(resposta.status, 204);
  assert.ok(decorrido >= 140, `segurou ${decorrido}ms, esperava ao menos o timeout de 150ms`);
});

test("o long-poll responde no instante do evento, não no timeout", async () => {
  const antes = Date.now();
  const pendente = fetch(`${base}/jogo/eventos?desde=0`, { headers: comToken });

  await new Promise((resolve) => setTimeout(resolve, 20));
  nucleo.longpoll.publicar([{
    id: 1, animacaoId: "sub_cometa", delta: 15, intensidade: 3,
    efeitoCurto: false, nomeDoador: "theuz", presenteNome: "Galaxy", emitidoEm: Date.now(),
  }]);

  const resposta = await pendente;
  const decorrido = Date.now() - antes;
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.ok(decorrido < 140, `respondeu em ${decorrido}ms: não esperou o timeout`);
  assert.equal(corpo.cursor, 1);
  assert.equal(corpo.eventos[0].animacaoId, "sub_cometa");
});

test("a resposta do long-poll não vaza slot nem presenteId para o jogo", async () => {
  const pendente = fetch(`${base}/jogo/eventos?desde=1`, { headers: comToken });
  await new Promise((resolve) => setTimeout(resolve, 20));
  nucleo.longpoll.publicar([{
    id: 2, animacaoId: "des_chumbo", delta: -8, intensidade: 2, efeitoCurto: false,
    nomeDoador: null, presenteNome: "Hand Hearts", emitidoEm: Date.now(),
    slot: 4, presenteId: "sem-hand-hearts", repeticoes: 1, recebidoEm: Date.now(),
  }]);

  const corpo = await (await pendente).json();
  assert.deepEqual(
    Object.keys(corpo.eventos[0]).sort(),
    ["animacaoId", "delta", "efeitoCurto", "emitidoEm", "id", "intensidade", "nomeDoador", "presenteNome"],
    "o motor no Roblox é burro de propósito: recebe animação e delta, e mais nada (ADR-007)",
  );
});

test("estado do jogo fora da faixa é descartado, não corrige o estado", async () => {
  const enviar = (corpo) =>
    fetch(`${base}/jogo/estado`, {
      method: "POST",
      headers: { ...comToken, "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });

  assert.equal((await enviar({ plataformaReferencia: 184, plataformaMaxima: 191, emAnimacao: false })).status, 204);
  assert.equal((await enviar({ plataformaReferencia: -5, plataformaMaxima: 191, emAnimacao: false })).status, 204);
  assert.equal((await enviar({ nada: "a ver" })).status, 204, "sempre 204: o jogo nunca espera a ponte");
});

test("o vestiário não abre com a sessão rodando (ADR-011)", async () => {
  const resposta = await fetch(`${base}/jogo/catalogo-itens?busca=a`, { headers: comToken });
  const corpo = await resposta.json();
  assert.equal(resposta.status, 400);
  assert.equal(corpo.erro, "busca_curta");
});

/* ---------------------------------------------------------------- */
/* Superfície local                                                  */
/* ---------------------------------------------------------------- */

test("/api responde em localhost, sem token", async () => {
  const corpo = await (await fetch(`${basePainel}/api/modalidades`)).json();
  assert.deepEqual(corpo.modalidades, [{ id: "escalada", nome: "Escalada", disponivel: true }]);
});

test("/api/animacoes serve as 20 da biblioteca", async () => {
  const corpo = await (await fetch(`${basePainel}/api/animacoes`)).json();
  assert.equal(corpo.animacoes.length, 20);
  assert.equal(corpo.animacoes.filter((a) => a.direcao === "subida").length, 10);
});

test("/api/cenarios lista as fixtures, para o painel oferecer o modo sem live", async () => {
  const corpo = await (await fetch(`${basePainel}/api/cenarios`)).json();
  assert.ok(corpo.cenarios.includes("04-combate-de-presentes"));
});

test("erro de domínio vira o contrato de erro, sem stack trace", async () => {
  const resposta = await fetch(`${basePainel}/api/presets/nao-existe`);
  const corpo = await resposta.json();

  assert.equal(resposta.status, 404);
  assert.deepEqual(Object.keys(corpo).sort(), ["erro", "mensagem"]);
  assert.equal(corpo.erro, "preset_nao_encontrado");
  assert.equal(JSON.stringify(corpo).includes("at "), false, "nada de stack trace na resposta");
});

test("preset fora das regras R1 e R2 é recusado com motivo legível", async () => {
  const resposta = await fetch(`${basePainel}/api/presets/teste-invalido`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      streamerId: "local", nome: "Inválido", modalidade: "escalada",
      slots: [
        { posicao: 1, presenteId: "sem-rose", animacaoId: "sub_pulo", delta: 0, intensidade: 1 },
      ],
    }),
  });

  assert.equal(resposta.status, 400);
  assert.equal((await resposta.json()).erro, "preset_invalido", "delta 0 não é presente");
});

test("preset com o mesmo presente em dois slots é recusado (R1.4)", async () => {
  const slot = (posicao) => ({ posicao, presenteId: "sem-rose", animacaoId: "sub_pulo", delta: 2, intensidade: 1 });
  const resposta = await fetch(`${basePainel}/api/presets/teste-repetido`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ streamerId: "local", nome: "Repetido", modalidade: "escalada", slots: [slot(1), slot(2)] }),
  });

  assert.equal(resposta.status, 400);
  assert.equal((await resposta.json()).erro, "presente_repetido");
});

test("gerar mapa sem GEMINI_API_KEY diz que quem chama é a ponte", async () => {
  const resposta = await fetch(`${basePainel}/api/mapas/gerar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ descricao: "torre vulcânica ao entardecer" }),
  });

  assert.equal(resposta.status, 503);
  assert.equal((await resposta.json()).erro, "gemini_sem_chave");
});

test("stop sem sessão não explode, responde o contrato de erro", async () => {
  const resposta = await fetch(`${basePainel}/api/sessao/stop`, { method: "POST" });
  assert.equal(resposta.status, 409);
  assert.equal((await resposta.json()).erro, "sem_sessao");
});

test("rota desconhecida devolve o contrato de erro, não HTML do Express", async () => {
  for (const onde of [base, basePainel]) {
    const resposta = await fetch(`${onde}/nao-existe`);
    assert.equal(resposta.status, 404);
    assert.equal((await resposta.json()).erro, "rota_desconhecida");
  }
});

test("o painel simplesmente não existe na porta que o túnel publica", async () => {
  // Este é o teste que vale: mesmo que o túnel seja configurado apontando para
  // a raiz, /api não está nesta porta. É defesa por construção, não por regra.
  const resposta = await fetch(`${base}/api/presets`, { headers: comToken });
  assert.equal(resposta.status, 404);
  assert.equal((await resposta.json()).erro, "rota_desconhecida");
});

test("e o jogo não existe na porta do painel", async () => {
  const resposta = await fetch(`${basePainel}/jogo/mapa`, { headers: comToken });
  assert.equal(resposta.status, 404);
});

/* ---------------------------------------------------------------- */
/* Rate limit                                                        */
/* ---------------------------------------------------------------- */

test("acima de 60 requisições por minuto é abuso, não uso", () => {
  let instante = 0;
  const limite = limitarTaxa({ agora: () => instante });
  const req = { ip: "1.2.3.4", path: "/jogo/eventos" };

  let bloqueios = 0;
  const res = { status: () => ({ json: () => { bloqueios += 1; } }) };

  for (let i = 0; i < REGRAS.LIMITE_JOGO_POR_MINUTO; i += 1) limite(req, res, () => {});
  assert.equal(bloqueios, 0, "o Roblox legítimo faz ~3 por minuto; 60 ainda passa");

  limite(req, res, () => {});
  assert.equal(bloqueios, 1);

  instante += 60_000;
  let passou = false;
  limite(req, res, () => { passou = true; });
  assert.equal(passou, true, "a janela vira e libera");
});
