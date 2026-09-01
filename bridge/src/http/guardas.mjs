/**
 * Os guardas da superfície pública. Só `/jogo/*` sai pelo túnel, e sai com
 * token. Ver docs/11_SEGURANCA, camadas 1 e 3.
 */

import { timingSafeEqual } from "node:crypto";

import { REGRAS } from "../config.mjs";
import { corpoDeErro } from "../erros.mjs";
import { log } from "../log.mjs";

/** Comparação de tempo constante: token não se compara com `===`. */
function tokenConfere(recebido, esperado) {
  const a = Buffer.from(String(recebido ?? ""));
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function exigirToken(esperado) {
  return (req, res, proximo) => {
    if (tokenConfere(req.get("x-bridge-token"), esperado)) return proximo();
    log.aviso("jogo_sem_token", { rota: req.path, ip: req.ip });
    return res.status(401).json(corpoDeErro("token_invalido", "Requisição sem X-Bridge-Token válido."));
  };
}

/**
 * Rate limit simples por janela. O Roblox legítimo faz cerca de 3 requisições
 * por minuto; qualquer coisa acima de 60 é abuso, não uso.
 */
export function limitarTaxa({ porMinuto = REGRAS.LIMITE_JOGO_POR_MINUTO, agora = Date.now } = {}) {
  const janelas = new Map();

  return (req, res, proximo) => {
    const chave = req.ip ?? "desconhecido";
    const instante = agora();
    const janela = janelas.get(chave);

    if (!janela || instante - janela.inicio >= 60_000) {
      janelas.set(chave, { inicio: instante, contagem: 1 });
      return proximo();
    }

    janela.contagem += 1;
    if (janela.contagem > porMinuto) {
      log.aviso("jogo_taxa_excedida", { ip: chave, contagem: janela.contagem });
      return res.status(429).json(corpoDeErro("taxa_excedida", "Requisições demais. Espere um minuto."));
    }
    return proximo();
  };
}
