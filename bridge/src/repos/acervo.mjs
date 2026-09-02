/** Acervo pré-aprovado. Só o que está aprovado pode ser oferecido ao Gemini (ADR-004). */

import { ErroDeDominio } from "../erros.mjs";
import { caminhoDeDados, escreverJsonAtomico, lerJsonOuPadrao } from "./arquivo.mjs";
import { criarValidador } from "./schemas.mjs";

const VAZIO = { skybox: [], texturas: [], props: [] };

/** As duas coleções que passam por moderação do Roblox. `props` são nativas e não têm assetId. */
const COLECOES_DE_UPLOAD = new Set(["skybox", "texturas"]);

const arquivo = () => caminhoDeDados("acervo.json");

export async function carregarAcervo() {
  return (await lerJsonOuPadrao(arquivo())) ?? VAZIO;
}

/** O subconjunto que entra no prompt: item pendente de moderação nunca é oferecido. */
export function acervoOferecivel(acervo) {
  const aprovados = (itens) => itens.filter((i) => i.status === "aprovado" && i.assetId !== null);
  return {
    skybox: aprovados(acervo.skybox),
    texturas: aprovados(acervo.texturas),
    props: acervo.props,
  };
}

export async function salvarAcervo(acervo) {
  const { validar } = await criarValidador();
  const problemas = validar("acervo", acervo);
  if (problemas.length) {
    throw new ErroDeDominio("acervo_invalido", `Acervo fora do contrato: ${problemas.join("; ")}`);
  }
  await escreverJsonAtomico(arquivo(), acervo);
  return acervo;
}

/**
 * Anota o resultado da moderação num item.
 *
 * Montar o acervo é trabalho manual de véspera (ADR-004) e até aqui era editar
 * `data/acervo.json` na mão — com o schema recusando o arquivo inteiro se um
 * `assetId` fosse para o item errado. O painel escreve por esta função, que
 * mexe num item só e revalida o acervo inteiro antes de gravar.
 *
 * O schema já barra "aprovado sem assetId"; a mensagem daqui existe para o
 * streamer ler o motivo em vez de um erro de validação de JSON Schema.
 */
export async function anotarItemDoAcervo(colecao, id, { assetId, status }) {
  if (!COLECOES_DE_UPLOAD.has(colecao)) {
    throw new ErroDeDominio(
      "colecao_invalida",
      `Só "skybox" e "texturas" passam por moderação. "${colecao}" não.`,
      { status: 400 },
    );
  }

  const acervo = await carregarAcervo();
  const item = (acervo[colecao] ?? []).find((i) => i.id === id);
  if (!item) {
    throw new ErroDeDominio("item_inexistente", `Não achei "${id}" em acervo.${colecao}.`, { status: 404 });
  }

  const novoStatus = status ?? item.status;
  // `assetId` ausente mantém o que estava; `null` explícito limpa. São coisas
  // diferentes: reprovar um item não deve apagar o número que já foi enviado.
  const novoAssetId = assetId === undefined ? item.assetId : assetId;

  if (novoStatus === "aprovado" && !Number.isInteger(novoAssetId)) {
    throw new ErroDeDominio(
      "aprovado_sem_asset",
      `"${id}" não pode ficar aprovado sem assetId: o mapa referenciaria um item que o jogo não consegue aplicar.`,
      { status: 400 },
    );
  }

  const atualizado = { ...item, assetId: novoAssetId, status: novoStatus };
  const novo = {
    ...acervo,
    atualizadoEm: new Date().toISOString(),
    [colecao]: acervo[colecao].map((i) => (i.id === id ? atualizado : i)),
  };

  await salvarAcervo(novo);
  return { item: atualizado, acervo: novo };
}

/**
 * Traduz os ids de acervo do mapa para assetId do Roblox.
 *
 * O spec guarda id de ACERVO (`textura_rocha_vulcanica`), não assetId, porque é
 * disso que o Gemini escolhe. Mas o jogo não conhece acervo e não deve conhecer:
 * o motor é burro de propósito (ADR-007). Então quem traduz é a ponte, e o jogo
 * recebe número pronto — ou `null`, que quer dizer "ainda não aprovado" e faz o
 * construtor cair no material nativo, sem céu.
 *
 * Devolve `null` por item, nunca omite a chave: campo ausente e campo nulo são
 * a mesma coisa no Luau, mas a chave presente documenta que a tradução rodou.
 */
export function resolverAssetsDoMapa(mapa, acervo) {
  const achar = (itens, id) => {
    const item = (itens ?? []).find((i) => i.id === id);
    return item && item.status === "aprovado" && Number.isInteger(item.assetId) ? item.assetId : null;
  };

  return {
    skybox: achar(acervo?.skybox, mapa?.skyboxAssetId),
    textura: achar(acervo?.texturas, mapa?.plataformas?.materialAssetId),
  };
}
