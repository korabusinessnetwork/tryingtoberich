/**
 * As regras que o JSON Schema não consegue prender, porque cruzam campos.
 * Tudo aqui é função pura: sem disco, sem rede, sem relógio.
 *
 * A ferramenta de contratos (`npm run validar`) e a ponte usam ESTE módulo,
 * para a regra existir num lugar só e não poder divergir entre os dois.
 */

/** Margem do ADR-009: cobre latência de input, borda de plataforma e erro de posicionamento. */
export const FATOR_SALTO_VERTICAL = 0.7;
/** Teto de deriva horizontal em função do raio da plataforma. Ver P1. */
export const FATOR_DERIVA_HORIZONTAL = 1.2;

/** Gravidade e velocidade de andar padrão do Roblox. Espelham game/src/server/jogabilidade.lua. */
export const GRAVIDADE_ROBLOX = 196.2;
export const VELOCIDADE_ANDAR_ROBLOX = 16;

/**
 * Quanto o personagem cobre na horizontal durante um pulo, já com a margem do
 * ADR-009. O Roblox dá controle total no ar, então é velocidade de andar vezes
 * o tempo de voo.
 *
 * Esta conta existe nos dois lados de propósito: a ponte precisa recusar um
 * spec intransponível antes de gravar, senão o mapa só falharia na hora de
 * construir, dentro do Roblox, no meio da live.
 */
export function alcanceHorizontalDoPulo(jumpHeight) {
  const velocidadeVertical = Math.sqrt(2 * GRAVIDADE_ROBLOX * jumpHeight);
  const tempoDeVoo = (2 * velocidadeVertical) / GRAVIDADE_ROBLOX;
  return VELOCIDADE_ANDAR_ROBLOX * tempoDeVoo * FATOR_SALTO_VERTICAL;
}

/**
 * R1.4 — um mesmo presente não pode ocupar dois slots do mesmo preset.
 * Não é expressável em JSON Schema porque o conjunto de presenteId é aberto.
 */
export function presentesRepetidos(preset) {
  const vistos = new Set();
  const repetidos = new Set();
  for (const slot of preset.slots ?? []) {
    if (vistos.has(slot.presenteId)) repetidos.add(slot.presenteId);
    vistos.add(slot.presenteId);
  }
  return [...repetidos];
}

/**
 * ADR-009 — o mapa tem que ser escalável do início ao topo só com o pulo do
 * jogador. Rejeita, não corrige: spec fora da faixa volta para o Gemini.
 */
export function problemasDeJogabilidade(mapa) {
  const problemas = [];
  const { jumpHeight } = mapa;
  const { espacamentoVertical, variacaoHorizontal, raioBase } = mapa.plataformas;

  const tetoVertical = jumpHeight * FATOR_SALTO_VERTICAL;
  if (espacamentoVertical > tetoVertical) {
    problemas.push(
      `espacamentoVertical ${espacamentoVertical} passa do teto ${tetoVertical.toFixed(2)} ` +
        `(jumpHeight ${jumpHeight} × ${FATOR_SALTO_VERTICAL}). O mapa teria salto que o pulo não alcança.`,
    );
  }

  // Duas regras mordem a deriva horizontal, e vale a menor das duas.
  // A de geometria (P1) impede plataforma solta longe da torre; a de
  // jogabilidade (ADR-009.2) impede salto que o pulo não alcança. Para
  // jumpHeight 7,2 a segunda é bem mais apertada que a primeira, e é ela que
  // decide — foi o que apareceu ao implementar o teste dentro do jogo.
  const tetoGeometria = raioBase * FATOR_DERIVA_HORIZONTAL;
  if (variacaoHorizontal > tetoGeometria) {
    problemas.push(
      `variacaoHorizontal ${variacaoHorizontal} passa do teto de geometria ${tetoGeometria.toFixed(2)} ` +
        `(raioBase ${raioBase} × ${FATOR_DERIVA_HORIZONTAL}).`,
    );
  }

  const tetoAlcance = alcanceHorizontalDoPulo(jumpHeight);
  if (variacaoHorizontal > tetoAlcance) {
    problemas.push(
      `variacaoHorizontal ${variacaoHorizontal} passa do alcance horizontal do pulo ` +
        `${tetoAlcance.toFixed(2)} (jumpHeight ${jumpHeight}). Ver ADR-009.2.`,
    );
  }

  const topo = (mapa.marcos ?? []).find((m) => m.tipo === "topo");
  if (topo && topo.plataforma !== mapa.totalPlataformas) {
    problemas.push(`marco topo está na plataforma ${topo.plataforma} e o mapa tem ${mapa.totalPlataformas}.`);
  }

  return problemas;
}

/** Todo id de acervo que o spec referencia, com o campo de onde veio. */
export function referenciasDeAcervo(mapa) {
  return [
    { campo: "skyboxAssetId", colecao: "skybox", id: mapa.skyboxAssetId },
    { campo: "plataformas.materialAssetId", colecao: "texturas", id: mapa.plataformas.materialAssetId },
    ...(mapa.props ?? []).map((p, i) => ({ campo: `props[${i}].tipo`, colecao: "props", id: p.tipo })),
  ];
}

/**
 * ADR-004 — o Gemini escolhe do acervo e vai tentar inventar id de asset.
 * Barrar isso é obrigação do código, não do prompt.
 */
export function referenciasInexistentes(mapa, acervo) {
  return referenciasDeAcervo(mapa)
    .filter(({ colecao, id }) => !acervo[colecao].some((item) => item.id === id))
    .map(({ campo, colecao, id }) => `${campo}: "${id}" não existe em acervo.${colecao}`);
}

/**
 * Prontidão para ir ao ar: existir no acervo não basta, o item precisa estar
 * aprovado e com assetId. Skybox pendente de moderação vira mapa sem céu na
 * live. Props são nativos e não passam por moderação, então ficam de fora.
 */
export function referenciasNaoAprovadas(mapa, acervo) {
  return referenciasDeAcervo(mapa)
    .filter(({ colecao }) => colecao !== "props")
    .map(({ campo, colecao, id }) => ({ campo, item: acervo[colecao].find((i) => i.id === id) }))
    .filter(({ item }) => item && (item.status !== "aprovado" || item.assetId === null))
    .map(({ campo, item }) => `${campo}: "${item.id}" está ${item.status}, não aprovado`);
}

/** Verdadeiro só quando o spec é válido, jogável e todo asset referenciado está aprovado. */
export function mapaPodeIrAoAr(mapa, acervo) {
  const motivos = [
    ...problemasDeJogabilidade(mapa),
    ...referenciasInexistentes(mapa, acervo),
    ...referenciasNaoAprovadas(mapa, acervo),
  ];
  return { pode: motivos.length === 0, motivos };
}

/** Faixa I a V derivada das moedas. Campo de EXIBIÇÃO. Nenhuma regra de jogo lê isto. Ver R3. */
export function faixaDeMoedas(moedas) {
  if (moedas >= 5000) return 5;
  if (moedas >= 1000) return 4;
  if (moedas >= 100) return 3;
  if (moedas >= 10) return 2;
  return 1;
}
