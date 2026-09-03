/**
 * A ponte inteira, ponta a ponta, sem live e sem Roblox.
 *
 * Um cenário de fixture entra pelo conector, atravessa casamento, combate e
 * long-poll, e sai pela superfície pública exatamente como o Roblox veria. É a
 * prova de que o Bloco 1 é entregável e testável sozinho.
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { criarAppDoJogo } from "../src/http/servidor.mjs";
import { Nucleo } from "../src/nucleo.mjs";
import { apagar, caminhoDeDados } from "../src/repos/arquivo.mjs";
import { salvarPreset } from "../src/repos/presets.mjs";
import { carregarExemplo } from "../src/repos/fixtures.mjs";

const TOKEN = "e".repeat(32);
const PRESET_ID = "teste-ponta-a-ponta";

const config = {
  token: TOKEN, portaJogo: 0, portaPainel: 0, host: "127.0.0.1",
  usuarioTiktok: "", chaveGemini: "",
  longpollTimeoutMs: 10_000, combateMaxMs: 2000,
};

let base;
let servidor;
let nucleo;

before(async () => {
  await salvarPreset({ ...(await carregarExemplo("preset-escalada-padrao")), presetId: PRESET_ID });

  nucleo = new Nucleo({ config });
  await nucleo.carregarAnimacoesNaMemoria();
  servidor = criarAppDoJogo(nucleo, { token: TOKEN }).listen(0, "127.0.0.1");
  await new Promise((resolve) => servidor.once("listening", resolve));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  if (nucleo.sessaoAtiva) await nucleo.encerrarSessao().catch(() => {});
  nucleo.longpoll.fecharTodos();
  servidor.close();
  await apagar(caminhoDeDados("presets", `${PRESET_ID}.json`));
});

const comToken = { "x-bridge-token": TOKEN };

/** O laço que o Luau faz: pede, recebe, guarda o cursor, pede de novo. */
async function laçoDoJogo(ate, colhidos = []) {
  let cursor = 0;
  while (Date.now() < ate) {
    const resposta = await fetch(`${base}/jogo/eventos?desde=${cursor}`, {
      headers: comToken,
      signal: AbortSignal.timeout(Math.max(50, ate - Date.now())),
    }).catch(() => null);

    if (!resposta) break;
    if (resposta.status === 204) continue;

    const corpo = await resposta.json();
    cursor = corpo.cursor;
    colhidos.push(...corpo.eventos);
  }
  return colhidos;
}

test("o combate atravessa a ponte e sai pelo long-poll do jeito que o Roblox lê", async () => {
  // O jogo tem que estar polling ANTES da sessão: com o jogo offline, evento é
  // descartado em vez de acumulado (F7), e é isso que a ponte deve fazer.
  const colhidos = [];
  const laco = laçoDoJogo(Date.now() + 2600, colhidos);
  await new Promise((resolve) => setTimeout(resolve, 100));

  await nucleo.iniciarSessao({ presetId: PRESET_ID, cenario: "04-combate-de-presentes" });
  await laco;

  assert.deepEqual(
    colhidos.map((e) => ({ animacaoId: e.animacaoId, delta: e.delta, intensidade: e.intensidade, efeitoCurto: e.efeitoCurto })),
    [
      { animacaoId: "sub_shuriken_vento", delta: 40, intensidade: 3, efeitoCurto: false },
      { animacaoId: "des_meteoro_igneo", delta: -49, intensidade: 5, efeitoCurto: false },
    ],
    "o Galaxy dispara na hora; os cinco seguintes brigam e a descida vence por 49",
  );

  assert.deepEqual(
    Object.keys(colhidos[0]).sort(),
    ["animacaoId", "delta", "efeitoCurto", "emitidoEm", "id", "intensidade", "nomeDoador", "presenteNome"],
    "o jogo recebe animação e delta, e nada de slot nem presenteId (ADR-007)",
  );

  const resumo = await nucleo.encerrarSessao();
  assert.equal(resumo.resumo.totalPresentes, 2, "dois disparos: o imediato e o resultado do combate");
  assert.deepEqual(resumo.eventos, [], "encerrar descarta o detalhe por evento (F5)");
  await apagar(caminhoDeDados("sessoes", `${resumo.sessaoId}.json`));
});

test("o painel acompanha a mesma sessão pelo SSE", async () => {
  const recebidos = [];
  const pararDeOuvir = nucleo.ouvir((evento, dados) => recebidos.push({ evento, dados }));

  try {
    const laco = laçoDoJogo(Date.now() + 1500);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await nucleo.iniciarSessao({ presetId: PRESET_ID, cenario: "05-presente-nao-mapeado" });
    await laco;

    const naoMapeado = recebidos.find((r) => r.evento === "naoMapeado");
    assert.equal(naoMapeado.dados.presenteNome, "Doughnut Gigante");
    assert.equal(naoMapeado.dados.contagem, 1, "o painel mostra o que o streamer está deixando na mesa");

    const presente = recebidos.find((r) => r.evento === "presente");
    assert.equal(presente.dados.animacaoId, "sub_shuriken_vento");
    assert.equal(typeof presente.dados.latenciaMs, "number", "disparo imediato tem latência medida");
    assert.ok(presente.dados.latenciaMs < 1000, `latência da ponte foi ${presente.dados.latenciaMs}ms`);

    assert.equal(
      JSON.stringify(recebidos).includes("Terceiro Espectador"),
      false,
      "o SSE não carrega nickname de quem mandou presente não mapeado",
    );

    const resumo = await nucleo.encerrarSessao();
    await apagar(caminhoDeDados("sessoes", `${resumo.sessaoId}.json`));
  } finally {
    pararDeOuvir();
  }
});

test("com o jogo sem fazer long-poll, o evento é descartado e não acumulado (F7)", async () => {
  // Núcleo próprio: os testes acima deixaram o jogo marcado como online, e a
  // janela de offline é de 60s. Reaproveitar aqui mediria o teste anterior.
  const sozinho = new Nucleo({ config });
  await sozinho.carregarAnimacoesNaMemoria();

  assert.equal(sozinho.estado.jogo, "offline", "ninguém fez long-poll ainda");

  await sozinho.iniciarSessao({ presetId: PRESET_ID, cenario: "01-presente-unico" });
  await new Promise((resolve) => setTimeout(resolve, 300));

  assert.ok(
    sozinho.longpoll.descartadosComJogoOffline > 0,
    "aplicar uma pilha de deltas de uma vez quando o Roblox voltasse seria pior que perder",
  );
  assert.equal(sozinho.longpoll.cursor, 0, "nada ficou guardado esperando o jogo aparecer");

  const resumo = await sozinho.encerrarSessao();
  await apagar(caminhoDeDados("sessoes", `${resumo.sessaoId}.json`));
});

test("duas sessões ao mesmo tempo é recusado", async () => {
  const sozinho = new Nucleo({ config });
  await sozinho.carregarAnimacoesNaMemoria();
  await sozinho.iniciarSessao({ presetId: PRESET_ID, cenario: "01-presente-unico" });

  try {
    await assert.rejects(
      () => sozinho.iniciarSessao({ presetId: PRESET_ID, cenario: "01-presente-unico" }),
      (erro) => erro.codigo === "sessao_em_andamento",
    );
  } finally {
    const resumo = await sozinho.encerrarSessao();
    await apagar(caminhoDeDados("sessoes", `${resumo.sessaoId}.json`));
  }
});
