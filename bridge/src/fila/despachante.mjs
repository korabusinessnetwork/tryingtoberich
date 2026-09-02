/**
 * O caminho quente. Recebe evento normalizado, casa com o slot e decide entre
 * despachar agora ou jogar no combate. Alvo: menos de 5ms, sem disco, sem
 * rede, sem chamada de IA. Ver CLAUDE.md, Princípio nº1.
 *
 * Duas leituras mandam no desenho:
 *
 * 1. **Presente com o boneco livre dispara na hora.** Uma janela de espera na
 *    entrada somaria centenas de ms a TODO presente e gastaria metade do
 *    orçamento de latência para resolver um caso raro.
 * 2. **Presente que chega durante uma animação entra no combate** (ADR-012):
 *    subidas somam, descidas somam, os lados se anulam e o boneco anda o
 *    líquido. Nenhum presente é descartado.
 *
 * O relógio é injetado em `receber` e `avancar` de propósito: o teste dirige o
 * tempo e o comportamento é determinístico. Em produção quem chama `avancar` é
 * um timer, não este módulo.
 */

import { REGRAS } from "../config.mjs";
import { casar, indexarSlots } from "../dominio/casamento.mjs";
import { resolverCombate } from "./combate.mjs";

const semAcao = () => {};

export class Despachante {
  #indice = new Map();
  #animacoes = new Map();
  #combate = null;
  #naoMapeados = new Map();
  #cooldowns = new Map();
  #ocupadoAte = 0;
  #cursor = 0;

  constructor({
    animacoes = new Map(),
    aoDespachar = semAcao,
    aoAnular = semAcao,
    aoDescartar = semAcao,
    aoNaoMapeado = semAcao,
    combateMaxMs = REGRAS.COMBATE_MAX_MS,
  } = {}) {
    this.combateMaxMs = combateMaxMs;
    this.#animacoes = animacoes;
    this.aoDespachar = aoDespachar;
    this.aoAnular = aoAnular;
    this.aoDescartar = aoDescartar;
    this.aoNaoMapeado = aoNaoMapeado;
  }

  definirPreset(preset) {
    this.#indice = indexarSlots(preset);
  }

  definirAnimacoes(animacoes) {
    this.#animacoes = animacoes;
  }

