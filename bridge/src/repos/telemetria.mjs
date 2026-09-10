/**
 * Telemetria da instalação para a Kora (ADR-P02).
 *
 * Três regras, e nenhuma delas é negociável:
 *
 * 1. **Fire-and-forget, sempre.** `registrar()` é síncrono, põe na fila e
 *    volta. Nunca espera rede, nunca devolve promessa, nunca lança. É a mesma
 *    regra do `log.mjs`, e pelo mesmo motivo: telemetria no caminho crítico do
 *    presente é violar o Princípio nº 1 do `CLAUDE.md`.
 * 2. **Falha não propaga.** Kora fora do ar, chave errada, projeto pausado —
 *    tudo vira linha de log local e a live continua. O ADR-P02 diz isso com
 *    todas as letras: queda do Supabase no meio da live não encerra a sessão.
 * 3. **Nenhum dado de espectador sai da máquina.** Duas defesas, em série: o
 *    `higienizar()` do log tira os campos que identificam alguém, e o
 *    `telemetria.schema.json` recusa qualquer campo que não esteja na lista
 *    curta. Evento reprovado é descartado, não corrigido — corrigir na marra
 *    esconderia o bug que o schema existe para expor.
 */

import { higienizar, log } from "../log.mjs";
import { criarValidador } from "./schemas.mjs";
import { registrarFalhaDaKora } from "./supabase.mjs";

export const TABELA = "telemetria";

/**
 * Teto da fila.
 *
 * Existe porque a Kora pode ficar fora do ar a live inteira, e uma fila sem
 * teto viraria vazamento de memória num processo que roda horas. Duzentos
 * eventos é muito mais do que uma live gera — os eventos daqui são arranque,
 * conexão, queda e desconexão, não presente — e quando estoura, o que se perde
 * é o mais VELHO: saúde de conexão pergunta "como está agora", e o começo da
 * fila é a parte que menos responde isso.
 */
const TETO_DA_FILA = 200;

/**
 * De quanto em quanto tempo a fila é despachada.
 *
 * Trinta segundos, e não a cada evento: agrupar transforma uma live inteira em
 * um punhado de requisições em vez de uma por acontecimento, e egress é um dos
 * dois gatilhos de upgrade do tier gratuito (ADR-P02). Nada aqui é urgente — o
 * console olha para as últimas 24h, não para os últimos 30 segundos.
 */
const INTERVALO_MS = 30_000;

/** As colunas do Postgres são snake_case; o domínio é camelCase (ver o SQL). */
const paraLinha = (evento) => ({
  streamer_id: evento.streamerId,
  tipo: evento.tipo,
  em: evento.em,
  versao_instalada: evento.versaoInstalada ?? null,
  idioma: evento.idioma ?? null,
  modalidade: evento.modalidade ?? null,
  motivo: evento.motivo ?? null,
});

export class Telemetria {
  #cliente;
  #fila = [];
  #relogio = null;
  #descarregando = false;

  /**
   * @param cliente  o `ClienteSupabase`. Sem ele, ou desconfigurado, a fila
   *                 nunca sai da máquina e a instalação roda igual.
   * @param contexto função que devolve `{ streamerId, versaoInstalada, idioma, chave }`
   *                 no instante do envio. Função e não objeto porque idioma e
   *                 chave mudam com o streamer mexendo no painel, e uma cópia
   *                 tirada no arranque reportaria o idioma de ontem para sempre.
   */
  constructor({ cliente = null, contexto = () => ({}), intervaloMs = INTERVALO_MS, teto = TETO_DA_FILA } = {}) {
    this.#cliente = cliente;
    this.contexto = contexto;
    this.intervaloMs = intervaloMs;
    this.teto = teto;
  }

  /** Quantos eventos ainda não saíram. Só para teste e diagnóstico. */
  get pendentes() {
    return this.#fila.length;
  }

