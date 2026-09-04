/**
 * A tabela de movimento (ADR-016): todo presente do catálogo move a torre, com
 * o delta saindo de `moedas × multiplicador` e ajustável presente a presente.
 *
 * O que estes testes protegem:
 *
 * - **Os 6 slots continuam mandando.** Presente que está num slot é despachado
 *   pelo slot, com a animação e o delta que o streamer escolheu. A tabela
 *   nunca passa por cima disso — é a linha que separa o ADR-016 do ADR-007.
 * - **A regra do dono:** rosa de 1 moeda sobe 10.
 * - **A rajada (R4)** vale para os dois caminhos.
 * - **Preset sem tabela é o comportamento de antes**, com o presente de fora
 *   dos 6 contado como não mapeado.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  MOVIMENTO_PADRAO,
  casarPorMovimento,
  deltaDaRegra,
  indexarMovimento,
  movimentoDoPreset,
} from "../src/dominio/movimento.mjs";
import { Despachante } from "../src/fila/despachante.mjs";
import { agruparPorSlot } from "../src/fila/combate.mjs";
import { indexarAnimacoes } from "../src/repos/animacoes.mjs";
import { carregarExemplo } from "../src/repos/fixtures.mjs";

const T0 = 1_756_742_620_000;
const animacoes = indexarAnimacoes((await carregarExemplo("../animacoes")).animacoes);

const CATALOGO = {
  presentes: [
    { presenteId: "rosa", nome: "Rose", moedas: 1, faixa: 1, combavel: true, ativo: true },
    { presenteId: "perfume", nome: "Perfume", moedas: 20, faixa: 2, combavel: true, ativo: true },
    { presenteId: "galaxia", nome: "Galaxy", moedas: 1000, faixa: 4, combavel: true, ativo: true },
    { presenteId: "gratis", nome: "TikTok", moedas: 0, faixa: 1, combavel: false, ativo: true },
  ],
};

const comTabela = (extra = {}) => ({
  presetId: "p",
  slots: [],
  movimento: { ...MOVIMENTO_PADRAO, excecoes: [], ...extra },
});

const evento = (presenteId, { repeticoes = 1, moedas } = {}) => ({
  presenteId,
  presenteNome: presenteId,
  repeticoes,
  ...(moedas === undefined ? {} : { moedas }),
  nomeDoador: "quem-pagou",
  recebidoEm: T0,
});

test("a regra do dono: o presente de 1 moeda sobe 10 andares", () => {
  assert.equal(deltaDaRegra(1, 10), 10);
  assert.equal(deltaDaRegra(20, 10), 200);
  assert.equal(deltaDaRegra(44999, 10), 449_990);
  // Presente grátis não move nada, e é isso que o mantém fora da tabela.
  assert.equal(deltaDaRegra(0, 10), 0);
  // Lixo não vira NaN dentro do caminho quente.
  assert.equal(deltaDaRegra(undefined, 10), 0);
  assert.equal(deltaDaRegra(10, undefined), 0);
});

test("o índice sai do catálogo, e a exceção escrita à mão vence a conta", () => {
  const tabela = indexarMovimento(
    comTabela({ excecoes: [{ presenteId: "perfume", delta: -60 }, { presenteId: "galaxia", delta: 0 }] }),
    CATALOGO,
  );

  assert.equal(tabela.indice.get("rosa"), 10, "1 moeda × 10");
  assert.equal(tabela.indice.get("perfume"), -60, "a exceção manda, e ela pode DESCER");
  assert.equal(tabela.indice.get("galaxia"), 0, "zero fica no índice: é o presente silenciado");
  assert.equal(tabela.indice.get("gratis"), 0);
});

test("tabela desligada, ou preset sem tabela, é o ADR-007 puro", () => {
  assert.equal(indexarMovimento(comTabela({ ativo: false }), CATALOGO), null);
  assert.equal(indexarMovimento({ presetId: "p", slots: [] }, CATALOGO), null);
  assert.equal(movimentoDoPreset({ presetId: "p" }), null);
});

test("o multiplicador vale para o catálogo inteiro de uma vez", () => {
  const tabela = indexarMovimento(comTabela({ multiplicador: 3 }), CATALOGO);
  assert.equal(tabela.indice.get("rosa"), 3);
  assert.equal(tabela.indice.get("perfume"), 60);
  // Multiplicador zero é o modo "só o que eu escolhi a mão": a conta zera e
  // sobra a exceção.
  const soExcecoes = indexarMovimento(
    comTabela({ multiplicador: 0, excecoes: [{ presenteId: "galaxia", delta: 40 }] }),
    CATALOGO,
  );
  assert.equal(soExcecoes.indice.get("rosa"), 0);
  assert.equal(soExcecoes.indice.get("galaxia"), 40);
});

test("o disparo da tabela não tem slot, e a animação segue o SINAL do delta", () => {
  const tabela = indexarMovimento(comTabela({ excecoes: [{ presenteId: "perfume", delta: -60 }] }), CATALOGO);

  const sobe = casarPorMovimento(evento("rosa"), tabela);
  assert.equal(sobe.slot, null, "presente da tabela não ocupa slot");
  assert.equal(sobe.delta, 10);
  assert.equal(sobe.animacaoId, MOVIMENTO_PADRAO.animacaoDeSubida);
  assert.equal(sobe.intensidade, MOVIMENTO_PADRAO.intensidade);
  assert.equal(sobe.cooldownMs, 0);

  const desce = casarPorMovimento(evento("perfume"), tabela);
  assert.equal(desce.delta, -60);
  assert.equal(desce.animacaoId, MOVIMENTO_PADRAO.animacaoDeDescida);
});

test("R4 também na tabela: a rajada multiplica o delta e sobe um nível de intensidade", () => {
  const tabela = indexarMovimento(comTabela(), CATALOGO);
  const disparo = casarPorMovimento(evento("rosa", { repeticoes: 20 }), tabela);

  assert.equal(disparo.delta, 200, "20 rosas de +10");
  assert.equal(disparo.intensidade, MOVIMENTO_PADRAO.intensidade + 1);
  assert.equal(disparo.repeticoes, 20);
});

test("presente zerado e presente de graça não movem nada: voltam a ser não mapeados", () => {
  const tabela = indexarMovimento(comTabela({ excecoes: [{ presenteId: "galaxia", delta: 0 }] }), CATALOGO);
  assert.equal(casarPorMovimento(evento("galaxia"), tabela), null);
  assert.equal(casarPorMovimento(evento("gratis"), tabela), null);
  assert.equal(casarPorMovimento(evento("rosa"), null), null, "sem tabela, nada casa");
});

test("presente que o catálogo local não conhece cai na regra pelo valor do próprio evento", () => {
  const tabela = indexarMovimento(comTabela(), CATALOGO);
  // O exclusivo da sala, ou o que a TikTok lançou hoje: a ponte nunca o viu.
  const disparo = casarPorMovimento(evento("exclusivo-da-sala", { moedas: 7 }), tabela);
  assert.equal(disparo.delta, 70);

  // Mas o presente ZERADO à mão continua zerado, mesmo trazendo moedas no
  // evento: quem silenciou quis silenciar, não recalcular.
  const silenciado = indexarMovimento(comTabela({ excecoes: [{ presenteId: "galaxia", delta: 0 }] }), CATALOGO);
  assert.equal(casarPorMovimento(evento("galaxia", { moedas: 1000 }), silenciado), null);
});

/* ---------------------------------------------------------------- */
/* O despachante: onde as duas listas se encontram                   */
/* ---------------------------------------------------------------- */

