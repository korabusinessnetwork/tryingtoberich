/**
 * O núcleo: amarra conector, despachante, long-poll e sessão, e expõe as
 * operações que as rotas chamam. As rotas ficam finas de propósito — regra de
 * negócio em handler HTTP é regra que não dá para testar sem subir servidor.
 *
 * O caminho quente inteiro está em `#aoEventoDaLive`, e ele é síncrono:
 * normalizar já aconteceu no conector, casar e despachar acontecem em memória,
 * e o long-poll é respondido antes de qualquer coisa tocar disco ou log.
 */

import { REGRAS } from "./config.mjs";
import { ErroDeDominio } from "./erros.mjs";
import { log } from "./log.mjs";
import { Despachante } from "./fila/despachante.mjs";
import { RegistroDeLongPoll } from "./longpoll/registro.mjs";
import { Sessao } from "./sessao/sessao.mjs";
import { ConectorTikTok, ESTADO } from "./tiktok/conector.mjs";
import { ConectorDeFixture } from "./tiktok/conector-fixture.mjs";
import { ClienteGemini } from "./gemini/cliente.mjs";
import { ClienteRoblox } from "./roblox/catalogo-itens.mjs";
import { carregarAnimacoes, indexarAnimacoes } from "./repos/animacoes.mjs";
import { carregarAcervo } from "./repos/acervo.mjs";
import { carregarCatalogo, salvarColeta } from "./repos/catalogo.mjs";
import { carregarPreset } from "./repos/presets.mjs";
import { carregarMapa, salvarMapa } from "./repos/mapas.mjs";
import { carregarLook } from "./repos/looks.mjs";

/** Com que frequência o despachante é cutucado para fechar combate vencido. */
const PASSO_DO_RELOGIO_MS = 50;

export class Nucleo {
  #despachante;
  #longpoll;
  #conector = null;
  #sessao = null;
  #preset = null;
  #relogio = null;
  #estadoDaLive = ESTADO.DESLIGADA;
  #ouvintes = new Set();
  #catalogoEmMemoria = null;

