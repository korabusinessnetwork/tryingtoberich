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
 * ## Os erros que carregam valor
 *
 * Metade deles tem um valor dentro da frase: "Não achei o mapa X", "Preset fora
 * do contrato: Y". Enquanto o valor vinha grudado no texto em português, o
 * painel não tinha como remontar a frase em outro idioma, e esses 26 erros
 * apareciam em português para quem usa o painel em inglês.
 *
 * A ponte passou a mandar os valores separados, em `detalhe` (`docs/07_APIS`),
 * e aqui eles viram os parâmetros da chave: `panel.error.mapaNaoEncontrado` é
 * "Não achei o mapa {mapaId}", e o `{mapaId}` vem do `detalhe`. Os nomes dos
 * campos do `detalhe` e os dos parâmetros da chave são o mesmo acordo, e
 * `test/erros-traduzidos.test.mjs` lê os dois lados para garantir isso.
 *
 * Parâmetro que falta não some da tela: `traduzir` deixa o `{nome}` visível, o
 * que é feio e diz exatamente o que faltou, em vez de uma frase mutilada.
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
  const traduzida = traduzir(chave, falha?.detalhe ?? undefined);

  // `traduzir` devolve a própria chave quando não há tradução. É assim que se
  // distingue "não existe no catálogo" de "existe e é assim mesmo".
  return traduzida === chave ? original : traduzida;
}
