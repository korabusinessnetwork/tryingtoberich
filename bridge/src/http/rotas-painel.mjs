/**
 * Superfície local: ponte ↔ painel, só em `localhost`. Ver 07_APIS seção B.
 *
 * Sem autenticação de propósito: ela nunca sai da máquina. O que a protege é o
 * bind em 127.0.0.1 e o túnel publicar só `/jogo`. Ver 11_SEGURANCA.
 */

import express from "express";

import { REGRAS } from "../config.mjs";
import { ErroDeDominio } from "../erros.mjs";
import { logRecente } from "../log.mjs";
import { abrirNoStudio } from "../roblox/estudio.mjs";
import { carregarAnimacoes } from "../repos/animacoes.mjs";
import { listarLooks } from "../repos/looks.mjs";
import { listarMapas } from "../repos/mapas.mjs";
import { apagarPreset, carregarPreset, listarPresets, salvarPreset } from "../repos/presets.mjs";
import { listarCenarios } from "../repos/fixtures.mjs";
import { anotarItemDoAcervo, carregarAcervo } from "../repos/acervo.mjs";
import { listarResumos } from "../repos/sessoes.mjs";
import { listarCutscenes } from "../repos/cutscenes.mjs";
import { carregarLayout } from "../repos/overlay.mjs";
import { CAM_PADRAO, ELEMENTOS_DO_OVERLAY } from "../dominio/overlay-layout.mjs";

/**
 * A escolha do preset ativo, dita junto de "o arquivo está lá?" (ADR-014).
 * `id: null` é "nenhuma — só o placar muda", e é dito, não omitido: a aba de
 * overlay precisa distinguir "não escolhi" de "escolhi e sumiu".
 */
function cutscenesEmUso(escolhidas, naPasta) {
  const ids = new Set(naPasta.map((cutscene) => cutscene.id));
  const dizer = (id) => ({ id: id ?? null, existe: id != null && ids.has(id) });
  return { vitoria: dizer(escolhidas?.vitoria), derrota: dizer(escolhidas?.derrota) };
}

