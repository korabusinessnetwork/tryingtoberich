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
import { log, ouvirLog } from "./log.mjs";
import { Despachante } from "./fila/despachante.mjs";
import { RegistroDeLongPoll } from "./longpoll/registro.mjs";
import { Sessao } from "./sessao/sessao.mjs";
import { ConectorTikTok, ESTADO } from "./tiktok/conector.mjs";
import { ConectorDeFixture } from "./tiktok/conector-fixture.mjs";
import { ClienteGemini } from "./gemini/cliente.mjs";
import { ClienteRoblox } from "./roblox/catalogo-itens.mjs";
import { carregarAnimacoes, indexarAnimacoes } from "./repos/animacoes.mjs";
import { carregarAcervo, resolverAssetsDoMapa } from "./repos/acervo.mjs";
import { carregarConfiguracao, salvarConfiguracao } from "./repos/configuracao.mjs";
import { carregarCatalogo, salvarColeta } from "./repos/catalogo.mjs";
import { carregarPreset, listarPresets } from "./repos/presets.mjs";
import { carregarMapa, salvarMapa } from "./repos/mapas.mjs";
import { carregarLook } from "./repos/looks.mjs";

/** Com que frequência o despachante é cutucado para fechar combate vencido. */
const PASSO_DO_RELOGIO_MS = 50;

/** O id do único preset instalado, ou null se houver zero ou vários. */
async function umPresetSozinho() {
  const presets = await listarPresets();
  return presets.length === 1 ? presets[0].presetId : null;
}