  constructor({ config, gemini, roblox } = {}) {
    this.config = config;
    this.gemini = gemini ?? new ClienteGemini({ chave: config.chaveGemini });
    this.roblox = roblox ?? new ClienteRoblox();

    this.#longpoll = new RegistroDeLongPoll({ timeoutMs: config.longpollTimeoutMs });
    this.#despachante = new Despachante({
      combateMaxMs: config.combateMaxMs,
      aoDespachar: (d) => this.#aoDespachar(d),
      aoAnular: (d) => this.#aoAnular(d),
      aoNaoMapeado: (d) => this.#aoNaoMapeado(d),
      aoDescartar: (d) => log.info("presente_descartado", { slot: d.slot, motivo: d.motivo }),
    });
  }

  get longpoll() {
    return this.#longpoll;
  }

  get sessaoAtiva() {
    return this.#sessao;
  }

  /** Estado que o painel mostra em destaque: live, jogo e sessão. */
  get estado() {
    return {
      live: this.#estadoDaLive,
      jogo: this.#longpoll.jogoOnline() ? "online" : "offline",
      sessao: this.#sessao ? "rodando" : "parada",
      presetId: this.#preset?.presetId ?? null,
      plataformaAtual: this.#sessao?.instantaneo.plataformaReferencia ?? 0,
    };
  }

  async carregarAnimacoesNaMemoria() {
    this.#despachante.definirAnimacoes(indexarAnimacoes(await carregarAnimacoes()));
  }

  /* ---------------------------------------------------------------- */
  /* Caminho quente                                                    */
  /* ---------------------------------------------------------------- */

  /** Síncrono e sem disco. Etapas 2 e 3 do caminho crítico de `docs/01_ARQUITETURA`. */
  #aoEventoDaLive(evento) {
    this.#despachante.receber(evento);
  }

  #aoDespachar(despachado) {
    // Primeiro o jogo. Tudo abaixo desta linha é caminho frio.
    this.#longpoll.publicar([despachado]);

    const registrado = this.#sessao?.registrarDisparo(despachado);
    this.#sessao?.persistirEmSegundoPlano();
    this.#publicar("presente", {
      slot: despachado.slot,
      presenteNome: despachado.presenteNome,
      nomeDoador: despachado.nomeDoador,
      animacaoId: despachado.animacaoId,
      delta: despachado.delta,
      intensidade: despachado.intensidade,
      efeitoCurto: despachado.efeitoCurto,
      disputa: despachado.disputa,
      latenciaMs: registrado?.latenciaMs ?? null,
    });
  }

  /**
   * Empate exato do ADR-012. Não move o boneco, mas o jogo precisa saber: sem
   * nada no HUD, o silêncio no momento de mais gente mandando presente lê como
   * travamento. Vai para o jogo E para o painel.
   */
  #aoAnular(dados) {
    this.#longpoll.publicar([{ ...dados, tipoDeEntrada: "anulado" }]);
    this.#publicar("combateAnulado", dados);
  }

  #aoNaoMapeado(dados) {
    this.#sessao?.registrarNaoMapeado(dados);
    this.#publicar("naoMapeado", dados);
  }

  /* ---------------------------------------------------------------- */
  /* SSE                                                               */
  /* ---------------------------------------------------------------- */

  ouvir(ouvinte) {
    this.#ouvintes.add(ouvinte);
    ouvinte("estado", this.estado);
    return () => this.#ouvintes.delete(ouvinte);
  }

  #publicar(evento, dados) {
    for (const ouvinte of this.#ouvintes) {
      try {
        ouvinte(evento, dados);
      } catch (erro) {
        log.aviso("sse_ouvinte_falhou", { motivo: erro.message });
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Sessão                                                            */
  /* ---------------------------------------------------------------- */

  async iniciarSessao({ presetId, cenario = null }) {
    if (this.#sessao) throw new ErroDeDominio("sessao_em_andamento", "Já existe uma sessão rodando. Pare antes de começar outra.", { status: 409 });

    const preset = await carregarPreset(presetId);
    if (!preset) throw new ErroDeDominio("preset_nao_encontrado", `Não achei o preset "${presetId}".`, { status: 404 });

    await this.carregarAnimacoesNaMemoria();
    this.#preset = preset;
    this.#despachante.definirPreset(preset);
    this.#despachante.limpar();
    this.#sessao = new Sessao({ presetId, mapaId: preset.mapaId ?? null });

    this.#conector = cenario
      ? new ConectorDeFixture({
          cenario,
          emLoop: true,
          aoEvento: (e) => this.#aoEventoDaLive(e),
          aoEstado: (e) => this.#aoEstadoDaLive(e),
        })
      : new ConectorTikTok({
          usuario: this.config.usuarioTiktok,
          aoEvento: (e) => this.#aoEventoDaLive(e),
          aoEstado: (e) => this.#aoEstadoDaLive(e),
          aoCatalogo: (presentes) => this.#aoCatalogo(presentes),
        });

    await this.prepararCatalogoEmMemoria();
    this.#iniciarRelogio();
    await this.#conector.conectar();
    log.info("sessao_iniciada", { sessaoId: this.#sessao.id, presetId, cenario });
    return this.#sessao.instantaneo;
  }

  async encerrarSessao() {
    if (!this.#sessao) throw new ErroDeDominio("sem_sessao", "Não há sessão rodando.", { status: 409 });

    clearInterval(this.#relogio);
    this.#relogio = null;
    await this.#conector?.desconectar();
    this.#conector = null;
    this.#longpoll.fecharTodos();
    this.#despachante.limpar();

    const resumo = await this.#sessao.encerrar();
    this.#sessao = null;
    this.#publicar("estado", this.estado);
    log.info("sessao_encerrada", { sessaoId: resumo.sessaoId, totalPresentes: resumo.resumo.totalPresentes });
    return resumo;
  }

  /** Cutuca o despachante para fechar combate vencido mesmo sem evento novo chegando. */
  #iniciarRelogio() {
    clearInterval(this.#relogio);
    this.#relogio = setInterval(() => this.#despachante.avancar(), PASSO_DO_RELOGIO_MS);
    this.#relogio.unref?.();
  }

  #aoEstadoDaLive({ live }) {
    this.#estadoDaLive = live;
    this.#publicar("estado", this.estado);
  }

  #aoCatalogo(presentes) {
    // Caminho frio: a coleta grava disco e não pode segurar a conexão da live.
    salvarColeta(presentes)
      .then((catalogo) => this.#publicar("catalogo", { total: catalogo.presentes.length }))
      .catch((erro) => log.aviso("catalogo_nao_persistiu", { motivo: erro.message }));
  }

  /* ---------------------------------------------------------------- */
  /* Teste de presente, disparado do painel                            */
  /* ---------------------------------------------------------------- */

  /**
   * Injeta presente à mão, pelo MESMO caminho de um presente de verdade.
   *
   * O valor inteiro disto está em não ter atalho: o evento entra por
   * `#aoEventoDaLive`, casa com o slot (R1), passa pelo combo (R4), disputa o
   * combate (ADR-012), sai pelo long-poll e aparece no SSE. Um testador que
   * chamasse o despachante por dentro provaria que o despachante funciona, e é
   * justamente a fiação que costuma estar errada.
   *
   * Vários presentes no mesmo instante é o modo mais útil: é como se testa o
   * combate sem depender de dois espectadores clicarem juntos.
   *
   * Só existe na superfície local. O túnel publica outra porta.
   */
  injetarPresentesDeTeste(presentes) {
    if (!this.#sessao) {
      throw new ErroDeDominio(
        "sem_sessao",
        "O teste de presente precisa de uma sessão rodando: é ela que carrega o preset e abre o long-poll do jogo.",
        { status: 409 },
      );
    }
    if (!Array.isArray(presentes) || presentes.length === 0) {
      throw new ErroDeDominio("presente_obrigatorio", "Escolha ao menos um presente para disparar.", { status: 400 });
    }

    const agora = Date.now();
    const catalogo = new Map((this.#catalogoEmMemoria?.presentes ?? []).map((p) => [p.presenteId, p]));

    const resultados = presentes.map(({ presenteId, repeticoes }) => {
      const doCatalogo = catalogo.get(presenteId);
      const evento = {
        presenteId: String(presenteId ?? "").trim(),
        presenteNome: doCatalogo?.nome ?? String(presenteId ?? "teste"),
        moedas: doCatalogo?.moedas ?? 0,
        repeticoes: Number.isInteger(repeticoes) && repeticoes > 0 ? repeticoes : 1,
        rajadaEncerrada: true,
        nomeDoador: "Teste do painel",
        recebidoEm: agora,
      };
      return this.#despachante.receber(evento, agora);
    });

    // O combate fecha quando a animação corrente termina; o relógio da sessão
    // já cuida disso. Aqui só devolvemos o que aconteceu com cada um.
    log.info("presente_de_teste", { quantidade: presentes.length });
    return resultados;
  }

  /** O catálogo fica em memória só para o testador dar nome e moedas ao evento. */
  async prepararCatalogoEmMemoria() {
    this.#catalogoEmMemoria = await carregarCatalogo();
    return this.#catalogoEmMemoria;
  }

  /* ---------------------------------------------------------------- */
  /* Vindo do jogo                                                     */
  /* ---------------------------------------------------------------- */

  /** R9 — o jogo é a fonte de verdade da posição. A ponte só repassa. */
  aplicarEstadoDoJogo(estado) {
    this.#despachante.informarEstadoDoJogo(estado);
    this.#sessao?.atualizarEstadoDoJogo(estado);
    this.#publicar("estado", { ...this.estado, emAnimacao: estado.emAnimacao });
  }

  async mapaAtivo() {
    return carregarMapa(this.#preset?.mapaId ?? null);
  }

  async lookAtivo() {
    return carregarLook(this.#preset?.personagem?.lookId ?? null);
  }

  /* ---------------------------------------------------------------- */
  /* Painel                                                            */
  /* ---------------------------------------------------------------- */

  async definirPresetAtivo(presetId) {
    const preset = await carregarPreset(presetId);
    if (!preset) throw new ErroDeDominio("preset_nao_encontrado", `Não achei o preset "${presetId}".`, { status: 404 });
    // R7 — trocar de preset no meio da sessão vale a partir do próximo evento.
    this.#preset = preset;
    this.#despachante.definirPreset(preset);
    this.#publicar("estado", this.estado);
    return preset;
  }

  async gerarMapa(descricao) {
    const acervo = await carregarAcervo();
    const spec = await this.gemini.gerarMapa(descricao, acervo);
    await salvarMapa(spec);
    return { mapa: spec, prontidao: ClienteGemini.prontidao(spec, acervo) };
  }

  async catalogo() {
    return carregarCatalogo();
  }

  async coletarCatalogo() {
    if (!this.#conector) throw new ErroDeDominio("sem_sessao", "A coleta lê a lista de presentes da sala. Comece a sessão primeiro.", { status: 409 });
    const presentes = await this.#conector.coletarCatalogo();
    return presentes.length > 0 ? salvarColeta(presentes) : carregarCatalogo();
  }

  modalidades() {
    // Fase 1 entrega só escalada, mas o seletor existe desde já (00_VISAO).
    return [{ id: "escalada", nome: "Escalada", disponivel: true }];
  }

  get regras() {
    return REGRAS;
  }
}
