/**
 * A fronteira não confiável. Traduz o payload do `tiktok-live-connector` para
 * `evento-presente.schema.json` e não deixa mais nada passar. Ver ADR-006.
 *
 * Duas responsabilidades que valem mais que a tradução em si:
 *
 * 1. **Isolar a biblioteca.** Ela é não oficial e muda de forma entre versões.
 *    Trocar de conector tem que ser reescrever este arquivo e nada mais.
 * 2. **Jogar fora o que identifica o espectador.** O payload cru traz `user.id`,
 *    avatares e metadados de conta. Nada disso atravessa daqui. Só o nome de
 *    exibição passa, sanitizado, porque vai para a tela do jogo e some em 3
 *    segundos. Ver 11_SEGURANCA, camada 4.
 *
 * Tudo aqui é função pura.
 */

import { faixaDeMoedas } from "../dominio/regras.mjs";

/** Teto do schema. Nome maior que isto não cabe no HUD vertical de qualquer jeito. */
const TAMANHO_MAX_DO_NOME = 24;

const CODIGO_ESPACO = 32;
const CODIGO_DEL = 127;

/**
 * Deixa passar só caractere imprimível, e barra os sinais que o rich text do
 * Roblox interpreta como tag. Checagem por code point em vez de classe de
 * regex para o próprio fonte não carregar caractere de controle.
 */
const caractereSeguro = (caractere) => {
  const codigo = caractere.codePointAt(0);
  return codigo >= CODIGO_ESPACO && codigo !== CODIGO_DEL && caractere !== "<" && caractere !== ">";
};

/** Texto vindo da TikTok é entrada não confiável. Ver 11_SEGURANCA, camada 3. */
export function sanitizarNome(valor) {
  if (typeof valor !== "string") return null;
  const limpo = [...valor]
    .filter(caractereSeguro)
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TAMANHO_MAX_DO_NOME);
  return limpo.length > 0 ? limpo : null;
}

const primeiraUrl = (imagem) => {
  const url = imagem?.urlList?.[0] ?? imagem?.url_list?.[0] ?? null;
  return typeof url === "string" && url.startsWith("https://") ? url : null;
};

/** `repeatEnd` chega como 0/1 no protobuf da v2 e como booleano em outras versões. */
const rajadaEncerrada = (cru) => cru.repeatEnd === 1 || cru.repeatEnd === true;

/**
 * Devolve o evento normalizado, ou null quando o payload não deve virar evento.
 *
 * Rajada ainda aberta é ignorada de propósito: o conector emite vários eventos
 * durante o combo e só o último traz a contagem final. Disparar em cada um
 * produziria N animações para uma rajada só, que é exatamente o que o R4 proíbe.
 */
export function normalizarPresente(cru, agora = Date.now()) {
  if (!cru || typeof cru !== "object") return null;

  const presente = cru.gift ?? {};
  const presenteId = String(cru.giftId ?? presente.id ?? "").trim();
  if (presenteId === "") return null;

  const combavel = presente.combo === true;
  if (combavel && !rajadaEncerrada(cru)) return null;

  const repeticoes = Number.isFinite(cru.repeatCount) && cru.repeatCount > 0 ? cru.repeatCount : 1;
  const moedas = Number.isFinite(presente.diamondCount) ? presente.diamondCount : 0;

  return {
    presenteId,
    presenteNome: sanitizarNome(presente.name) ?? presenteId,
    moedas,
    repeticoes,
    rajadaEncerrada: rajadaEncerrada(cru),
    nomeDoador: sanitizarNome(cru.user?.nickname),
    // Carimbado na entrada da ponte: é o t0 da medição de latência do Princípio nº1.
    recebidoEm: agora,
  };
}

/**
 * Normaliza a lista de presentes da sala para o catálogo.
 * A forma da resposta de `fetchAvailableGifts` não é contratada, então
 * aceitamos as que a biblioteca já usou e ignoramos item sem id.
 */
export function normalizarCatalogo(resposta, agora = new Date().toISOString()) {
  const lista = Array.isArray(resposta)
    ? resposta
    : resposta?.gifts ?? resposta?.giftList ?? resposta?.data ?? [];

  return lista
    .map((cru) => {
      const presenteId = String(cru.id ?? cru.giftId ?? "").trim();
      if (presenteId === "") return null;

      const moedas = Number.isFinite(cru.diamondCount) ? cru.diamondCount
        : Number.isFinite(cru.diamond_count) ? cru.diamond_count
        : 0;

      return {
        presenteId,
        nome: sanitizarNome(cru.name) ?? presenteId,
        moedas,
        faixa: faixaDeMoedas(moedas),
        iconeUrl: primeiraUrl(cru.image ?? cru.icon),
        iconeLocal: null,
        combavel: cru.combo === true,
        ativo: true,
        vistoEm: agora,
      };
    })
    .filter(Boolean);
}
