/**
 * O adaptador da Lemon Squeezy, a troca de plano e a conta do dinheiro.
 *
 * Três coisas se provam aqui, e as três são das que erram caro:
 *
 * 1. **A regra de escolha do adaptador**, que é a mesma da camada de dados, e
 *    o falso registrando a ação igual ao real (contrato da onda 2, seção 4).
 * 2. **A ordem da troca**: a Lemon Squeezy primeiro, a base da Kora depois, e
 *    recusa da cobrança abortando a troca inteira. Ficha que mente sobre o que
 *    o cliente paga é pior que ficha desatualizada.
 * 3. **Dinheiro em centavos inteiros**, do começo ao fim, e o mês somando o que
 *    deve somar. É a conta que o dono vai ler.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { MOTIVOS } from "../src/dados/contrato.js";
import { criarDadosDeExemplo, resumirFaturamento } from "../src/dados/exemplo.js";
import { FUNCOES_DE_FATURAMENTO, escolherFaturamento } from "../src/faturamento/index.js";
import { criarFaturamentoDaLemon, varianteDoPlano } from "../src/faturamento/lemon.js";
import { criarFaturamentoDeExemplo } from "../src/faturamento/exemplo.js";
import { trocarPlanoDoAssinante } from "../src/faturamento/troca.js";

const AGORA = new Date("2026-09-10T12:00:00.000Z");

/* ---------------------------------------------------------------- */
/* A regra de escolha                                                */
/* ---------------------------------------------------------------- */

test("sem LEMON_API_KEY vale o adaptador falso", () => {
  assert.equal(escolherFaturamento({}).fonte, "exemplo");
  assert.equal(escolherFaturamento({ LEMON_API_KEY: "   " }).fonte, "exemplo");
});

test("com LEMON_API_KEY vale o real", () => {
  assert.equal(escolherFaturamento({ LEMON_API_KEY: "chave" }).fonte, "lemon");
});

test("não existe flag separada para ligar o adaptador falso", () => {
  // Flag separada é como se esquece o mock ligado em produção: a configuração
  // diria "produção" e a variável esquecida diria "exemplo".
  const escolhido = escolherFaturamento({ LEMON_API_KEY: "chave", LEMON_MOCK: "1", USAR_EXEMPLO: "true" });
  assert.equal(escolhido.fonte, "lemon");
});

test("os dois adaptadores expõem exatamente as funções do contrato", () => {
  const falso = criarFaturamentoDeExemplo({});
  const real = criarFaturamentoDaLemon({ chave: "k" });

  for (const nome of FUNCOES_DE_FATURAMENTO) {
    assert.equal(typeof falso[nome], "function", `o falso não tem ${nome}`);
    assert.equal(typeof real[nome], "function", `o real não tem ${nome}`);
  }
});

/* ---------------------------------------------------------------- */
/* O falso registra a ação igual ao real                             */
/* ---------------------------------------------------------------- */

test("o adaptador FALSO grava a ação no log administrativo", async () => {
  // Exigência da seção 4 do contrato: sem isto o teste do item 5 passaria por
  // acidente, porque a linha existiria por conta de quem grava a licença.
  const registradas = [];
  const falso = criarFaturamentoDeExemplo({ registrarAcao: async (acao) => registradas.push(acao) });

  const resposta = await falso.trocarPlano("cus_exemplo_002", "anual", { streamerId: "livia-parkour" });

  assert.equal(resposta.ok, true);
  assert.equal(resposta.assinatura.plano, "anual");
  assert.equal(registradas.length, 1);
  assert.equal(registradas[0].acao, "plano_trocado_na_lemon");
  assert.equal(registradas[0].streamerId, "livia-parkour");
  assert.deepEqual(registradas[0].detalhe.de, "mensal");
  assert.equal(registradas[0].detalhe.adaptador, "exemplo");
});

test("cobrança recusada não registra nada no log", async () => {
  const registradas = [];
  const falso = criarFaturamentoDeExemplo({ registrarAcao: async (acao) => registradas.push(acao) });

  const semCliente = await falso.trocarPlano("cus_que_nao_existe", "anual", {});
  assert.equal(semCliente.ok, false);
  assert.equal(semCliente.motivo, MOTIVOS.NAO_ENCONTRADO);
  assert.equal(registradas.length, 0, "registrar antes diria que houve troca quando não houve");
});

test("plano sem cobrança não é mandado para a Lemon Squeezy", async () => {
  // `cortesia` é decisão da Kora e não existe no catálogo deles: mandar seria
  // pedir um plano que não existe e receber 422 numa tela que só queria liberar
  // uma conta.
  const falso = criarFaturamentoDeExemplo({});
  const resposta = await falso.trocarPlano("cus_exemplo_002", "cortesia", {});
  assert.equal(resposta.ok, false);
  assert.equal(resposta.motivo, MOTIVOS.PEDIDO_INVALIDO);
});

