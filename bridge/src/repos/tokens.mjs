/**
 * Os tokens visuais, para quem serve tela FORA do painel.
 *
 * O painel recebe `tokens.css` gerado por `npm run gerar`, e o jogo recebe
 * `tokens.lua`. O overlay do OBS é HTML servido pela ponte, e não passa por
 * bundler nenhum: ele lê `data/tokens.json` direto e injeta as variáveis na
 * página. Mesma fonte, mesmos nomes de variável que o painel usa
 * (`--faixa-N`, `--estado-*`, `--painel-*`), mais o bloco `hud`, que agora é
 * do jogo E do overlay (02_DESIGN_SYSTEM).
 *
 * Lido uma vez e guardado: tokens mudam com `npm run gerar`, não durante a
 * live, e o overlay é aberto pelo OBS uma vez por sessão.
 */

import { caminhoDeDados, lerJsonOuPadrao } from "./arquivo.mjs";

let cache = null;

export async function carregarTokens() {
  if (cache) return cache;
  cache = (await lerJsonOuPadrao(caminhoDeDados("tokens.json"), null)) ?? {};
  return cache;
}

/** `camelCase` → `kebab-case`, para `textoPrimario` virar `--painel-texto-primario`. */
const kebab = (nome) => nome.replace(/[A-Z]/g, (letra) => `-${letra.toLowerCase()}`);

/** Só o que é cor `#rrggbb`: o resto do JSON é descrição, e não vira CSS. */
const ehCor = (valor) => typeof valor === "string" && /^#[0-9a-fA-F]{6}$/.test(valor);

/** As variáveis CSS, no mesmo formato do tokens.css gerado. */
export function cssDosTokens(tokens) {
  const linhas = [];
  for (const [faixa, dados] of Object.entries(tokens?.faixas ?? {})) {
    if (ehCor(dados?.cor)) linhas.push(`  --faixa-${faixa}: ${dados.cor};`);
  }
  for (const bloco of ["estado", "hud", "painel"]) {
    for (const [nome, cor] of Object.entries(tokens?.[bloco] ?? {})) {
      if (ehCor(cor)) linhas.push(`  --${bloco}-${kebab(nome)}: ${cor};`);
    }
  }
  return `:root {\n${linhas.join("\n")}\n}`;
}
