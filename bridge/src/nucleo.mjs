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
import { buscarCatalogoPublico } from "./tiktok/catalogo-publico.mjs";
import { normalizarCatalogo } from "./tiktok/normalizador.mjs";
import { ConectorDeFixture } from "./tiktok/conector-fixture.mjs";
import { ClienteGemini } from "./gemini/cliente.mjs";
import { ClienteRoblox } from "./roblox/catalogo-itens.mjs";
import { ClienteSkins } from "./roblox/skins.mjs";
import { PublicadorRoblox } from "./roblox/publicador.mjs";
import { publicarAcervoPendente } from "./acervo/publicar.mjs";
import { montarMundo } from "./dominio/mundo.mjs";
import { desenharCeu, desenharTextura } from "./acervo/desenho.mjs";
import { carregarAnimacoes, indexarAnimacoes } from "./repos/animacoes.mjs";
import { carregarAcervo, miniaturaDaPeca, resolverAssetsDoMapa } from "./repos/acervo.mjs";
import { VIDA_PADRAO_DO_PORTAL, comFormato, problemasDeJogabilidade } from "./dominio/regras.mjs";
import { carregarConfiguracao, salvarConfiguracao } from "./repos/configuracao.mjs";
import { carregarCatalogo, salvarColeta } from "./repos/catalogo.mjs";
import { carregarPreset, listarPresets, salvarPreset } from "./repos/presets.mjs";
// Apelidado: a classe tem um método com o mesmo nome, e ler `apagarMapa` no
// meio dele deixaria dúvida sobre qual dos dois está sendo chamado.
import { apagarMapa as apagarMapaDoDisco, carregarMapa, salvarMapa } from "./repos/mapas.mjs";
import { carregarLook } from "./repos/looks.mjs";

/**
 * Quantas plataformas o teste de animação percorre, por peso visual.
 *
 * O peso é a escala do efeito na biblioteca (`03_REGRAS_DE_NEGOCIO`), e quem
 * aceita delta variável desenha proporcional à distância. Testar tudo com 1
 * mostrava a Fênix como um pulinho.
 */
const DELTA_DE_TESTE_POR_PESO = Object.freeze({ 1: 1, 2: 3, 3: 6, 4: 12, 5: 20 });

/** Com que frequência o despachante é cutucado para fechar combate vencido. */
const PASSO_DO_RELOGIO_MS = 50;

/**
 * Lado da miniatura do acervo, em pixels.
 *
 * A textura que vai para o Roblox tem 512; a galeria não precisa disso e
 * pagaria por isso em cada linha da lista. 128 é o suficiente para reconhecer
 * um bloco de grama de um de pedregulho num relance.
 */
