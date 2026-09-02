/**
 * As rotas que o painel ganhou depois do Bloco 3, com o servidor de verdade
 * numa porta efêmera — mesmo arranjo de `http.test.mjs`.
 *
 * O que elas têm em comum é serem tudo o que a ponte já sabia fazer e o painel
 * não pedia: prontidão de mapa salvo (ADR-004), troca de preset ao vivo (R7),
 * reinício da corrida (R6), histórico (F5) e a anotação do acervo.
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";

import { criarAppDoJogo, criarAppDoPainel } from "../src/http/servidor.mjs";
import { Nucleo } from "../src/nucleo.mjs";
import { caminhoDeDados } from "../src/repos/arquivo.mjs";

const TOKEN = "t".repeat(32);

const config = {
  token: TOKEN, portaJogo: 0, portaPainel: 0, host: "127.0.0.1",
  usuarioTiktok: "", chaveGemini: "",
  longpollTimeoutMs: 150, combateMaxMs: 2000,
};

let base;
let basePainel;
let servidorDoJogo;
let servidorDoPainel;
let nucleo;

/** O acervo de verdade é restaurado no fim: o teste ESCREVE nele. */
let acervoOriginal;

const escutar = (app) =>
  new Promise((resolve) => {
    const servidor = app.listen(0, "127.0.0.1", () => resolve(servidor));
  });

const comToken = { "x-bridge-token": TOKEN };
const json = { "content-type": "application/json" };

before(async () => {
  acervoOriginal = await readFile(caminhoDeDados("acervo.json"), "utf8");
  nucleo = new Nucleo({ config });
  await nucleo.carregarAnimacoesNaMemoria();
  servidorDoJogo = await escutar(criarAppDoJogo(nucleo, { token: TOKEN }));
  servidorDoPainel = await escutar(criarAppDoPainel(nucleo));
  base = `http://127.0.0.1:${servidorDoJogo.address().port}`;
  basePainel = `http://127.0.0.1:${servidorDoPainel.address().port}`;
});

after(async () => {
  nucleo.longpoll.fecharTodos();
  servidorDoJogo.close();
  servidorDoPainel.close();
  await rm(caminhoDeDados("presets", "teste-apagavel.json"), { force: true });
  // Devolve o acervo byte a byte: ele é versionado, e um teste que suja o
  // repositório é um teste que ninguém roda duas vezes.
  const { escreverJsonAtomico } = await import("../src/repos/arquivo.mjs");
  await escreverJsonAtomico(caminhoDeDados("acervo.json"), JSON.parse(acervoOriginal));
});

/* ---------------------------------------------------------------- */
/* ADR-004 — prontidão de um mapa que já estava salvo                */
/* ---------------------------------------------------------------- */

test("a prontidão de um mapa salvo é respondida sem precisar gerar de novo", async () => {
  const mapas = await (await fetch(`${basePainel}/api/mapas`)).json();
  if (mapas.mapas.length === 0) return; // máquina sem mapa gerado ainda

  const { mapaId } = mapas.mapas[0];
  const resposta = await fetch(`${basePainel}/api/mapas/${mapaId}/prontidao`);
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.equal(corpo.mapaId, mapaId);
  assert.equal(typeof corpo.pode, "boolean");
  assert.ok(Array.isArray(corpo.motivos), "sem os motivos o painel só sabe dizer não, não sabe dizer por quê");
});

test("prontidão de mapa inexistente é 404 com o contrato de erro, não um 'pode: false'", async () => {
  // A diferença importa: "não pode ir ao ar" e "não existe" desenhariam a
  // mesma tela vermelha, e o streamer procuraria um problema de acervo que
  // não existe.
  const resposta = await fetch(`${basePainel}/api/mapas/nao-existe-mesmo/prontidao`);
  assert.equal(resposta.status, 404);
  assert.equal((await resposta.json()).erro, "mapa_nao_encontrado");
});

/* ---------------------------------------------------------------- */
/* R6 — vitória e reinício                                           */
/* ---------------------------------------------------------------- */

