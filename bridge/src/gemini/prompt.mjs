/**
 * O prompt P1, montado a partir do acervo. Ver docs/10_PROMPTS.
 *
 * Prompt vive em arquivo próprio e é referenciado pelo código, nunca escrito
 * solto no meio de uma função. Tudo aqui é função pura: quem chama a API é o
 * cliente ao lado.
 */

import { FATOR_DERIVA_HORIZONTAL, FATOR_SALTO_VERTICAL } from "../dominio/regras.mjs";

export const SYSTEM = `Você é um gerador de layout de mapa para um jogo de escalada vertical no Roblox.
Você recebe uma descrição de ambiente em português e devolve APENAS um objeto
JSON válido, sem markdown, sem crase, sem texto antes ou depois.

Você NÃO cria imagens, texturas nem skyboxes. Você ESCOLHE um item da lista de
acervo fornecida. Usar um id que não está na lista é erro.

REGRA MAIS IMPORTANTE: o mapa precisa ser escalável do início ao topo usando
apenas pulos normais do jogador, sem nenhuma ajuda externa. Se um salto for
alto demais, o mapa está errado.

Regras de faixa (obrigatórias):
- totalPlataformas: inteiro entre 100 e 400
- jumpHeight: entre 7 e 12 (altura de pulo do personagem, em studs)
- raioBase: número entre 4 e 14
- variacaoRaio: entre 0 e 0.5
- espacamentoVertical: entre 3 e (jumpHeight * ${FATOR_SALTO_VERTICAL}), NUNCA acima disso
- variacaoHorizontal: entre 0 e (raioBase * ${FATOR_DERIVA_HORIZONTAL})
- paleta: três cores em hexadecimal
- props: no máximo 3 tipos, todos escolhidos da lista de acervo, densidade entre 0 e 1
- marcos: um checkpoint visual a cada 50 plataformas, e um marco "topo" na
  última plataforma

Coerência: a paleta e a escolha de skybox e textura devem refletir a descrição.
Um ambiente noturno não recebe paleta clara.`;

/** As listas injetadas trazem só id e tags: é por elas que o modelo casa a descrição. */
const listar = (itens) =>
  itens.length === 0
    ? "(vazio)"
    : itens.map((item) => `- ${item.id}: ${item.tags.join(", ")}`).join("\n");

const FORMATO = `{
  "mapaId": "identificador-em-minusculas-com-hifen",
  "streamerId": "local",
  "nome": "Nome curto do mapa",
  "geradoPor": "gemini",
  "totalPlataformas": 250,
  "jumpHeight": 7.2,
  "skyboxAssetId": "<id do acervo de skybox>",
  "paleta": { "primaria": "#RRGGBB", "secundaria": "#RRGGBB", "destaque": "#RRGGBB" },
  "plataformas": {
    "formato": "disco",
    "raioBase": 8,
    "variacaoRaio": 0.3,
    "espacamentoVertical": 5,
    "variacaoHorizontal": 9,
    "materialAssetId": "<id do acervo de textura>"
  },
  "props": [ { "tipo": "<id do acervo de props>", "densidade": 0.4, "aCadaNPlataformas": 10 } ],
  "marcos": [ { "plataforma": 50, "tipo": "checkpoint_visual" }, { "plataforma": 250, "tipo": "topo" } ]
}`;

export function montarPrompt(descricao, acervo) {
  return `Descrição do streamer: ${descricao}

Acervo de skybox disponível:
${listar(acervo.skybox)}

Acervo de textura de plataforma disponível:
${listar(acervo.texturas)}

Acervo de props disponível:
${listar(acervo.props)}

Formato de saída exato:
${FORMATO}`;
}

/**
 * Retentativa única, acrescentando ao prompt o que veio errado.
 * Nunca preencher campo faltante com chute: ou o modelo acerta, ou vira erro
 * claro no painel. Ver P1, pós-processamento.
 */
export function montarPromptDeCorrecao(descricao, acervo, problemas) {
  return `${montarPrompt(descricao, acervo)}

A tentativa anterior foi rejeitada por estes motivos. Corrija TODOS e devolva o
JSON inteiro de novo:
${problemas.map((p) => `- ${p}`).join("\n")}`;
}

/** O modelo às vezes devolve cerca de código mesmo mandado não devolver. */
export function limparCercaDeCodigo(texto) {
  return String(texto ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}