const LADO_DA_MINIATURA = 128;

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
  #doJogo = { totalPlataformas: 0, vitoria: false, vitorias: 0, derrotas: 0 };
  #ouvintes = new Set();
  #catalogoEmMemoria = null;
  #animacoesEmMemoria = null;

  constructor({ config, gemini, roblox, skins, publicador } = {}) {
    this.config = config;
    // Injetável como os outros clientes externos: teste de acervo não pode
    // depender do Open Cloud estar de pé nem de haver chave na máquina.
    this.publicador = publicador ?? new PublicadorRoblox({
      chave: config?.chaveRoblox,
      criador: config?.criadorRoblox,
    });
    // Injetável como o cliente do catálogo: teste de galeria não pode depender
    // da API pública do Roblox estar de pé.
    this.skins = skins ?? new ClienteSkins();
    this.gemini = gemini ?? new ClienteGemini({ chave: config.chaveGemini });
    this.roblox = roblox ?? new ClienteRoblox();

    this.#longpoll = new RegistroDeLongPoll({ timeoutMs: config.longpollTimeoutMs });
    this.#despachante = new Despachante({
      combateMaxMs: config.combateMaxMs,
      aoDespachar: (d) => this.#aoDespachar(d),
      aoAnular: (d) => this.#aoAnular(d),
      aoNaoMapeado: (d) => this.#aoNaoMapeado(d),
      // Presente que mexe no placar vira COMANDO, não animação: mesmo canal do
      // "reiniciar", porque não tem delta e não casa com slot (ADR-013).
      aoComando: (comando) => {
        this.#longpoll.publicar([comando]);
        this.#publicar("placar", { efeito: comando.tipo });
        log.info("placar_por_presente", { efeito: comando.tipo });
      },
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
      // O placar da sessão, como o jogo o reporta. É por ele que o overlay
      // sabe que uma rodada acabou.
      vitorias: this.#doJogo.vitorias,
      derrotas: this.#doJogo.derrotas,
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
    this.#doJogo = { totalPlataformas: 0, vitoria: false, vitorias: 0, derrotas: 0 };

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

  /** Os nicks da galeria. O jogo LÊ; quem escreve é o painel. */
  async galeriaDeSkins() {
    const { galeriaDeSkins } = await carregarConfiguracao(this.config.usuarioTiktok);
    return galeriaDeSkins ?? [];
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
    this.#doJogo = { totalPlataformas: 0, vitoria: false, vitorias: 0, derrotas: 0 };
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

    //[[ O delta do teste acompanha o PESO da animação.
    //
    // Ele era sempre 1, "o menor passo possível". Só que metade da biblioteca
    // tem `aceitaDeltaVariavel`: a Fênix, o Tornado e o Buraco Negro escalam o
    // efeito com a distância percorrida, e com delta 1 tocam uma versão
    // encolhida de si mesmas — o boneco dá um passo e o efeito mal aparece.
    // Testar assim mostrava a animação errada de propósito.
    //
    // Peso 1 continua em 1 porque essas são passo curto por definição, e
    // animação de delta fixo também: esticar não muda nada nelas.
    //
    // O sentido continua sendo o da própria animação — descida com delta
    // positivo tocaria o visual errado para o olho.
    const passo = animacao.aceitaDeltaVariavel ? DELTA_DE_TESTE_POR_PESO[animacao.pesoVisual] ?? 1 : 1;
    const delta = animacao.direcao === "descida" ? -passo : passo;
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

    //[[ O PLACAR também atravessa, e não só a vitória em curso.
    //
    // A ponte só guardava o booleano "está no topo". O placar acumulado é do
    // jogo, e ficava só lá — o painel via, porque lê o estado cru, mas nada
    // fora do jogo sabia que uma rodada tinha acabado.
    //
    // É disso que o overlay de cutscene vive: ele compara o número com o
    // anterior e toca o vídeo quando ele sobe. Sem contador, a única pista
    // seria o booleano da vitória — e a derrota não tem booleano nenhum. ]]
    const inteiro = (valor, anterior) => (Number.isInteger(valor) ? valor : anterior);
    this.#doJogo = {
      totalPlataformas: inteiro(estado.totalPlataformas, this.#doJogo.totalPlataformas),
      vitoria: estado.vitoria === true,
      vitorias: inteiro(estado.vitorias, this.#doJogo.vitorias),
      derrotas: inteiro(estado.derrotas, this.#doJogo.derrotas),
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
   * Zera o placar de vitórias e derrotas da sessão.
   *
   * Separado do `reiniciarCorrida` de propósito: reiniciar é "a corrida
   * recomeça, o placar continua", e zerar é "o placar recomeça, a corrida
   * continua". Juntar os dois num botão só tiraria do streamer a chance de
   * fazer um sem o outro — e o caso comum é justamente reiniciar sem perder o
   * histórico da live.
   *
   * Quem é dono do placar é o JOGO, como da posição (R9.1). Aqui só sai o
   * comando; o número novo volta no próximo estado.
   */
  zerarPlacar() {
    const jogoOnline = this.#longpoll.jogoOnline();
    const comando = this.#despachante.emitirComando("zerar-placar");
    this.#longpoll.publicar([comando]);

    log.info("placar_zerado", { jogoOnline });
    return { id: comando.id, jogoOnline };
  }

  /**
   * Manda o jogo buscar o mapa de novo e reerguer a torre.
   *
   * O jogo busca `/jogo/mapa` UMA vez, ao subir a sessão. Trocar o mapa no
   * painel gravava o preset e não chegava a lugar nenhum: a torre antiga
   * continuava de pé e parecia que a troca não tinha funcionado.
   *
   * Sai pelo mesmo canal de comando do `reiniciar` — é ordem do streamer, sem
   * delta e sem casar com slot (ADR-013).
   */
  recarregarMapa() {
    const jogoOnline = this.#longpoll.jogoOnline();
    const comando = this.#despachante.emitirComando("recarregar-mapa");
    this.#longpoll.publicar([comando]);

    log.info("mapa_recarregado", { jogoOnline });
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

    //[[ O portal viaja JUNTO do mapa, não numa rota própria.
    //
    // Ele é regra de partida e mora no preset, mas o jogo não conhece preset —
    // ele busca mapa e look, e mais nada. Enriquecer esta resposta é o mesmo
    // caminho que `acervoResolvido` já usa: o disco continua guardando só o
    // spec, e quem junta as pontas é a ponte. Uma rota nova para carregar um
    // número seria mais superfície exposta no túnel sem ganho nenhum.
    //
    // Trocar a vida no painel vale a partir do próximo `recarregar-mapa`, que
    // é o mesmo instante em que a torre se reergue. ]]
    return {
      ...mapa,
      acervoResolvido: resolverAssetsDoMapa(mapa, await carregarAcervo()),
      portal: { vida: this.#preset?.portal?.vida ?? VIDA_PADRAO_DO_PORTAL },
      // As animações de fim de rodada viajam pelo mesmo caminho do portal, e
      // pelo mesmo motivo: são regra de partida, moram no preset, e o jogo não
      // conhece preset — ele busca mapa e look.
      animacoesDeRodada: {
        vitoria: this.#preset?.animacaoDeVitoria ?? null,
        derrota: this.#preset?.animacaoDeDerrota ?? null,
      },
    };
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

    const anterior = this.#preset;
    // R7 — trocar de preset no meio da sessão vale a partir do próximo evento.
    this.#preset = preset;
    this.#despachante.definirPreset(preset);

    //[[ Trocar de mapa no painel tem que chegar ao jogo sozinho.
    //
    // O `/jogo/mapa` passava a servir o mapa novo na hora, e o jogo não pedia
    // de novo: ele busca UMA vez, ao subir a sessão. Do lado de cá tudo parecia
    // certo — preset salvo, rota respondendo o mapa novo — e na tela a torre
    // antiga continuava de pé. Escolher o mapa e mandar reerguer a torre são a
    // mesma intenção; separar as duas em dois cliques era pedir para o streamer
    // adivinhar que faltava um.
    //
    // Só quando havia preset ANTES: no arranque não há torre construída, e o
    // jogo busca o mapa por conta própria ao entrar.
    if (anterior && (preset.mapaId ?? null) !== (anterior.mapaId ?? null)) {
      this.recarregarMapa();
    }

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

  async gerarMapa(descricao, formato = "disco") {
    const acervo = await carregarAcervo();
    const spec = await this.gemini.gerarMapa(descricao, acervo, formato);
    await salvarMapa(spec);
    return { mapa: spec, prontidao: ClienteGemini.prontidao(spec, acervo) };
  }

  /**
   * Converte um mapa entre escada e passarela, sem regerar nada.
   *
   * A escolha de formato no painel só valia para o PRÓXIMO mapa gerado, e do
   * lado de quem clica o botão não fazia nada. Converter é determinístico — os
   * números de cada formato estão em `PADROES_POR_FORMATO` — então não há razão
   * para gastar uma chamada de IA nisso.
   */
  async converterFormatoDoMapa(mapaId, formato) {
    const mapa = await carregarMapa(mapaId);
    if (!mapa) throw new ErroDeDominio("mapa_nao_encontrado", `Não achei o mapa "${mapaId}".`, { status: 404 });

    const convertido = comFormato(mapa, formato);
    const problemas = problemasDeJogabilidade(convertido);
    if (problemas.length) {
      throw new ErroDeDominio("mapa_invalido", `A conversão saiu fora das regras: ${problemas.join("; ")}`, { status: 422 });
    }

    await salvarMapa(convertido);
    log.info("mapa_convertido", { mapaId, formato });

    // Se é o mapa que está no ar, a torre se reergue sozinha — a conversão não
    // serve de nada se o streamer tiver que lembrar de um segundo clique.
    if (this.#preset?.mapaId === mapaId) this.recarregarMapa();

    return { mapa: convertido, prontidao: ClienteGemini.prontidao(convertido, await carregarAcervo()) };
  }

  /**
   * Apaga um mapa gerado.
   *
   * Recusa o que está EM USO por qualquer preset, e não só pelo ativo: apagar o
   * mapa de um preset guardado deixaria uma bomba armada — o streamer trocaria
   * de preset no meio da live e o jogo entraria num mundo vazio, com `sem_mapa`
   * e nada explicando. O erro diz quais presets seguram o mapa, para ele saber
   * o que soltar.
   */
  async apagarMapa(mapaId) {
    const presets = await listarPresets();
    const presos = [];
    for (const { presetId } of presets) {
      const preset = await carregarPreset(presetId);
      if (preset?.mapaId === mapaId) presos.push(presetId);
    }

    if (presos.length > 0) {
      throw new ErroDeDominio(
        "mapa_em_uso",
        `Este mapa está em uso por ${presos.join(", ")}. Escolha outro mapa nesses presets antes de apagar.`,
        { status: 409 },
      );
    }

    const apagado = await apagarMapaDoDisco(mapaId);
    log.info("mapa_apagado", { mapaId });
    return apagado;
  }

  async catalogo() {
    return carregarCatalogo();
  }

  /**
   * Traz os presentes de verdade da TikTok, com id, valor e ícone oficiais.
   *
   * Com a live de pé a fonte é a SALA, que é a mais completa: ela lista também
   * os presentes exclusivos dela. Sem live, cai no painel público da TikTok,
   * que devolve a lista global sem exigir sala nem assinatura.
   *
   * A ordem importa. Antes disto a coleta exigia sessão, e montar preset é
   * trabalho de ANTES da live: quem abria o painel pela primeira vez via 13
   * presentes de mentira com id inventado, e o preset montado em cima deles
   * nunca casaria com um presente real (R1 casa por `presenteId`).
   */
  async coletarCatalogo() {
    if (this.#conector) {
      const daSala = await this.#conector.coletarCatalogo();
      if (daSala.length > 0) return salvarColeta(daSala, undefined, { origem: "live" });
    }

    try {
      const presentes = normalizarCatalogo(await buscarCatalogoPublico());
      if (presentes.length === 0) throw new Error("lista vazia depois de normalizar");
      return salvarColeta(presentes, undefined, { origem: "publico" });
    } catch (erro) {
      // API pública não contratada: quando ela cai, o que já está em disco
      // continua valendo. Derrubar o painel por causa disso seria pior.
      log.aviso("catalogo_publico_falhou", { motivo: erro.message });
      throw new ErroDeDominio(
        "catalogo_indisponivel",
        `Não consegui buscar os presentes na TikTok: ${erro.message}`,
        { status: 502 },
      );
    }
  }

  /**
   * Monta o mundo com as peças escolhidas na galeria, e põe no ar.
   *
   * Substitui o mundo anterior no MESMO arquivo, de propósito: montar é um
   * gesto de composição, não de criação de acervo. Cada clique gerando um mapa
   * novo encheria a lista de descartes em minutos — foi o que aconteceu com o
   * gerador por texto.
   *
   * Recusa peça que não esteja aprovada: o jogo não consegue aplicar assetId
   * pendente, e o mundo sairia sem céu ou sem textura, calado (ADR-004).
   */
  async montarMundo(escolhas = {}) {
    const acervo = await carregarAcervo();

    const acharPeca = (colecao, id, rotulo) => {
      const item = (acervo[colecao] ?? []).find((i) => i.id === id);
      if (!item) {
        throw new ErroDeDominio("peca_inexistente", `Não achei ${rotulo} "${id}" no acervo.`, { status: 400 });
      }
      if (item.status !== "aprovado" || !Number.isInteger(item.assetId)) {
        throw new ErroDeDominio(
          "peca_nao_aprovada",
          `"${item.nome}" ainda não foi aprovada pelo Roblox: o jogo não conseguiria aplicá-la.`,
          { status: 409 },
        );
      }
      return item;
    };

    const ceu = acharPeca("skybox", escolhas.skybox, "o céu");
    const idsDeTextura = Array.isArray(escolhas.texturas) ? escolhas.texturas : [];
    if (idsDeTextura.length === 0) {
      throw new ErroDeDominio("sem_textura", "Escolha ao menos uma textura de plataforma.", { status: 400 });
    }
    const texturas = idsDeTextura.map((id) => acharPeca("texturas", id, "a textura"));

    const mundo = montarMundo({
      nome: escolhas.nome || `${ceu.nome} com ${texturas[0].nome}`,
      skybox: ceu.id,
      texturas: texturas.map((t) => t.id),
      formato: escolhas.formato === "laje" ? "laje" : "disco",
      totalPlataformas: escolhas.totalPlataformas ?? this.#preset?.totalPlataformas ?? 1000,
      tagsDaTextura: texturas[0].tags,
      tagsDoCeu: ceu.tags,
    });

    const problemas = problemasDeJogabilidade(mundo);
    if (problemas.length) {
      throw new ErroDeDominio("mundo_invalido", `O mundo saiu fora das regras: ${problemas.join("; ")}`, { status: 422 });
    }

    await salvarMapa(mundo);

    // Entra em uso na hora: montar e não usar não é um gesto que exista.
    if (this.#preset && this.#preset.mapaId !== mundo.mapaId) {
      await salvarPreset({ ...this.#preset, mapaId: mundo.mapaId });
      await this.definirPresetAtivo(this.#preset.presetId);
    } else {
      this.recarregarMapa();
    }

    log.info("mundo_montado", { skybox: ceu.id, texturas: texturas.length, formato: mundo.plataformas.formato });
    return { mapa: mundo, prontidao: ClienteGemini.prontidao(mundo, acervo) };
  }

  /**
   * A foto de uma peça do acervo, para a galeria do painel.
   *
   * Desenhada na hora e pequena: é miniatura, não a textura que sobe para o
   * Roblox. Determinística, então não há o que guardar nem invalidar.
   */
  async imagemDoAcervo(colecao, id) {
    const desenhar = { texturas: desenharTextura, skybox: desenharCeu }[colecao];
    if (!desenhar) {
      throw new ErroDeDominio(
        "colecao_invalida",
        `Só "skybox" e "texturas" têm imagem. "${colecao}" não.`,
        { status: 400 },
      );
    }

    const acervo = await carregarAcervo();
    const item = (acervo[colecao] ?? []).find((i) => i.id === id);
    if (!item) {
      throw new ErroDeDominio("item_inexistente", `Não achei "${id}" em acervo.${colecao}.`, { status: 404 });
    }

    //[[ O ARQUIVO do streamer manda, quando existe.
    //
    // A galeria mostra o que vai para o jogo. Enquanto o desenho em código era
    // a única fonte, desenhar sob demanda era o certo; com arte de verdade em
    // disco, mostrar o desenho seria mostrar outra coisa — o streamer
    // escolheria por uma imagem e receberia outra.
    //
    // Céu de seis faces vira a face `ft`: é a que se olha de frente. ]]
    const doStreamer = await miniaturaDaPeca(colecao, item.id);
    if (doStreamer) return { png: doStreamer, tipo: "image/png" };

    return { png: desenhar(item, { lado: LADO_DA_MINIATURA }), tipo: "image/png" };
  }

  /**
   * Enche o acervo: desenha o que falta, sobe pelo Open Cloud e anota o
   * assetId (ADR-004, nota de 2026-09-02).
   *
   * Fora do caminho crítico por definição — é trabalho de véspera, e cada item
   * espera a operação do Roblox terminar.
   */
  async publicarAcervo() {
    if (!this.publicador.configurado) {
      throw new ErroDeDominio(
        "roblox_sem_chave",
        "Falta ROBLOX_API_KEY e ROBLOX_CREATOR_ID no .env. A chave é gratuita: "
          + "create.roblox.com/dashboard/credentials, API System \"Assets\" com read e write.",
        { status: 400 },
      );
    }

    const resultado = await publicarAcervoPendente({ publicador: this.publicador });
    log.info("acervo_publicado", resultado.resumo);
    return resultado;
  }

  modalidades() {
    // Fase 1 entrega só escalada, mas o seletor existe desde já (00_VISAO).
    return [{ id: "escalada", nome: "Escalada", disponivel: true }];
  }

  get regras() {
    return REGRAS;
  }
}
