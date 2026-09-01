/**
 * Conexão com a live. Este é o único arquivo que sabe que a biblioteca se chama
 * `tiktok-live-connector` — todo o resto da ponte só conhece a interface abaixo
 * e o evento já normalizado. Ver ADR-006.
 *
 *   conectar()      abre a live e começa a emitir
 *   desconectar()   fecha e para de tentar
 *   coletarCatalogo()  lista de presentes da sala, normalizada
 *
 * Callbacks: aoEvento(eventoNormalizado), aoEstado({live}), aoCatalogo(presentes).
 *
 * O import da biblioteca é preguiçoso de propósito: teste e desenvolvimento
 * offline nunca carregam o pacote, e a ponte sobe mesmo sem ele instalado.
 */

import { REGRAS } from "../config.mjs";
import { log } from "../log.mjs";
import { normalizarCatalogo, normalizarPresente } from "./normalizador.mjs";

/** Estados que o painel entende. Ver o evento `estado` do SSE em 07_APIS. */
export const ESTADO = Object.freeze({
  DESLIGADA: "desligada",
  CONECTANDO: "conectando",
  CONECTADA: "conectada",
  RECONECTANDO: "reconectando",
});

const semAcao = () => {};

export class ConectorTikTok {
  #conexao = null;
  #estado = ESTADO.DESLIGADA;
  #tentativa = 0;
  #desistiu = false;
  #temporizador = null;

  constructor({
    usuario,
    aoEvento = semAcao,
    aoEstado = semAcao,
    aoCatalogo = semAcao,
    // Injetável para o teste não depender do pacote nem da rede.
    abrirConexao = abrirConexaoReal,
    backoffMs = REGRAS.BACKOFF_MS,
  } = {}) {
    this.usuario = usuario;
    this.aoEvento = aoEvento;
    this.aoEstado = aoEstado;
    this.aoCatalogo = aoCatalogo;
    this.abrirConexao = abrirConexao;
    this.backoffMs = backoffMs;
  }

  get estado() {
    return this.#estado;
  }

  #mudarEstado(estado, detalhe = {}) {
    this.#estado = estado;
    this.aoEstado({ live: estado, ...detalhe });
  }

  async conectar() {
    this.#desistiu = false;
    this.#mudarEstado(this.#tentativa === 0 ? ESTADO.CONECTANDO : ESTADO.RECONECTANDO);

    try {
      this.#conexao = await this.abrirConexao(this.usuario);
    } catch (erro) {
      log.aviso("live_falhou_ao_conectar", { motivo: erro.message });
      this.#agendarReconexao();
      return false;
    }

    this.#tentativa = 0;
    this.#mudarEstado(ESTADO.CONECTADA);

    this.#conexao.aoPresente((cru) => {
      // Carimba na entrada: é o t0 da medição de latência do Princípio nº1.
      const evento = normalizarPresente(cru, Date.now());
      if (evento) this.aoEvento(evento);
    });

    this.#conexao.aoFim((motivo) => {
      if (this.#desistiu) return;
      log.aviso("live_caiu", { motivo });
      this.#agendarReconexao();
    });

    // Coleta do catálogo fora do caminho crítico: a live já está de pé.
    this.coletarCatalogo().catch((erro) => log.aviso("catalogo_falhou", { motivo: erro.message }));
    return true;
  }

  /**
   * F6 — backoff de 1, 2, 4, 8, 16, teto de 30s. O jogo continua no estado em
   * que está e nenhum evento é inventado.
   */
  #agendarReconexao() {
    if (this.#desistiu) return;

    const espera = this.backoffMs[Math.min(this.#tentativa, this.backoffMs.length - 1)];
    this.#tentativa += 1;
    this.#mudarEstado(ESTADO.RECONECTANDO, { tentativa: this.#tentativa, emMs: espera });

    this.#temporizador = setTimeout(() => this.conectar(), espera);
    this.#temporizador.unref?.();
  }

  async coletarCatalogo() {
    if (!this.#conexao) return [];
    const presentes = normalizarCatalogo(await this.#conexao.listarPresentes());
    if (presentes.length > 0) this.aoCatalogo(presentes);
    return presentes;
  }

  async desconectar() {
    this.#desistiu = true;
    clearTimeout(this.#temporizador);
    this.#tentativa = 0;
    try {
      await this.#conexao?.fechar();
    } catch (erro) {
      log.aviso("live_falhou_ao_fechar", { motivo: erro.message });
    }
    this.#conexao = null;
    this.#mudarEstado(ESTADO.DESLIGADA);
  }
}

/**
 * O adaptador de verdade. Tudo que a v2.4.4 expõe fica preso aqui dentro:
 * `TikTokLiveConnection`, `WebcastEvent.GIFT` e `fetchAvailableGifts`.
 * Se a biblioteca mudar de forma, este é o único trecho que muda.
 */
async function abrirConexaoReal(usuario) {
  if (!usuario) throw new Error("TIKTOK_USERNAME não está definido no .env");

  const { TikTokLiveConnection, WebcastEvent } = await import("tiktok-live-connector");
  const conexao = new TikTokLiveConnection(usuario, { enableExtendedGiftInfo: true });
  await conexao.connect();

  return {
    aoPresente: (ouvinte) => conexao.on(WebcastEvent.GIFT, ouvinte),
    aoFim: (ouvinte) => {
      conexao.on(WebcastEvent.STREAM_END, () => ouvinte("stream_end"));
      conexao.on("disconnected", () => ouvinte("desconectado"));
      conexao.on("error", (erro) => ouvinte(erro?.message ?? "erro"));
    },
    listarPresentes: () => conexao.fetchAvailableGifts(),
    fechar: () => conexao.disconnect(),
  };
}
