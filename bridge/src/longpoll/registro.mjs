/**
 * Registro de long-poll. O Roblox chama GET /jogo/eventos em laço e a ponte
 * segura a resposta aberta até haver evento ou até o timeout. Ver ADR-002.
 *
 * Três coisas que este módulo existe para não deixar acontecer:
 *  - responder devagar. A conexão já está aberta; publicar é escrever nela.
 *  - vazar conexão. Long-poll órfão numa live de 2 horas acumula até estourar.
 *  - acumular evento com o jogo fora. Aplicar uma pilha de deltas de uma vez
 *    quando o Roblox voltasse seria pior que perder. Ver F7.
 */

import { REGRAS } from "../config.mjs";

/** Quanto evento recente fica guardado para quem reconecta com cursor atrasado. */
const TAMANHO_DO_BUFFER = 32;

export class RegistroDeLongPoll {
  #pendentes = new Set();
  #recentes = [];
  #ultimoContato = 0;
  #descartadosComJogoOffline = 0;

  constructor({ timeoutMs = 20_000, offlineMs = REGRAS.JOGO_OFFLINE_MS, agora = Date.now } = {}) {
    this.timeoutMs = timeoutMs;
    this.offlineMs = offlineMs;
    this.agora = agora;
  }

  get pendentes() {
    return this.#pendentes.size;
  }

  get descartadosComJogoOffline() {
    return this.#descartadosComJogoOffline;
  }

  /** F7 — sem requisição por mais que `offlineMs`, o jogo é dado como offline. */
  jogoOnline(agora = this.agora()) {
    return this.#ultimoContato > 0 && agora - this.#ultimoContato < this.offlineMs;
  }

  get cursor() {
    return this.#recentes.at(-1)?.id ?? 0;
  }

  /**
   * Registra uma espera. Se já houver evento novo para este cursor, responde na
   * hora — o Roblox pode ter perdido a resposta anterior por queda de rede.
   */
  registrar(resposta, { desde = 0 } = {}, agora = this.agora()) {
    this.#ultimoContato = agora;

    const atrasados = this.#recentes.filter((evento) => evento.id > desde);
    if (atrasados.length > 0) {
      this.#responder(resposta, atrasados);
      return { tipo: "imediato", eventos: atrasados.length };
    }

    const espera = {
      resposta,
      desde,
      temporizador: setTimeout(() => this.#encerrarPorTimeout(espera), this.timeoutMs),
    };
    espera.temporizador.unref?.();

    // Órfão: o Roblox desistiu, a rede caiu, o túnel reiniciou. Sem isto, vaza.
    resposta.on?.("close", () => this.#remover(espera));

    this.#pendentes.add(espera);
    return { tipo: "aguardando" };
  }

  /**
   * Publica no instante do evento. Esta é a etapa 3 do caminho crítico e o alvo
   * é menos de 10ms: a conexão já está aberta, só falta escrever.
   */
  publicar(eventos, agora = this.agora()) {
    if (eventos.length === 0) return { entregues: 0 };

    if (!this.jogoOnline(agora)) {
      this.#descartadosComJogoOffline += eventos.length;
      return { entregues: 0, descartados: eventos.length };
    }

    this.#recentes.push(...eventos);
    if (this.#recentes.length > TAMANHO_DO_BUFFER) {
      this.#recentes = this.#recentes.slice(-TAMANHO_DO_BUFFER);
    }

    let entregues = 0;
    for (const espera of [...this.#pendentes]) {
      const paraEsta = eventos.filter((evento) => evento.id > espera.desde);
      if (paraEsta.length === 0) continue;
      this.#remover(espera);
      this.#responder(espera.resposta, paraEsta);
      entregues += 1;
    }

    return { entregues };
  }

  /** Fecha tudo que está aberto. Chamado no stop da sessão (F5). */
  fecharTodos() {
    for (const espera of [...this.#pendentes]) {
      this.#remover(espera);
      try {
        espera.resposta.status(204).end();
      } catch { /* conexão já foi embora */ }
    }
    this.#recentes = [];
  }

  #responder(resposta, entradas) {
    // Três listas no mesmo envelope, com um cursor só. `eventos` move o boneco;
    // `anulados` não move nada mas o HUD precisa mostrar, senão o empate do
    // ADR-012 lê como travamento; `comandos` é ordem do streamer, não de
    // espectador (ADR-013). Ver evento-jogo.schema.json.
    const anulados = entradas.filter((e) => e.tipoDeEntrada === "anulado");
    const comandos = entradas.filter((e) => e.tipoDeEntrada === "comando");
    const eventos = entradas.filter((e) => e.tipoDeEntrada !== "anulado" && e.tipoDeEntrada !== "comando");

    const corpo = {
      cursor: Math.max(...entradas.map((e) => e.id)),
      // O contrato com o jogo é {animacaoId, delta, intensidade}. Slot, presenteId
      // e latência são coisa da ponte e do painel, e não atravessam o túnel.
      eventos: eventos.map(({ id, animacaoId, delta, intensidade, efeitoCurto, nomeDoador, presenteNome, emitidoEm }) => ({
        id, animacaoId, delta, intensidade, efeitoCurto, nomeDoador, presenteNome, emitidoEm,
      })),
      anulados: anulados.map(({ id, somaSubida, somaDescida, participantes, emitidoEm }) => ({
        id, somaSubida, somaDescida, participantes, emitidoEm,
      })),
      comandos: comandos.map(({ id, tipo, emitidoEm }) => ({ id, tipo, emitidoEm })),
    };
    try {
      resposta.status(200).json(corpo);
    } catch { /* conexão já foi embora */ }
  }

  #encerrarPorTimeout(espera) {
    if (!this.#pendentes.has(espera)) return;
    this.#remover(espera);
    try {
      // 204 de propósito: o Roblox chama de novo na hora, e corpo vazio não
      // gasta banda nem parsing no Luau.
      espera.resposta.status(204).end();
    } catch { /* conexão já foi embora */ }
  }

  #remover(espera) {
    clearTimeout(espera.temporizador);
    this.#pendentes.delete(espera);
  }
}
