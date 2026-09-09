/**
 * O HUD da live para o overlay do OBS (ADR-015): a disputa subida × descida da
 * rodada, e a legenda dos presentes do preset.
 *
 * **Não existe mais agregação por doador aqui.** O overlay mostrava um ranking
 * dos três que mais gastaram, com nome e total de moedas, e o dono mandou tirar
 * para a live não correr risco de restrição na TikTok. Junto com o ranking
 * saíram o pote de moedas, o maior combo e o maior presente — tudo que media
 * quanto alguém pagou.
 *
 * O efeito colateral é bom: com o ranking foi embora o único lugar da ponte que
 * acumulava nickname de espectador (11_SEGURANCA, camada 4). Hoje o nome do
 * doador aparece no evento que atravessa e some, e em lugar nenhum mais.
 *
 * Funções puras sobre um objeto de estado, para o teste não precisar de
 * despachante nem de núcleo. Tudo aqui é caminho FRIO: é chamado depois que o
 * long-poll já respondeu (CLAUDE.md, Princípio nº1).
 */

export function criarHud() {
  return { disputa: { subida: 0, descida: 0 } };
}

const inteiro = (valor) => (Number.isFinite(valor) && valor > 0 ? Math.floor(valor) : 0);

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

/** A rodada acabou: a disputa recomeça do zero. */
export function zerarDisputa(hud) {
  if (hud) hud.disputa = { subida: 0, descida: 0 };
  return hud;
}

/** O que vai para o SSE. Cópia, para quem recebe não mexer no estado da ponte. */
export function instantaneoDoHud(hud) {
  if (!hud) return { disputa: { subida: 0, descida: 0 } };
  return { disputa: { ...hud.disputa } };
}

/**
 * A legenda dos slots MARCADOS para o overlay: presente, ícone e delta, sem
 * slot vazio. Ordenada por força — o maior empurrão primeiro — porque é assim
 * que a referência do dono lê: o presente caro no alto, o barato embaixo.
 *
 * Deixou de ser "a legenda dos 6": com o preset podendo ter até 24 slots, a
 * faixa do overlay 9:16 cobriria o boneco se todos entrassem. Quem manda é o
 * `mostrarNoOverlay` do slot, e a AUSÊNCIA dele vale como true — preset já
 * gravado em disco não tem o campo e continua com a legenda de sempre. Só um
 * `false` explícito esconde, e esconde só a tela: o presente segue valendo no
 * jogo, com o mesmo delta e a mesma animação.
 *
 * É a única coisa do HUD que fala de presente, e fala do PRESENTE: o que ele
 * faz com a torre. Nunca quanto ele custa nem quem mandou.
 */
export function legendaDoPreset(preset, catalogo) {
  const porId = new Map((catalogo?.presentes ?? []).map((p) => [String(p.presenteId), p]));
  return (preset?.slots ?? [])
    .filter((slot) => slot && Number.isFinite(slot.delta) && slot.delta !== 0)
    .filter((slot) => slot.mostrarNoOverlay !== false)
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