export function rotasDoPainel(nucleo) {
  const rotas = express.Router();

  rotas.get("/modalidades", (req, res) => res.json({ modalidades: nucleo.modalidades() }));

  rotas.get("/presets", async (req, res) => res.json({ presets: await listarPresets() }));

  rotas.get("/presets/:id", async (req, res) => {
    const preset = await carregarPreset(req.params.id);
    if (!preset) throw new ErroDeDominio("preset_nao_encontrado", `Não achei o preset "${req.params.id}".`, { status: 404 });
    res.json(preset);
  });

  /**
   * Valida R1 e R2 antes de gravar. O repositório recusa o que passar.
   *
   * Cria também: o repositório grava o arquivo que ainda não existe, e é por
   * isso que o painel consegue oferecer "novo preset" sem uma rota própria.
   *
   * O `streamerId` é preenchido AQUI quando o corpo não traz. O painel não
   * conhece o tenant e não deve conhecer — hoje ele é sempre "local", e a
   * Fase 3 troca isto num lugar só (ADR-003). O que vier no corpo vence, para
   * um preset existente nunca ter o dono reescrito por um PUT de edição.
   */
  rotas.put("/presets/:id", async (req, res) => {
    const salvo = await salvarPreset({ streamerId: REGRAS.STREAMER_ID, ...req.body, presetId: req.params.id });
    if (nucleo.estado.presetId === salvo.presetId) await nucleo.definirPresetAtivo(salvo.presetId);
    res.json(salvo);
  });

  /**
   * Apaga um preset. Recusa apagar o que está no ar: o preset ativo é o que
   * casa presente com slot, e sumir com ele no meio da live deixaria todo
   * presente caindo em "não mapeado" sem explicação nenhuma na tela.
   */
  rotas.delete("/presets/:id", async (req, res) => {
    if (nucleo.sessaoAtiva && nucleo.estado.presetId === req.params.id) {
      throw new ErroDeDominio(
        "preset_em_uso",
        "Este preset está rodando agora. Pare a sessão, ou troque de preset, antes de apagar.",
        { status: 409 },
      );
    }
    res.json(await apagarPreset(req.params.id));
  });

  rotas.get("/catalogo", async (req, res) => res.json(await nucleo.catalogo()));

  rotas.post("/catalogo/atualizar", async (req, res) => res.json(await nucleo.coletarCatalogo()));

  rotas.get("/animacoes", async (req, res) => res.json({ animacoes: await carregarAnimacoes() }));

  rotas.get("/looks", async (req, res) => res.json({ looks: await listarLooks() }));

  rotas.get("/mapas", async (req, res) => res.json({ mapas: await listarMapas() }));

  /**
   * O mapa pode ir ao ar? (ADR-004)
   *
   * A resposta da geração já trazia isto, mas só para o mapa recém-nascido —
   * escolher um mapa salvo na lista deixava o painel sem saber, e "sem saber"
   * desenha igual a "pode". A prontidão muda sem o mapa mudar: ela depende do
   * estado do ACERVO, que anda quando a moderação do Roblox aprova.
   */
  rotas.get("/mapas/:id/prontidao", async (req, res) => res.json(await nucleo.prontidaoDoMapa(req.params.id)));

  /**
   * Apaga um mapa gerado. Recusa o que está em uso por qualquer preset.
   *
   * A geração é barata e o disco enche rápido: sem isto, mapa ruim fica na
   * lista para sempre, disputando espaço com os bons na hora de escolher.
   */
  rotas.delete("/mapas/:id", async (req, res) => res.json(await nucleo.apagarMapa(req.params.id)));

  /**
   * Troca o formato de um mapa que já existe (ADR-009), sem regerar.
   *
   * É o que faz o botão "Escada / Passarela" ter efeito no mapa que está no ar,
   * em vez de valer só para o próximo que o Gemini gerar.
   */
  rotas.post("/mapas/:id/formato", async (req, res) => {
    const formato = String(req.body?.formato ?? "");
    if (formato !== "disco" && formato !== "laje") {
      throw new ErroDeDominio("formato_invalido", `Formato "${formato}" não existe. Use "disco" ou "laje".`, { status: 400 });
    }
    res.json(await nucleo.converterFormatoDoMapa(req.params.id, formato));
  });

  /**
   * Monta o mundo com as peças escolhidas na galeria, e põe no ar.
   *
   * Sem IA e sem espera: as regras de geometria são conhecidas, e o que o
   * streamer escolhe são as peças. Substitui o mundo anterior no mesmo arquivo.
   */
  rotas.post("/mundo", async (req, res) => res.json(await nucleo.montarMundo(req.body ?? {})));

  /** F4 — o painel manda o texto, a ponte fala com o Gemini. A chave nunca sai daqui. */
  rotas.post("/mapas/gerar", async (req, res) => {
    const descricao = String(req.body?.descricao ?? "").trim();
    if (descricao.length < 5) {
      throw new ErroDeDominio("descricao_curta", "Descreva o ambiente com pelo menos algumas palavras.", { status: 400 });
    }
    // O formato é do CONTRATO do mapa, então a rota valida em vez de repassar
    // qualquer texto: o schema recusaria depois, com erro de validação em vez
    // de mensagem legível.
    const formato = String(req.body?.formato ?? "disco");
    if (formato !== "disco" && formato !== "laje") {
      throw new ErroDeDominio("formato_invalido", `Formato "${formato}" não existe. Use "disco" ou "laje".`, { status: 400 });
    }
    res.json(await nucleo.gerarMapa(descricao, formato));
  });

  /**
   * A conta da live. É ela que decide em QUAL live a sessão vai rodar.
   *
   * Vive nesta superfície e não no `.env` porque é configuração de produto: o
   * streamer troca de conta sem editar arquivo nem reiniciar a ponte.
   */
  rotas.get("/configuracao", async (req, res) => res.json({ configuracao: await nucleo.configuracao() }));

  rotas.put("/configuracao", async (req, res) => {
    res.json(await nucleo.definirConfiguracao({ usuarioTiktok: req.body?.usuarioTiktok }));
  });

  /**
   * A galeria de skins: nicks do Roblox usados como base no vestiário.
   *
   * A curadoria vive AQUI, na superfície local, e o jogo só lê. É configuração
   * do streamer, como a conta da live.
   */
  rotas.put("/galeria", async (req, res) => {
    res.json(await nucleo.definirConfiguracao({ galeriaDeSkins: req.body?.nicks }));
  });

  /** Espia a skin antes de acrescentar à galeria, para não salvar nick errado. */
  rotas.get("/skin", async (req, res) => {
    const skin = await nucleo.skins.buscarSkin(String(req.query.nick ?? "").trim());
    if (!skin) throw new ErroDeDominio("skin_nao_encontrada", "Não achei esse usuário no Roblox.", { status: 404 });
    res.json(skin);
  });

  /**
   * A FOTO de uma peça do acervo, desenhada na hora.
   *
   * Não serve arquivo de disco: a imagem é determinística (mesmo id, mesmas
   * tags, mesma imagem — ver `desenho.mjs`), então gerar sob demanda é mais
   * simples que guardar, e não existe cache para invalidar quando as tags
   * mudam. Sai pequena de propósito: é miniatura de galeria, não a textura que
   * vai para o Roblox.
   *
   * Rota do PAINEL, e não do jogo: o jogo carrega a textura de verdade pelo
   * assetId, direto do Roblox. Isto aqui é só para o streamer ver o que tem.
   */
  rotas.get("/acervo/imagem/:colecao/:id", async (req, res) => {
    const { png, tipo } = await nucleo.imagemDoAcervo(req.params.colecao, req.params.id);
    res.set("content-type", tipo);
    // Determinística: o navegador pode guardar à vontade dentro da sessão.
    res.set("cache-control", "private, max-age=300");
    res.send(png);
  });

  /**
   * Enche o acervo sozinho (ADR-004). Desenha o que falta, sobe pelo Open
   * Cloud e anota o assetId. Demora: são doze itens e cada um espera a
   * operação do Roblox — por isso não tem timeout curto e não é botão de live.
   */
  rotas.post("/acervo/publicar", async (req, res) => res.json(await nucleo.publicarAcervo()));

  rotas.get("/sessao", (req, res) => {
    res.json({ estado: nucleo.estado, sessao: nucleo.sessaoAtiva?.instantaneo ?? null });
  });

  rotas.post("/sessao/start", async (req, res) => {
    const presetId = String(req.body?.presetId ?? "").trim();
    if (!presetId) throw new ErroDeDominio("preset_obrigatorio", "Escolha um preset antes de começar.", { status: 400 });
    res.json(await nucleo.iniciarSessao({ presetId, cenario: req.body?.cenario ?? null }));
  });

  rotas.post("/sessao/stop", async (req, res) => res.json(await nucleo.encerrarSessao()));

  /**
   * Troca o preset ativo com a sessão rodando (R7).
   *
   * "Vale a partir do próximo evento, não recalcula nada retroativo" é a regra
   * inteira: o que já foi despachado já está no jogo, e não há o que refazer.
   */
  rotas.post("/sessao/preset", async (req, res) => {
    const presetId = String(req.body?.presetId ?? "").trim();
    if (!presetId) throw new ErroDeDominio("preset_obrigatorio", "Diga qual preset passa a valer.", { status: 400 });
    res.json(await nucleo.trocarPresetAtivo(presetId));
  });

  /** R6 — chegar no topo não reinicia sozinho. Quem decide é o streamer, aqui. */
  rotas.post("/sessao/reiniciar", async (req, res) => res.json(nucleo.reiniciarCorrida()));

  /** Zera vitórias e derrotas SEM mexer na corrida. Ver Nucleo.zerarPlacar. */
  rotas.post("/sessao/zerar-placar", async (req, res) => res.json(nucleo.zerarPlacar()));

  /** Reergue a torre com o mapa do preset ativo, sem parar a sessão. */
  rotas.post("/sessao/recarregar-mapa", async (req, res) => res.json(nucleo.recarregarMapa()));

  /**
   * O histórico das lives.
   *
   * Sessão encerrada já teve o detalhe por evento descartado (F5), então o que
   * sai daqui é agregado por definição. Nenhum dado de espectador passa por
   * esta rota — não porque ela filtra, mas porque ele não existe mais em disco.
   */
  rotas.get("/sessoes", async (req, res) => res.json({ sessoes: await listarResumos() }));

  /**
   * O acervo do ADR-004, e a anotação do que a moderação do Roblox devolveu.
   *
   * Montar o acervo é trabalho manual de véspera, e até aqui era editar
   * `data/acervo.json` na mão — com o schema recusando o arquivo INTEIRO
   * quando um assetId caía no item errado. Nenhum mapa vai ao ar antes disso,
   * então a tarefa que bloqueia a live merecia uma tela.
   */
  rotas.get("/acervo", async (req, res) => res.json(await carregarAcervo()));

  rotas.put("/acervo/:colecao/:id", async (req, res) => {
    const { assetId, status } = req.body ?? {};
    // String vazia do campo de texto vira null: "apagar o número" e "não mexer
    // no número" são coisas diferentes, e `undefined` já quer dizer a segunda.
    const numero = assetId === "" || assetId === null
      ? null
      : (assetId === undefined ? undefined : Number.parseInt(assetId, 10));

    if (numero !== undefined && numero !== null && !Number.isInteger(numero)) {
      throw new ErroDeDominio("asset_invalido", "O assetId é o número que o Roblox devolve, sem letras.", { status: 400 });
    }

    res.json(await anotarItemDoAcervo(req.params.colecao, req.params.id, { assetId: numero, status }));
  });

  /**
   * Dispara presente à mão, para testar um slot sem depender de espectador.
   *
   * Existe só nesta superfície: a porta do painel não é publicada pelo túnel.
   * Se um dia esta rota vazasse, qualquer um moveria o boneco da live.
   */
  rotas.post("/teste/presentes", (req, res) => {
    const presentes = Array.isArray(req.body?.presentes) ? req.body.presentes : [];
    res.json({ resultados: nucleo.injetarPresentesDeTeste(presentes) });
  });

  /**
   * Dispara uma animação direto no jogo, sem presente e sem preset.
   *
   * Este é o teste do Bloco 2: responde "a animação toca no Roblox?" sem exigir
   * live, preset ou sessão. Mesma razão de morar só aqui que o teste de
   * presente — a porta do painel não é publicada pelo túnel.
   */
  rotas.post("/teste/animacao", (req, res) => {
    res.json(nucleo.injetarAnimacaoDeTeste({
      animacaoId: req.body?.animacaoId,
      intensidade: req.body?.intensidade,
    }));
  });

  /**
   * Abre o jogo no Roblox Studio, com o `rojo serve` de pé.
   *
   * Executa processo local, então vive nesta superfície e em nenhuma outra, e
   * NÃO lê nada do corpo da requisição: o projeto e o binário são fixos no
   * módulo. Ver bridge/src/roblox/estudio.mjs.
   */
  rotas.post("/jogo/abrir-studio", async (req, res) => {
    // A URL e o token vêm da CONFIG da ponte, nunca do corpo da requisição:
    // esta rota executa processo local e grava o token num arquivo.
    res.json(await abrirNoStudio({
      urlDaPonte: `http://127.0.0.1:${nucleo.config.portaJogo}`,
      token: nucleo.config.token,
    }));
  });

  /**
   * O log recente da ponte, para o painel ter o que aconteceu ANTES de ele
   * abrir. O que vem depois chega pelo SSE.
   *
   * As linhas já saem higienizadas de `log.mjs`: nickname e id de espectador
   * nunca entram no buffer. Ver 11_SEGURANCA, camada 4.
   */
  rotas.get("/logs", (req, res) => {
    const limite = Number.parseInt(req.query.limite ?? "100", 10);
    res.json({ linhas: logRecente(Number.isFinite(limite) ? Math.min(limite, 200) : 100) });
  });

  /** Cenários de fixture, para o painel oferecer o modo sem live. */
  rotas.get("/cenarios", async (req, res) => {
    res.json({ cenarios: (await listarCenarios()).map((n) => n.replace(".json", "")) });
  });

  /**
   * SSE. Unidirecional e reconecta sozinho, por isso não é WebSocket.
   * Ver docs/01_ARQUITETURA.
   */
  rotas.get("/sessao/stream", (req, res) => {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });

    // `ouvir` entrega o estado de AGORA no ato de assinar: é assim que o
    // overlay do OBS sabe qual vídeo carregar assim que abre, sem esperar o
    // próximo batimento do jogo — que pode não vir se o Roblox estiver fechado.
    const parar = nucleo.ouvir((evento, dados) => {
      res.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`);
    });

    // Comentário periódico: sem isto, proxy no meio fecha a conexão ociosa.
    const batida = setInterval(() => res.write(": batida\n\n"), 15_000);
    batida.unref?.();

    req.on("close", () => {
      clearInterval(batida);
      parar();
    });
  });

  /**
   * A pasta de cutscenes, para o preset escolher (ADR-014). A pasta É a lista:
   * não há cadastro, e o que está fora do padrão de nome volta em `ignorados`
   * para o painel dizer por que não aparece.
   */
  rotas.get("/cutscenes", async (req, res) => res.json(await listarCutscenes()));

  /**
   * O overlay do OBS: a URL para colar, os vídeos da pasta, e qual está em uso.
   *
   * A URL é montada da CONFIGURAÇÃO, não do `Host` da requisição. Em
   * desenvolvimento o painel vive em :5173 e chega aqui pelo proxy do Vite —
   * copiar o host de quem perguntou daria ao streamer uma URL que o OBS não
   * alcança, e o sintoma seria uma fonte de navegador eternamente em branco.
   *
   * `emUso` cruza a escolha do preset ativo com o que há na pasta. "Escolhi
   * vitoria e o arquivo saiu da pasta" precisa aparecer AQUI, antes da live: a
   * cutscene falha CALADA — o OBS mostra um retângulo transparente e nada no
   * mundo reclama.
   */
  rotas.get("/overlay", async (req, res) => {
    const { host, portaPainel } = nucleo.config ?? {};
    const base = `http://${host ?? "127.0.0.1"}:${portaPainel ?? 8788}`;
    const pasta = await listarCutscenes();
    res.json({
      // Com `.html` no fim: a fonte "Link" do TikTok LIVE Studio recusa URL sem
      // um `algo.letras` no texto ("Digite o URL correto"), e `127.0.0.1` não
      // tem. A extensão satisfaz a validação dele sem trocar de host, e o OBS
      // aceita igual. As páginas respondem nas duas formas — ver overlay.mjs.
      url: `${base}/overlay.html`,
      // O HUD da live (ADR-015) é a segunda fonte de navegador. Mesma base,
      // mesma regra: quem monta a URL é a ponte, que sabe a porta.
      urlHud: `${base}/overlay/hud.html`,
      ...pasta,
      emUso: cutscenesEmUso(nucleo.estado.cutscenes, pasta.cutscenes),
    });
  });

  /**
   * O Estúdio de Overlay: o que o streamer mexeu, e o CATÁLOGO do que existe.
   *
   * O catálogo vai junto de propósito. As posições padrão são o CSS da página
   * do HUD, e o painel não pode ter uma segunda cópia delas: duas escritas dos
   * mesmos números divergem caladas, e o sintoma seria a caixa cair no estúdio
   * num lugar e no OBS em outro. A `cam` acompanha porque é ela que separa a
   * faixa da câmera do resto do palco, e nada deve ser desenhado lá (ADR-015).
   *
   * Os NOMES das três chaves são lidos em panel/src/components/EstudioDeOverlay.jsx:
   * `catalogo` é o que existe, `elementos` é só a exceção que o streamer salvou.
   * Já saíram trocados uma vez — o catálogo indo como `elementos` — e o efeito
   * foi mudo e total: o estúdio caía no estado vazio, nenhuma caixa era
   * desenhada, e a cena de ontem nunca voltava. Nada quebra, a feature só não
   * existe na tela.
   */
  rotas.get("/overlay/layout", async (req, res) => {
    const layout = await carregarLayout();
    res.json({ catalogo: ELEMENTOS_DO_OVERLAY, elementos: layout.elementos, cam: CAM_PADRAO });
  });

  /**
   * Salva a cena inteira. Quem valida contra o schema é o repositório (ADR-003)
   * — a rota só traduz o corpo e devolve o que ficou gravado.
   *
   * O `streamerId` é preenchido AQUI, como no PUT de preset: o painel não
   * conhece o tenant e não deve conhecer (ADR-003). Por isso ele vem DEPOIS do
   * spread e não antes: antes, um `streamerId` no corpo vencia o da ponte, e
   * qualquer requisição gravava o tenant que quisesse em disco.
   *
   * E `elementos` é EXIGIDO. A gravação é substituição total por decisão
   * documentada, então um corpo `{}` — truncado, retry de fetch abortado, bug
   * no painel — significaria "apague a cena inteira", com escrita atômica e sem
   * confirmação. Apagar continua possível, mas dito: `{ elementos: {} }`, que é
   * o que o botão "voltar ao padrão" já manda.
   */
  rotas.put("/overlay/layout", async (req, res) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      throw new ErroDeDominio("layout_invalido", "O estúdio manda um objeto com os elementos que você mexeu.", { status: 400 });
    }
    const { elementos } = req.body;
    if (!elementos || typeof elementos !== "object" || Array.isArray(elementos)) {
      throw new ErroDeDominio("layout_invalido", "O estúdio manda { elementos }: um objeto por elemento que você mexeu.", { status: 400 });
    }
    res.json(await nucleo.definirLayoutDoOverlay({ ...req.body, streamerId: REGRAS.STREAMER_ID }));
  });

  /**
   * A legenda do HUD da live (ADR-015): os slots do preset ativo com nome,
   * ícone e delta do presente. O overlay busca ao abrir e quando o preset
   * troca (R7). Sem preset ativo, lista vazia — e dita, não 404: a página
   * abre antes da sessão começar e não pode ficar em erro por isso.
   */
  rotas.get("/hud", async (req, res) => res.json(await nucleo.legendaDoHud()));

  return rotas;
}
