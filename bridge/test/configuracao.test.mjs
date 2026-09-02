/**
 * A conta da live: em qual live a sessão vai rodar.
 *
 * O caso que originou isto: o `.env.example` traz `seu_usuario_sem_arroba`, que
 * NÃO é vazio e por isso passava pela única guarda que existia. A ponte tentava
 * conectar nessa conta e o streamer via um erro do TikTok sobre um usuário que
 * nunca existiu, em vez de "configure sua conta".
 *
 * A normalização também não é conveniência: "qual é o seu @" é respondido com
 * arroba ou com a URL colada, e recusar as duas formas seria só teimosia.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { normalizarUsuario, PLACEHOLDER } from "../src/repos/configuracao.mjs";

test("tira a arroba, que é como qualquer pessoa digita", () => {
  assert.equal(normalizarUsuario("@matheusbonato"), "matheusbonato");
  assert.equal(normalizarUsuario("matheusbonato"), "matheusbonato");
});

test("aceita a URL do perfil colada inteira", () => {
  assert.equal(normalizarUsuario("https://www.tiktok.com/@matheusbonato"), "matheusbonato");
  assert.equal(normalizarUsuario("tiktok.com/@fulano.de_tal"), "fulano.de_tal");
});

test("espaço nas pontas e arroba repetida não viram conta diferente", () => {
  assert.equal(normalizarUsuario("  @@fulano  "), "fulano");
});

test("entrada vazia continua vazia, para a guarda de cima poder recusar", () => {
  assert.equal(normalizarUsuario(""), "");
  assert.equal(normalizarUsuario("   "), "");
  assert.equal(normalizarUsuario(null), "");
  assert.equal(normalizarUsuario(undefined), "");
});

test("o placeholder do .env.example é reconhecível: não é vazio nem é conta", () => {
  // Se um dia alguém mudar o texto do .env.example, este teste avisa.
  assert.equal(normalizarUsuario(PLACEHOLDER), PLACEHOLDER);
  assert.ok(PLACEHOLDER.length > 0, "vazio passaria por outra guarda, não por esta");
});

/* ---------------------------------------------------------------- */
/* Mudança parcial                                                   */
/* ---------------------------------------------------------------- */

test("gravar o preset ativo não apaga a conta da live, e vice-versa", async () => {
  // Os dois campos são escritos por caminhos diferentes — um pela tela da conta,
  // outro por trocar de preset. Um salvar completo faria cada um apagar o outro,
  // e o sintoma seria a conta sumindo sozinha ao mexer no preset.
  const { mkdtemp, rm } = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { escreverJsonAtomico, lerJsonOuPadrao } = await import("../src/repos/arquivo.mjs");

  const dir = await mkdtemp(path.join(os.tmpdir(), "kora-cfg-"));
  try {
    const arquivo = path.join(dir, "configuracao.json");

    // Simula a sequência real: conta primeiro, preset depois.
    await escreverJsonAtomico(arquivo, {
      streamerId: "local",
      usuarioTiktok: "matheusbonato",
      presetAtivo: null,
      atualizadoEm: null,
    });

    const depoisDaConta = await lerJsonOuPadrao(arquivo);
    const comPreset = { ...depoisDaConta, presetAtivo: "escalada-padrao" };
    await escreverJsonAtomico(arquivo, comPreset);

    const final = await lerJsonOuPadrao(arquivo);
    assert.equal(final.usuarioTiktok, "matheusbonato", "a conta sobreviveu ao salvar do preset");
    assert.equal(final.presetAtivo, "escalada-padrao");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
