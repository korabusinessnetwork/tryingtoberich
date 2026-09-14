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
 * O que a superfície do painel aceita como origem.
 *
 * Ela não tem autenticação de propósito: o que a protege é o bind em 127.0.0.1
 * (11_SEGURANCA, camada 1). Isso resolve "alguém da rede alcança", e NÃO
 * resolve o outro caso: uma página aberta no navegador do streamer também fala
 * de 127.0.0.1. Um `fetch` de `https://sitequalquer.com` para
 * `http://127.0.0.1:8788/api/sessao/stop` sai da máquina dele, com a porta
 * certa, e derruba a sessão no meio da live.
 *
 * O ataque é CEGO — sem CORS ninguém lê a resposta — e isso não consola: o
 * efeito colateral já aconteceu quando a resposta é descartada.
 */
const ORIGENS_LOCAIS = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

const MUTANTES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Fecha a porta do painel para página de terceiro. Duas travas, porque uma só
 * não cobre os dois jeitos de chegar aqui:
 *
 * 1. **Origin.** O navegador carimba `Origin` em toda requisição
 *    cross-origin, e a página atacante não consegue forjá-lo. Origem que não
 *    é local: 403. Ausente é normal e passa — é o painel pelo proxy do Vite,
 *    o `EventSource` do overlay e o `curl` do streamer.
 * 2. **Content-Type nas mutantes.** `application/json` não é requisição
 *    simples: o navegador tem que pedir preflight antes, e o preflight morre
 *    porque a ponte não responde CORS. Isso barra o formulário disfarçado, que
 *    só consegue mandar `text/plain`, `form-urlencoded` ou `multipart` e por
 *    isso nunca precisa de preflight.
 *
 * Não substitui o bind em 127.0.0.1, soma a ele. Ver 11_SEGURANCA, camada 1.
 */
export function exigirOrigemLocal() {
  return (req, res, proximo) => {
    const origem = req.get("origin");
    if (origem && !ORIGENS_LOCAIS.test(origem)) {
      log.aviso("painel_origem_recusada", { rota: req.path, metodo: req.method });
      return res.status(403).json(
        corpoDeErro("origem_recusada", "Esta porta só atende o painel desta máquina."),
      );
    }

    if (MUTANTES.has(req.method)) {
      const tipo = String(req.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (tipo !== "application/json") {
        log.aviso("painel_tipo_recusado", { rota: req.path, metodo: req.method, tipo });
        return res.status(415).json(
          corpoDeErro("tipo_nao_suportado", "O painel fala JSON: mande content-type: application/json."),
        );
      }
    }

    return proximo();
  };
}

/**
 * Rate limit simples por janela. O Roblox legítimo faz cerca de 3 requisições
 * por minuto; qualquer coisa acima de 60 é abuso, não uso.
 */
export function limitarTaxa({ porMinuto = REGRAS.LIMITE_JOGO_POR_MINUTO, agora = Date.now } = {}) {
  const janelas = new Map();
  let proximaVarredura = 0;

  /**
   * Tira as janelas vencidas.
   *
   * O mapa só perdia entrada quando o MESMO ip voltava: ip que aparece uma vez
   * e some ficava ali para sempre. É um vazamento lento, e a superfície é a que
   * atravessa o túnel — quem quiser fazê-lo crescer não precisa de permissão
   * nenhuma, só de endereços diferentes.
   *
   * Varre no máximo uma vez por minuto, e nunca mais de uma vez por
   * requisição. O custo médio por chamada continua sendo o de um `Map.get`,
   * que é o que o Princípio nº1 exige: isto aqui roda no caminho do long-poll.
   */
  const varrer = (instante) => {
    if (instante < proximaVarredura) return;
    proximaVarredura = instante + 60_000;
    for (const [chave, janela] of janelas) {
      if (instante - janela.inicio >= 60_000) janelas.delete(chave);
    }
  };

  const guarda = (req, res, proximo) => {
    const chave = req.ip ?? "desconhecido";
    const instante = agora();
    varrer(instante);
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

  // Quantas janelas o guarda está segurando. Existe para o teste poder VER o
  // vazamento: sem isto, "o mapa cresce para sempre" não é observável de fora,
  // e o teste passa com e sem a varredura — que foi exatamente o que aconteceu
  // na primeira versão deste teste.
  Object.defineProperty(guarda, "janelasAbertas", { get: () => janelas.size });

  return guarda;
}
