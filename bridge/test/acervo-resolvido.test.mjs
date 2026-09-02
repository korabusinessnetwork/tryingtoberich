/**
 * A tradução de id de acervo para assetId do Roblox.
 *
 * Ela existe porque o spec guarda `textura_rocha_vulcanica` e o Roblox precisa
 * de um número. Quem traduz é a ponte: o motor é burro de propósito (ADR-007) e
 * não deve conhecer a estrutura do acervo.
 *
 * O caso que mais importa é o `null`: enquanto a moderação do Roblox não
 * aprovar, o jogo TEM que receber nulo e cair no material nativo. Devolver um
 * número de item não aprovado faria a torre pedir um asset que não carrega, e
 * o sintoma seria plataforma sem textura, sem erro nenhum.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { resolverAssetsDoMapa } from "../src/repos/acervo.mjs";

const mapa = {
  skyboxAssetId: "skybox_entardecer_vulcanico",
  plataformas: { materialAssetId: "textura_rocha_vulcanica" },
};

const acervo = (skyboxStatus, skyboxId, texturaStatus, texturaId) => ({
  skybox: [{ id: "skybox_entardecer_vulcanico", status: skyboxStatus, assetId: skyboxId }],
  texturas: [{ id: "textura_rocha_vulcanica", status: texturaStatus, assetId: texturaId }],
  props: [],
});

test("item aprovado com assetId vira o número que o jogo aplica", () => {
  assert.deepEqual(
    resolverAssetsDoMapa(mapa, acervo("aprovado", 111, "aprovado", 222)),
    { skybox: 111, textura: 222 },
  );
});

test("pendente de moderação devolve null, mesmo que já tenha assetId", () => {
  // Acontece de verdade: o upload dá o número antes de a moderação decidir.
  assert.deepEqual(
    resolverAssetsDoMapa(mapa, acervo("em-moderacao", 111, "pendente-upload", null)),
    { skybox: null, textura: null },
  );
});

test("rejeitado pela moderação devolve null, e não o número que ficou no arquivo", () => {
  assert.deepEqual(
    resolverAssetsDoMapa(mapa, acervo("rejeitado", 111, "aprovado", 222)),
    { skybox: null, textura: 222 },
  );
});

test("aprovado sem assetId devolve null em vez de vazar undefined para o Luau", () => {
  assert.deepEqual(
    resolverAssetsDoMapa(mapa, acervo("aprovado", null, "aprovado", 222)),
    { skybox: null, textura: 222 },
  );
});

test("assetId que não é inteiro é recusado: rbxassetid:// não aceita fração", () => {
  assert.deepEqual(
    resolverAssetsDoMapa(mapa, acervo("aprovado", 1.5, "aprovado", "222")),
    { skybox: null, textura: null },
  );
});

test("id do mapa que não existe no acervo devolve null, sem estourar", () => {
  const fantasma = { skyboxAssetId: "nao_existe", plataformas: { materialAssetId: "some_tambem" } };
  assert.deepEqual(resolverAssetsDoMapa(fantasma, acervo("aprovado", 111, "aprovado", 222)), {
    skybox: null,
    textura: null,
  });
});

test("acervo vazio ou mapa capenga não derrubam a torre", () => {
  assert.deepEqual(resolverAssetsDoMapa(mapa, { skybox: [], texturas: [], props: [] }), { skybox: null, textura: null });
  assert.deepEqual(resolverAssetsDoMapa({}, acervo("aprovado", 111, "aprovado", 222)), { skybox: null, textura: null });
  assert.deepEqual(resolverAssetsDoMapa(mapa, {}), { skybox: null, textura: null });
});

test("as duas chaves existem SEMPRE, mesmo nulas", () => {
  // Chave ausente e chave nula são a mesma coisa no Luau, mas a chave presente
  // documenta que a tradução rodou — e o teste trava isso.
  const resolvido = resolverAssetsDoMapa({}, {});
  assert.deepEqual(Object.keys(resolvido).sort(), ["skybox", "textura"]);
});
