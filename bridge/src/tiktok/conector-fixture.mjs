/**
 * Conector de mentira, que toca um cenário de `data/fixtures/cenarios/` em vez
 * de conectar numa live.
 *
 * Existe porque testar coalescência, combate e latência exigindo uma live real
 * com espectador real mandando presente na ordem certa é inviável. Com isto, a
 * ponte inteira sobe, o painel recebe SSE e o Roblox recebe evento pelo
 * long-poll, tudo sem estar ao vivo.
 *
 * Só desenvolvimento. Ativado por `--cenario=<nome>` na subida da ponte.
 */

import { log } from "../log.mjs";
import { carregarCenario, listarCenarios } from "../repos/fixtures.mjs";
import { ESTADO } from "./conector.mjs";

const semAcao = () => {};

export class ConectorDeFixture {
  #temporizadores = [];

  constructor({ cenario, aoEvento = semAcao, aoEstado = semAcao, aoCatalogo = semAcao, emLoop = false } = {}) {
    this.cenario = cenario;
    this.aoEvento = aoEvento;
    this.aoEstado = aoEstado;
    this.aoCatalogo = aoCatalogo;
    this.emLoop = emLoop;
    this.estado = ESTADO.DESLIGADA;
  }

  async conectar() {
    const roteiro = await carregarCenario(this.cenario);
    if (!roteiro) {
      const disponiveis = (await listarCenarios()).map((n) => n.replace(".json", "")).join(", ");
      throw new Error(`Cenário "${this.cenario}" não existe. Disponíveis: ${disponiveis}`);
    }

    this.estado = ESTADO.CONECTADA;
    this.aoEstado({ live: ESTADO.CONECTADA, fixture: roteiro.cenario });
    log.info("fixture_iniciada", { cenario: roteiro.cenario, eventos: roteiro.entrada.length });

    this.#agendar(roteiro);
    return true;
  }

  #agendar(roteiro) {
    const fim = Math.max(...roteiro.entrada.map((e) => e.emMs)) + 3000;

    for (const passo of roteiro.entrada) {
      const temporizador = setTimeout(() => {
        // recebidoEm da fixture é de outro dia; o t0 é sempre a entrada na ponte.
        this.aoEvento({ ...passo.evento, recebidoEm: Date.now() });
      }, passo.emMs);
      temporizador.unref?.();
      this.#temporizadores.push(temporizador);
    }

    if (this.emLoop) {
      const repetir = setTimeout(() => this.#agendar(roteiro), fim);
      repetir.unref?.();
      this.#temporizadores.push(repetir);
    }
  }

  /** O catálogo em modo fixture é a semente; o repositório já cai nela sozinho. */
  async coletarCatalogo() {
    return [];
  }

  async desconectar() {
    for (const temporizador of this.#temporizadores) clearTimeout(temporizador);
    this.#temporizadores = [];
    this.estado = ESTADO.DESLIGADA;
    this.aoEstado({ live: ESTADO.DESLIGADA });
  }
}