function despachanteComTabela(preset) {
  const despachados = [];
  const naoMapeados = [];
  const despachante = new Despachante({
    animacoes,
    aoDespachar: (d) => despachados.push(d),
    aoNaoMapeado: (d) => naoMapeados.push(d),
  });
  despachante.definirPreset(preset, CATALOGO);
  return { despachante, despachados, naoMapeados };
}

test("o slot vence a tabela: presente escolhido dispara com a animação e o delta do slot", () => {
  const preset = {
    ...comTabela(),
    slots: [{ posicao: 1, presenteId: "galaxia", animacaoId: "sub_shuriken_vento", delta: 50, intensidade: 4, cooldownMs: 0 }],
  };
  const { despachante, despachados } = despachanteComTabela(preset);

  const resultado = despachante.receber(evento("galaxia"), T0);
  assert.equal(resultado.tipo, "despachado");
  assert.equal(despachados[0].slot, 1);
  assert.equal(despachados[0].delta, 50, "o delta é o do slot, não os 10.000 da conta");
  assert.equal(despachados[0].animacaoId, "sub_shuriken_vento");
});

test("presente fora dos 6 deixa de ser descartado: ele anda o que a tabela diz", () => {
  const { despachante, despachados, naoMapeados } = despachanteComTabela(comTabela());

  const resultado = despachante.receber(evento("rosa"), T0);
  assert.equal(resultado.tipo, "despachado");
  assert.equal(despachados[0].delta, 10);
  assert.equal(despachados[0].slot, null);
  assert.equal(naoMapeados.length, 0);
});

test("sem tabela no preset, o mesmo presente volta a ser não mapeado", () => {
  const { despachante, despachados, naoMapeados } = despachanteComTabela({ presetId: "p", slots: [] });

  const resultado = despachante.receber(evento("rosa"), T0);
  assert.equal(resultado.tipo, "nao_mapeado");
  assert.equal(despachados.length, 0);
  assert.equal(naoMapeados[0].presenteNome, "rosa");
});

test("catálogo novo (coleta da live) refaz a tabela sem trocar o preset", () => {
  const { despachante, despachados } = despachanteComTabela(comTabela());
  despachante.definirCatalogo({
    presentes: [{ presenteId: "rosa", nome: "Rose", moedas: 5, faixa: 1, combavel: true, ativo: true }],
  });

  despachante.receber(evento("rosa"), T0);
  assert.equal(despachados[0].delta, 50, "a rosa agora vale 5 moedas");
});

test("dois presentes da tabela em combate são DOIS participantes, não um balde só", () => {
  // Sem slot, a chave do agrupamento é o presente. Agrupar os dois no mesmo
  // balde nulo somaria +10 com -600 e mandaria um participante mentiroso.
  const tabela = indexarMovimento(comTabela({ excecoes: [{ presenteId: "perfume", delta: -600 }] }), CATALOGO);
  const agrupado = agruparPorSlot([
    casarPorMovimento(evento("rosa"), tabela),
    casarPorMovimento(evento("perfume"), tabela),
    casarPorMovimento(evento("rosa"), tabela),
  ]);

  assert.equal(agrupado.length, 2);
  assert.equal(agrupado.find((p) => p.presenteId === "rosa").delta, 20, "as duas rosas somam");
  assert.equal(agrupado.find((p) => p.presenteId === "perfume").delta, -600);
});
