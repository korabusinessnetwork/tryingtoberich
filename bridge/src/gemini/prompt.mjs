/**
 * O prompt P1, montado a partir do acervo. Ver docs/10_PROMPTS.
 *
 * Prompt vive em arquivo próprio e é referenciado pelo código, nunca escrito
 * solto no meio de uma função. Tudo aqui é função pura: quem chama a API é o
 * cliente ao lado.
 */

//[[ Os números do mapa NÃO são escritos aqui.
//
// O prompt e `PADROES_POR_FORMATO` já disseram coisas diferentes uma vez, e o
// efeito é o pior tipo de bug: o mundo montado à mão sai de um jeito e o gerado
// pela IA sai de outro, os dois "certos" segundo o código que os produziu.
// Interpolar a constante é o que impede a divergência de nascer de novo. ]]
import {
  alcanceHorizontalDoPulo,
  FATOR_SALTO_VERTICAL,
  PADRAO_DO_MUNDO,
  PADROES_POR_FORMATO,
} from "../dominio/regras.mjs";

const DISCO = PADROES_POR_FORMATO.disco;
const LAJE = PADROES_POR_FORMATO.laje;

/**
 * O papel do modelo. Depende do formato porque as regras de plataforma são
 * opostas entre `disco` e `laje` — ver `REGRAS_DE_PLATAFORMA` abaixo.
 */
export const SYSTEM = (formato = "disco") => `Você é um gerador de layout de mapa para um jogo de escalada vertical no Roblox.
Você recebe uma descrição de ambiente em português e devolve APENAS um objeto
JSON válido, sem markdown, sem crase, sem texto antes ou depois.

Você NÃO cria imagens, texturas nem skyboxes. Você ESCOLHE um item da lista de
acervo fornecida. Usar um id que não está na lista é erro.

REGRA MAIS IMPORTANTE: o mapa precisa ser escalável do início ao topo usando
apenas pulos normais do jogador, sem nenhuma ajuda externa. Se um salto for
alto demais, o mapa está errado.

Regras de faixa (obrigatórias):
- totalPlataformas: use ${PADRAO_DO_MUNDO.totalPlataformas}. É o padrão do produto e a resposta certa em quase
  todo caso: torre curta acaba no meio da live e o jogo fica sem para onde subir.
  Só use menos se a descrição PEDIR uma torre baixa, e nunca menos que 100 nem
  mais que ${PADRAO_DO_MUNDO.totalPlataformas}.
- jumpHeight: use ${PADRAO_DO_MUNDO.jumpHeight}. É o padrão do produto, e todo o
  resto (passo horizontal e subida) é limitado por ele: pulo mais baixo aperta o
  alcance, e é o alcance que decide o quanto a torre pode ser espaçada.
${REGRAS_DE_PLATAFORMA[formato] ?? REGRAS_DE_PLATAFORMA.disco}
- materialAssetId: a textura dos degraus. Um id só pinta a torre inteira igual.
  Uma LISTA de ids reveza as texturas degrau a degrau, na ordem dada — é assim,
  e SÓ assim, que se faz uma torre de blocos variados. Quando a descrição pedir
  variedade ("cada bloco diferente", "vários materiais", "blocos variados"),
  devolva a lista, com quantos ids do acervo fizerem sentido para o tema.
- paleta: três cores em hexadecimal. Atenção: com UMA textura, a paleta tinge os
  degraus e faz o gradiente da torre. Com uma LISTA, os degraus não são tingidos
  — quem carrega a variedade é a textura. Escolha a paleta pensando no que vale
  no seu caso.
- props: no máximo 3 tipos, todos escolhidos da lista de acervo, densidade entre 0 e 1
- marcos: um checkpoint visual a cada 250 plataformas, e um marco "topo" na
  última plataforma

Coerência: a paleta e a escolha de skybox e textura devem refletir a descrição.
Um ambiente noturno não recebe paleta clara.`;


/**
 * As regras de plataforma, uma receita por formato.
 *
 * Não é enfeite de prompt: as duas são **matematicamente opostas** e o
 * validador escolhe pela mesma chave (`regras.mjs`). Mandar a receita do disco
 * num pedido de laje faria o modelo devolver um spec que o validador reprova
 * nas três tentativas, e o streamer veria "não consegui gerar" sem motivo.
 */
