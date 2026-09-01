/**
 * Os dois clientes externos. Nenhum teste aqui toca a rede: as duas APIs são
 * de terceiros e a graça de isolá-las (ADR-006, ADR-011) é poder testar o que
 * a ponte faz com a resposta, não a resposta.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { ClienteGemini, validarSpec } from "../src/gemini/cliente.mjs";
import { limparCercaDeCodigo, montarPrompt } from "../src/gemini/prompt.mjs";
import { ClienteRoblox } from "../src/roblox/catalogo-itens.mjs";
import { acervoOferecivel, carregarAcervo } from "../src/repos/acervo.mjs";
import { carregarExemplo } from "../src/repos/fixtures.mjs";
import { criarValidador } from "../src/repos/schemas.mjs";

const { validar } = await criarValidador();
const acervoReal = await carregarAcervo();
const mapaBom = await carregarExemplo("mapa-torre-vulcanica-01");

/** O acervo versionado está todo pendente-upload; para testar geração, finge aprovado. */
const acervoAprovado = {
  ...acervoReal,
  skybox: acervoReal.skybox.map((i) => ({ ...i, status: "aprovado", assetId: 100000001 })),
  texturas: acervoReal.texturas.map((i) => ({ ...i, status: "aprovado", assetId: 100000002 })),
};

const respondendo = (...textos) => {
  const fila = [...textos];
  const chamadas = [];
  const chamar = async (args) => {
    chamadas.push(args);
    return fila.shift() ?? "";
  };
  return { chamar, chamadas };
};

/* ---------------------------------------------------------------- */
/* Gemini                                                            */
/* ---------------------------------------------------------------- */

test("o prompt injeta as três listas do acervo, com id e tags", () => {
  const prompt = montarPrompt("torre vulcânica ao entardecer", acervoOferecivel(acervoAprovado));
  assert.match(prompt, /skybox_entardecer_vulcanico: vulcanico/);
  assert.match(prompt, /textura_rocha_vulcanica: rocha/);
  assert.match(prompt, /fumaca: vulcanico/);
  assert.match(prompt, /torre vulcânica ao entardecer/);
});

