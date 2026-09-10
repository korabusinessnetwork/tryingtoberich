/**
 * A interface do adaptador da Lemon Squeezy, e nada mais.
 *
 * Duas implementações, escolhidas por configuração, exatamente como a camada de
 * dados: o console fala só com esta forma e nunca sabe qual está ligada
 * (contrato da onda 2, seção 4).
 *
 * **O envelope é o MESMO da camada de dados**, e é por isso que este arquivo
 * reexporta `falha`, `sucesso` e `MOTIVOS` em vez de inventar os próprios. Duas
 * gramáticas de erro na mesma tela seriam duas listas de frase para o operador
 * ler, e a segunda nasceria incompleta.
 *
 * @typedef {Object} Assinatura
 * @property {string}      id            o id da assinatura na Lemon Squeezy
 * @property {string|null} plano
 * @property {string}      estado        'ativa' | 'cancelada' | 'expirada'
 * @property {number}      valorCentavos inteiro, sempre
 * @property {string}      moeda
 */

import { falha, MOTIVOS, sucesso } from "../dados/contrato.js";

/**
 * Os nomes que as duas implementações precisam ter, todos.
 *
 * Mesma razão da lista da camada de dados: o teste confere as duas contra a
 * MESMA fonte, senão a falsa ganha uma função que a real não tem no dia em que
 * a tela precisar dela, e a descoberta é em produção.
 */
export const FUNCOES_DE_FATURAMENTO = Object.freeze(["trocarPlano", "assinaturaDe"]);

/**
 * O catálogo de planos do console.
 *
 * Mora aqui, e não numa tela, porque plano é assunto de cobrança: quem decide
 * o que existe para vender é a Lemon Squeezy. Enquanto não há catálogo real
 * para consultar (a chave não existe), esta lista é a fonte, e ela é do
 * PRODUTO, não de nenhum streamer: nada de marca ou de regra do Matheus aqui
 * (CLAUDE.md, single-tenant agora, multi-tenant no roadmap).
 */
export const PLANOS = Object.freeze(["mensal", "anual", "cortesia"]);

/**
 * Os planos que geram cobrança, e por isso os únicos que a Lemon Squeezy
 * conhece. `cortesia` é decisão da Kora e não existe lá: mandar o adaptador
 * escrever "cortesia" na assinatura seria pedir um plano que não está no
 * catálogo e receber 422 numa tela que só queria liberar uma conta.
 */
export const PLANOS_COBRADOS = Object.freeze(["mensal", "anual"]);

export const planoValido = (plano) => PLANOS.includes(String(plano ?? "").trim());

export const planoCobrado = (plano) => PLANOS_COBRADOS.includes(String(plano ?? "").trim());

/**
 * O verbo que o adaptador grava no log administrativo.
 *
 * É diferente do `plano_trocado` que a camada de dados grava, e a diferença
 * importa: são dois sistemas escritos em sequência, a Lemon Squeezy primeiro e
 * a base da Kora depois. Se o processo morrer no meio, o log mostra a linha da
 * Lemon sem a linha da Kora, e é exatamente esse o estado que alguém precisa
 * consertar. Um verbo só para os dois esconderia a metade que ficou.
 */
export const ACAO_NA_LEMON = "plano_trocado_na_lemon";

/** Por que a Lemon Squeezy não foi chamada, quando não foi. Nunca é silêncio. */
export const SEM_COBRANCA = Object.freeze({
  SEM_CLIENTE: "sem_cliente_na_lemon",
  PLANO_SEM_COBRANCA: "plano_sem_cobranca",
});

export { falha, MOTIVOS, sucesso };
