/**
 * A única porta de rede do console, no lado do navegador.
 *
 * Nenhum componente chama `fetch`. É a mesma regra do painel (CLAUDE.md), e
 * aqui ela tem um segundo motivo: **o navegador nunca fala com o Supabase.**
 * Quem tem a chave de serviço é o processo Node que serve esta página, e ela
 * ignora RLS. Este arquivo fala com `/api` da própria origem, e mais nada.
 *
 * A superfície é a MESMA da camada de dados (`src/dados/contrato.js`): mesmos
 * nomes, mesmos argumentos, mesmo envelope `{ ok, ... }`. Quem escreve tela não
 * precisa saber que existe um salto de HTTP no meio, e trocar o transporte não
 * mexe em componente nenhum.
 *
 * **Nunca lança**, pela mesma razão do contrato: numa tela de operador, "não
 * há assinante" e "não deu para perguntar" levam a decisões opostas, e exceção
 * solta transforma a segunda na primeira.
 */

/** Mesma origem. Não existe variável de ambiente aqui, e é de propósito. */
const BASE = "/api";

async function chamar(caminho, opcoes = {}) {
  let resposta;
  try {
    resposta = await fetch(`${BASE}${caminho}`, {
      headers: { "content-type": "application/json" },
      ...opcoes,
    });
  } catch {
    // O caso comum não é a base cair, é a aba ficar aberta depois de o
    // servidor ter sido derrubado. A tela precisa dizer isso, e não
    // "Failed to fetch".
    return { ok: false, motivo: "console_offline" };
  }

  try {
    // O corpo é o envelope do contrato inclusive no erro: o status HTTP existe
    // para a aba de rede não mentir, e quem decide é o `ok` do corpo.
    return await resposta.json();
  } catch {
    return { ok: false, motivo: "corpo_ilegivel" };
  }
}

const querystring = (campos) => {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(campos)) {
    if (valor !== null && valor !== undefined && valor !== "") busca.set(chave, String(valor));
  }
  const texto = busca.toString();
  return texto ? `?${texto}` : "";
};

const json = (metodo, corpo) => ({ method: metodo, body: JSON.stringify(corpo) });

export const api = {
  /* Item 1 */
  listarAssinantes: ({ busca = "", limite = null, cursor = null } = {}) =>
    chamar(`/assinantes${querystring({ busca, limite, cursor })}`),

  /* Item 2 */
  buscarFicha: (streamerId) => chamar(`/assinantes/${encodeURIComponent(streamerId)}`),

  /* Item 3 */
  trocarPlano: (streamerId, plano, { motivo = null } = {}) =>
    chamar(`/assinantes/${encodeURIComponent(streamerId)}/plano`, json("POST", { plano, motivo })),

  /* Item 4 */
  resumoDeFaturamento: ({ mes = null } = {}) => chamar(`/faturamento${querystring({ mes })}`),

  /* Item 5 */
  listarEventos: ({ streamerId = null, desde = null, limite = null } = {}) =>
    chamar(`/eventos${querystring({ streamerId, desde, limite })}`),
  listarAcoesAdministrativas: ({ desde = null, limite = null } = {}) =>
    chamar(`/acoes${querystring({ desde, limite })}`),
  registrarAcao: ({ acao, streamerId = null, detalhe = {} }) =>
    chamar("/acoes", json("POST", { acao, streamerId, detalhe })),

  /* Item 6 */
  saudeDeConexao: () => chamar("/saude"),

  /** Qual implementação está do outro lado. Só o nome, nunca a URL nem a chave. */
  fonte: () => chamar("/fonte"),
};
