/**
 * O catálogo de presentes sem estar ao vivo.
 *
 * O que estes testes protegem é uma ordem de trabalho, não uma função: montar
 * preset acontece ANTES da live. Enquanto a coleta exigia sessão, quem abria o
 * painel pela primeira vez via 13 presentes de mentira, com id inventado —
 * e o R1 casa por `presenteId`, então nada daquilo dispararia na live.
 *
 * Nenhum teste toca a rede. O payload é uma captura de verdade do painel
 * público da TikTok (`data/fixtures/tiktok-cru/painel-publico-presentes.json`),
 * com os campos ao pé da letra: `diamond_count` em snake_case e a URL do ícone
 * dentro de `icon.url_list`. Fixture inventada não teria pego nenhuma das duas.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { buscarCatalogoPublico } from "../src/tiktok/catalogo-publico.mjs";
import { normalizarCatalogo } from "../src/tiktok/normalizador.mjs";
import { mesclarPresentes } from "../src/repos/catalogo.mjs";
import { carregarPayloadCru } from "../src/repos/fixtures.mjs";
import { criarValidador } from "../src/repos/schemas.mjs";

const { validar } = await criarValidador();
const PAYLOAD = await carregarPayloadCru("painel-publico-presentes");

const rede = (corpo, { ok = true, status = 200, espiar = null } = {}) => async (url, opcoes) => {
  espiar?.(url, opcoes);
  return { ok, status, json: async () => corpo };
};

test("o painel público responde sem sala: é isso que permite configurar antes da live", async () => {
  let urlVista = null;
  const presentes = await buscarCatalogoPublico({
    buscarNaRede: rede(PAYLOAD, { espiar: (url) => { urlVista = url; } }),
  });

  assert.equal(presentes.length, 4);
  assert.ok(!urlVista.includes("room_id"), "sem sala, `room_id` nem entra na URL");
  assert.ok(urlVista.includes("aid=1988"), "sem o app id do site a TikTok devolve vazio");
});

test("com sala, a URL leva o room_id — a sala tem presentes que a lista global não tem", async () => {
  let urlVista = null;
  await buscarCatalogoPublico({
    roomId: "7679022730909469458",
    buscarNaRede: rede(PAYLOAD, { espiar: (url) => { urlVista = url; } }),
  });
  assert.ok(urlVista.includes("room_id=7679022730909469458"));
});

test("erro de aplicação com HTTP 200 é erro, não catálogo vazio", async () => {
  // O padrão das APIs internas da TikTok: status 200 e `status_code` diferente
  // de zero. Sem esta checagem, a recusa passaria por "o streamer não tem
  // presentes" e a lista boa em disco seria sobrescrita por nada.
  await assert.rejects(
    () => buscarCatalogoPublico({ buscarNaRede: rede({ status_code: 4004003, data: {} }) }),
    /status_code 4004003/,
  );
});

test("lista vazia é falha, e o que está em disco continua valendo", async () => {
  await assert.rejects(
    () => buscarCatalogoPublico({ buscarNaRede: rede({ status_code: 0, data: { gifts: [] } }) }),
    /lista vazia/,
  );
});

test("HTTP fora do ar vira erro com o status, não uma lista meia-boca", async () => {
  await assert.rejects(
    () => buscarCatalogoPublico({ buscarNaRede: rede(null, { ok: false, status: 503 }) }),
    /respondeu 503/,
  );
});

test("a captura real vira catálogo válido, com id, moedas e ícone de verdade", async () => {
  const presentes = normalizarCatalogo(
    await buscarCatalogoPublico({ buscarNaRede: rede(PAYLOAD) }),
    "2026-09-01T20:00:00Z",
  );

  const porNome = new Map(presentes.map((p) => [p.nome, p]));

  // O id é o que o R1 usa para casar o presente com o slot. Se ele viesse
  // inventado — como na semente — o preset nunca dispararia na live.
  assert.equal(porNome.get("Rose").presenteId, "5655");
  assert.equal(porNome.get("Rose").moedas, 1, "`diamond_count` em snake_case");
  assert.equal(porNome.get("TikTok Universe").moedas, 44999);

  assert.equal(porNome.get("Rose").faixa, 1);
  assert.equal(porNome.get("TikTok Universe").faixa, 5, "a faixa sai das moedas (R3)");

  for (const presente of presentes) {
    assert.ok(presente.iconeUrl?.startsWith("https://"), `${presente.nome} sem ícone oficial`);
  }

  assert.deepEqual(
    validar("catalogo-presentes", {
      streamerId: "local", origem: "publico", confirmado: true,
      atualizadoEm: "2026-09-01T20:00:00Z", presentes,
    }),
    [],
    "o contrato precisa aceitar a terceira origem",
  );
});

test("fonte diferente não apaga o que a outra trouxe", () => {
  // A sala lista presentes exclusivos dela; o painel global não os conhece. Se
  // cada coleta pudesse marcar `ativo: false` no que a outra trouxe, a lista
  // encolheria a cada troca de fonte sem ninguém ter mexido em nada.
  const daSala = [
    { presenteId: "5655", nome: "Rose", moedas: 1, faixa: 1, combavel: true, ativo: true },
    { presenteId: "999", nome: "Exclusivo da sala", moedas: 10, faixa: 2, combavel: false, ativo: true },
  ];
  const doPainel = [{ presenteId: "5655", nome: "Rose", moedas: 1, faixa: 1, combavel: true, ativo: true }];

  const trocandoDeFonte = mesclarPresentes(daSala, doPainel, "2026-09-01T20:00:00Z", { podeDesativar: false });
  assert.equal(trocandoDeFonte.find((p) => p.presenteId === "999").ativo, true);

  const mesmaFonte = mesclarPresentes(daSala, doPainel, "2026-09-01T20:00:00Z");
  assert.equal(
    mesmaFonte.find((p) => p.presenteId === "999").ativo,
    false,
    "dentro da MESMA fonte, sumir continua querendo dizer que sumiu",
  );
});
