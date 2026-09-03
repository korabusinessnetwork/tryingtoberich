/**
 * Busca de item no catálogo do Roblox, para o vestiário dentro do jogo.
 *
 * **Não é Open Cloud, é API web pública.** Não é contratada, tem limite de taxa
 * e pode mudar sem aviso. Por isso vive isolada num módulo só, do mesmo jeito
 * que o conector da TikTok: se cair, o vestiário para de buscar item novo e
 * nada mais é afetado. Ver ADR-011 e 07_APIS seção C.
 *
 * Só item de **preço zero** entra no resultado, e o filtro vai na REQUISIÇÃO
 * (`MaxPrice=0`), não depois. A diferença não é otimização, é a feature
 * funcionar: hoje quase todo acessório do catálogo custa Robux, então pedir os
 * 30 mais relevantes e filtrar depois devolvia lista VAZIA para quase toda
 * busca — "chapeu" dava zero item. Pedindo já filtrado, voltam 30 gratuitos.
 *
 * O filtro em memória continua logo abaixo, de propósito: a API é pública e não
 * contratada, e um dia pode ignorar o parâmetro sem avisar. Look montado com
 * item pago é look que o streamer não consegue vestir.
 */

import { log } from "../log.mjs";
import { guardarIcone, caminhoRelativoDoIcone, iconeEmCache } from "../repos/icones.mjs";

const BUSCA = "https://catalog.roblox.com/v1/search/items/details";
const THUMBNAILS = "https://thumbnails.roblox.com/v1/assets";

/** Categoria 11 = Accessories no catálogo. É o que compõe look sem custo. */
const CATEGORIA_ACESSORIOS = 11;
const LIMITE_PADRAO = 30;

const ehGratuito = (item) => item?.price === 0 || item?.priceStatus === "Free";

export class ClienteRoblox {
  #cacheDeBusca = new Map();

  constructor({ buscarNaRede = fetch, ttlMs = 5 * 60 * 1000 } = {}) {
    this.buscarNaRede = buscarNaRede;
    this.ttlMs = ttlMs;
  }

  /** Só o que é de graça. Devolve [] em qualquer falha: o vestiário para, o jogo não. */
  async buscarItensGratuitos(termo, { limite = LIMITE_PADRAO, agora = Date.now() } = {}) {
    const chave = `${termo}|${limite}`;
    const emCache = this.#cacheDeBusca.get(chave);
    if (emCache && agora - emCache.em < this.ttlMs) return emCache.itens;

    const url = new URL(BUSCA);
    url.searchParams.set("Category", String(CATEGORIA_ACESSORIOS));
    url.searchParams.set("Keyword", termo);
    url.searchParams.set("Limit", String(limite));
    // O que faz a busca devolver algo: sem isto vêm os mais relevantes, que são
    // pagos, e o filtro de gratuito abaixo esvazia a lista inteira.
    url.searchParams.set("MaxPrice", "0");

    let itens = [];
    try {
      const resposta = await this.buscarNaRede(url.toString());
      if (!resposta.ok) throw new Error(`catálogo respondeu ${resposta.status}`);

      const corpo = await resposta.json();
      itens = (corpo?.data ?? [])
        .filter(ehGratuito)
        .map((item) => ({
          assetId: item.id,
          nome: item.name,
          tipo: item.itemType ?? null,
          preco: 0,
        }))
        .filter((item) => Number.isInteger(item.assetId) && item.assetId > 0);
    } catch (erro) {
      log.aviso("roblox_busca_falhou", { termo, motivo: erro.message });
      return [];
    }

    this.#cacheDeBusca.set(chave, { em: agora, itens });
    return itens;
  }

  /**
   * Ícone da peça, baixado uma vez por asset e reusado. Fora do caminho crítico
   * sempre: o vestiário só abre com a sessão parada (ADR-011).
   */
  async iconeDoItem(assetId) {
    if (await iconeEmCache("item", assetId)) return caminhoRelativoDoIcone("item", assetId);

    try {
      const url = new URL(THUMBNAILS);
      url.searchParams.set("assetIds", String(assetId));
      url.searchParams.set("size", "150x150");
      url.searchParams.set("format", "Png");

      const resposta = await this.buscarNaRede(url.toString());
      if (!resposta.ok) throw new Error(`thumbnails respondeu ${resposta.status}`);

      const destino = (await resposta.json())?.data?.[0];
      if (destino?.state !== "Completed" || !destino?.imageUrl) throw new Error("thumbnail não está pronta");

      const imagem = await this.buscarNaRede(destino.imageUrl);
      if (!imagem.ok) throw new Error(`imagem respondeu ${imagem.status}`);

      return await guardarIcone("item", assetId, Buffer.from(await imagem.arrayBuffer()));
    } catch (erro) {
      log.aviso("roblox_thumbnail_falhou", { assetId, motivo: erro.message });
      return null;
    }
  }

  /** Busca com ícone já resolvido, que é o que o vestiário consome. */
  async buscarComIcone(termo, opcoes) {
    const itens = await this.buscarItensGratuitos(termo, opcoes);
    return Promise.all(
      itens.map(async (item) => ({ ...item, icone: await this.iconeDoItem(item.assetId) })),
    );
  }
}
