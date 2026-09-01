/**
 * Duas superfícies, dois servidores, duas portas.
 *
 * Isto não é organização, é segurança. O `11_SEGURANCA` diz que o pior cenário
 * possível deste projeto é o túnel apontar para a raiz e publicar o painel na
 * internet sem autenticação. Enquanto as duas superfícies dividissem a mesma
 * porta, a única coisa entre esse cenário e o vazamento seria a configuração do
 * túnel estar certa.
 *
 * Filtrar por ip não resolve: o `cloudflared` roda na mesma máquina, então o
 * que vem do túnel chega como 127.0.0.1 e passa por qualquer checagem de
 * origem local. Portas separadas resolvem por construção — o túnel aponta para
 * a porta do jogo e a do painel simplesmente não está lá.
 */

import express from "express";

import { corpoDeErro, responderErro } from "../erros.mjs";
import { log } from "../log.mjs";
import { exigirToken, limitarTaxa } from "./guardas.mjs";
import { rotasDoJogo } from "./rotas-jogo.mjs";
import { rotasDoPainel } from "./rotas-painel.mjs";

function baseComum(nucleo) {
  const app = express();
  // Confia só no socket: sem isto, X-Forwarded-For do túnel faria req.ip mentir
  // e o rate limit por ip viraria enfeite.
  app.set("trust proxy", false);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));
  app.get("/saude", (req, res) => res.json({ ok: true, estado: nucleo.estado }));
  return app;
}

function fecharComTratamentoDeErro(app) {
  app.use((req, res) => res.status(404).json(corpoDeErro("rota_desconhecida", "Essa rota não existe.")));

  // Nada de stack trace na resposta. O detalhe vai para o log local (07_APIS).
  app.use((erro, req, res, proximo) => {
    log.erro("rota_falhou", { rota: req.path, codigo: erro.codigo ?? null, motivo: erro.message });
    if (res.headersSent) return proximo(erro);
    return responderErro(res, erro);
  });
  return app;
}

/**
 * A única coisa deste sistema que pode ficar na internet. Só `/jogo/*`, com
 * token obrigatório e rate limit. Cada rota nova aqui é superfície nova.
 */
export function criarAppDoJogo(nucleo, { token }) {
  const app = baseComum(nucleo);
  app.use("/jogo", limitarTaxa(), exigirToken(token), rotasDoJogo(nucleo));
  return fecharComTratamentoDeErro(app);
}

/**
 * Nunca sai da máquina. Sem autenticação de propósito: o que a protege é o bind
 * em 127.0.0.1 e o fato de o túnel não conhecer esta porta.
 */
export function criarAppDoPainel(nucleo) {
  const app = baseComum(nucleo);
  app.use("/api", rotasDoPainel(nucleo));
  return fecharComTratamentoDeErro(app);
}
