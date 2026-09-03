/**
 * Subir imagem para o Roblox e receber o assetId de volta (Open Cloud).
 *
 * Isto é o que faltava para o acervo do ADR-004 deixar de ser trabalho manual.
 * A decisão original dizia que montar o acervo "não é automatizável", e a parte
 * verdadeira disso é a MODERAÇÃO: ela é assíncrona e ninguém controla. Subir e
 * descobrir o número, porém, é uma chamada de API — e enquanto era manual, o
 * streamer tinha que abrir o site, esperar, achar o id e colar no painel, doze
 * vezes. Onze dos doze itens ficaram para trás por causa disso, e todo mapa
 * gerado saía com o mesmo céu.
 *
 * **Custo zero:** upload de imagem no Open Cloud não gasta Robux. O que ele
 * exige é uma chave de API, que se cria de graça em create.roblox.com.
 *
 * A moderação continua sendo dela: o item entra como `em-moderacao` e só vira
 * `aprovado` quando o Roblox disser que sim. O ADR continua valendo — o que
 * muda é quem faz a digitação.
 */

import { log } from "../log.mjs";

const ASSETS = "https://apis.roblox.com/assets/v1/assets";
const OPERACOES = "https://apis.roblox.com/assets/v1/operations";

/**
 * O upload devolve uma operação, não o asset. A espera é curta na prática
 * (segundos), mas é dela que sai o número — por isso vale insistir um pouco.
 */
const ESPERAS_MS = [700, 1200, 2000, 3000, 4000, 5000, 5000, 5000];

/** Como o Roblox chama o estado da moderação, e o que isso vira no acervo. */
export const STATUS_POR_MODERACAO = {
  Approved: "aprovado",
  Rejected: "rejeitado",
  Reviewing: "em-moderacao",
};

export class PublicadorRoblox {
  constructor({ chave, criador, buscarNaRede = fetch, esperar = null } = {}) {
    this.chave = chave ?? null;
    // `userId` do dono da conta. Sem ele o Roblox não sabe em nome de quem
    // criar o asset, e a chave sozinha não diz.
    this.criador = criador ?? null;
    this.buscarNaRede = buscarNaRede;
    this.esperar = esperar ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  get configurado() {
    return Boolean(this.chave && this.criador);
  }

  #cabecalhos() {
    return { "x-api-key": this.chave };
  }

  /**
   * Sobe um PNG como Decal e devolve o id da operação.
   *
   * `multipart/form-data` com duas partes de nomes fixos: `request`, que é o
   * JSON do asset, e `fileContent`, que é o binário. O `FormData` e o `Blob`
   * são nativos do Node desde a 18 — nenhuma dependência entra por isso.
   */
  async enviarImagem({ nome, descricao, png }) {
    if (!this.configurado) {
      throw new Error("ROBLOX_API_KEY e ROBLOX_CREATOR_ID não estão no .env");
    }

    const formulario = new FormData();
    formulario.append(
      "request",
      JSON.stringify({
        //[[ "Image", e NÃO "Decal".
        //
        // O Open Cloud aceita os dois para um PNG, e a diferença só aparece
        // dentro do jogo: um Decal é um EMBRULHO em volta de uma imagem, com id
        // próprio. `Sky.SkyboxFt` e `Texture.Texture` esperam o id da IMAGEM —
        // com o do decal eles não resolvem nada, e o resultado é céu padrão do
        // Roblox e plataforma cinza, sem erro em lugar nenhum.
        //
        // Foi exatamente o que aconteceu: 70 uploads aprovados, todos inúteis,
        // e da tela parecia que a arte não tinha chegado. ]]
        assetType: "Image",
        displayName: nome,
        description: descricao,
        creationContext: { creator: { userId: String(this.criador) } },
      }),
    );
    formulario.append("fileContent", new Blob([png], { type: "image/png" }), `${nome}.png`);

    const resposta = await this.buscarNaRede(ASSETS, {
      method: "POST",
      headers: this.#cabecalhos(),
      body: formulario,
    });

    const corpo = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      throw new Error(`o Roblox recusou o upload (${resposta.status}): ${mensagemDeErro(corpo)}`);
    }

    // A resposta traz `path: "operations/<id>"` ou `operationId`, conforme a
    // versão. As duas formas aparecem na documentação, então aceitamos as duas.
    const operacao = corpo?.operationId ?? String(corpo?.path ?? "").split("/").pop();
    if (!operacao) throw new Error("o Roblox aceitou mas não disse qual é a operação");
    return operacao;
  }

  /** Consulta a operação até ela terminar. Devolve o assetId. */
  async aguardarAssetId(operacao) {
    for (const espera of ESPERAS_MS) {
      await this.esperar(espera);

      const resposta = await this.buscarNaRede(`${OPERACOES}/${operacao}`, { headers: this.#cabecalhos() });
      const corpo = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        throw new Error(`não consegui acompanhar a operação (${resposta.status}): ${mensagemDeErro(corpo)}`);
      }
      if (corpo?.done) {
        const id = corpo?.response?.assetId;
        if (!id) throw new Error(`a operação terminou sem assetId: ${JSON.stringify(corpo).slice(0, 200)}`);
        return Number(id);
      }
    }

    // Não é falha: o asset provavelmente existe e a operação só demorou. Quem
    // chama registra `em-moderacao` sem id e tenta de novo depois, em vez de
    // subir a mesma imagem outra vez.
    throw new Error("a operação não terminou no tempo esperado");
  }

  /**
   * O que a moderação decidiu. Devolve `null` quando não deu para saber —
   * ausência de resposta não pode virar "rejeitado".
   */
  async moderacaoDe(assetId) {
    try {
      const resposta = await this.buscarNaRede(`${ASSETS}/${assetId}`, { headers: this.#cabecalhos() });
      if (!resposta.ok) return null;
      const corpo = await resposta.json();
      return corpo?.moderationResult?.moderationState ?? null;
    } catch (erro) {
      log.aviso("roblox_moderacao_falhou", { assetId, motivo: erro.message });
      return null;
    }
  }

  /** Sobe e espera, numa chamada. É o que o publicador do acervo usa. */
  async publicar({ nome, descricao, png }) {
    const operacao = await this.enviarImagem({ nome, descricao, png });
    const assetId = await this.aguardarAssetId(operacao);
    const moderacao = await this.moderacaoDe(assetId);
    log.info("acervo_imagem_publicada", { assetId, moderacao });
    return { assetId, moderacao };
  }
}

/** O Roblox devolve erro em dois formatos; nenhum deles pode virar "[object Object]". */
function mensagemDeErro(corpo) {
  if (!corpo) return "sem corpo";
  if (typeof corpo.message === "string") return corpo.message;
  const primeiro = corpo.errors?.[0];
  if (primeiro?.message) return primeiro.message;
  return JSON.stringify(corpo).slice(0, 200);
}
