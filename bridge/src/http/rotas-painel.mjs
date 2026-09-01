/**
 * Superfície local: ponte ↔ painel, só em `localhost`. Ver 07_APIS seção B.
 *
 * Sem autenticação de propósito: ela nunca sai da máquina. O que a protege é o
 * bind em 127.0.0.1 e o túnel publicar só `/jogo`. Ver 11_SEGURANCA.
 */

import express from "express";

import { ErroDeDominio } from "../erros.mjs";
import { carregarAnimacoes } from "../repos/animacoes.mjs";
import { listarLooks } from "../repos/looks.mjs";
import { listarMapas } from "../repos/mapas.mjs";
import { carregarPreset, listarPresets, salvarPreset } from "../repos/presets.mjs";
import { listarCenarios } from "../repos/fixtures.mjs";

export function rotasDoPainel(nucleo) {
  const rotas = express.Router();

  rotas.get("/modalidades", (req, res) => res.json({ modalidades: nucleo.modalidades() }));

  rotas.get("/presets", async (req, res) => res.json({ presets: await listarPresets() }));

  rotas.get("/presets/:id", async (req, res) => {
    const preset = await carregarPreset(req.params.id);
    if (!preset) throw new ErroDeDominio("preset_nao_encontrado", `Não achei o preset "${req.params.id}".`, { status: 404 });
    res.json(preset);
  });

  /** Valida R1 e R2 antes de gravar. O repositório recusa o que passar. */
  rotas.put("/presets/:id", async (req, res) => {
    const salvo = await salvarPreset({ ...req.body, presetId: req.params.id });
    if (nucleo.estado.presetId === salvo.presetId) await nucleo.definirPresetAtivo(salvo.presetId);
    res.json(salvo);
  });

  rotas.get("/catalogo", async (req, res) => res.json(await nucleo.catalogo()));

  rotas.post("/catalogo/atualizar", async (req, res) => res.json(await nucleo.coletarCatalogo()));

  rotas.get("/animacoes", async (req, res) => res.json({ animacoes: await carregarAnimacoes() }));

  rotas.get("/looks", async (req, res) => res.json({ looks: await listarLooks() }));

  rotas.get("/mapas", async (req, res) => res.json({ mapas: await listarMapas() }));

  /** F4 — o painel manda o texto, a ponte fala com o Gemini. A chave nunca sai daqui. */
  rotas.post("/mapas/gerar", async (req, res) => {
    const descricao = String(req.body?.descricao ?? "").trim();
    if (descricao.length < 5) {
      throw new ErroDeDominio("descricao_curta", "Descreva o ambiente com pelo menos algumas palavras.", { status: 400 });
    }
    res.json(await nucleo.gerarMapa(descricao));
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
   * Dispara presente à mão, para testar um slot sem depender de espectador.
   *
   * Existe só nesta superfície: a porta do painel não é publicada pelo túnel.
   * Se um dia esta rota vazasse, qualquer um moveria o boneco da live.
   */
  rotas.post("/teste/presentes", (req, res) => {
    const presentes = Array.isArray(req.body?.presentes) ? req.body.presentes : [];
    res.json({ resultados: nucleo.injetarPresentesDeTeste(presentes) });
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
