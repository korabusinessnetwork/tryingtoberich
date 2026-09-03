/**
 * Superfície pública: ponte ↔ Roblox, via túnel Cloudflare. Ver 07_APIS seção A.
 *
 * É mínima de propósito. Tudo que sai daqui atravessa a internet, então cada
 * rota nova aqui é superfície de ataque nova. O painel não tem nada nesta
 * árvore e nunca terá.
 */

import express from "express";

import { ErroDeDominio } from "../erros.mjs";
import { log } from "../log.mjs";
import { salvarLook } from "../repos/looks.mjs";
import { criarValidador } from "../repos/schemas.mjs";

export function rotasDoJogo(nucleo) {
  const rotas = express.Router();

  /** Long-poll. A ponte segura a resposta até haver evento ou até o timeout. */
  rotas.get("/eventos", (req, res) => {
    const desde = Number.parseInt(req.query.desde ?? "0", 10);
    nucleo.longpoll.registrar(res, { desde: Number.isFinite(desde) ? desde : 0 });
  });

  rotas.get("/mapa", async (req, res) => {
    const mapa = await nucleo.mapaAtivo();
    if (!mapa) throw new ErroDeDominio("sem_mapa", "O preset ativo não tem mapa. Gere um no painel.", { status: 404 });
    res.json(mapa);
  });

  rotas.get("/look", async (req, res) => {
    const look = await nucleo.lookAtivo();
    if (!look) throw new ErroDeDominio("sem_look", "O preset ativo não referencia nenhum look.", { status: 404 });
    res.json(look);
  });

  /** Busca de item gratuito para o vestiário. O jogo nunca chama o Roblox direto (ADR-011). */
  rotas.get("/catalogo-itens", async (req, res) => {
    const busca = String(req.query.busca ?? "").trim();
    if (busca.length < 2) {
      throw new ErroDeDominio("busca_curta", "Digite ao menos 2 letras para buscar.", { status: 400 });
    }
    res.json({ itens: await nucleo.roblox.buscarComIcone(busca) });
  });

  /**
   * A galeria de nicks e a skin de um deles.
   *
   * Só LEITURA nesta superfície. Curar a lista é do painel, que não é publicado
   * pelo túnel: escrever configuração do streamer por aqui daria ao túnel poder
   * de mexer no que o jogo carrega (11_SEGURANCA).
   */
  rotas.get("/galeria", async (req, res) => res.json({ nicks: await nucleo.galeriaDeSkins() }));

  rotas.get("/skin", async (req, res) => {
    const nick = String(req.query.nick ?? "").trim();
    if (nick.length < 3) {
      throw new ErroDeDominio("nick_curto", "Digite ao menos 3 letras do nick.", { status: 400 });
    }

    const skin = await nucleo.skins.buscarSkin(nick);
    if (!skin) {
      throw new ErroDeDominio("skin_nao_encontrada", `Não achei o usuário "${nick}" no Roblox.`, { status: 404 });
    }
    res.json(skin);
  });

  /** O vestiário salva o look montado. Valida contra o schema antes de gravar. */
  rotas.put("/looks/:lookId", async (req, res) => {
    if (nucleo.sessaoAtiva) {
      // ADR-011: streamer parado num menu é a tela estática que o ADR-009 evita.
      throw new ErroDeDominio(
        "vestiario_bloqueado",
        "O vestiário não abre com a sessão rodando. Pare a sessão no painel primeiro.",
        { status: 409 },
      );
    }
    const look = { ...req.body, lookId: req.params.lookId };
    res.json(await salvarLook(look));
  });

  /**
   * O jogo informa onde está. Fire-and-forget do lado dele: responde 204 na
   * hora e nunca segura o Roblox esperando disco. Valor fora da faixa é
   * DESCARTADO, não corrige o estado (11_SEGURANCA, camada 3).
   */
  rotas.post("/estado", async (req, res) => {
    const { validar } = await criarValidador();
    const problemas = validar("estado-jogo", req.body);

    // A RESPOSTA leva o estado da live de volta. Motivo: o jogo precisa saber
    // se há plateia — é isso que tranca o vestiário (ADR-011) — e não tinha
    // como saber. Aproveita este canal, que o jogo já usa a cada ~2s, em vez de
    // abrir rota nova na superfície pública, que é a que atravessa o túnel.
    const resposta = { live: nucleo.estado.live === "conectada" };

    if (problemas.length > 0) {
      log.aviso("estado_do_jogo_descartado", { problemas });
      return res.status(200).json(resposta);
    }

    nucleo.aplicarEstadoDoJogo(req.body);
    return res.status(200).json(resposta);
  });

  return rotas;
}
