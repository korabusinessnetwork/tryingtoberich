/**
 * A tradução do webhook da Lemon Squeezy em linha de faturamento.
 *
 * A função de borda em si roda em Deno, no Supabase, e não cabe aqui. O que
 * cabe é a conta, e é ela que erra caro: valor na unidade errada, evento
 * contado duas vezes, cancelamento lido como renovação. Um número errado aqui
 * não quebra nada, só faz o MRR mentir, e ninguém confere MRR contra o extrato
 * toda semana.
 *
 * A fonte da verdade do dinheiro é a Lemon Squeezy (ADR-P02). Esta tabela é
 * espelho, e o teste protege o espelho de distorcer.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { emCentavos, mapear } from "../data/supabase/borda/lemon-webhook/mapear.mjs";

const corpo = (nome, atributos = {}, meta = {}) => ({
  meta: { event_name: nome, event_id: "evt_1", ...meta },
  data: { id: "sub_1", attributes: { currency: "USD", total: "1900", ...atributos } },
});

test("a venda vira linha de faturamento, com o valor em centavos inteiros", () => {
  const linha = mapear(corpo("subscription_created", { variant_name: "Mensal" }));

  assert.equal(linha.tipo, "assinatura_criada");
  assert.equal(linha.valor_centavos, 1900);
  assert.equal(Number.isInteger(linha.valor_centavos), true, "dinheiro nunca em ponto flutuante");
  assert.equal(linha.moeda, "USD");
  assert.equal(linha.plano, "Mensal");
});

test("o mesmo evento reenviado tem a MESMA chave, senão a venda conta duas vezes", () => {
  // Webhook reenvia. Se o `evento_id` mudasse a cada entrega, o MRR subiria
  // sozinho, e o número errado só apareceria comparando com o extrato.
  const uma = mapear(corpo("subscription_created"));
  const outra = mapear(corpo("subscription_created"));

  assert.equal(uma.evento_id, outra.evento_id);
});

test("sem id de evento, a chave ainda é estável entre reenvios", () => {
  const sem = { meta: { event_name: "subscription_created" }, data: { id: "sub_9", attributes: {} } };

  assert.equal(mapear(sem).evento_id, mapear(sem).evento_id);
  assert.match(mapear(sem).evento_id, /sub_9/, "a chave carrega o recurso, não um sorteio");
});

test("o pagamento que chega junto da renovação é ignorado, senão dobra a receita", () => {
  // `subscription_payment_success` chega JUNTO com `subscription_updated` na
  // renovação. Contar as duas dobraria o mês inteiro.
  assert.equal(mapear(corpo("subscription_payment_success")), null);
  assert.equal(mapear(corpo("order_created")), null);
  assert.equal(mapear(corpo("license_key_created")), null);
});

test("subscription_updated só é renovação quando o status diz que sim", () => {
  // É o evento mais ambíguo do lote: chega em troca de plano, troca de cartão e
  // renovação. Ler todos como renovação inventaria receita.
  assert.equal(mapear(corpo("subscription_updated", { status: "active" })).tipo, "assinatura_renovada");
  assert.equal(mapear(corpo("subscription_updated", { status: "cancelled" })).tipo, "assinatura_cancelada");
  assert.equal(mapear(corpo("subscription_updated", { status: "expired" })).tipo, "assinatura_expirada");
  assert.equal(mapear(corpo("subscription_updated", { status: "on_trial" })), null, "trial não é dinheiro");
});

test("cancelamento e reembolso chegam pelo que são", () => {
  assert.equal(mapear(corpo("subscription_cancelled")).tipo, "assinatura_cancelada");
  assert.equal(mapear(corpo("subscription_expired")).tipo, "assinatura_expirada");
  assert.equal(mapear(corpo("subscription_payment_refunded")).tipo, "reembolso");
});

test("o reembolso guarda o valor POSITIVO, e é o tipo que diz o sinal", () => {
  // Guardar negativo faria a soma do mês depender de ninguém esquecer o `abs`.
  const linha = mapear(corpo("subscription_payment_refunded", { total: "1900" }));
  assert.equal(linha.valor_centavos, 1900);
});

test("o streamerId vem do checkout e é validado antes de virar chave de tenant", () => {
  const bom = mapear(corpo("subscription_created", {}, { custom_data: { streamer_id: "Matheus" } }));
  assert.equal(bom.streamer_id, "matheus", "normalizado, para casar com a coluna");

  const ruim = mapear(corpo("subscription_created", {}, { custom_data: { streamer_id: "não vale!" } }));
  assert.equal(ruim.streamer_id, null, "id fora da regra vira nulo, não vira linha recusada pelo banco");
});

test("valor que não é número inteiro vira zero, e nunca NaN", () => {
  // NaN em `valor_centavos` seria recusado pelo banco e derrubaria a gravação
  // do evento inteiro. Zero entra, e o corpo cru fica guardado para conferência.
  assert.equal(emCentavos(undefined), 0);
  assert.equal(emCentavos("abc"), 0);
  assert.equal(emCentavos("-500"), 0);
  assert.equal(emCentavos("1900"), 1900);
  assert.equal(emCentavos(1900), 1900);
});

test("moeda estranha cai em USD em vez de derrubar a linha", () => {
  assert.equal(mapear(corpo("subscription_created", { currency: "usd" })).moeda, "USD");
  assert.equal(mapear(corpo("subscription_created", { currency: "BRL" })).moeda, "BRL");
  assert.equal(mapear(corpo("subscription_created", { currency: "" })).moeda, "USD");
});

test("corpo estranho não lança, porque webhook que dá 500 é reenviado para sempre", () => {
  for (const lixo of [null, undefined, {}, { meta: {} }, { data: {} }, "texto"]) {
    assert.equal(mapear(lixo), null, `explodiu com ${JSON.stringify(lixo)}`);
  }
});

test("o corpo cru fica guardado, para o número ter de onde ser conferido", () => {
  // Toda vez que o painel discordar do painel deles, a resposta precisa estar
  // em algum lugar que não seja a memória de alguém.
  const original = corpo("subscription_created");
  assert.deepEqual(mapear(original).bruto, original);
});
