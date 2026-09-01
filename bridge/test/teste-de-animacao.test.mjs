/**
 * O disparo de animação avulsa: o teste do Bloco 2.
 *
 * Duas coisas aqui são contrato com o Roblox, não preferência, e é por isso que
 * cada uma tem teste: o cursor tem que continuar monotônico junto com o caminho
 * normal (senão o `?desde=` reprocessa ou pula evento), e o delta nunca pode
 * sair zero (o `tipos.lua` e o `evento-jogo.schema.json` descartam delta 0).
 */

import test from "node:test";
import assert from "node:assert/strict";

import { Despachante } from "../src/fila/despachante.mjs";
import { indexarAnimacoes } from "../src/repos/animacoes.mjs";
import { carregarExemplo } from "../src/repos/fixtures.mjs";
import { criarValidador } from "../src/repos/schemas.mjs";

const T0 = 1_756_742_620_000;
const animacoes = indexarAnimacoes((await carregarExemplo("../animacoes")).animacoes);
const { validar } = await criarValidador();

const criar = () => {
  const despachados = [];
  const despachante = new Despachante({ animacoes, aoDespachar: (d) => despachados.push(d) });
  return { despachante, despachados };
};

test("dispara sem preset: não há slot para casar, e exigir um travaria o teste", () => {
  const { despachante, despachados } = criar();
  // De propósito: nenhum `definirPreset` antes.
  despachante.testarAnimacao({ animacaoId: "sub_pulo", delta: 1, intensidade: 3 }, T0);

  assert.equal(despachados.length, 1);
  assert.equal(despachados[0].animacaoId, "sub_pulo");
  assert.equal(despachados[0].slot, null, "sem slot, porque não veio de slot nenhum");
});

test("o cursor é o MESMO do caminho normal, e segue monotônico", () => {
  const { despachante, despachados } = criar();
  const preset = { slots: [{ posicao: 1, presenteId: "rose", animacaoId: "sub_pulo", delta: 1, intensidade: 1 }] };
  despachante.definirPreset(preset);

  despachante.testarAnimacao({ animacaoId: "sub_pulo", delta: 1, intensidade: 1 }, T0);
  despachante.testarAnimacao({ animacaoId: "sub_pulo", delta: 1, intensidade: 1 }, T0 + 5000);

  const ids = despachados.map((d) => d.id);
  assert.deepEqual(ids, [1, 2], "id repetido faria o Roblox descartar o segundo por já ter visto o cursor");
});

test("o evento que sai passa no schema que o jogo recebe", () => {
  const { despachante, despachados } = criar();
  despachante.testarAnimacao({ animacaoId: "des_escorregao", delta: -1, intensidade: 5 }, T0);

  const { id, animacaoId, delta, intensidade, efeitoCurto, nomeDoador, presenteNome, emitidoEm } = despachados[0];
  const envelope = {
    cursor: id,
    eventos: [{ id, animacaoId, delta, intensidade, efeitoCurto, nomeDoador, presenteNome, emitidoEm }],
  };
  assert.deepEqual(validar("evento-jogo", envelope), []);
});

test("delta zero é recusado pelo schema — é por isso que o núcleo manda ±1", () => {
  const { despachante, despachados } = criar();
  despachante.testarAnimacao({ animacaoId: "sub_pulo", delta: 0, intensidade: 1 }, T0);

  const { id, animacaoId, intensidade, efeitoCurto, nomeDoador, presenteNome, emitidoEm } = despachados[0];
  const envelope = {
    cursor: id,
    eventos: [{ id, animacaoId, delta: 0, intensidade, efeitoCurto, nomeDoador, presenteNome, emitidoEm }],
  };
  assert.notDeepEqual(validar("evento-jogo", envelope), [], "delta 0 não pode passar: o jogo descarta na entrada");
});

test("o teste ocupa o canal pela duração da animação, como um presente de verdade", () => {
  const { despachante } = criar();
  despachante.testarAnimacao({ animacaoId: "sub_pulo", delta: 1, intensidade: 1 }, T0);

  const duracaoMs = Math.round(animacoes.get("sub_pulo").duracaoBase * 1000);
  assert.equal(despachante.estado.ocupadoAte, T0 + duracaoMs);
});