/* ---------------------------------------------------------------- */
/* O adaptador real, no que dá para verificar sem a API deles        */
/* ---------------------------------------------------------------- */

test("sem a variante do plano configurada, a troca não sai", async () => {
  // Chutar um id mudaria o plano do cliente para o produto errado, que é o pior
  // desfecho possível desta tela.
  const real = criarFaturamentoDaLemon({ chave: "k", env: {} });
  const resposta = await real.trocarPlano("cus_1", "anual", {});

  assert.equal(resposta.ok, false);
  assert.equal(resposta.motivo, MOTIVOS.SEM_CONFIGURACAO);
  assert.match(String(resposta.detalhe), /LEMON_VARIANTE_ANUAL/);
});

test("a variante sai do ambiente, nunca do código", () => {
  assert.equal(varianteDoPlano({ LEMON_VARIANTE_MENSAL: "123456" }, "mensal"), "123456");
  assert.equal(varianteDoPlano({}, "mensal"), null);
  assert.equal(varianteDoPlano({ LEMON_VARIANTE_MENSAL: "  " }, "mensal"), null);
});

test("o adaptador real nunca lança, nem sem rede nenhuma", async () => {
  const real = criarFaturamentoDaLemon({
    chave: "k",
    env: { LEMON_VARIANTE_ANUAL: "1" },
    buscar: async () => {
      throw new Error("sem rede");
    },
  });

  const resposta = await real.assinaturaDe("cus_1");
  assert.equal(resposta.ok, false);
  assert.equal(resposta.motivo, MOTIVOS.REDE);
});

test("o adaptador real escolhe a assinatura ATIVA, não a primeira", async () => {
  // Cliente que cancelou e voltou tem duas. Mexer na antiga seria mudar o plano
  // de uma assinatura que não cobra mais nada.
  const real = criarFaturamentoDaLemon({
    chave: "k",
    buscar: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: "10", attributes: { status: "cancelled", variant_name: "mensal", currency: "USD" } },
          { id: "11", attributes: { status: "active", variant_name: "anual", currency: "USD" } },
        ],
      }),
    }),
  });

  const resposta = await real.assinaturaDe("cus_1");
  assert.equal(resposta.ok, true);
  assert.equal(resposta.assinatura.id, "11");
  assert.equal(resposta.assinatura.estado, "ativa");
});

/* ---------------------------------------------------------------- */
/* Item 3: a troca inteira, nos dois sistemas                        */
/* ---------------------------------------------------------------- */

const montar = () => {
  const dados = criarDadosDeExemplo({ agora: AGORA });
  const faturamento = escolherFaturamento({}, { registrarAcao: dados.registrarAcao });
  return { dados, faturamento };
};

test("a troca completa muda o plano e escreve as duas linhas de log", async () => {
  const { dados, faturamento } = montar();

  const resposta = await trocarPlanoDoAssinante({
    dados,
    faturamento,
    streamerId: "livia-parkour",
    plano: "anual",
    motivo: "upgrade pedido por e-mail",
  });

  assert.equal(resposta.ok, true);
  assert.equal(resposta.ficha.plano, "anual");
  assert.equal(resposta.cobranca.escrita, true);

  const log = await dados.listarAcoesAdministrativas({});
  const verbos = log.acoes.map((a) => a.acao).sort();
  assert.deepEqual(verbos, ["plano_trocado", "plano_trocado_na_lemon"]);

  // O motivo escrito pelo operador está na linha, que é a única razão de o
  // campo ser obrigatório.
  const local = log.acoes.find((a) => a.acao === "plano_trocado");
  assert.equal(local.detalhe.motivo, "upgrade pedido por e-mail");
  assert.equal(local.detalhe.cobranca.escrita, true);
});

test("sem motivo, a troca é recusada antes de tocar qualquer sistema", async () => {
  const { dados, faturamento } = montar();

  const resposta = await trocarPlanoDoAssinante({
    dados,
    faturamento,
    streamerId: "livia-parkour",
    plano: "anual",
    motivo: "  ",
  });

  assert.equal(resposta.ok, false);
  assert.equal(resposta.motivo, MOTIVOS.PEDIDO_INVALIDO);

  const ficha = await dados.buscarFicha("livia-parkour");
  assert.equal(ficha.ficha.plano, "mensal", "o plano mudou mesmo com o pedido recusado");
  const log = await dados.listarAcoesAdministrativas({});
  assert.equal(log.acoes.length, 0);
});

