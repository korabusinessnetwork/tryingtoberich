/**
 * As cutscenes em disco: quais existem, e onde o streamer as põe.
 *
 * Existe como repositório e não dentro de `http/overlay.mjs` porque o ADR-003 é
 * sobre o DIRETÓRIO, não sobre quem pergunta: quem toca `data/` é `repos/`, e
 * agora duas superfícies precisam da mesma resposta — o overlay, para servir o
 * vídeo, e o painel, para dizer se ele está lá.
 *
 * Dizer se está lá é o ponto. A cutscene falha CALADA: o OBS mostra um
 * retângulo transparente, o `<video>` não reclama, e da live não se distingue
 * "o arquivo não existe" de "a rodada não acabou ainda". A aba de overlay no
 * painel existe para essa diferença ser visível antes da live, não durante.
 */

import { abrirParaStream, caminhoDeDados } from "./arquivo.mjs";

/** Os dois nomes fixos. Trocar a cutscene é trocar o arquivo, sem tocar código. */
export const CUTSCENES = Object.freeze({
  vitoria: "vitoria.mp4",
  derrota: "derrota.mp4",
});

/** Onde o arquivo mora, para o painel poder dizer o caminho por extenso. */
export const PASTA_DAS_CUTSCENES = "data/cutscenes";

/** O arquivo aberto para leitura em trechos, ou `null` se não existir. */
export function abrirCutscene(nome) {
  const arquivo = CUTSCENES[nome];
  if (!arquivo) return Promise.resolve(null);
  return abrirParaStream(caminhoDeDados("cutscenes", arquivo));
}

/**
 * O estado das duas, para o painel. `existe: false` não é erro — é o caso
 * normal de quem ainda não pôs o vídeo lá, e é justamente o que precisa
 * aparecer na tela.
 */
export async function listarCutscenes() {
  const nomes = Object.keys(CUTSCENES);
  return Promise.all(
    nomes.map(async (id) => {
      const fonte = await abrirCutscene(id);
      return {
        id,
        arquivo: CUTSCENES[id],
        caminho: `${PASTA_DAS_CUTSCENES}/${CUTSCENES[id]}`,
        existe: Boolean(fonte),
        bytes: fonte ? fonte.tamanho : 0,
      };
    }),
  );
}