  /** Duração da animação em ms. Intensidade multiplica escala e partícula, nunca duração. */
  #duracaoMs(animacaoId) {
    const animacao = this.#animacoes.get(animacaoId);
    return animacao ? Math.round(animacao.duracaoBase * 1000) : 0;
  }

  get estado() {
    return {
      combate: this.#combate
        ? { abertoEm: this.#combate.abertoEm, participantes: this.#combate.disparos.map((d) => ({ ...d })) }
        : null,
      ocupadoAte: this.#ocupadoAte,
      naoMapeados: [...this.#naoMapeados.entries()].map(([presenteNome, dados]) => ({ presenteNome, ...dados })),
      cursor: this.#cursor,
    };
  }

  /**
   * Dispara uma animação direto, sem presente e sem preset.
   *
   * Existe para o painel testar as 20 animações no jogo antes da live, quando
   * ainda não há preset montado nem espectador mandando nada. Por isso NÃO
   * passa por `casar`: não há slot, e exigir preset transformaria "ver se a
   * animação toca" numa tarefa de configuração.
   *
   * Passa pelo `#despachar` de propósito, e não direto no long-poll: é ele que
   * é dono do `#cursor`. Cursor emitido por fora colidiria com o do caminho
   * normal, e o `?desde=` do Roblox reprocessaria ou pularia evento.
   */
  testarAnimacao({ animacaoId, delta, intensidade }, agora = Date.now()) {
    return this.#despachar(
      {
        animacaoId,
        delta,
        intensidade,
        // Sem slot e sem presente: não veio de lugar nenhum do preset.
        slot: null,
        presenteId: null,
        presenteNome: "Teste de animação",
        nomeDoador: null,
        repeticoes: 1,
        recebidoEm: agora,
        // Zero de propósito: cooldown é do slot, e aqui não há slot para travar.
        cooldownMs: 0,
      },
      agora,
      { efeitoCurto: false },
    );
  }

  /** Caminho quente. Devolve o que aconteceu com o evento, para o painel e para o teste. */
  receber(evento, agora = Date.now()) {
    const disparo = casar(evento, this.#indice);

    if (!disparo) {
      const chave = evento.presenteNome ?? evento.presenteId;
      // `presenteId` vai junto porque sem ele o contador do painel é só um
      // lamento: com o id, o streamer vincula o presente a um slot em um
      // clique, no meio da live, e o próximo já conta. Ele NÃO entra na chave
      // — quem agrupa é o nome, que é o que aparece na tela.
      const anterior = this.#naoMapeados.get(chave)
        ?? { presenteId: evento.presenteId ?? null, moedas: evento.moedas ?? 0, contagem: 0 };
      const atualizado = { ...anterior, contagem: anterior.contagem + 1 };
      this.#naoMapeados.set(chave, atualizado);
      this.aoNaoMapeado({ presenteNome: chave, ...atualizado });
      return { tipo: "nao_mapeado", presenteNome: chave };
    }

    const liberadoEm = this.#cooldowns.get(disparo.slot) ?? 0;
    if (agora < liberadoEm) {
      this.aoDescartar({ ...disparo, motivo: "cooldown" });
      return { tipo: "cooldown", slot: disparo.slot };
    }

    // Boneco livre: dispara agora. Este é o caso comum e é o que a latência protege.
    if (agora >= this.#ocupadoAte && this.#combate === null) {
      return { tipo: "despachado", disparo: this.#despachar(disparo, agora, { efeitoCurto: false }) };
    }

    if (this.#combate === null) this.#combate = { abertoEm: agora, disparos: [] };
    this.#combate.disparos.push(disparo);
    return { tipo: "em_combate", slot: disparo.slot, participantes: this.#combate.disparos.length };
  }

  #despachar(disparo, agora, { efeitoCurto, disputa = null }) {
    this.#cursor += 1;
    const despachado = {
      id: this.#cursor,
      animacaoId: disparo.animacaoId,
      delta: disparo.delta,
      intensidade: disparo.intensidade,
      efeitoCurto,
      nomeDoador: disparo.nomeDoador,
      presenteNome: disparo.presenteNome,
      emitidoEm: agora,
      // Fora do contrato com o jogo, mas o painel e o log da sessão precisam.
      slot: disparo.slot,
      presenteId: disparo.presenteId,
      repeticoes: disparo.repeticoes,
      recebidoEm: disparo.recebidoEm,
      disputa,
    };

    // Efeito curto não toma o controle do boneco, então não ocupa o canal.
    if (!efeitoCurto) this.#ocupadoAte = agora + this.#duracaoMs(disparo.animacaoId);
    if (disparo.cooldownMs > 0) this.#cooldowns.set(disparo.slot, agora + disparo.cooldownMs);

    this.aoDespachar(despachado);
    return despachado;
  }

  /**
   * Ordem do streamer para o jogo (ADR-013). Não é presente, não casa com slot
   * e não move o boneco por delta.
   *
   * Mora aqui pelo mesmo motivo que `testarAnimacao`: o `#cursor` é deste
   * módulo, e id emitido por fora colidiria com o do caminho normal — o
   * `?desde=` do Roblox então reprocessaria ou pularia evento.
   *
   * Não mexe em `#ocupadoAte` nem em cooldown: reiniciar não ocupa o canal de
   * animação, e o presente que chegar no instante seguinte continua saindo na
   * hora.
   */
  emitirComando(tipo, agora = Date.now()) {
    this.#cursor += 1;
    return { id: this.#cursor, tipo, emitidoEm: agora, tipoDeEntrada: "comando" };
  }

  /**
   * Chamado pelo timer. Fecha o combate quando a animação corrente termina, ou
   * quando ele já está aberto há tempo demais — nada espera mais que o teto,
   * e o que sai por tempo esgotado sai com efeito curto, sem animação completa.
   */
  avancar(agora = Date.now()) {
    if (this.#combate === null) return [];

    const animacaoTerminou = agora >= this.#ocupadoAte;
    const esperouDemais = agora - this.#combate.abertoEm >= this.combateMaxMs;
    if (!animacaoTerminou && !esperouDemais) return [];

    const { disparos } = this.#combate;
    this.#combate = null;

    const resultado = resolverCombate(disparos);
    if (resultado.anulado) {
      // Id do mesmo cursor dos disparos: o jogo precisa saber que o empate
      // aconteceu (o HUD mostra), e o long-poll entrega tudo por cursor único.
      this.#cursor += 1;
      this.aoAnular({ id: this.#cursor, ...resultado.disputa, emitidoEm: agora });
      return [];
    }

    return [this.#despachar(resultado.disparo, agora, {
      efeitoCurto: !animacaoTerminou,
      disputa: resultado.disputa,
    })];
  }

  /** Quando `avancar` precisa rodar de novo. Null quando não há nada pendente. */
  proximoInstante() {
    if (this.#combate === null) return null;
    return Math.min(this.#combate.abertoEm + this.combateMaxMs, this.#ocupadoAte);
  }

  /** Correção vinda do jogo (R9): quem sabe se ainda está em animação é ele. */
  informarEstadoDoJogo({ emAnimacao }, agora = Date.now()) {
    if (emAnimacao === false && this.#ocupadoAte > agora) this.#ocupadoAte = agora;
  }

  limpar() {
    this.#combate = null;
    this.#naoMapeados.clear();
    this.#cooldowns.clear();
    this.#ocupadoAte = 0;
  }
}
