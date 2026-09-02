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

  /** F4 — o painel manda o texto, a ponte fala com o Gemini. A chave nunca sai daqui. */
  rotas.post("/mapas/gerar", async (req, res) => {
    const descricao = String(req.body?.descricao ?? "").trim();
    if (descricao.length < 5) {
      throw new ErroDeDominio("descricao_curta", "Descreva o ambiente com pelo menos algumas palavras.", { status: 400 });
    }
    res.json(await nucleo.gerarMapa(descricao));
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

  return rotas;
}
