/**
 * Índice de animações. É espelho gerado, nunca editado à mão: ver
 * scripts/gerar-animacoes.mjs, que produz data/animacoes.json a partir da
 * tabela de docs/03_REGRAS_DE_NEGOCIO/biblioteca-animacoes.md.
 */

import { ErroDeDominio } from "../erros.mjs";
import { caminhoDeDados, lerJsonOuPadrao } from "./arquivo.mjs";

export async function carregarAnimacoes() {
  const indice = await lerJsonOuPadrao(caminhoDeDados("animacoes.json"));
  if (!indice) {
    throw new ErroDeDominio(
      "animacoes_ausentes",
      "data/animacoes.json não existe. Rode `npm run gerar` para produzi-lo a partir da biblioteca documentada.",
      { status: 503 },
    );
  }
  return indice.animacoes;
}

/** Mapa id → animação, para o despachante não varrer lista no caminho crítico. */
export const indexarAnimacoes = (animacoes) => new Map(animacoes.map((a) => [a.id, a]));
