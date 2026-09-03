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

/**
 * Vazio significa MESMA ORIGEM, e é o caminho normal: o servidor de
 * desenvolvimento do Vite encaminha `/api` para a ponte (ver vite.config.js).
 *
 * Sem isso o painel viveria em :5173 chamando :8788, que para o navegador são
 * origens diferentes, e tudo morreria em CORS. `VITE_BRIDGE_URL` existe para
 * quem servir o painel de outro jeito e precisar apontar direto — aí a ponte
 * teria que autorizar a origem, o que é uma decisão que ninguém tomou ainda.
 *
 * Nenhuma chave entra aqui: o bundle do Vite é público por definição.
 */
const BASE = import.meta.env?.VITE_BRIDGE_URL ?? "";

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
  /** Criar é o mesmo PUT: o repositório grava o arquivo que ainda não existe. */
  apagarPreset: (presetId) => chamar(`/api/presets/${encodeURIComponent(presetId)}`, { method: "DELETE" }),

  catalogo: () => chamar("/api/catalogo"),
  atualizarCatalogo: () => chamar("/api/catalogo/atualizar", { method: "POST" }),

  animacoes: () => chamar("/api/animacoes").then((r) => r.animacoes),
  looks: () => chamar("/api/looks").then((r) => r.looks),
  mapas: () => chamar("/api/mapas").then((r) => r.mapas),

  /**
   * F4 — o painel manda o texto, a ponte fala com o Gemini. A chave nunca sai de lá.
   *
   * `formato` é a construção da torre (ADR-009): "disco" são degraus separados
   * com vão para pular, "laje" é uma passarela de lajes encostadas.
   */
  gerarMapa: (descricao, formato = "disco") =>
    chamar("/api/mapas/gerar", json("POST", { descricao, formato })),

  /**
   * Monta o mundo com as peças escolhidas na galeria, e põe no ar.
   *
   * Sem IA e sem espera: a geometria é conhecida (ADR-009) e o que o streamer
   * escolhe são as peças. Grava sempre no mesmo mapa — montar é compor, não
   * criar acervo.
   */
  montarMundo: (escolhas) => chamar("/api/mundo", json("POST", escolhas)),

  /** Apaga um mapa gerado. 409 quando algum preset ainda o usa. */
  apagarMapa: (mapaId) => chamar(`/api/mapas/${encodeURIComponent(mapaId)}`, { method: "DELETE" }),

  /**
   * Troca escada por passarela num mapa que já existe (ADR-009), sem regerar.
   *
   * A escolha de formato valia só para o PRÓXIMO mapa gerado, e do lado de quem
   * clicava o botão não fazia nada. Converter é determinístico: não gasta
   * chamada de IA e a torre se reergue sozinha quando é o mapa que está no ar.
   */
  converterFormatoDoMapa: (mapaId, formato) =>
    chamar(`/api/mapas/${encodeURIComponent(mapaId)}/formato`, json("POST", { formato })),

  /**
   * ADR-004 — este mapa pode ir ao ar?
   *
   * Só a geração respondia isso, e só para o mapa recém-nascido. A prontidão
   * depende do ACERVO, que muda quando a moderação do Roblox aprova: o mesmo
   * mapa que não podia ontem pode hoje, sem ninguém ter tocado nele.
   */
  prontidaoDoMapa: (mapaId) => chamar(`/api/mapas/${encodeURIComponent(mapaId)}/prontidao`),

  /** O acervo do ADR-004, e a anotação do que a moderação devolveu. */
  acervo: () => chamar("/api/acervo"),
  anotarAcervo: (colecao, id, campos) =>
    chamar(`/api/acervo/${encodeURIComponent(colecao)}/${encodeURIComponent(id)}`, json("PUT", campos)),

  /**
   * Enche o acervo (ADR-004): a ponte desenha as imagens que faltam, sobe pelo
   * Open Cloud do Roblox e anota o assetId. Demora — são doze itens e cada um
   * espera a operação do Roblox terminar.
   */
  publicarAcervo: () => chamar("/api/acervo/publicar", { method: "POST" }),

  sessao: () => chamar("/api/sessao"),
  iniciarSessao: (presetId, cenario = null) => chamar("/api/sessao/start", json("POST", { presetId, cenario })),
  encerrarSessao: () => chamar("/api/sessao/stop", { method: "POST" }),

  /** R7 — trocar de preset no meio da sessão vale a partir do próximo evento. */
  trocarPresetAtivo: (presetId) => chamar("/api/sessao/preset", json("POST", { presetId })),

  /** R6 — o topo não reinicia sozinho. Este é o botão que o streamer decide apertar. */
  reiniciarCorrida: () => chamar("/api/sessao/reiniciar", { method: "POST" }),

  /** Zera vitórias e derrotas SEM reiniciar a corrida: são coisas separadas. */
  zerarPlacar: () => chamar("/api/sessao/zerar-placar", { method: "POST" }),

  /** Reergue a torre com o mapa do preset ativo, sem parar a sessão. */
  recarregarMapa: () => chamar("/api/sessao/recarregar-mapa", { method: "POST" }),

  /** F5 — as lives passadas, já reduzidas ao resumo. Nenhum dado de espectador sobrevive até aqui. */
  sessoes: () => chamar("/api/sessoes").then((r) => r.sessoes),

  /** Cenários de fixture: é o que permite montar o painel sem estar ao vivo. */
  cenarios: () => chamar("/api/cenarios").then((r) => r.cenarios),

  /**
   * Dispara presente à mão. Vários no mesmo pedido chegam no mesmo instante,
   * que é como se testa o combate do ADR-012 sem depender de dois espectadores
   * clicarem juntos.
   */
  testarPresentes: (presentes) => chamar("/api/teste/presentes", json("POST", { presentes })),

  /**
   * Dispara uma animação direto no jogo, sem presente e sem preset.
   *
   * Não precisa de sessão: a pergunta que ela responde é "a animação toca no
   * Roblox?", e exigir preset montado para isso seria pedir configuração antes
   * do teste mais básico. A ponte devolve `jogoOnline`, que é o que diz se o
   * clique chegou a algum lugar.
   */
  testarAnimacao: (animacaoId, intensidade) =>
    chamar("/api/teste/animacao", json("POST", { animacaoId, intensidade })),

  /** A conta da live: em qual live a sessão vai rodar. `null` = não configurada. */
  configuracao: () => chamar("/api/configuracao").then((r) => r.configuracao),

  salvarConfiguracao: (usuarioTiktok) => chamar("/api/configuracao", json("PUT", { usuarioTiktok })),

  /** Espia a skin de um nick ANTES de acrescentar à galeria. Traz a miniatura. */
  espiarSkin: (nick) => chamar(`/api/skin?nick=${encodeURIComponent(nick)}`),

  /** A lista inteira, sempre: a galeria é um conjunto, não um diff. */
  salvarGaleria: (nicks) => chamar("/api/galeria", json("PUT", { nicks })),

  /** Sobe o `rojo serve` e abre o Roblox Studio nesta máquina. */
  abrirNoStudio: () => chamar("/api/jogo/abrir-studio", { method: "POST" }),

  /** O que aconteceu antes do painel abrir. O que vem depois chega pelo SSE. */
  logs: (limite = 100) => chamar(`/api/logs?limite=${limite}`).then((r) => r.linhas),

  /**
   * O overlay do OBS: a URL para colar lá, e se as cutscenes estão no lugar.
   *
   * A URL vem da PONTE, não é montada aqui. O painel roda em :5173 e não sabe
   * em que porta a ponte atende — montar no navegador daria uma URL que o OBS
   * não alcança, e a fonte ficaria em branco sem dizer por quê.
   */
  overlay: () => chamar("/api/overlay"),

  urlDoFluxo: () => `${BASE}/api/sessao/stream`,
};
