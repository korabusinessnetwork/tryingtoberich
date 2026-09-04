/**
 * O HUD da live para o overlay do OBS (ADR-015): o que o espectador vê por
 * cima da cam e do jogo — ranking de doadores, maior combo, maior presente, a
 * disputa subida × descida da rodada e o total de moedas.
 *
 * Só memória, só sessão. O nickname entra porque vai para a tela e some no
 * Stop, e nunca é gravado (11_SEGURANCA, camada 4): este módulo não conhece
 * disco, e quem o guarda é o núcleo, que o joga fora junto com a sessão.
 *
 * Funções puras sobre um objeto de estado, para o teste não precisar de
 * despachante nem de núcleo. Tudo aqui é caminho FRIO: é chamado depois que o
 * long-poll já respondeu (CLAUDE.md, Princípio nº1).
 */

/** Quantos doadores o overlay mostra. A referência do dono mostra três. */
export const TOPO_DO_RANKING = 3;

export function criarHud() {
  return {
    moedas: 0,
    porDoador: new Map(),
    topCombo: null,
    topPresente: null,
    disputa: { subida: 0, descida: 0 },
  };
}

const inteiro = (valor) => (Number.isFinite(valor) && valor > 0 ? Math.floor(valor) : 0);

const nomeDe = (evento) => {
  const nome = typeof evento.nomeDoador === "string" ? evento.nomeDoador.trim() : "";
  return nome || null;
};

/**
 * Todo presente que chega, mapeado ou não: moedas, ranking, combo e maior
 * presente. Não mapeado conta de propósito — o espectador pagou, e o ranking
 * é sobre quem pagou, não sobre o que o preset aproveitou.
 *
 * `moedas` do evento é o valor UNITÁRIO; a rajada multiplica. Sem nome
 * (sanitizado até sumir), o presente conta no total e não conta no ranking.
 */
export function registrarPresente(hud, evento) {
  if (!hud || !evento) return hud;

  const unitario = inteiro(evento.moedas);
  const repeticoes = Math.max(1, inteiro(evento.repeticoes));
  const total = unitario * repeticoes;
  const nome = nomeDe(evento);
  const presenteNome = evento.presenteNome ?? String(evento.presenteId ?? "");

  hud.moedas += total;
  if (nome && total > 0) hud.porDoador.set(nome, (hud.porDoador.get(nome) ?? 0) + total);

  // Combo é rajada: x1 não é combo. Empate fica com quem chegou primeiro.
  if (repeticoes > 1 && (!hud.topCombo || repeticoes > hud.topCombo.repeticoes)) {
    hud.topCombo = { presenteId: evento.presenteId ?? null, presenteNome, nome, repeticoes };
  }
  if (unitario > 0 && (!hud.topPresente || unitario > hud.topPresente.moedas)) {
    hud.topPresente = { presenteId: evento.presenteId ?? null, presenteNome, nome, moedas: unitario };
  }
  return hud;
}

/** Um empurrão que chegou ao jogo sozinho: entra na disputa da rodada pelo sinal. */
export function registrarEmpurrao(hud, delta) {
  if (!hud || !Number.isFinite(delta) || delta === 0) return hud;
  if (delta > 0) hud.disputa.subida += delta;
  else hud.disputa.descida += -delta;
  return hud;
}

/**
 * Um combate resolvido ou anulado (ADR-012): entram as DUAS somas brutas, não
 * o líquido. A barra "VS" é sobre quanto cada lado brigou, e o líquido já está
 * na torre.
 */
export function registrarDisputa(hud, { somaSubida, somaDescida } = {}) {
  if (!hud) return hud;
  hud.disputa.subida += inteiro(somaSubida);
  hud.disputa.descida += inteiro(somaDescida);
  return hud;
}

/** A rodada acabou: a disputa recomeça do zero. O resto é da sessão inteira. */
export function zerarDisputa(hud) {
  if (hud) hud.disputa = { subida: 0, descida: 0 };
  return hud;
}

/**
 * O que vai para o SSE. Ranking já ordenado e cortado; nada de Map lá fora.
 * Empate em moedas desempata pelo nome, para a lista não pular de ordem a
 * cada presente entre dois doadores iguais.
 */
export function instantaneoDoHud(hud, topo = TOPO_DO_RANKING) {
  if (!hud) return { moedas: 0, ranking: [], topCombo: null, topPresente: null, disputa: { subida: 0, descida: 0 } };

  const ranking = [...hud.porDoador.entries()]
    .map(([nome, moedas]) => ({ nome, moedas }))
    .sort((a, b) => b.moedas - a.moedas || a.nome.localeCompare(b.nome))
    .slice(0, topo);

  return {
    moedas: hud.moedas,
    ranking,
    topCombo: hud.topCombo ? { ...hud.topCombo } : null,
    topPresente: hud.topPresente ? { ...hud.topPresente } : null,
    disputa: { ...hud.disputa },
  };
}

/**
 * A legenda dos 6 slots para o overlay: presente, ícone e delta, sem slot
 * vazio. Ordenada por força — o maior empurrão primeiro — porque é assim que
 * a referência do dono lê: o presente caro no alto, o barato embaixo.
 */
export function legendaDoPreset(preset, catalogo) {
  const porId = new Map((catalogo?.presentes ?? []).map((p) => [String(p.presenteId), p]));
  return (preset?.slots ?? [])
    .filter((slot) => slot && Number.isFinite(slot.delta) && slot.delta !== 0)
    .map((slot) => {
      const presente = porId.get(String(slot.presenteId));
      return {
        posicao: slot.posicao,
        presenteId: String(slot.presenteId),
        nome: presente?.nome ?? String(slot.presenteId),
        iconeUrl: presente?.iconeUrl ?? null,
        delta: slot.delta,
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.posicao - b.posicao);
}
