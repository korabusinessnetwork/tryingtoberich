/**
 * A mensagem de erro da ponte, no idioma do streamer (ADR-P03).
 *
 * O retrofit da rodada 1 deixou isto de fora de propósito, e o buraco era real:
 * um streamer com o painel em inglês clicava em Iniciar sem preset e recebia
 * "Escolha um preset antes de começar." em português.
 *
 * **Não precisou de mudança de contrato.** A ponte já responde
 * `{ erro: "<codigo>", mensagem: "<frase>" }` (`docs/07_APIS`), e o código
 * atravessa até o painel dentro de `ErroDaPonte`. Traduzir é olhar o código
 * num catálogo, não reescrever a resposta.
 *
 * ## O que fica de fora, e por quê
 *
 * Metade dos erros da ponte carrega um VALOR na frase — `Não achei o mapa
 * "{id}"`, `Preset fora do contrato: {problemas}`. O valor não viaja separado
 * do texto, então o painel não consegue remontá-lo em outro idioma. Esses
 * continuam chegando em português, e a lista deles é mantida por
 * `test/erros-traduzidos.test.mjs` para que ninguém pense que estão resolvidos.
 *
 * Traduzi-los exige a ponte mandar `detalhe` estruturado junto — mudança de
 * contrato, e rodada própria.
 */

import { traduzir } from "./traduzir.js";

/** O prefixo das chaves de erro no catálogo. */
export const PREFIXO = "panel.error.";

/**
 * O código da ponte é `snake_case` — `sem_conta_da_live` —, e o ADR-P03 exige
 * slug alfanumérico nas chaves. A conversão mora aqui, num lugar só, e é o
 * teste `test/erros-traduzidos.test.mjs` que garante que os dois lados usam a
 * mesma.
 */
export function emSlug(codigo) {
  const [primeira, ...resto] = String(codigo).split("_");
  return primeira + resto.map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1)).join("");
}

/**
 * A frase para mostrar ao streamer.
 *
 * Sem código conhecido, devolve a frase que a ponte mandou — que é o
 * comportamento de antes, e continua sendo melhor que uma mensagem genérica.
 */
export function mensagemDoErro(falha, padrao = "Algo falhou.") {
  const original = falha?.message ?? padrao;
  const codigo = falha?.codigo;
  if (!codigo) return original;

  const chave = `${PREFIXO}${emSlug(codigo)}`;
  const traduzida = traduzir(chave);

  // `traduzir` devolve a própria chave quando não há tradução. É assim que se
  // distingue "não existe no catálogo" de "existe e é assim mesmo".
  return traduzida === chave ? original : traduzida;
}
