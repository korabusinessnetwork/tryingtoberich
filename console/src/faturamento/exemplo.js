/**
 * O adaptador FALSO da Lemon Squeezy, e o ativo por padrão.
 *
 * A regra que o diferencia de um `mock` qualquer é a mesma da base falsa, e o
 * contrato da onda 2 é explícito na seção 4: **ele registra a ação no log
 * administrativo do mesmo jeito que o real.** Sem isso o teste do item 5
 * passaria por acidente, porque a linha existiria por conta de quem grava a
 * licença e não por conta de quem mexeu no dinheiro, e no dia em que o
 * adaptador real entrasse o log perderia metade da história sem ninguém notar.
 *
 * As assinaturas de exemplo espelham `dados/exemplo.js`: mesmo `lemonCustomerId`,
 * mesmo plano, mesmo valor em centavos. Duas bases falsas que discordam entre si
 * são pior que uma só, porque a tela mostra as duas ao mesmo tempo.
 */

import { ACAO_NA_LEMON, falha, MOTIVOS, planoCobrado, sucesso } from "./contrato.js";

/**
 * Preço de cada plano, em CENTAVOS inteiros e com a moeda ao lado.
 *
 * Aqui é dado de exemplo, e só. Quem sabe preço de verdade é a Lemon Squeezy, e
 * o adaptador real lê o valor de lá em vez de decidir: preço cravado no console
 * seria uma segunda fonte de verdade do dinheiro, que é justamente o que o
 * ADR-P02 não quer.
 */
const PRECO = { mensal: { valorCentavos: 1_900, moeda: "USD" }, anual: { valorCentavos: 19_900, moeda: "USD" } };

/** Espelha os `lemonCustomerId` de `dados/exemplo.js`, um a um. */
function assinaturasDeExemplo() {
  return new Map([
    ["cus_exemplo_001", { id: "sub_ex_001", plano: "anual", estado: "ativa", ...PRECO.anual }],
    ["cus_exemplo_002", { id: "sub_ex_002", plano: "mensal", estado: "ativa", ...PRECO.mensal }],
    ["cus_exemplo_003", { id: "sub_ex_003", plano: "mensal", estado: "ativa", ...PRECO.mensal }],
    ["cus_exemplo_004", { id: "sub_ex_004", plano: "mensal", estado: "expirada", ...PRECO.mensal }],
    ["cus_exemplo_005", { id: "sub_ex_005", plano: "mensal", estado: "cancelada", ...PRECO.mensal }],
    // `cus_exemplo_007` comprou e ainda não instalou: a assinatura existe lá e
    // ainda não virou licença aqui. É o caso que faz a troca de plano funcionar
    // para quem a ficha mostra sem licença nenhuma.
    ["cus_exemplo_007", { id: "sub_ex_007", plano: "mensal", estado: "ativa", ...PRECO.mensal }],
  ]);
}

/**
 * @param registrarAcao a `registrarAcao` da camada de dados, injetada.
 *        Entra por parâmetro, e não por import, porque quem escolhe a base é a
 *        configuração: o adaptador não pode decidir sozinho em qual log escreve.
 */
export function criarFaturamentoDeExemplo({ registrarAcao } = {}) {
  const assinaturas = assinaturasDeExemplo();

  const copiar = (assinatura) => ({ ...assinatura });

  return {
    fonte: "exemplo",

    async assinaturaDe(lemonCustomerId) {
      if (!lemonCustomerId) return falha(MOTIVOS.PEDIDO_INVALIDO, "lemonCustomerId é obrigatório");
      const assinatura = assinaturas.get(String(lemonCustomerId));
      // Cliente sem assinatura é resposta, não é falha: cortesia e conta de
      // teste nunca passaram pela Lemon Squeezy, e a tela precisa dizer isso
      // sem confundir com "não deu para perguntar".
      return sucesso({ assinatura: assinatura ? copiar(assinatura) : null });
    },

    async trocarPlano(lemonCustomerId, plano, { streamerId = null } = {}) {
      if (!lemonCustomerId) return falha(MOTIVOS.PEDIDO_INVALIDO, "lemonCustomerId é obrigatório");
      if (!planoCobrado(plano)) return falha(MOTIVOS.PEDIDO_INVALIDO, "plano sem cobrança na Lemon Squeezy");

      const assinatura = assinaturas.get(String(lemonCustomerId));
      if (!assinatura) return falha(MOTIVOS.NAO_ENCONTRADO, "sem assinatura na Lemon Squeezy");

      const anterior = assinatura.plano;
      Object.assign(assinatura, { plano, ...PRECO[plano] });

      // O log é gravado DEPOIS da escrita, igual ao real: registrar antes diria
      // que houve troca quando a Lemon recusou.
      //
      // `streamerId` viaja junto porque log de conta sem a conta é log que
      // ninguém cruza com a ficha depois. O adaptador não descobre o streamerId
      // sozinho, então quem chama entrega.
      await registrarAcao?.({
        acao: ACAO_NA_LEMON,
        streamerId,
        detalhe: {
          de: anterior,
          para: plano,
          lemonCustomerId: String(lemonCustomerId),
          assinatura: assinatura.id,
          adaptador: "exemplo",
        },
      });

      return sucesso({ assinatura: copiar(assinatura) });
    },
  };
}
