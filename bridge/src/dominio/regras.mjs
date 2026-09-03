/**
 * As regras que o JSON Schema não consegue prender, porque cruzam campos.
 * Tudo aqui é função pura: sem disco, sem rede, sem relógio.
 *
 * A ferramenta de contratos (`npm run validar`) e a ponte usam ESTE módulo,
 * para a regra existir num lugar só e não poder divergir entre os dois.
 */

/** Margem do ADR-009: cobre latência de input, borda de plataforma e erro de posicionamento. */
export const FATOR_SALTO_VERTICAL = 0.7;

/**
 * Vida do portal do primeiro andar, quando o preset não diz outra.
 *
 * A unidade é ANDAR de empurrão para baixo, a mesma do `delta`: um presente de
 * -20 tira 20. Com a torre de 1000, 2000 é o equivalente a duas torres
 * inteiras de queda. Espelha `Tipos.VIDA_PADRAO_DO_PORTAL` no Luau — o teste
 * de contrato confere que os dois números continuam iguais.
 */
export const VIDA_PADRAO_DO_PORTAL = 2000;

/**
 * Espessura do degrau em studs. Espelha `ESPESSURA_DISCO` no construtor.
 *
 * Vale como REGRA e não só como aparência: na passarela os degraus se encostam,
 * e é a espessura que diz qual subida deixa um degrau apoiado no anterior em
 * vez de flutuando acima dele com o jogador preso no meio.
 */
export const ESPESSURA_DO_DEGRAU = 2;

/**
 * A config padrão do mundo: o que sai quando ninguém escolhe nada.
 *
 * Fica ao lado de `PADROES_POR_FORMATO` porque é a outra metade da mesma
 * decisão — aquele diz a geometria do degrau, este diz o tamanho da torre e a
 * altura do pulo que ela pressupõe. Os dois juntos são o mundo padrão, e é
 * dele que o compositor de mundos e o prompt do Gemini partem.
 *
 * `jumpHeight` é o piso do contrato (`mapa.schema.json`), e o piso é
 * deliberado: pulo baixo aperta o alcance horizontal, e é o alcance que decide
 * quanto a torre pode ser espaçada. Mexer aqui muda o que passa na checagem de
 * jogabilidade dos dois lados.
 */
export const PADRAO_DO_MUNDO = Object.freeze({
  jumpHeight: 7,
  totalPlataformas: 5000,
});

/**
 * A geometria afinada de cada formato (ADR-009).
 *
 * Existe para o painel poder CONVERTER um mapa de um formato para o outro sem
 * regerar nada. Sem isto, escolher "Passarela" só valia para o próximo mapa
 * gerado — e do lado de quem clica, o botão simplesmente não fazia nada.
 *
 * São os mesmos números que o prompt manda o modelo usar. Um lugar só: dois
 * conjuntos de padrões desencostariam na primeira afinação.
 */
export const PADROES_POR_FORMATO = Object.freeze({
  disco: Object.freeze({
    raioBase: 7.5,
    variacaoRaio: 0.1,
    espacamentoVertical: 4,
    variacaoHorizontal: 16,
  }),
  laje: Object.freeze({
    raioBase: 10,
    variacaoRaio: 0,
    // Subida igual à espessura: cada degrau assenta no anterior, sem fresta.
    espacamentoVertical: ESPESSURA_DO_DEGRAU,
    // Avanço igual à subida: rampa de 45 graus, apontando para o céu.
    variacaoHorizontal: ESPESSURA_DO_DEGRAU,
  }),
});

