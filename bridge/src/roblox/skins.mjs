/**
 * Skin de outro usuário do Roblox, para a galeria do vestiário.
 *
 * **API web pública, não Open Cloud** — mesma natureza do catálogo de itens
 * (ADR-011): não é contratada, tem limite de taxa e pode mudar sem aviso. Por
 * isso vive isolada aqui: se cair, a galeria para de trazer skin e o resto do
 * jogo não sente.
 *
 * São dois passos porque o Roblox separa identidade de aparência: o nick vira
 * userId num serviço, e a aparência sai de outro.
 */

import { log } from "../log.mjs";

const NICKS = "https://users.roblox.com/v1/usernames/users";
const AVATAR = "https://avatar.roblox.com/v1/users";
const MINIATURAS = "https://thumbnails.roblox.com/v1/users/avatar";

/** O que o `HumanoidDescription` do Luau precisa. Nada além disso atravessa. */
const camposDaSkin = (corpo) => ({
  playerAvatarType: corpo?.playerAvatarType ?? null,
  bodyColors: corpo?.bodyColors ?? null,
  scale: corpo?.scale ?? null,
  assets: (corpo?.assets ?? [])
    .filter((a) => Number.isInteger(a?.id) && a.id > 0)
    .map((a) => ({
      assetId: a.id,
      nome: a.name ?? null,
      // `assetType.name` é o que decide ONDE a peça entra no personagem:
      // acessório de chapéu e animação de corrida vão para campos diferentes.
      tipo: a.assetType?.name ?? null,
    })),
});

export class ClienteSkins {
  #cache = new Map();

  constructor({ buscarNaRede = fetch, ttlMs = 10 * 60 * 1000 } = {}) {
    this.buscarNaRede = buscarNaRede;
    this.ttlMs = ttlMs;
  }

  /**
   * Nick → userId. Devolve null quando não existe, sem lançar: nick digitado
   * errado é o caso comum, não uma falha do sistema.
   */
  async resolverNick(nick) {
    const limpo = String(nick ?? "").trim().replace(/^@+/, "");
    if (limpo.length < 3) return null;

    try {
      const resposta = await this.buscarNaRede(NICKS, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usernames: [limpo], excludeBannedUsers: true }),
      });
      if (!resposta.ok) throw new Error(`usuários respondeu ${resposta.status}`);

      const corpo = await resposta.json();
      const achado = (corpo?.data ?? [])[0];
      return achado?.id ?? null;
    } catch (erro) {
      log.aviso("roblox_nick_falhou", { motivo: erro.message });
      return null;
    }
  }

  /**
   * A imagem do avatar montado, para o painel mostrar antes de adicionar.
   *
   * É o que faz a galeria ser navegável: sem ela o streamer acrescenta um nick
   * às cegas e só descobre o que veio quando veste no jogo. Falha aqui devolve
   * null e a tela mostra o nome sem figura — uma miniatura ausente não pode
   * impedir a skin de ser usada.
   */
  async buscarMiniatura(userId) {
    try {
      const url = `${MINIATURAS}?userIds=${userId}&size=420x420&format=Png&isCircular=false`;
      const resposta = await this.buscarNaRede(url);
      if (!resposta.ok) throw new Error(`miniaturas respondeu ${resposta.status}`);

      const primeira = (await resposta.json())?.data?.[0];
      // `state` vem "Pending" enquanto o Roblox ainda está gerando a imagem.
      // Devolver a URL nesse caso daria uma figura quebrada na tela.
      return primeira?.state === "Completed" ? primeira.imageUrl ?? null : null;
    } catch (erro) {
      log.aviso("roblox_miniatura_falhou", { motivo: erro.message });
      return null;
    }
  }

  /**
   * A skin que a pessoa está usando AGORA.
   *
   * Cacheado por 10 minutos: a galeria é navegada em rajada — o streamer clica
   * em vários para comparar — e cada clique seria duas chamadas a uma API com
   * limite de taxa.
   */
  async buscarSkin(nick, { agora = Date.now() } = {}) {
    const chave = String(nick ?? "").trim().toLowerCase();
    const emCache = this.#cache.get(chave);
    if (emCache && agora - emCache.em < this.ttlMs) return emCache.skin;

    const userId = await this.resolverNick(nick);
    if (!userId) return null;

    try {
      const resposta = await this.buscarNaRede(`${AVATAR}/${userId}/avatar`);
      if (!resposta.ok) throw new Error(`avatar respondeu ${resposta.status}`);

      // A miniatura vai junto e em PARALELO: são serviços diferentes, e
      // encadear somaria a latência de um na do outro sem motivo.
      const [corpo, imagemUrl] = await Promise.all([resposta.json(), this.buscarMiniatura(userId)]);

      const skin = { nick: String(nick).trim(), userId, imagemUrl, ...camposDaSkin(corpo) };
      this.#cache.set(chave, { em: agora, skin });
      return skin;
    } catch (erro) {
      log.aviso("roblox_skin_falhou", { motivo: erro.message });
      return null;
    }
  }
}