test("o reinício chega ao jogo como COMANDO, não como presente", async () => {
  // O jogo precisa distinguir: presente move o boneco por delta, comando é
  // ordem do streamer. Vindo na lista errada, o Luau tentaria validar como
  // evento, não acharia animacaoId nem delta, e descartaria em silêncio.
  await fetch(`${base}/jogo/eventos?desde=999`, { headers: comToken }).catch(() => {});

  const pendente = fetch(`${base}/jogo/eventos?desde=0`, { headers: comToken });
  await new Promise((resolve) => setTimeout(resolve, 20));

  const resposta = await fetch(`${basePainel}/api/sessao/reiniciar`, { method: "POST" });
  const resultado = await resposta.json();
  assert.equal(resposta.status, 200);
  assert.equal(resultado.jogoOnline, true, "o long-poll acabou de bater, o jogo está online");

  const corpo = await (await pendente).json();
  assert.equal(corpo.comandos.length, 1);
  assert.equal(corpo.comandos[0].tipo, "reiniciar");
  assert.deepEqual(Object.keys(corpo.comandos[0]).sort(), ["emitidoEm", "id", "tipo"]);
  assert.deepEqual(corpo.eventos, [], "comando não é evento: ele não pode entrar na lista que move o boneco");
});

test("a vitória do jogo aparece no estado que o painel lê", async () => {
  const enviar = (corpo) =>
    fetch(`${base}/jogo/estado`, { method: "POST", headers: { ...comToken, ...json }, body: JSON.stringify(corpo) });

  await enviar({
    plataformaReferencia: 40, plataformaMaxima: 40, emAnimacao: false,
    quedasNaturais: 2, totalPlataformas: 40, sessaoAtiva: true, vitoria: true,
  });

  const { estado } = await (await fetch(`${basePainel}/api/sessao`)).json();
  assert.equal(estado.vitoria, true);
  assert.equal(estado.totalPlataformas, 40, "sem o total, o painel não sabe dizer 40 de quanto");

  // E o reinício tira a vitória da tela na hora, sem esperar o próximo
  // batimento do jogo — senão o botão parece não ter feito nada.
  await fetch(`${basePainel}/api/sessao/reiniciar`, { method: "POST" });
  const depois = await (await fetch(`${basePainel}/api/sessao`)).json();
  assert.equal(depois.estado.vitoria, false);
});

/* ---------------------------------------------------------------- */
/* F5 — histórico                                                    */
/* ---------------------------------------------------------------- */

test("o histórico responde uma lista, e nenhuma sessão dele carrega evento", async () => {
  const resposta = await fetch(`${basePainel}/api/sessoes`);
  const { sessoes } = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.ok(Array.isArray(sessoes));
  for (const sessao of sessoes) {
    assert.equal(sessao.eventos, undefined, "detalhe por evento não sai desta rota (F5, 11_SEGURANCA)");
    assert.equal(typeof sessao.interrompida, "boolean");
  }
});

/* ---------------------------------------------------------------- */
/* Presets — criar e apagar pela tela                                */
/* ---------------------------------------------------------------- */

test("o PUT cria o preset que ainda não existe, e o DELETE apaga", async () => {
  // É isto que faz o painel funcionar numa máquina limpa: `data/presets/`
  // vazio deixava a barra em "Nenhum preset salvo" sem saída pela tela.
  const criar = await fetch(`${basePainel}/api/presets/teste-apagavel`, {
    method: "PUT",
    headers: json,
    body: JSON.stringify({ nome: "Teste apagável", modalidade: "escalada", slots: [] }),
  });
  const criado = await criar.json();
  assert.equal(criar.status, 200);
  assert.equal(criado.presetId, "teste-apagavel");
  assert.equal(criado.streamerId, "local", "o painel não conhece o tenant: quem preenche é a ponte (ADR-003)");

  const apagar = await fetch(`${basePainel}/api/presets/teste-apagavel`, { method: "DELETE" });
  assert.equal(apagar.status, 200);

  const denovo = await fetch(`${basePainel}/api/presets/teste-apagavel`, { method: "DELETE" });
  assert.equal(denovo.status, 404, "apagar o que não existe não pode responder sucesso");
});

/* ---------------------------------------------------------------- */
/* ADR-004 — anotar o acervo                                         */
/* ---------------------------------------------------------------- */

test("aprovar um item sem assetId é recusado com motivo legível", async () => {
  const acervo = await (await fetch(`${basePainel}/api/acervo`)).json();
  const semAsset = acervo.skybox.find((item) => item.assetId === null);
  if (!semAsset) return; // acervo já montado nesta máquina

  const resposta = await fetch(`${basePainel}/api/acervo/skybox/${semAsset.id}`, {
    method: "PUT",
    headers: json,
    body: JSON.stringify({ status: "aprovado" }),
  });

  assert.equal(resposta.status, 400);
  const erro = await resposta.json();
  assert.equal(erro.erro, "aprovado_sem_asset");
  // Mapa apontando para item aprovado sem número é céu que não aparece na
  // live, e o schema recusaria o arquivo inteiro depois.
  assert.match(erro.mensagem, /assetId/);
});

