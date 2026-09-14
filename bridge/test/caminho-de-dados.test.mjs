/**
 * O caminho de arquivo nunca sai de `data/`.
 *
 * Este teste existe por um buraco real: `GET /api/presets/:id` entrega ao
 * repositório o que veio da URL, e o Express decodifica `%2F` DEPOIS de casar
 * a rota. `..%2F..%2Fpackage` chegava como `../../package`, o `path.join`
 * saía do diretório de dados, e o DELETE da mesma rota apagava arquivo de
 * fora. Ver 11_SEGURANCA, camada 3, e ADR-003.
 *
 * São DUAS defesas e as duas têm teste: o guarda de identificador, que recusa
 * com mensagem legível, e a contenção do `caminhoDeDados`, que segura mesmo
 * quando alguém esquecer de validar.
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  caminhoDeDados,
  DIR_DADOS,
  exigirIdDeAcervo,
  exigirIdentificador,
} from "../src/repos/arquivo.mjs";
import { apagarPreset, carregarPreset } from "../src/repos/presets.mjs";
import { apagarMapa, carregarMapa } from "../src/repos/mapas.mjs";
import { carregarLook } from "../src/repos/looks.mjs";
import { imagemDaPeca, miniaturaDaPeca } from "../src/repos/acervo.mjs";

/** O que o Express entrega depois de decodificar a URL. */
const SAEM_DE_DADOS = ["../../package", "../../etc/passwd", "../../../etc/passwd", "/etc/passwd"];

test("caminhoDeDados recusa a parte que sai de data/", () => {
  for (const travessia of SAEM_DE_DADOS) {
    assert.throws(
      () => caminhoDeDados("presets", `${travessia}.json`),
      { codigo: "caminho_invalido", status: 400 },
      `"${travessia}" deveria ser recusado`,
    );
  }
});

//[[ Um `..` só NÃO sai de data/, e é por isso que as duas defesas existem.
//
// `presets/../configuracao.json` cai em `data/configuracao.json`, que é a conta
// da live do streamer. A contenção deixa passar, com razão: o caminho continua
// dentro do diretório de dados. Quem recusa é o guarda de identificador, e é
// ele que está ligado nas rotas. Sem esse par, `GET /api/presets/..%2Fconfiguracao`
// leria a configuração. ]]
test("um `..` só continua dentro de data/, e quem barra é o identificador", () => {
  assert.equal(
    caminhoDeDados("presets", "../configuracao.json"),
    path.join(DIR_DADOS, "configuracao.json"),
  );
  assert.throws(
    () => exigirIdentificador("../configuracao", "presetId"),
    { codigo: "identificador_invalido", status: 400 },
  );
});

test("caminhoDeDados continua montando o caminho normal", () => {
  assert.equal(
    caminhoDeDados("presets", "escalada-padrao.json"),
    path.join(DIR_DADOS, "presets", "escalada-padrao.json"),
  );
  assert.equal(caminhoDeDados("acervo.json"), path.join(DIR_DADOS, "acervo.json"));
  assert.equal(caminhoDeDados(), DIR_DADOS);
  // Subdiretório legítimo continua valendo: o que é proibido é SAIR.
  assert.equal(
    caminhoDeDados("acervo-imagens", "skybox_aurora", "ft.png"),
    path.join(DIR_DADOS, "acervo-imagens", "skybox_aurora", "ft.png"),
  );
});

test("exigirIdentificador aceita o id de arquivo e recusa o resto", () => {
  assert.equal(exigirIdentificador("escalada-padrao", "presetId"), "escalada-padrao");
  assert.equal(exigirIdentificador("mapa1"), "mapa1");

  const ruins = ["../x", "a/b", "MAIUSCULA", "-comeca-com-hifen", "", null, undefined, "com espaco", "a".repeat(65)];
  for (const ruim of ruins) {
    assert.throws(
      () => exigirIdentificador(ruim, "presetId"),
      { codigo: "identificador_invalido", status: 400 },
      `${JSON.stringify(ruim)} deveria ser recusado`,
    );
  }
});

test("exigirIdDeAcervo segue o padrao do acervo, que usa sublinhado", () => {
  assert.equal(exigirIdDeAcervo("textura_gelo"), "textura_gelo");
  assert.equal(exigirIdDeAcervo("skybox_aurora"), "skybox_aurora");
  assert.throws(() => exigirIdDeAcervo("../x"), { codigo: "identificador_invalido" });
  assert.throws(() => exigirIdDeAcervo("1comeca-com-numero"), { codigo: "identificador_invalido" });
});

test("as rotas com :id nao conseguem ler nem apagar fora de data/", async () => {
  const travessia = "../../package";

  await assert.rejects(() => carregarPreset(travessia), { codigo: "identificador_invalido" });
  await assert.rejects(() => apagarPreset(travessia), { codigo: "identificador_invalido" });
  await assert.rejects(() => carregarMapa(travessia), { codigo: "identificador_invalido" });
  await assert.rejects(() => apagarMapa(travessia), { codigo: "identificador_invalido" });
  await assert.rejects(() => carregarLook(travessia), { codigo: "identificador_invalido" });
  await assert.rejects(() => imagemDaPeca("texturas", travessia), { codigo: "identificador_invalido" });
  await assert.rejects(() => miniaturaDaPeca("skybox", travessia), { codigo: "identificador_invalido" });
});

test("id vazio continua devolvendo nada em vez de estourar", async () => {
  // O preset ativo pode não existir ainda, e `carregarMapa(null)` é o caminho
  // normal de "o preset não referencia mapa nenhum". Isso não é travessia.
  assert.equal(await carregarMapa(null), null);
  assert.equal(await carregarMapa(""), null);
  assert.equal(await carregarLook(null), null);
  assert.equal(await carregarLook(""), null);
});
