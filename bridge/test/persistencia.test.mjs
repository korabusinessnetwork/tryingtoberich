/**
 * Persistência: escrita atômica, validação antes de gravar, e o descarte de
 * dado de espectador no fim da sessão.
 *
 * Não existe transação em arquivo JSON. Um preset truncado no meio de uma live
 * é dado perdido, e a defesa é escrever em temporário e renomear.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  escreverJsonAtomico,
  lerJson,
  lerJsonOuPadrao,
  listarJson,
} from "../src/repos/arquivo.mjs";
import { mesclarPresentes } from "../src/repos/catalogo.mjs";
import { reduzirAoResumo, sessaoIdDe } from "../src/repos/sessoes.mjs";
import { carregarPreset, salvarPreset } from "../src/repos/presets.mjs";
import { acervoOferecivel, carregarAcervo } from "../src/repos/acervo.mjs";
import { Sessao } from "../src/sessao/sessao.mjs";
import { carregarExemplo } from "../src/repos/fixtures.mjs";

const comDiretorioTemporario = async (corpo) => {
  const dir = await mkdtemp(path.join(tmpdir(), "kora-"));
  try {
    return await corpo(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/* ---------------------------------------------------------------- */
/* Escrita atômica                                                   */
/* ---------------------------------------------------------------- */

test("escrita atômica não deixa temporário para trás", async () => {
  await comDiretorioTemporario(async (dir) => {
    const alvo = path.join(dir, "preset.json");
    await escreverJsonAtomico(alvo, { presetId: "a" });
    await escreverJsonAtomico(alvo, { presetId: "b" });

    assert.deepEqual(await lerJson(alvo), { presetId: "b" });
    assert.deepEqual(await readdir(dir), ["preset.json"], "nenhum .tmp sobrou");
  });
});

test("escrita atômica cria o diretório que faltar", async () => {
  await comDiretorioTemporario(async (dir) => {
    const alvo = path.join(dir, "fundo", "do", "poco.json");
    await escreverJsonAtomico(alvo, { ok: true });
    assert.deepEqual(await lerJson(alvo), { ok: true });
  });
});

test("escritas concorrentes deixam um arquivo inteiro, nunca meio arquivo", async () => {
  await comDiretorioTemporario(async (dir) => {
    const alvo = path.join(dir, "corrida.json");
    const grandes = Array.from({ length: 12 }, (_, i) => ({ id: i, recheio: "x".repeat(20_000) }));

    await Promise.all(grandes.map((dado) => escreverJsonAtomico(alvo, dado)));

    const final = await lerJson(alvo);
    assert.ok(grandes.some((g) => g.id === final.id), "o que sobrou é um dos escritos, inteiro");
    assert.equal(final.recheio.length, 20_000);
    assert.deepEqual(await readdir(dir), ["corrida.json"]);
  });
});

/**
 * Regressão do EPERM do Windows.
 *
 * O teste de 12 escritas acima já falhava aqui, mas 12 podem passar por sorte.
 * Este sobe a concorrência a ponto de a corrida ser praticamente certa, e checa
 * as DUAS coisas que o bug quebrava: o rename estourando EPERM (a escrita se
 * perde) e o temporário ficando para trás (lixo no diretório de dados).
 */
test("dezenas de escritas concorrentes: nenhuma estoura, nenhum .tmp sobra", async () => {
  await comDiretorioTemporario(async (dir) => {
    const alvo = path.join(dir, "tumulto.json");
    const lote = Array.from({ length: 40 }, (_, i) => ({ id: i, recheio: "y".repeat(20_000) }));

    await Promise.all(lote.map((dado) => escreverJsonAtomico(alvo, dado)));

    const final = await lerJson(alvo);
    assert.ok(lote.some((g) => g.id === final.id), "sobrou um dos escritos, inteiro");
    assert.equal(final.recheio.length, 20_000, "e não meio arquivo");
    assert.deepEqual(await readdir(dir), ["tumulto.json"], "nenhum temporário para trás");
  });
});

test("arquivo ausente devolve o padrão; JSON quebrado continua subindo", async () => {
  await comDiretorioTemporario(async (dir) => {
    assert.equal(await lerJsonOuPadrao(path.join(dir, "nada.json"), null), null);

    const quebrado = path.join(dir, "quebrado.json");
    await escreverJsonAtomico(quebrado, { ok: true });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(quebrado, "{ isto não é json", "utf8");

    await assert.rejects(() => lerJsonOuPadrao(quebrado, null), SyntaxError, "corrupção não pode virar silêncio");
  });
});

test("listar ignora temporário e diretório ausente", async () => {
  await comDiretorioTemporario(async (dir) => {
    assert.deepEqual(await listarJson(path.join(dir, "nao-existe")), []);
    await escreverJsonAtomico(path.join(dir, "b.json"), {});
    await escreverJsonAtomico(path.join(dir, "a.json"), {});
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.join(dir, ".a.json.tmp"), "{}", "utf8");

    assert.deepEqual(await listarJson(dir), ["a.json", "b.json"]);
  });
});

