/**
 * A sessão de live, em memória.
 *
 * Duas regras moldam este arquivo:
 *
 * 1. **Caminho frio.** Registrar evento, contar e calcular estatística nunca
 *    bloqueiam o despacho. Tudo aqui é chamado depois que o long-poll já foi
 *    respondido. Ver CLAUDE.md, Princípio nº1, e memory/patterns.md.
 * 2. **Nada de espectador em disco.** O log guarda tipo de presente, valor,
 *    delta e latência. Nunca quem enviou. Ao encerrar, até o detalhe por evento
 *    é descartado e sobra o resumo (F5 e 11_SEGURANCA, camada 4).
 */

import { REGRAS } from "../config.mjs";
import { log } from "../log.mjs";
import { reduzirAoResumo, salvarSessao, sessaoIdDe } from "../repos/sessoes.mjs";

export class Sessao {
  #sessao;

  constructor({ presetId, mapaId = null, iniciadaEm = new Date() }) {
    this.#sessao = {
      sessaoId: sessaoIdDe(iniciadaEm),
      streamerId: REGRAS.STREAMER_ID,
      presetId,
      mapaId,
      iniciadaEm: iniciadaEm.toISOString(),
      encerradaEm: null,
      plataformaReferencia: 0,
      plataformaMaxima: 0,
      quedasNaturais: 0,
      naoMapeados: [],
      eventos: [],
      //[[ O número do PORTÃO da Fase 0, e não o mesmo que `eventos.length`.
      //
      // `eventos` guarda ANIMAÇÃO DESPACHADA. Presente que perde combate
      // (ADR-012), que cai em cooldown ou que coalesce com outro vira um
      // despacho só — e a maratona mediu a escala disso: 228 presentes
      // chegando viraram 66 eventos, uma subcontagem de 3,5x.
      //
      // Isso importa porque o portão da Fase 0 é "os presentes aumentaram de
      // forma visível?". Julgá-lo por `totalPresentes` erraria MAIS
      // justamente quando o jogo está funcionando melhor: momento de hype é
      // quando mais presente chega junto, e é quando mais coalesce. ]]
      presentesRecebidos: 0,
      moedasRecebidas: 0,
      // Presentes CHEGADOS por slot, para o gráfico do resumo comparar o que a
      // plateia manda — não o que o jogo conseguiu animar.
      recebidosPorSlot: {},
    };
  }

  get id() {
    return this.#sessao.sessaoId;
  }

  /** Cópia rasa, para o painel e para o teste sem deixar ninguém mexer no estado. */
  get instantaneo() {
    return {
      ...this.#sessao,
      naoMapeados: [...this.#sessao.naoMapeados],
      eventos: [...this.#sessao.eventos],
      recebidosPorSlot: { ...this.#sessao.recebidosPorSlot },
    };
  }

  /**
   * Registra o disparo já entregue ao jogo.
   *
   * `latenciaMs` só existe para disparo imediato. Resolução de combate segurou
   * o evento de propósito (ADR-012), e contar essa espera como latência sujaria
   * a única métrica que mede se a ponte está lenta.
   */
  registrarDisparo(despachado) {
    const evento = {
      em: new Date(despachado.emitidoEm).toISOString(),
      slot: despachado.slot,
      presenteId: despachado.presenteId,
      repeticoes: despachado.repeticoes,
      delta: despachado.delta,
      animacaoId: despachado.animacaoId,
    };

    if (!despachado.disputa && Number.isFinite(despachado.recebidoEm)) {
      evento.latenciaMs = Math.max(0, despachado.emitidoEm - despachado.recebidoEm);
    }

    this.#sessao.eventos.push(evento);
    return evento;
  }

  /**
   * R7 — o preset mudou no meio da live.
   *
   * O arquivo guarda UM `presetId`, então ele passa a ser o que estava em
   * vigor no fim. É o menos errado dos dois: o resumo é lido depois da live,
   * e "com que preset ela terminou" é a pergunta que se faz olhando o
   * resultado. A troca em si fica na linha `preset_trocado_ao_vivo` do log.
   */
  trocarPreset(presetId) {
    this.#sessao.presetId = presetId;
  }

  /**
   * Um presente chegou da live, antes de qualquer regra.
   *
   * Contado ANTES de casar com slot, de brigar no combate ou de bater em
   * cooldown — porque a pergunta do portão é sobre a PLATEIA, não sobre o que o
   * jogo conseguiu animar. Presente não mapeado conta aqui também: ele foi
   * enviado, e é isso que o portão mede.
   *
   * Caminho quente: é incremento em memória, sem disco e sem alocação.
   */
  registrarRecebido({ moedas, repeticoes } = {}) {
    const vezes = Number.isFinite(repeticoes) && repeticoes > 0 ? Math.floor(repeticoes) : 1;
    this.#sessao.presentesRecebidos += vezes;
    if (Number.isFinite(moedas) && moedas > 0) this.#sessao.moedasRecebidas += Math.floor(moedas) * vezes;
  }

  /**
   * Um presente casou com um slot, antes de cooldown e de combate.
   *
   * Separado de `registrarDisparo` porque as perguntas são outras: aquele
   * responde "o que o jogo tocou", este responde "o que a plateia mandou neste
   * slot". Rajada conta as N repetições que ela é (R4).
   */
  registrarCasado({ slot, repeticoes } = {}) {
    if (slot == null) return;
    const vezes = Number.isFinite(repeticoes) && repeticoes > 0 ? Math.floor(repeticoes) : 1;
    const chave = String(slot);
    this.#sessao.recebidosPorSlot[chave] = (this.#sessao.recebidosPorSlot[chave] ?? 0) + vezes;
  }

  /** F2.4 — o que o streamer está deixando na mesa. Só contagem, sem doador. */
  registrarNaoMapeado({ presenteNome, moedas, contagem }) {
    const existente = this.#sessao.naoMapeados.find((n) => n.presenteNome === presenteNome);
    if (existente) {
      existente.contagem = contagem;
      return;
    }
    this.#sessao.naoMapeados.push({ presenteNome, moedas: moedas ?? 0, contagem });
  }

  /** R9 — a posição vem do jogo. A ponte nunca calcula nem acumula. */
  atualizarEstadoDoJogo({ plataformaReferencia, plataformaMaxima, quedasNaturais }) {
    this.#sessao.plataformaReferencia = plataformaReferencia;
    this.#sessao.plataformaMaxima = Math.max(this.#sessao.plataformaMaxima, plataformaMaxima);
    if (Number.isFinite(quedasNaturais)) this.#sessao.quedasNaturais = quedasNaturais;
  }

  /** Fire-and-forget: uma falha de disco nunca pode derrubar a live. */
  persistirEmSegundoPlano() {
    queueMicrotask(() => {
      salvarSessao(this.instantaneo).catch((erro) =>
        log.erro("sessao_nao_persistiu", { sessaoId: this.id, motivo: erro.message }),
      );
    });
  }

  /** F5 — encerra, reduz ao resumo e grava. Depois disto não há dado de espectador em disco. */
  async encerrar(encerradaEm = new Date()) {
    const reduzida = reduzirAoResumo(this.instantaneo, encerradaEm.toISOString());
    await salvarSessao(reduzida);
    this.#sessao = reduzida;
    return reduzida;
  }
}