export class Nucleo {
  #despachante;
  #longpoll;
  #conector = null;
  #sessao = null;
  #preset = null;
  #relogio = null;
  #estadoDaLive = ESTADO.DESLIGADA;
  /**
   * O último estado que o JOGO reportou (R9: ele é a fonte de verdade da
   * posição). Guardado porque o painel lê o estado por dois caminhos — o SSE e
   * o GET de abertura — e os dois precisam contar a mesma história. Sem isto,
   * quem abrisse o painel no meio de uma live veria a vitória sumir até o
   * próximo batimento do jogo.
   */
  #doJogo = { totalPlataformas: 0, vitoria: false };
  #ouvintes = new Set();
  #catalogoEmMemoria = null;
  #animacoesEmMemoria = null;

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
      totalPlataformas: this.#doJogo.totalPlataformas,
      // R6 — o topo não reinicia sozinho. Enquanto isto for verdadeiro, o
      // painel mostra a decisão que só o streamer pode tomar.
      vitoria: this.#doJogo.vitoria,
    };
  }

  async carregarAnimacoesNaMemoria() {
    this.#animacoesEmMemoria = indexarAnimacoes(await carregarAnimacoes());
    this.#despachante.definirAnimacoes(this.#animacoesEmMemoria);
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

    // O log vai junto pelo mesmo fluxo: quando algo falha durante a live, o
    // streamer precisa ver no painel, não no terminal do Node atrás da janela.
    const pararDeOuvirLog = ouvirLog((linha) => {
      try {
        ouvinte("log", linha);
      } catch {
        // Ouvinte de SSE que caiu já vai ser removido pelo `close` da rota.
      }
    });

    return () => {
      pararDeOuvirLog();
      this.#ouvintes.delete(ouvinte);
    };
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
    // Vitória e tamanho do mapa são da CORRIDA, não da ponte. Sessão nova
    // começa sem os dois, e o jogo republica no primeiro batimento — senão a
    // live que acabou no topo abriria a próxima já com o aviso de vitória na
    // tela e um botão de reiniciar que não tem o que reiniciar.
    this.#doJogo = { totalPlataformas: 0, vitoria: false };

    this.#conector = cenario
      ? new ConectorDeFixture({
          cenario,
          emLoop: true,
          aoEvento: (e) => this.#aoEventoDaLive(e),
          aoEstado: (e) => this.#aoEstadoDaLive(e),
        })
      : new ConectorTikTok({
          usuario: await this.#contaDaLive(),
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

  /**
   * Em qual live a sessão vai rodar.
   *
   * O painel manda; o `.env` é só semente para quem já tinha configurado antes
   * de a tela existir. Falhar AQUI, com mensagem, é o ponto: antes disso a
   * ponte tentava conectar no placeholder do `.env.example` e o streamer via um
   * erro do TikTok sobre uma conta que nunca existiu.
   */
  async #contaDaLive() {
    const configuracao = await carregarConfiguracao(this.config.usuarioTiktok);
    if (!configuracao.usuarioTiktok) {
      throw new ErroDeDominio(
        "sem_conta_da_live",
        "Nenhuma conta configurada. Digite o @ da sua live no painel, em Configurar.",
        { status: 409 },
      );
    }
    return configuracao.usuarioTiktok;
  }

  /** A conta configurada, para o painel mostrar. `null` = ninguém configurou ainda. */
  async configuracao() {
    return carregarConfiguracao(this.config.usuarioTiktok);
  }

  async definirConfiguracao(dados) {
    const salva = await salvarConfiguracao(dados, this.config.usuarioTiktok);
    log.info("conta_da_live_definida", { streamerId: salva.streamerId });
    this.#publicar("estado", this.estado);
    return salva;
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
    // Idem no Stop: o jogo não tem como avisar que a corrida acabou (os
    // long-polls já foram fechados na linha acima), então quem esquece a
    // vitória é a ponte. Sem isto o aviso do R6 fica na tela por cima do
    // resumo da live, oferecendo reiniciar uma corrida que não existe mais.
    this.#doJogo = { totalPlataformas: 0, vitoria: false };
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

  /**
   * Dispara uma animação no jogo, sem presente e sem preset.
   *
   * NÃO exige sessão, ao contrário do teste de presente. A diferença é real: o
   * teste de presente precisa do preset para saber qual slot casar, e o preset
   * é da sessão. Uma animação já é o destino final — não há o que casar. Exigir
   * sessão aqui obrigaria a montar preset antes de responder a pergunta mais
   * básica do Bloco 2: "essa animação toca no Roblox?".
   */
  injetarAnimacaoDeTeste({ animacaoId, intensidade } = {}) {
    const animacao = this.#animacoesEmMemoria?.get(String(animacaoId ?? "").trim());
    if (!animacao) {
      throw new ErroDeDominio(
        "animacao_desconhecida",
        `Não existe animação com id "${animacaoId}". O índice sai de \`npm run gerar\`.`,
        { status: 400 },
      );
    }

    // O contrato com o jogo proíbe delta 0 (evento-jogo.schema.json e
    // tipos.lua): evento que não move o boneco é descartado na entrada. Então o
    // teste manda o menor passo possível, no sentido da própria animação —
    // uma descida com delta positivo tocaria a animação errada para o olho.
    const delta = animacao.direcao === "descida" ? -1 : 1;
    const nivel = Number.isInteger(intensidade) ? Math.min(5, Math.max(1, intensidade)) : 3;

    // Lido ANTES de despachar: se o jogo estiver fora, o long-poll descarta em
    // silêncio e o streamer ficaria clicando um botão que não faz nada.
    const jogoOnline = this.#longpoll.jogoOnline();
    const despachado = this.#despachante.testarAnimacao({ animacaoId: animacao.id, delta, intensidade: nivel });

    log.info("animacao_de_teste", { animacaoId: animacao.id, jogoOnline });
    return {
      id: despachado.id,
      animacaoId: animacao.id,
      nome: animacao.nome,
      direcao: animacao.direcao,
      delta,
      intensidade: nivel,
      jogoOnline,
    };
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

    const venceuAgora = estado.vitoria === true && !this.#doJogo.vitoria;
    this.#doJogo = {
      totalPlataformas: Number.isInteger(estado.totalPlataformas)
        ? estado.totalPlataformas
        : this.#doJogo.totalPlataformas,
      vitoria: estado.vitoria === true,
    };
    // Só na transição: o jogo republica o estado a cada 2s, e uma linha de log
    // por batimento afogaria o painel justo no momento de mais atenção.
    if (venceuAgora) log.info("vitoria", { plataforma: estado.plataformaReferencia });

    this.#publicar("estado", { ...this.estado, emAnimacao: estado.emAnimacao });
  }

  /**
   * R6 — reinicia a corrida. Ordem do streamer, não de espectador (ADR-013).
   *
   * A ponte NÃO zera posição nenhuma: quem é dono de onde o boneco está é o
   * jogo (R9.1), e ele devolve a posição nova pelo POST de estado. Aqui só sai
   * o comando. Com o jogo offline o long-poll descarta, como faz com presente
   * (F7), e é por isso que a resposta diz `jogoOnline` — senão o streamer fica
   * clicando um botão que não chega em lugar nenhum.
   */
  reiniciarCorrida() {
    const jogoOnline = this.#longpoll.jogoOnline();
    const comando = this.#despachante.emitirComando("reiniciar");
    this.#longpoll.publicar([comando]);

    // Otimista de propósito: se o comando saiu, a vitória deixa de valer no
    // painel na hora. O jogo confirma no próximo estado, e se ele não recebeu,
    // o `vitoria: true` volta sozinho no batimento seguinte.
    if (jogoOnline) this.#doJogo = { ...this.#doJogo, vitoria: false };

    log.info("corrida_reiniciada", { jogoOnline });
    this.#publicar("estado", this.estado);
    return { id: comando.id, jogoOnline };
  }

  /**
   * O mapa que o jogo recebe, já com os assetId do acervo resolvidos.
   *
   * A tradução acontece AQUI e não no disco: o schema do mapa é
   * `additionalProperties: false`, então `acervoResolvido` não pode ser gravado
   * no arquivo. E não deveria mesmo — o assetId é estado do acervo, que muda
   * quando a moderação do Roblox aprova, sem o mapa mudar em nada.
   */
  async mapaAtivo() {
    const mapa = await carregarMapa(this.#preset?.mapaId ?? null);
    if (!mapa) return null;

    return { ...mapa, acervoResolvido: resolverAssetsDoMapa(mapa, await carregarAcervo()) };
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

    // Persistido, e fora do caminho crítico: o Roblox pede GET /jogo/mapa na
    // ENTRADA, então sem isto uma ponte reiniciada servia 404 e o jogo caía num
    // mundo vazio, sem erro na tela. Fire-and-forget porque trocar de preset não
    // pode esperar disco (CLAUDE.md, Princípio nº1).
    salvarConfiguracao({ presetAtivo: presetId }, this.config.usuarioTiktok)
      .catch((erro) => log.aviso("preset_ativo_nao_persistido", { motivo: erro.message }));

    this.#publicar("estado", this.estado);
    return preset;
  }

  /**
   * Restaura o que valia antes do reinício. Chamado uma vez, no arranque.
   *
   * Sem isto a ponte subia sem preset e o jogo, que pede o mapa na entrada,
   * recebia `sem_mapa` — mundo vazio, HUD funcionando, e nada explicando.
   */
  async restaurar() {
    const { presetAtivo } = await carregarConfiguracao(this.config.usuarioTiktok);

    // Nada persistido e existe UM preset só: ativa ele. É instalação nova, e a
    // alternativa é o jogo abrir vazio até alguém clicar em algo no painel.
    const escolhido = presetAtivo ?? (await umPresetSozinho());
    if (!escolhido) return null;

    try {
      await this.definirPresetAtivo(escolhido);
      log.info("preset_restaurado", { presetId: escolhido });
      return escolhido;
    } catch (erro) {
      // Preset apagado do disco depois de configurado não pode impedir a ponte
      // de subir: sem ela, o painel nem abre para o streamer arrumar.
      log.aviso("preset_nao_restaurado", { presetId: escolhido, motivo: erro.message });
      return null;
    }
  }

  /**
   * R7 — troca o preset com a sessão rodando.
   *
   * Separado de `definirPresetAtivo` porque a sessão precisa saber com QUAL
   * preset ela terminou: o resumo de F5 carrega o `presetId`, e trocar sem
   * registrar deixaria o histórico apontando para o preset errado.
   */
  async trocarPresetAtivo(presetId) {
    const preset = await this.definirPresetAtivo(presetId);
    if (this.#sessao) {
      this.#sessao.trocarPreset(presetId);
      log.info("preset_trocado_ao_vivo", { presetId });
    }
    return preset;
  }

  /** ADR-004 — a prontidão de um mapa já salvo. Ela muda com o ACERVO, não com o mapa. */
  async prontidaoDoMapa(mapaId) {
    const mapa = await carregarMapa(mapaId);
    if (!mapa) throw new ErroDeDominio("mapa_nao_encontrado", `Não achei o mapa "${mapaId}".`, { status: 404 });
    return { mapaId, ...ClienteGemini.prontidao(mapa, await carregarAcervo()) };
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