/* ---------------------------------------------------------------- */
/* Repositório de preset                                             */
/* ---------------------------------------------------------------- */

test("salvar preset valida antes de gravar e carimba a data", async () => {
  const preset = { ...(await carregarExemplo("preset-escalada-padrao")), presetId: "teste-ida-e-volta" };
  try {
    const salvo = await salvarPreset(preset);
    assert.notEqual(salvo.atualizadoEm, preset.atualizadoEm, "carimba na gravação");

    const relido = await carregarPreset("teste-ida-e-volta");
    assert.deepEqual(relido, salvo);
  } finally {
    const { caminhoDeDados, apagar } = await import("../src/repos/arquivo.mjs");
    await apagar(caminhoDeDados("presets", "teste-ida-e-volta.json"));
  }
});

test("preset inválido não chega ao disco", async () => {
  const invalido = {
    presetId: "teste-nunca-gravado", streamerId: "local", nome: "X", modalidade: "escalada",
    slots: [{ posicao: 1, presenteId: "p", animacaoId: "sub_pulo", delta: 0, intensidade: 1 }],
  };
  await assert.rejects(() => salvarPreset(invalido), /preset_invalido|Preset fora do contrato/);
  assert.equal(await carregarPreset("teste-nunca-gravado"), null, "nada foi escrito");
});

/* ---------------------------------------------------------------- */
/* Catálogo                                                          */
/* ---------------------------------------------------------------- */

test("merge do catálogo: entra novo, atualiza existente, e o que sumiu não é apagado", () => {
  const existentes = [
    { presenteId: "1", nome: "Rose", moedas: 1, faixa: 1, combavel: true, ativo: true, vistoEm: "2026-08-01T00:00:00Z" },
    { presenteId: "2", nome: "Sumiu", moedas: 10, faixa: 2, combavel: true, ativo: true, vistoEm: "2026-08-01T00:00:00Z" },
  ];
  const coletados = [
    { presenteId: "1", nome: "Rose", moedas: 2, faixa: 1, combavel: true, ativo: true, vistoEm: null },
    { presenteId: "3", nome: "Novo", moedas: 500, faixa: 3, combavel: false, ativo: true, vistoEm: null },
  ];

  const mesclado = mesclarPresentes(existentes, coletados, "2026-09-01T20:00:00Z");
  const porId = Object.fromEntries(mesclado.map((p) => [p.presenteId, p]));

  assert.equal(porId["1"].moedas, 2, "valor atualizado pela coleta");
  assert.equal(porId["2"].ativo, false, "sumiu da live");
  assert.ok(porId["2"], "mas não foi apagado: preset antigo pode referenciar");
  assert.equal(porId["3"].nome, "Novo");
  assert.deepEqual(
    mesclado.map((p) => [p.presenteId, p.moedas]),
    [["3", 500], ["2", 10], ["1", 2]],
    "ordenado por valor, inclusive o inativo: quem filtra para exibição é o painel",
  );
});

/* ---------------------------------------------------------------- */
/* Acervo                                                            */
/* ---------------------------------------------------------------- */

test("o acervo oferecível esconde o que não está aprovado (ADR-004)", () => {
  // Acervo construído aqui, NÃO o data/acervo.json real: o que este teste
  // afirma é a regra do filtro, e ela não pode passar a falhar no dia em que o
  // streamer aprovar um item de verdade. Foi exatamente o que aconteceu.
  const acervo = {
    skybox: [
      { id: "a", status: "aprovado", assetId: 111 },
      { id: "b", status: "em-moderacao", assetId: 222 },
      { id: "c", status: "pendente-upload", assetId: null },
      { id: "d", status: "rejeitado", assetId: 444 },
      { id: "e", status: "aprovado", assetId: null },
    ],
    texturas: [{ id: "t", status: "aprovado", assetId: 999 }],
    props: [{ id: "fumaca" }],
  };

  const oferecivel = acervoOferecivel(acervo);
  assert.deepEqual(oferecivel.skybox.map((i) => i.id), ["a"], "só aprovado COM assetId é oferecido");
  assert.deepEqual(oferecivel.texturas.map((i) => i.id), ["t"]);
  assert.equal(oferecivel.props.length, 1, "prop não passa por moderação e sempre entra");
});

test("o acervo versionado existe e tem as três coleções", async () => {
  // O que vale afirmar sobre o arquivo real é a FORMA, não quantos itens estão
  // aprovados hoje — isso muda conforme o streamer sobe imagem.
  const acervo = await carregarAcervo();
  assert.ok(acervo.skybox.length > 0);
  assert.ok(acervo.texturas.length > 0);
  assert.ok(acervo.props.length > 0);
});

