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

//[[ O estilo de cada textura: FORMA, material e transparência.
//
// Uma rosquinha redonda com furo no meio não é a mesma coisa que um quadrado
// com a foto de uma rosquinha. A forma é da PEÇA e mora no acervo, ao lado da
// imagem que ela veste; a lista anda em paralelo com `texturas`.
//
// O acervo de teste não declara forma, então o padrão é o bloco de sempre. ]]
const ESTILO_PADRAO = [{ forma: "bloco", material: null, transparencia: 0 }];

//[[ `texturas` é a lista REVEZADA degrau a degrau, e `textura` continua sendo a
// primeira — quem só sabe pintar uma continua funcionando. Uma torre de blocos
// variados precisa de várias, e é por isso que o resolvedor devolve as duas
// formas. ]]
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
    { skybox: 111, skyboxFaces: null, textura: 222, texturas: [222], estilos: ESTILO_PADRAO },
  );
});

test("pendente de moderação devolve null, mesmo que já tenha assetId", () => {
  // Acontece de verdade: o upload dá o número antes de a moderação decidir.
  assert.deepEqual(
    resolverAssetsDoMapa(mapa, acervo("em-moderacao", 111, "pendente-upload", null)),
    { skybox: null, skyboxFaces: null, textura: null, texturas: [], estilos: [] },
  );
});

test("rejeitado pela moderação devolve null, e não o número que ficou no arquivo", () => {
  assert.deepEqual(
    resolverAssetsDoMapa(mapa, acervo("rejeitado", 111, "aprovado", 222)),
    { skybox: null, skyboxFaces: null, textura: 222, texturas: [222], estilos: ESTILO_PADRAO },
  );
});

test("aprovado sem assetId devolve null em vez de vazar undefined para o Luau", () => {
  assert.deepEqual(
    resolverAssetsDoMapa(mapa, acervo("aprovado", null, "aprovado", 222)),
    { skybox: null, skyboxFaces: null, textura: 222, texturas: [222], estilos: ESTILO_PADRAO },
  );
});

test("assetId que não é inteiro é recusado: rbxassetid:// não aceita fração", () => {
  assert.deepEqual(
    resolverAssetsDoMapa(mapa, acervo("aprovado", 1.5, "aprovado", "222")),
    { skybox: null, skyboxFaces: null, textura: null, texturas: [], estilos: [] },
  );
});

test("id do mapa que não existe no acervo devolve null, sem estourar", () => {
  const fantasma = { skyboxAssetId: "nao_existe", plataformas: { materialAssetId: "some_tambem" } };
  assert.deepEqual(resolverAssetsDoMapa(fantasma, acervo("aprovado", 111, "aprovado", 222)), {
    skybox: null,
    skyboxFaces: null,
    textura: null,
    texturas: [],
    estilos: [],
  });
});

test("acervo vazio ou mapa capenga não derrubam a torre", () => {
  assert.deepEqual(resolverAssetsDoMapa(mapa, { skybox: [], texturas: [], props: [] }), { skybox: null, skyboxFaces: null, textura: null, texturas: [], estilos: [] });
  assert.deepEqual(resolverAssetsDoMapa({}, acervo("aprovado", 111, "aprovado", 222)), { skybox: null, skyboxFaces: null, textura: null, texturas: [], estilos: [] });
  assert.deepEqual(resolverAssetsDoMapa(mapa, {}), { skybox: null, skyboxFaces: null, textura: null, texturas: [], estilos: [] });
});

test("as quatro chaves existem SEMPRE, mesmo vazias", () => {
  // Chave ausente e chave nula são a mesma coisa no Luau, mas a chave presente
  // documenta que a tradução rodou — e o teste trava isso.
  //
  // `texturas` entrou com a torre de blocos variados: é a lista revezada degrau
  // a degrau. `textura` continua sendo a primeira dela, para o construtor que
  // só sabe pintar uma continuar funcionando com mapa antigo.
  //
  // `skyboxFaces` entrou com o céu de seis faces: céu de verdade tem horizonte,
  // e horizonte só existe com faces distintas. Nula quando a peça é uma imagem
  // única, que o jogo aplica nas seis.
  const resolvido = resolverAssetsDoMapa({}, {});
  assert.deepEqual(Object.keys(resolvido).sort(), ["estilos", "skybox", "skyboxFaces", "textura", "texturas"]);
  assert.deepEqual(resolvido.texturas, [], "lista vazia, nunca ausente");
});