test("anotar assetId e status grava, e a prontidão do mapa muda junto", async () => {
  const acervo = await (await fetch(`${basePainel}/api/acervo`)).json();
  const alvo = acervo.skybox[0];

  const resposta = await fetch(`${basePainel}/api/acervo/skybox/${alvo.id}`, {
    method: "PUT",
    headers: json,
    body: JSON.stringify({ assetId: "123456789", status: "aprovado" }),
  });

  assert.equal(resposta.status, 200);
  const { item } = await resposta.json();
  assert.equal(item.assetId, 123456789, "o campo de texto manda string; quem converte é a ponte");
  assert.equal(item.status, "aprovado");

  const relido = await (await fetch(`${basePainel}/api/acervo`)).json();
  assert.equal(relido.skybox.find((i) => i.id === alvo.id).assetId, 123456789, "gravou em disco, não só em memória");
});

test("assetId com letra é recusado antes de tocar o disco", async () => {
  const acervo = await (await fetch(`${basePainel}/api/acervo`)).json();
  const resposta = await fetch(`${basePainel}/api/acervo/skybox/${acervo.skybox[0].id}`, {
    method: "PUT",
    headers: json,
    body: JSON.stringify({ assetId: "não é número" }),
  });

  assert.equal(resposta.status, 400);
  assert.equal((await resposta.json()).erro, "asset_invalido");
});

test("props não aceitam anotação: são nativos e não passam por moderação", async () => {
  const resposta = await fetch(`${basePainel}/api/acervo/props/qualquer`, {
    method: "PUT",
    headers: json,
    body: JSON.stringify({ status: "aprovado" }),
  });

  assert.equal(resposta.status, 400);
  assert.equal((await resposta.json()).erro, "colecao_invalida");
});

/* ---------------------------------------------------------------- */
/* R7 — trocar preset                                                */
/* ---------------------------------------------------------------- */

test("trocar para um preset que não existe é 404, não uma troca silenciosa", async () => {
  const resposta = await fetch(`${basePainel}/api/sessao/preset`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ presetId: "nao-existe-mesmo" }),
  });

  assert.equal(resposta.status, 404);
  assert.equal((await resposta.json()).erro, "preset_nao_encontrado");
});

test("trocar sem dizer para qual preset é 400", async () => {
  const resposta = await fetch(`${basePainel}/api/sessao/preset`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({}),
  });

  assert.equal(resposta.status, 400);
  assert.equal((await resposta.json()).erro, "preset_obrigatorio");
});

test("a vitória não sobrevive ao fim da sessão", async () => {
  // Ela é da CORRIDA, não da ponte. Os long-polls fecham no Stop, então o jogo
  // não tem como avisar que acabou — quem esquece é a ponte. Sem isto, o aviso
  // do R6 ficaria por cima do resumo da live, com um botão de reiniciar uma
  // corrida que não existe mais.
  const enviar = (corpo) =>
    fetch(`${base}/jogo/estado`, { method: "POST", headers: { ...comToken, ...json }, body: JSON.stringify(corpo) });

  await enviar({
    plataformaReferencia: 40, plataformaMaxima: 40, emAnimacao: false,
    totalPlataformas: 40, sessaoAtiva: true, vitoria: true,
  });
  assert.equal((await (await fetch(`${basePainel}/api/sessao`)).json()).estado.vitoria, true);

  // Sem sessão de verdade aberta, o stop responde o contrato de erro — o que
  // interessa aqui é o começo de uma sessão nova, que é o outro caminho.
  await fetch(`${basePainel}/api/sessao/start`, {
    method: "POST", headers: json, body: JSON.stringify({ presetId: "escalada-padrao", cenario: "01-presente-unico" }),
  });

  const depois = await (await fetch(`${basePainel}/api/sessao`)).json();
  assert.equal(depois.estado.vitoria, false, "sessão nova começa sem a vitória da anterior");

  const resumo = await (await fetch(`${basePainel}/api/sessao/stop`, { method: "POST" })).json();
  assert.ok(resumo.resumo, "e o stop devolve o resumo que o painel mostra (F5.5)");
  assert.equal((await (await fetch(`${basePainel}/api/sessao`)).json()).estado.vitoria, false);
});
