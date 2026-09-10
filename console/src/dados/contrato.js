/**
 * A interface da camada de dados do console, e nada mais.
 *
 * O console inteiro fala só com esta forma e nunca sabe qual implementação
 * está ligada (contrato da onda 2, seção 3). Quem conhece o banco é
 * `supabase.js`, e ele é o único lugar do console onde `snake_case` aparece:
 * tudo que sai daqui já está em português de domínio.
 *
 * **Erro nunca vira exceção solta.** Toda função devolve um envelope:
 * `{ ok: true, ...carga }` quando deu, `{ ok: false, motivo }` quando não deu.
 * O motivo é o mesmo espírito do `bridge/src/repos/supabase.mjs`: quem chama
 * precisa distinguir "o banco respondeu" de "não deu para perguntar", e
 * exceção é o jeito errado de dizer a segunda. Numa tela de operador a
 * diferença é grande: lista vazia porque não há assinante e lista vazia porque
 * a base caiu levam a decisões opostas.
 *
 * O envelope carrega `ok` porque a tabela do contrato descreve a CARGA, não a
 * resposta inteira: `listarAssinantes` devolve `{ ok: true, assinantes, proximo }`.
 *
 * @typedef {Object} Assinante
 * @property {string}      streamerId
 * @property {string}      email
 * @property {string|null} usuarioTiktok    o @ da TikTok, sem arroba
 * @property {string|null} nome
 * @property {string|null} idioma           'pt' | 'es' | 'en', do perfil (ADR-P03)
 * @property {string|null} licenca          a chave, quando existe licença
 * @property {string|null} licencaEstado    'ativa' | 'expirada' | 'cancelada'
 * @property {string|null} plano
 * @property {string|null} criadoEm         ISO 8601
 *
 * @typedef {Assinante & {
 *   validaAte: string|null,
 *   ultimaConexao: string|null,
 *   versaoInstalada: string|null,
 *   modalidades: string[],
 * }} Ficha
 * As sete coisas do item 2 do ADR-P05: estado da licença, plano, data de
 * início, última conexão, modalidades usadas, idioma do perfil e versão
 * instalada.
 *
 * @typedef {Object} Evento            uma linha de telemetria (item 5)
 * @property {number}      id
 * @property {string}      streamerId
 * @property {string}      tipo         'instalacao' | 'conexao' | 'queda' | 'desconexao'
 * @property {string}      em
 * @property {string|null} versaoInstalada
 * @property {string|null} idioma
 * @property {string|null} modalidade
 * @property {string|null} motivo
 *
 * @typedef {Object} AcaoAdministrativa uma linha do log imutável (item 5)
 * @property {number}      id
 * @property {string}      operador
 * @property {string}      acao         verbo em snake_case, nunca frase
 * @property {string|null} streamerId
 * @property {Object}      detalhe      o antes e o depois
 * @property {string}      em
 */

/**
 * Os nomes que as duas implementações precisam ter, todos.
 *
 * Existe como lista para o teste conferir as duas contra a MESMA fonte. Sem
 * isso, a falsa ganharia uma função que a real não tem no dia em que uma tela
 * precisasse dela, e a descoberta seria em produção.
 */
export const FUNCOES = Object.freeze([
  "listarAssinantes",
  "buscarFicha",
  "trocarPlano",
  "resumoDeFaturamento",
  "listarEventos",
  "listarAcoesAdministrativas",
  "saudeDeConexao",
  "registrarAcao",
]);

/**
 * Motivos de falha. São poucos de propósito: a tela decide o que dizer ao
 * operador a partir daqui, e uma lista aberta viraria `String(erro)` na tela.
 */
export const MOTIVOS = Object.freeze({
  SEM_CONFIGURACAO: "sem_configuracao",
  REDE: "rede",
  TIMEOUT: "timeout",
  HTTP: "http",
  CORPO_ILEGIVEL: "corpo_ilegivel",
  NAO_ENCONTRADO: "nao_encontrado",
  PEDIDO_INVALIDO: "pedido_invalido",
});

/** Falha do contrato. `detalhe` vai para o log local, nunca para a tela crua. */
export const falha = (motivo, detalhe = null) => ({ ok: false, motivo, detalhe });

/** Sucesso do contrato. A carga é o que a tabela da seção 3 descreve. */
export const sucesso = (carga) => ({ ok: true, ...carga });

/** Verdadeiro quando a resposta não é um sucesso, inclusive quando é nula. */
export const falhou = (resposta) => !resposta || resposta.ok !== true;

/**
 * Limite pedido pela tela, dentro do que faz sentido pedir ao banco de uma vez.
 * A tela do operador é desktop e densa, mas nem ela lê mil linhas por vez.
 */
export const LIMITE_PADRAO = 50;
export const LIMITE_MAXIMO = 200;

export function limiteValido(limite) {
  const numero = Number.parseInt(limite, 10);
  if (!Number.isFinite(numero) || numero <= 0) return LIMITE_PADRAO;
  return Math.min(numero, LIMITE_MAXIMO);
}