export const REGRAS_DE_PLATAFORMA = {
  disco: `- formato: use "disco".
- raioBase: raio do disco, entre 7 e 8. Degrau largo, de pisar com folga.
  A torre é uma ESCADA QUADRADA: degraus grandes, bem afastados, subindo pelo
  perímetro de um quadrado, 6 por lado. Não é pilha de discos nem pedrinha solta.
- variacaoRaio: use 0.1. Quanto MAIOR, menor pode ser o passo — porque o pior
  caso do vão é o disco pequeno, e variacaoRaio sorteia para baixo também.
- espacamentoVertical: a subida de um degrau para o outro. Use ${DISCO.espacamentoVertical}.
  Degrau baixo, de subir sem esforço — a distância que dá a sensação de torre é
  a HORIZONTAL, não a vertical. NUNCA acima de (jumpHeight * ${FATOR_SALTO_VERTICAL}),
  que viraria salto impossível.
- variacaoHorizontal: o passo entre um degrau e o seguinte, de CENTRO a centro.
  Use EXATAMENTE ${DISCO.variacaoHorizontal}, que é o padrão afinado do produto.
  Só mude se alguma das duas regras abaixo reprovar com ele.
  Duas regras, as duas obrigatórias:
    (a) o VÃO no PIOR caso, que é com os discos MENORES:
        (variacaoHorizontal - 2 * raioBase * (1 - variacaoRaio))
        não pode passar do alcance horizontal do pulo:
        jumpHeight ${PADRAO_DO_MUNDO.jumpHeight} -> ${alcanceHorizontalDoPulo(PADRAO_DO_MUNDO.jumpHeight).toFixed(1)}   jumpHeight 12 -> ${alcanceHorizontalDoPulo(12).toFixed(1)}
        Vão maior que isso é salto que não se alcança: torre travada.
    (b) variacaoHorizontal tem que ser MAIOR que raioBase * (1 + variacaoRaio),
        senão um disco cobre o anterior inteiro e a torre vira coluna maciça.`,

  laje: `- formato: use "laje".
  Não é torre: é uma RAMPA RETA subindo para o céu, feita dos MESMOS degraus
  quadrados da escada, encostados um no outro. Sem caracol, sem vaivém e sem
  virar em canto nenhum — uma linha só, indo embora e subindo. Não há vão e não
  há pulo: o jogador sobe ANDANDO, degrau por degrau.
- raioBase: meia-largura do degrau. Use ${LAJE.raioBase}, o mesmo tamanho da escada.
- variacaoRaio: use 0, obrigatoriamente. Degrau de tamanho sorteado abriria
  buraco no caminho; passarela é feita de degrau IGUAL.
- espacamentoVertical: use EXATAMENTE ${LAJE.espacamentoVertical}. É a espessura do degrau, e é o que faz
  um degrau apoiar no anterior em vez de flutuar acima dele. Mais que isso abre
  fresta por baixo e obriga a pular — e passarela é para subir andando.
- variacaoHorizontal: o passo entre uma laje e a seguinte, de CENTRO a centro.
  Use EXATAMENTE ${LAJE.variacaoHorizontal}, que é o padrão afinado do produto.
  Aqui ele é o AVANÇO por degrau, e é ele que decide a inclinação da rampa:
  quanto menor, mais em pé ela fica. Igual à subida, ele dá uma rampa de 45
  graus apontando para o céu. NUNCA maior que (2 * raioBase), senão abre
  buraco entre um degrau e o outro; menor pode, e é o que levanta a rampa.`,
};

/** As listas injetadas trazem só id e tags: é por elas que o modelo casa a descrição. */
const listar = (itens) =>
  itens.length === 0
    ? "(vazio)"
    : itens.map((item) => `- ${item.id}: ${item.tags.join(", ")}`).join("\n");

export const FORMATO = (formato = "disco") => `{
  "mapaId": "identificador-em-minusculas-com-hifen",
  "streamerId": "local",
  "nome": "Nome curto do mapa",
  "geradoPor": "gemini",
  "totalPlataformas": ${PADRAO_DO_MUNDO.totalPlataformas},
  "jumpHeight": ${PADRAO_DO_MUNDO.jumpHeight},
  "skyboxAssetId": "<id do acervo de skybox>",
  "paleta": { "primaria": "#RRGGBB", "secundaria": "#RRGGBB", "destaque": "#RRGGBB" },
  "plataformas": {
    "formato": "${formato}",
    "raioBase": ${(PADROES_POR_FORMATO[formato] ?? DISCO).raioBase},
    "variacaoRaio": ${(PADROES_POR_FORMATO[formato] ?? DISCO).variacaoRaio},
    "espacamentoVertical": ${(PADROES_POR_FORMATO[formato] ?? DISCO).espacamentoVertical},
    "variacaoHorizontal": ${(PADROES_POR_FORMATO[formato] ?? DISCO).variacaoHorizontal},
    "materialAssetId": "<id do acervo de textura, OU uma lista deles>"
  },
  "props": [ { "tipo": "<id do acervo de props>", "densidade": 0.4, "aCadaNPlataformas": 10 } ],
  "marcos": [ { "plataforma": 250, "tipo": "checkpoint_visual" }, { "plataforma": ${PADRAO_DO_MUNDO.totalPlataformas}, "tipo": "topo" } ]
}`;

export function montarPrompt(descricao, acervo, formato = "disco") {
  return `Descrição do streamer: ${descricao}

Acervo de skybox disponível:
${listar(acervo.skybox)}

Acervo de textura de plataforma disponível:
${listar(acervo.texturas)}

Acervo de props disponível:
${listar(acervo.props)}

Formato de saída exato:
${FORMATO(formato)}`;
}

/**
 * Retentativa única, acrescentando ao prompt o que veio errado.
 * Nunca preencher campo faltante com chute: ou o modelo acerta, ou vira erro
 * claro no painel. Ver P1, pós-processamento.
 */
export function montarPromptDeCorrecao(descricao, acervo, problemas, formato = "disco") {
  return `${montarPrompt(descricao, acervo, formato)}

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