/* ---------------------------------------------------------------- */
/* Sessão e LGPD                                                     */
/* ---------------------------------------------------------------- */

test("o id da sessão sai da data em formato de nome de arquivo", () => {
  assert.equal(sessaoIdDe(new Date("2026-09-01T20:00:00.000Z")), "2026-09-01T20-00-00");
});

test("o log da sessão não guarda quem enviou", () => {
  const sessao = new Sessao({ presetId: "escalada-padrao", iniciadaEm: new Date("2026-09-01T20:00:00Z") });
  const evento = sessao.registrarDisparo({
    id: 1, slot: 5, presenteId: "sem-galaxy", presenteNome: "Galaxy", nomeDoador: "theuz",
    animacaoId: "sub_cometa", delta: 40, intensidade: 3, repeticoes: 1,
    recebidoEm: 1_000_000, emitidoEm: 1_000_620, disputa: null,
  });

  assert.equal(evento.latenciaMs, 620);
  assert.equal(JSON.stringify(evento).includes("theuz"), false, "o doador vai para a tela, nunca para o log");
  assert.deepEqual(
    Object.keys(evento).sort(),
    ["animacaoId", "delta", "em", "latenciaMs", "presenteId", "repeticoes", "slot"],
  );
});

test("resolução de combate não conta como latência", () => {
  const sessao = new Sessao({ presetId: "escalada-padrao" });
  const evento = sessao.registrarDisparo({
    id: 2, slot: 6, presenteId: "sem-lion", presenteNome: "Lion", nomeDoador: null,
    animacaoId: "des_buraco_negro", delta: -49, intensidade: 5, repeticoes: 1,
    recebidoEm: 1_000_000, emitidoEm: 1_001_600,
    disputa: { participantes: 5, somaSubida: 19, somaDescida: -68, liquido: -49, contestado: true },
  });

  assert.equal(evento.latenciaMs, undefined, "o combate segura de propósito; isso não é a ponte estar lenta");
});

test("encerrar a sessão descarta o detalhe por evento e deixa só o resumo (F5)", () => {
  const aberta = {
    sessaoId: "2026-09-01T20-00-00", streamerId: "local", presetId: "escalada-padrao",
    mapaId: "torre-vulcanica-01", iniciadaEm: "2026-09-01T20:00:00Z", encerradaEm: null,
    plataformaReferencia: 184, plataformaMaxima: 191, quedasNaturais: 12, naoMapeados: [],
    eventos: [
      { em: "2026-09-01T20:03:11Z", slot: 5, presenteId: "sem-galaxy", repeticoes: 1, delta: 40, animacaoId: "sub_cometa", latenciaMs: 620 },
      { em: "2026-09-01T20:04:02Z", slot: 1, presenteId: "sem-rose", repeticoes: 9, delta: 18, animacaoId: "sub_pulo", latenciaMs: 580 },
      { em: "2026-09-01T20:05:00Z", slot: 1, presenteId: "sem-rose", repeticoes: 1, delta: 2, animacaoId: "sub_pulo" },
    ],
  };

  const reduzida = reduzirAoResumo(aberta, "2026-09-01T22:07:30Z");

  assert.deepEqual(reduzida.eventos, [], "o detalhe por evento some");
  assert.equal(reduzida.resumo.totalPresentes, 3);
  assert.deepEqual(reduzida.resumo.presentesPorSlot, { 1: 2, 5: 1 });
  assert.equal(reduzida.resumo.latenciaMediaMs, 600, "média só do que tinha latência medida");
  assert.equal(reduzida.resumo.duracaoSegundos, 7650);
  assert.equal("plataformaReferencia" in reduzida, false, "posição corrente não faz sentido depois do fim");
});

test("a sessão reduzida passa no schema, que recusa encerrada com eventos dentro", async () => {
  const { criarValidador } = await import("../src/repos/schemas.mjs");
  const { validar } = await criarValidador();

  const aberta = {
    sessaoId: "2026-09-01T20-00-00", streamerId: "local", presetId: "escalada-padrao",
    mapaId: null, iniciadaEm: "2026-09-01T20:00:00Z", encerradaEm: null,
    plataformaReferencia: 0, plataformaMaxima: 0, quedasNaturais: 0, naoMapeados: [], eventos: [],
  };

  const reduzida = reduzirAoResumo(aberta, "2026-09-01T21:00:00Z");
  assert.deepEqual(validar("sessao", reduzida), []);
  assert.notDeepEqual(
    validar("sessao", { ...reduzida, eventos: [{ em: "2026-09-01T20:03:11Z", slot: 1, presenteId: "x", repeticoes: 1, delta: 1, animacaoId: "sub_pulo" }] }),
    [],
  );
});