/** O mesmo mapa, com a geometria do formato pedido. Não valida — quem chama valida. */
export function comFormato(mapa, formato) {
  const padroes = PADROES_POR_FORMATO[formato];
  if (!padroes) return mapa;
  return { ...mapa, plataformas: { ...mapa.plataformas, formato, ...padroes } };
}
/** Teto de deriva horizontal em função do raio da plataforma. Ver P1. */

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

  // Slots e placar na MESMA varredura: um presente em ambos seria ambíguo —
  // anima o boneco ou encerra a rodada? — e a resposta dependeria da ordem em
  // que o código consultasse as duas listas, que é o pior tipo de regra.
  const vinculos = [...(preset.slots ?? []), ...(preset.placar ?? [])];
  for (const vinculo of vinculos) {
    if (vistos.has(vinculo.presenteId)) repetidos.add(vinculo.presenteId);
    vistos.add(vinculo.presenteId);
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

  // O teto de GEOMETRIA (variacaoHorizontal <= raioBase * 1,2) foi removido
  // aqui: ele descrevia o modelo antigo, de discos largos empilhados perto do
  // eixo, e é o OPOSTO do caracol — que precisa do passo MAIOR que o disco para
  // existir vão. Os dois eram matematicamente incompatíveis.
  //
  // Nada ficou sem guarda: a largura da torre continua limitada, porque o passo
  // não pode passar do alcance do pulo (abaixo) e o raio da órbita é derivado
  // dele. Ver a nota no construtorMapa.lua.

  //[[ Duas regras, dois piores casos OPOSTOS. Confundir os dois foi o erro que
  // fez a torre construída ser reprovada com o spec aprovado:
  //
  //   vão grande demais  -> pior caso são os discos MENORES (raio mínimo):
  //                         quanto menor o disco, maior a distância entre bordas.
  //   discos se cobrindo -> pior caso são os discos MAIORES (raio máximo).
  //
  // `variacaoRaio` sorteia para os DOIS lados na construção, então a validação
  // do spec tem que cobrir as duas pontas — não a média, nem só uma delas. ]]
  const variacaoRaio = mapa.plataformas.variacaoRaio ?? 0;
  const raioMaximo = raioBase * (1 + variacaoRaio);
  const raioMinimo = raioBase * (1 - variacaoRaio);
  const tetoAlcance = alcanceHorizontalDoPulo(jumpHeight);

  //[[ O que o jogador atravessa é o VÃO entre as bordas, não a distância entre
  // os centros.
  //
  // Esta regra comparava `variacaoHorizontal` — que é distância de CENTRO a
  // centro — direto com o alcance do pulo, como se fosse o vão. Isso ignora os
  // dois raios: com degraus de raio 6, um passo de 20 studs deixa um vão de só
  // 8, perfeitamente saltável, e mesmo assim era reprovado.
  //
  // O jogo sempre mediu certo (`jogabilidade.lua`, "o que o streamer atravessa
  // é o VÃO entre as bordas"). Era a ponte que discordava dele, e era ela que
  // estava errada — o efeito era uma torre muito mais apertada do que o pulo
  // do Roblox comporta. ]]
  //[[ Dois formatos, duas regras OPOSTAS (ADR-009, nota de 2026-09-02).
  //
  //   disco -> degraus separados. Existe VÃO entre as bordas, e o jogador pula.
  //            O erro a evitar é o vão passar do alcance, ou o degrau cobrir o
  //            anterior inteiro e a torre virar coluna.
  //   laje  -> lajes largas que se ENCOSTAM. NÃO existe vão, e o jogador sobe
  //            quase andando. O erro a evitar é o contrário: a laje curta
  //            demais para o passo, que abre buraco no meio do caminho.
  //
  // Rodar a regra do disco num mapa de laje reprovaria todo mapa de laje por
  // "plataformas se cobrem" — que no formato laje é justamente o objetivo. ]]
  const formato = mapa.plataformas.formato ?? "disco";

  const vao = variacaoHorizontal - 2 * raioMinimo;
  if (formato === "laje") {
    //[[ A laje TILA: o fundo é exatamente o passo. Nem vão, nem enterro.
    //
    // A primeira versão desta regra pedia só "sem vão", e a torre construída
    // ficou intransponível de um jeito que nenhuma checagem pegava: com fundo
    // 24 e passo 20, cada laje enterra 4 studs na seguinte. Nessa faixa de
    // sobreposição a folga vertical é `espacamentoVertical - espessura` = 1
    // stud, e o boneco de 5 studs fica DENTRO da laje de cima. A física o
    // expulsa — que é o mesmo estrago do spawn no andar 500.
    //
    // Sobreposição e vão são o mesmo eixo, e só um valor serve nos dois
    // sentidos: fundo == passo. Por isso `variacaoRaio` também tem que ser
    // zero — sorteando o fundo, uma ponta abre buraco e a outra enterra, sem
    // saída possível. Passarela é feita de laje igual; é isso que faz dela um
    // caminho e não uma pilha. ]]
    if (variacaoRaio !== 0) {
      problemas.push(
        `variacaoRaio ${variacaoRaio} no formato "laje": tem que ser 0. Sorteando o fundo, ` +
          `a laje pequena abre buraco no caminho e a grande enterra na seguinte — não existe ` +
          `valor que sirva nos dois sentidos.`,
      );
    }

    //[[ Sem BURACO. Sobreposição, sim — e é ela que dá a inclinação.
    //
    // A regra anterior exigia degrau EXATAMENTE igual ao passo, o que travava a
    // rampa numa inclinação só: com degrau de 20 e subida de 2, ela sobe 1 para
    // cada 10 de avanço, e 5000 degraus dariam 100 mil studs de comprimento —
    // longe demais para o Roblox posicionar com precisão, e nem de longe "uma
    // reta até a lua".
    //
    // Avançar MENOS que o tamanho do degrau é o que levanta a rampa, e aqui é
    // seguro: a subida é igual à espessura (regra logo abaixo), então cada
    // degrau assenta em cima do anterior sem deixar fresta. O que continua
    // proibido é avançar MAIS que o degrau, que abre buraco no caminho. ]]
    const tamanho = 2 * raioBase;
    if (variacaoHorizontal > tamanho + 0.01) {
      problemas.push(
        `avanço de ${variacaoHorizontal} com degrau de ${tamanho.toFixed(2)}: abre um buraco de ` +
          `${(variacaoHorizontal - tamanho).toFixed(2)} studs no caminho. Na passarela o avanço tem ` +
          `que caber dentro do degrau — é o que faz um encostar no outro.`,
      );
    }
    if (variacaoHorizontal <= 0) {
      problemas.push(
        `avanço de ${variacaoHorizontal} na passarela: os degraus ficariam todos no mesmo lugar, ` +
          `empilhados, e não haveria caminho nenhum.`,
      );
    }

    //[[ SEM PULO: o degrau apoia no anterior, não flutua acima dele.
    //
    // A passarela é para subir ANDANDO. Com a subida maior que a espessura, o
    // degrau seguinte fica solto no ar e abre uma fresta por baixo — foi assim
    // que a primeira versão prendeu o boneco (subida 3, espessura 2, 1 stud de
    // folga e um personagem de 5). Subida igual à espessura encosta um degrau
    // no outro: vira escada de verdade, e o Roblox sobe degrau desse tamanho
    // sem pular. ]]
    if (espacamentoVertical > ESPESSURA_DO_DEGRAU) {
      problemas.push(
        `subida de ${espacamentoVertical} na passarela: o máximo é ${ESPESSURA_DO_DEGRAU}, a espessura ` +
          `do degrau. Acima disso o degrau seguinte flutua e abre fresta por baixo — o jogador ` +
          `precisaria pular, e passarela é para subir andando.`,
      );
    }
  }

  // O piso de 3 do disco vivia no schema; com a passarela precisando de 2, ele
  // desceu para cá, onde o motivo cabe junto do número.
  if (formato === "disco" && espacamentoVertical < 3) {
    problemas.push(
      `subida de ${espacamentoVertical} no formato "disco": o mínimo é 3. Degrau mais baixo que ` +
        `isso não é escada de pular, é rampa — e a torre perde a sensação de altura.`,
    );
  }

  if (formato === "disco" && vao > tetoAlcance) {
    problemas.push(
      `vão de ${vao.toFixed(2)} entre as bordas passa do alcance horizontal do pulo ` +
        `${tetoAlcance.toFixed(2)} (jumpHeight ${jumpHeight}, passo ${variacaoHorizontal}, ` +
        `raio mínimo ${raioMinimo.toFixed(2)} — é o disco pequeno que abre o maior vão). Ver ADR-009.2.`,
    );
  }

  //[[ A regra do DEGRAU.
  //
  // O passo horizontal tem que ser maior que o RAIO do disco, não que o
  // diâmetro. A diferença é o que separa uma escada de uma coluna:
  //
  //   passo > raio  -> o centro da próxima plataforma cai FORA da anterior.
  //                    Elas se sobrepõem nas bordas, como todo degrau de
  //                    escada caracol, mas o caracol é visível e o jogador
  //                    precisa andar para chegar na próxima.
  //   passo < raio  -> cada disco cobre o anterior inteiro. A torre vira uma
  //                    coluna maciça, não há caminho, e o personagem nasce
  //                    DENTRO dela — o Roblox então o empurra para cima até
  //                    achar espaço, que foi o spawn no andar 500.
  //
  // Exigir vão entre as BORDAS (passo > diâmetro) era forte demais: prendia o
  // raio em 3 studs mesmo no pulo máximo, e degrau de escada não tem vão.
  //
  // Usa o raio MÁXIMO, não o base: variacaoRaio sorteia para cima também. ]]
  if (formato === "disco" && raioMaximo >= variacaoHorizontal) {
    problemas.push(
      `plataformas se cobrem: raio máximo ${raioMaximo.toFixed(2)} ` +
        `(raioBase ${raioBase} × 1+variacaoRaio) é maior que o passo horizontal ${variacaoHorizontal}. ` +
        `Cada disco cobriria o anterior inteiro e a torre viraria coluna, sem caminho.`,
    );
  }

  //[[ A laje ainda precisa ANDAR para o lado.
  //
  // Sem esta guarda, passo 0 passaria em tudo: sem vão (é o que a regra da
  // laje quer) e sem cobertura para checar. Só que aí toda laje nasce no mesmo
  // X e Z, uma em cima da outra — a coluna maciça de novo, por outro caminho,
  // com o personagem nascendo dentro dela. O piso é meia laje: menos que isso
  // e o degrau some visualmente. ]]
  const topo = (mapa.marcos ?? []).find((m) => m.tipo === "topo");
  if (topo && topo.plataforma !== mapa.totalPlataformas) {
    problemas.push(`marco topo está na plataforma ${topo.plataforma} e o mapa tem ${mapa.totalPlataformas}.`);
  }

  return problemas;
}

