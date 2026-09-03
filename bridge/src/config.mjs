/**
 * Configuração da ponte. Lida só de process.env — nenhuma chave, token ou URL
 * de túnel nasce em código (CLAUDE.md, Segurança).
 *
 * O arquivo .env é carregado pelo Node com --env-file, não por dependência.
 * Ver package.json na raiz, script `ponte`.
 */

const inteiro = (valor, padrao) => {
  const n = Number.parseInt(valor ?? "", 10);
  return Number.isFinite(n) ? n : padrao;
};

/** Constantes de regra, não de ambiente. Mudá-las é mudar `docs/03_REGRAS_DE_NEGOCIO`. */
export const REGRAS = Object.freeze({
  /** R5.3 — teto de espera do combate; passou, aplica o líquido com efeito curto. */
  COMBATE_MAX_MS: 2000,
  /** R8 — sem long-poll por mais que isso, o jogo é dado como offline (F7). */
  JOGO_OFFLINE_MS: 60_000,
  /** R8 — backoff de reconexão da live (F6). */
  BACKOFF_MS: Object.freeze([1000, 2000, 4000, 8000, 16_000, 30_000]),
  /** 11_SEGURANCA — o Roblox legítimo faz ~3 req/min. Acima de 60 é abuso. */
  LIMITE_JOGO_POR_MINUTO: 60,
  /** R1 — seis slots, sempre. O limite é o formato da TikTok, não técnico. */
  SLOTS: 6,
  /** R2 e biblioteca de animações — teto de intensidade. */
  INTENSIDADE_MAX: 5,
  /** Fase 1 — streamerId existe desde já, mas é sempre "local" (ADR-003). */
  STREAMER_ID: "local",
});

export function carregarConfig(env = process.env) {
  const config = {
    token: env.BRIDGE_TOKEN ?? "",
    // Porta do jogo: é a que o túnel publica. Porta do painel: nunca sai daqui.
    portaJogo: inteiro(env.BRIDGE_PORT, 8787),
    portaPainel: inteiro(env.PAINEL_PORT, 8788),
    host: env.BRIDGE_HOST ?? "127.0.0.1",
    usuarioTiktok: env.TIKTOK_USERNAME ?? "",
    chaveGemini: env.GEMINI_API_KEY ?? "",
    // Open Cloud do Roblox: sobe as imagens do acervo e devolve o assetId
    // (ADR-004, nota de 2026-09-02). Opcional — sem elas o painel diz o que
    // falta em vez de quebrar, e o resto do produto não depende disso.
    chaveRoblox: env.ROBLOX_API_KEY ?? "",
    criadorRoblox: env.ROBLOX_CREATOR_ID ?? "",
    longpollTimeoutMs: inteiro(env.LONGPOLL_TIMEOUT_MS, 20_000),
    combateMaxMs: inteiro(env.COMBATE_MAX_MS, REGRAS.COMBATE_MAX_MS),
  };

  const problemas = [];
  if (config.token.length < 32) {
    problemas.push("BRIDGE_TOKEN precisa de no mínimo 32 caracteres. Gere com: openssl rand -hex 32");
  }
  if (config.host !== "127.0.0.1" && config.host !== "localhost") {
    problemas.push(
      `BRIDGE_HOST está "${config.host}". Os dois servidores fazem bind aqui, e o painel ` +
        "não pode responder fora da máquina. Ver docs/11_SEGURANCA, camada 1.",
    );
  }
  if (config.portaJogo === config.portaPainel) {
    problemas.push(
      "BRIDGE_PORT e PAINEL_PORT são iguais. Elas existem separadas para o túnel não " +
        "conseguir alcançar o painel nem se for configurado errado.",
    );
  }

  return { ...config, problemas };
}

/** Verdadeiro quando a config permite subir a ponte de verdade. */
export function configValida(config) {
  return config.problemas.length === 0;
}