test("conta de cortesia troca de plano sem passar pela Lemon Squeezy", async () => {
  // `kora-demo` nunca comprou: `lemonCustomerId` é nulo. Não é erro, e a tela
  // precisa poder dizer que a troca valeu só na base da Kora.
  const { dados, faturamento } = montar();

  const resposta = await trocarPlanoDoAssinante({
    dados,
    faturamento,
    streamerId: "kora-demo",
    plano: "mensal",
    motivo: "virou cliente pagante",
  });

  assert.equal(resposta.ok, true);
  assert.equal(resposta.cobranca.escrita, false);
  assert.equal(resposta.cobranca.motivo, "sem_cliente_na_lemon");
  assert.equal(resposta.ficha.plano, "mensal");
});

test("cobrança que falha ABORTA a troca, e a base da Kora fica como estava", async () => {
  const { dados } = montar();
  const faturamentoQuebrado = {
    fonte: "lemon",
    async assinaturaDe() {
      return { ok: false, motivo: MOTIVOS.HTTP };
    },
    async trocarPlano() {
      return { ok: false, motivo: MOTIVOS.HTTP };
    },
  };

  const resposta = await trocarPlanoDoAssinante({
    dados,
    faturamento: faturamentoQuebrado,
    streamerId: "livia-parkour",
    plano: "anual",
    motivo: "upgrade pedido por e-mail",
  });

  assert.equal(resposta.ok, false);

  // Gravar `anual` aqui enquanto lá continua cobrando mensal produziria uma
  // ficha que mente para quem atende, e o cliente descobriria pela fatura.
  const ficha = await dados.buscarFicha("livia-parkour");
  assert.equal(ficha.ficha.plano, "mensal");
  const log = await dados.listarAcoesAdministrativas({});
  assert.equal(log.acoes.length, 0);
});

test("plano fora do catálogo não chega a lugar nenhum", async () => {
  const { dados, faturamento } = montar();
  const resposta = await trocarPlanoDoAssinante({
    dados,
    faturamento,
    streamerId: "livia-parkour",
    plano: "vitalicio",
    motivo: "pedido do cliente",
  });

  assert.equal(resposta.ok, false);
  assert.equal(resposta.motivo, MOTIVOS.PEDIDO_INVALIDO);
});

/* ---------------------------------------------------------------- */
/* Item 4: a conta do mês                                            */
/* ---------------------------------------------------------------- */

test("o mês soma criação e renovação, e não conta cancelamento como receita", () => {
  const linhas = [
    { tipo: "assinatura_criada", valorCentavos: 19_900, moeda: "USD", em: "2026-09-02T10:00:00.000Z" },
    { tipo: "assinatura_renovada", valorCentavos: 1_900, moeda: "USD", em: "2026-09-06T10:00:00.000Z" },
    { tipo: "assinatura_cancelada", valorCentavos: 0, moeda: "USD", em: "2026-09-07T10:00:00.000Z" },
    // Mês vizinho: não entra.
    { tipo: "assinatura_criada", valorCentavos: 1_900, moeda: "USD", em: "2026-08-30T10:00:00.000Z" },
  ];

  const resumo = resumirFaturamento(linhas, "2026-09");

  assert.equal(resumo.mrrCentavos, 21_800);
  assert.equal(Number.isInteger(resumo.mrrCentavos), true, "centavo tem de ser inteiro");
  assert.equal(resumo.vendas, 1, "renovação não é venda nova");
  assert.equal(resumo.cancelamentos, 1);
  assert.equal(resumo.moeda, "USD");
});

test("reembolso abate do mês, e não vira receita negativa escondida", () => {
  const linhas = [
    { tipo: "assinatura_criada", valorCentavos: 1_900, moeda: "USD", em: "2026-09-02T10:00:00.000Z" },
    { tipo: "reembolso", valorCentavos: 1_900, moeda: "USD", em: "2026-09-03T10:00:00.000Z" },
  ];

  const resumo = resumirFaturamento(linhas, "2026-09");
  assert.equal(resumo.mrrCentavos, 0, "dinheiro que voltou não é receita do mês");
  assert.equal(resumo.vendas, 1);
});

test("a decisão do MRR é receita cobrada: o anual entra INTEIRO no mês", () => {
  // É a divergência que a decisão resolve. Pela projeção da carteira o anual
  // entraria como 1/12 por mês; pela receita cobrada ele entra inteiro, uma vez.
  // A tela do item 4 diz isso com todas as letras, e há teste em telas.test.mjs.
  const resumo = resumirFaturamento(
    [{ tipo: "assinatura_criada", plano: "anual", valorCentavos: 19_900, moeda: "USD", em: "2026-09-02T10:00:00.000Z" }],
    "2026-09",
  );

  assert.equal(resumo.mrrCentavos, 19_900);
  assert.notEqual(resumo.mrrCentavos, Math.round(19_900 / 12));
});