  /**
   * Registra um acontecimento. SÍNCRONO e à prova de bala.
   *
   * O `try` envolve tudo, inclusive montar o objeto: quem chama está no meio de
   * iniciar uma sessão ou de tratar uma queda da live, e um erro escapando
   * daqui derrubaria a operação de verdade por causa de uma métrica.
   */
  registrar(tipo, dados = {}) {
    try {
      const { streamerId, versaoInstalada, idioma } = this.contexto() ?? {};

      const evento = higienizar({
        streamerId: streamerId ?? "local",
        tipo,
        em: new Date().toISOString(),
        versaoInstalada: versaoInstalada ?? null,
        idioma: idioma ?? null,
        modalidade: dados.modalidade ?? null,
        motivo: dados.motivo ?? null,
      });

      this.#fila.push(evento);
      // Descarta o mais VELHO: a pergunta do console é sobre agora.
      while (this.#fila.length > this.teto) this.#fila.shift();

      this.#garantirRelogio();
    } catch (erro) {
      log.aviso("telemetria_nao_registrada", { motivo: erro.message });
    }
  }

  /**
   * O relógio só nasce quando há o que despachar, e é `unref`: telemetria
   * pendente não pode ser o motivo de o processo se recusar a morrer quando o
   * streamer fecha o aplicativo.
   */
  #garantirRelogio() {
    if (this.#relogio || !this.#cliente?.configurado) return;
    this.#relogio = setInterval(() => {
      this.descarregar().catch(() => {});
    }, this.intervaloMs);
    this.#relogio.unref?.();
  }

  parar() {
    if (this.#relogio) clearInterval(this.#relogio);
    this.#relogio = null;
  }

  /**
   * Manda o que está na fila. NUNCA lança e nunca deixa a fila crescer sem
   * limite por causa de falha: o que não foi aceito volta para a frente da
   * fila, e o teto continua valendo sobre o resultado.
   */
  async descarregar() {
    // Sem reentrância: dois descarregamentos concorrentes mandariam o mesmo
    // evento duas vezes, e a saúde de conexão contaria quedas que não houve.
    if (this.#descarregando || this.#fila.length === 0) return { enviados: 0 };
    if (!this.#cliente?.configurado) return { enviados: 0 };

    this.#descarregando = true;
    const lote = this.#fila.splice(0, this.#fila.length);

    try {
      const { chave } = this.contexto() ?? {};

      // Sem chave de licença o RLS recusa a inserção, e é o comportamento
      // certo: instalação que a Kora não conhece não escreve na base da Kora.
      // Descartar aqui evita uma viagem para tomar 401 e o lote empatando fila.
      if (!chave) return { enviados: 0, descartados: lote.length };

      const validos = await this.#validar(lote);
      if (validos.length === 0) return { enviados: 0, descartados: lote.length };

      const resultado = await this.#cliente.inserir(TABELA, validos.map(paraLinha), { chaveDaLicenca: chave });

      if (!resultado.ok) {
        registrarFalhaDaKora("telemetria_nao_enviada", resultado);
        // Volta para a frente da fila e tenta no próximo ciclo. O ADR-P02 pede
        // exatamente isto: a telemetria acumula para enviar depois.
        this.#fila.unshift(...validos);
        while (this.#fila.length > this.teto) this.#fila.shift();
        return { enviados: 0, pendentes: this.#fila.length };
      }

      return { enviados: validos.length };
    } catch (erro) {
      // Último anteparo. Telemetria nunca sobe exceção para quem chamou.
      log.aviso("telemetria_falhou", { motivo: erro.message });
      return { enviados: 0 };
    } finally {
      this.#descarregando = false;
    }
  }

  /**
   * O portão de privacidade. Evento fora do contrato é DESCARTADO com log, não
   * consertado: se um campo novo apareceu no payload, o certo é a linha
   * vermelha no log e a revisão — não o dado vazando com o campo removido em
   * silêncio na próxima versão.
   */
  async #validar(lote) {
    const { validar } = await criarValidador();
    const validos = [];

    for (const evento of lote) {
      const problemas = validar("telemetria", evento);
      if (problemas.length) {
        log.erro("telemetria_fora_do_contrato", { tipo: evento?.tipo ?? null, problemas });
        continue;
      }
      validos.push(evento);
    }

    return validos;
  }
}
