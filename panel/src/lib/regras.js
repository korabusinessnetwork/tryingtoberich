/**
 * As regras de exibição do painel. Funções puras, sem React e sem rede — é o
 * que permite testá-las com `node --test` sem montar componente nenhum.
 *
 * Regra que atravessa este arquivo inteiro (R3): **o valor em moedas sugere,
 * nunca decide.** Ele ordena, colore e avisa. Nenhuma regra de jogo lê faixa.
 */

/** Espelha `faixaDeMoedas` de bridge/src/dominio/regras.mjs. Ver R3. */
export function faixaDeMoedas(moedas) {
  if (moedas >= 5000) return 5;
  if (moedas >= 1000) return 4;
  if (moedas >= 100) return 3;
  if (moedas >= 10) return 2;
  return 1;
}

/** Nome da variável CSS da faixa. As cores vivem em styles/tokens.css, gerado. */
export const corDaFaixa = (faixa) => `var(--faixa-${faixa})`;

export const NOME_DA_FAIXA = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V" };

/** Delta sempre com sinal: o `+` é o que diferencia subida de descida de relance. */
export const formatarDelta = (delta) => (delta > 0 ? `+${delta}` : String(delta));

/**
 * R3 — aviso de vínculo fora da curva. **Avisa, não bloqueia.**
 *
 * A curva é uma expectativa grosseira: presente caro tende a mover mais. Mas o
 * vínculo é escolha explícita do streamer (ADR-007), e ele pode querer
 * justamente o contrário — um presente de 1 moeda que derruba tudo é uma piada
 * boa de live. Por isso o retorno é um texto para mostrar, nunca um booleano
 * que trave o salvar.
 *
 * Devolve `null` quando está dentro do esperado.
 */
export function avisoDeCurva({ moedas, delta }) {
  if (!Number.isFinite(moedas) || !Number.isFinite(delta) || delta === 0) return null;

  const faixa = faixaDeMoedas(moedas);
  const forca = Math.abs(delta);

  // Faixas I e II são presentes de 1 a 99 moedas: eles chegam em rajada, e um
  // delta grande neles faz o boneco atravessar o mapa por centavos.
  if (faixa <= 2 && forca >= 50) {
    return `${forca} plataformas por ${moedas} ${moedas === 1 ? "moeda" : "moedas"} é muito para um presente barato — ele chega em rajada.`;
  }

  // Faixa V é o presente mais caro do catálogo. Delta pequeno nele decepciona
  // quem pagou, e decepção some com o próximo presente caro.
  if (faixa >= 4 && forca <= 3) {
    return `${moedas} moedas para mover ${forca} ${forca === 1 ? "plataforma" : "plataformas"} vai decepcionar quem mandar.`;
  }

  return null;
}

/**
 * A direção efetiva é o sinal do delta, não a animação (R2).
 *
 * O painel avisa quando os dois discordam, e permite mesmo assim: animação de
 * subida com delta negativo é escolha válida, só é quase sempre engano.
 */
export function avisoDeDirecao({ animacao, delta }) {
  if (!animacao || !Number.isFinite(delta) || delta === 0) return null;
  const subindo = delta > 0;
  if (animacao.direcao === "subida" && !subindo) {
    return "Animação de subida com delta negativo: o boneco desce enquanto o efeito sobe.";
  }
  if (animacao.direcao === "descida" && subindo) {
    return "Animação de descida com delta positivo: o boneco sobe enquanto o efeito desce.";
  }
  return null;
}

/** R1 — o preset tem 6 posições, e slot vazio é válido. Sempre devolve 6. */
export const SLOTS = 6;

export function slotsDoPreset(preset) {
  const porPosicao = new Map((preset?.slots ?? []).map((slot) => [slot.posicao, slot]));
  return Array.from({ length: SLOTS }, (_, i) => porPosicao.get(i + 1) ?? { posicao: i + 1, vazio: true });
}

/** R1.4 — o mesmo presente não pode ocupar dois slots. A ponte recusa; o painel avisa antes. */
export function presentesRepetidos(preset) {
  const vistos = new Set();
  const repetidos = new Set();
  for (const slot of preset?.slots ?? []) {
    if (vistos.has(slot.presenteId)) repetidos.add(slot.presenteId);
    vistos.add(slot.presenteId);
  }
  return [...repetidos];
}

/** Milissegundos como o streamer lê de canto de olho: inteiro, com unidade. */
export const formatarLatencia = (ms) => (Number.isFinite(ms) ? `${Math.round(ms)}ms` : "—");

/**
 * O orçamento do Princípio nº1: alvo de 600ms, teto de 1000ms. O painel
 * mostra a latência medida com essa leitura, para o streamer ver degradação
 * antes de o espectador reclamar.
 */
export function saudeDaLatencia(ms) {
  if (!Number.isFinite(ms)) return "desconhecida";
  if (ms <= 600) return "ok";
  if (ms <= 1000) return "atencao";
  return "erro";
}
