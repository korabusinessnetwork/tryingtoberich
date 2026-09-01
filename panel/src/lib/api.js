/**
 * A única porta de rede do painel.
 *
 * Nenhum componente chama `fetch`. A regra está no `CLAUDE.md` e em
 * `docs/06_COMPONENTES`: componente não conhece caminho de rota nem formato de
 * resposta cru. Isso é o que permite trocar a ponte de lugar, ou versionar a
 * API, mexendo num arquivo só.
 *
 * O painel também **nunca** fala com a TikTok, com o Gemini ou com o Roblox.
 * Quem tem chave é a ponte, e o bundle do Vite é público por definição.
 * Ver `docs/11_SEGURANCA`, camada 2.
 */

/** A ponte roda em localhost. Nenhuma chave entra aqui — só endereço. */
const BASE = import.meta.env?.VITE_BRIDGE_URL ?? "http://127.0.0.1:8788";

/** Erro com o código curto do contrato de erro de `docs/07_APIS`. */
export class ErroDaPonte extends Error {
  constructor(codigo, mensagem, status) {
    super(mensagem);
    this.name = "ErroDaPonte";
    this.codigo = codigo;
    this.status = status;
  }
}

/**
 * Toda chamada passa por aqui, e toda chamada é tratada.
 *
 * Ponte fora do ar é o caso comum durante o desenvolvimento, não a exceção:
 * o streamer abre o painel antes de subir o Node o tempo todo. Por isso a
 * falha de rede vira um erro com mensagem em português em vez de um
 * `TypeError: Failed to fetch` que não diz nada.
 */
async function chamar(caminho, opcoes = {}) {
  let resposta;
  try {
    resposta = await fetch(`${BASE}${caminho}`, {
      headers: { "content-type": "application/json" },
      ...opcoes,
    });
  } catch (erro) {
    throw new ErroDaPonte(
      "ponte_offline",
      `A ponte não respondeu em ${BASE}. Ela está rodando? (npm run ponte)`,
      0,
    );
  }

  if (resposta.status === 204) return null;

  let corpo = null;
  try {
    corpo = await resposta.json();
  } catch {
    corpo = null;
  }

  if (!resposta.ok) {
    throw new ErroDaPonte(
      corpo?.erro ?? "erro_desconhecido",
      corpo?.mensagem ?? `A ponte respondeu ${resposta.status}.`,
      resposta.status,
    );
  }

  return corpo;
}

const json = (metodo, corpo) => ({ method: metodo, body: JSON.stringify(corpo) });

/* ---------------------------------------------------------------- */
/* Verbos de domínio. Nenhum componente monta caminho de rota.        */
/* ---------------------------------------------------------------- */

export const api = {
  modalidades: () => chamar("/api/modalidades").then((r) => r.modalidades),

  listarPresets: () => chamar("/api/presets").then((r) => r.presets),
  carregarPreset: (presetId) => chamar(`/api/presets/${encodeURIComponent(presetId)}`),
  salvarPreset: (preset) => chamar(`/api/presets/${encodeURIComponent(preset.presetId)}`, json("PUT", preset)),

  catalogo: () => chamar("/api/catalogo"),
  atualizarCatalogo: () => chamar("/api/catalogo/atualizar", { method: "POST" }),

  animacoes: () => chamar("/api/animacoes").then((r) => r.animacoes),
  looks: () => chamar("/api/looks").then((r) => r.looks),
  mapas: () => chamar("/api/mapas").then((r) => r.mapas),

  /** F4 — o painel manda o texto, a ponte fala com o Gemini. A chave nunca sai de lá. */
  gerarMapa: (descricao) => chamar("/api/mapas/gerar", json("POST", { descricao })),

  sessao: () => chamar("/api/sessao"),
  iniciarSessao: (presetId, cenario = null) => chamar("/api/sessao/start", json("POST", { presetId, cenario })),
  encerrarSessao: () => chamar("/api/sessao/stop", { method: "POST" }),

  /** Cenários de fixture: é o que permite montar o painel sem estar ao vivo. */
  cenarios: () => chamar("/api/cenarios").then((r) => r.cenarios),

  /**
   * Dispara presente à mão. Vários no mesmo pedido chegam no mesmo instante,
   * que é como se testa o combate do ADR-012 sem depender de dois espectadores
   * clicarem juntos.
   */
  testarPresentes: (presentes) => chamar("/api/teste/presentes", json("POST", { presentes })),

  /** O que aconteceu antes do painel abrir. O que vem depois chega pelo SSE. */
  logs: (limite = 100) => chamar(`/api/logs?limite=${limite}`).then((r) => r.linhas),

  urlDoFluxo: () => `${BASE}/api/sessao/stream`,
};