test("cerca de código é removida mesmo tendo sido proibida no prompt", () => {
  assert.equal(limparCercaDeCodigo('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(limparCercaDeCodigo('```\n{"a":1}\n```'), '{"a":1}');
  assert.equal(limparCercaDeCodigo('  {"a":1}  '), '{"a":1}');
});

test("resposta que não é JSON vira problema legível, não exceção", async () => {
  const { problemas } = await validarSpec("desculpe, não consegui", acervoAprovado, { validar });
  assert.equal(problemas.length, 1);
  assert.match(problemas[0], /não é JSON válido/);
});

test("spec com asset inventado é rejeitado (ADR-004)", async () => {
  const inventado = { ...mapaBom, skyboxAssetId: "skybox_cristal_submarino" };
  const { problemas } = await validarSpec(JSON.stringify(inventado), acervoAprovado, { validar });
  assert.match(problemas.join(" "), /skybox_cristal_submarino/);
});

test("spec intransponível é rejeitado, não arredondado (ADR-009)", async () => {
  const intransponivel = {
    ...mapaBom,
    plataformas: { ...mapaBom.plataformas, espacamentoVertical: 6 },
  };
  const { problemas } = await validarSpec(JSON.stringify(intransponivel), acervoAprovado, { validar });
  assert.match(problemas.join(" "), /espacamentoVertical/);
});

test("gerar mapa: acerta de primeira e devolve o spec", async () => {
  const { chamar, chamadas } = respondendo(JSON.stringify(mapaBom));
  const cliente = new ClienteGemini({ chave: "chave-de-teste", chamar });

  const spec = await cliente.gerarMapa("torre vulcânica", acervoAprovado);
  assert.equal(spec.mapaId, "torre-vulcanica-01");
  assert.equal(chamadas.length, 1);
});

test("gerar mapa: erra, recebe o motivo no prompt e acerta na retentativa", async () => {
  const ruim = JSON.stringify({ ...mapaBom, plataformas: { ...mapaBom.plataformas, espacamentoVertical: 8 } });
  const { chamar, chamadas } = respondendo(ruim, JSON.stringify(mapaBom));
  const cliente = new ClienteGemini({ chave: "chave-de-teste", chamar });

  const spec = await cliente.gerarMapa("torre vulcânica", acervoAprovado);
  assert.equal(spec.mapaId, "torre-vulcanica-01");
  assert.equal(chamadas.length, 2, "uma retentativa, não mais");
  assert.match(chamadas[1].usuario, /espacamentoVertical/, "a retentativa diz o que veio errado");
});

test("gerar mapa: errou duas vezes, erro claro e nenhum campo chutado", async () => {
  const ruim = JSON.stringify({ ...mapaBom, plataformas: { ...mapaBom.plataformas, espacamentoVertical: 8 } });
  const { chamar, chamadas } = respondendo(ruim, ruim, JSON.stringify(mapaBom));
  const cliente = new ClienteGemini({ chave: "chave-de-teste", chamar });

  await assert.rejects(
    () => cliente.gerarMapa("torre vulcânica", acervoAprovado),
    (erro) => {
      assert.equal(erro.codigo, "mapa_invalido");
      assert.match(erro.message, /duas vezes/);
      return true;
    },
  );
  assert.equal(chamadas.length, 2, "não fica tentando para sempre");
});

test("sem chave no .env, o erro aponta que quem chama é a ponte", async () => {
  const cliente = new ClienteGemini({ chave: "" });
  await assert.rejects(() => cliente.gerarMapa("qualquer", acervoAprovado), /GEMINI_API_KEY/);
});

test("acervo sem nada aprovado bloqueia a geração antes de gastar chamada", async () => {
  const { chamar, chamadas } = respondendo(JSON.stringify(mapaBom));
  const cliente = new ClienteGemini({ chave: "chave-de-teste", chamar });

  await assert.rejects(
    () => cliente.gerarMapa("torre vulcânica", acervoReal),
    (erro) => {
      assert.equal(erro.codigo, "acervo_vazio");
      return true;
    },
  );
  assert.equal(chamadas.length, 0, "nem chega a chamar a API");
});

/* ---------------------------------------------------------------- */
/* Roblox                                                            */
/* ---------------------------------------------------------------- */

const respostaJson = (corpo, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => corpo });

test("só item de preço zero entra na busca do vestiário (ADR-011)", async () => {
  const cliente = new ClienteRoblox({
    buscarNaRede: async () => respostaJson({
      data: [
        { id: 1, name: "Chapéu grátis", price: 0, itemType: "Asset" },
        { id: 2, name: "Chapéu caro", price: 350, itemType: "Asset" },
        { id: 3, name: "Grátis por status", priceStatus: "Free", itemType: "Asset" },
        { id: 4, name: "Fora de venda", priceStatus: "Off Sale", itemType: "Asset" },
      ],
    }),
  });

  const itens = await cliente.buscarItensGratuitos("chapeu");
  assert.deepEqual(itens.map((i) => i.assetId), [1, 3], "senão o streamer monta look que não consegue vestir");
});

test("catálogo do Roblox fora do ar não derruba a ponte", async () => {
  const cliente = new ClienteRoblox({ buscarNaRede: async () => { throw new Error("ECONNRESET"); } });
  assert.deepEqual(await cliente.buscarItensGratuitos("chapeu"), [], "o vestiário para, o jogo não");
});

test("resposta com forma inesperada devolve lista vazia em vez de explodir", async () => {
  const cliente = new ClienteRoblox({ buscarNaRede: async () => respostaJson({ inesperado: true }) });
  assert.deepEqual(await cliente.buscarItensGratuitos("chapeu"), []);
});

test("a busca é cacheada: a API tem limite de taxa e não é contratada", async () => {
  let chamadas = 0;
  const cliente = new ClienteRoblox({
    buscarNaRede: async () => { chamadas += 1; return respostaJson({ data: [{ id: 1, name: "X", price: 0 }] }); },
    ttlMs: 1000,
  });

  await cliente.buscarItensGratuitos("chapeu", { agora: 0 });
  await cliente.buscarItensGratuitos("chapeu", { agora: 500 });
  assert.equal(chamadas, 1);

  await cliente.buscarItensGratuitos("chapeu", { agora: 2000 });
  assert.equal(chamadas, 2, "passado o ttl, busca de novo");
});

test("thumbnail que ainda não ficou pronta não vira ícone quebrado", async () => {
  const cliente = new ClienteRoblox({
    buscarNaRede: async () => respostaJson({ data: [{ state: "Pending", imageUrl: null }] }),
  });
  assert.equal(await cliente.iconeDoItem(999999999), null);
});