/** Todo id de acervo que o spec referencia, com o campo de onde veio. */
/**
 * As texturas do mapa, sempre como lista.
 *
 * O campo aceita um id só (torre toda igual) ou uma lista (blocos variados,
 * revezando degrau a degrau). Todo mundo que lê passa por aqui para não ter que
 * saber qual das duas formas veio.
 */
export function texturasDoMapa(mapa) {
  const bruto = mapa?.plataformas?.materialAssetId;
  if (Array.isArray(bruto)) return bruto.filter((id) => typeof id === "string" && id !== "");
  return typeof bruto === "string" && bruto !== "" ? [bruto] : [];
}

export function referenciasDeAcervo(mapa) {
  return [
    { campo: "skyboxAssetId", colecao: "skybox", id: mapa.skyboxAssetId },
    //[[ Uma textura ou várias: a torre de blocos variados reveza degrau a degrau.
    //
    // Cada id da lista é uma referência ao acervo por si só, e todas precisam
    // estar aprovadas. Achatar aqui é o que faz `referenciasInexistentes` e
    // `referenciasNaoAprovadas` valerem para a lista inteira sem saber que ela
    // existe. ]]
    ...texturasDoMapa(mapa).map((id) => ({ campo: "plataformas.materialAssetId", colecao: "texturas", id })),
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
