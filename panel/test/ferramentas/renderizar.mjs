/**
 * Renderiza componente do painel dentro do `node --test`.
 *
 * **Como usar, e por que não dá para importar o componente de cima:** os hooks
 * de `.jsx` são registrados quando ESTE módulo é avaliado, e `import` estático
 * é resolvido antes de qualquer avaliação. Então o componente entra por
 * `await import(...)` no corpo do teste, depois deste módulo já ter rodado:
 *
 *     import { renderizar } from "./ferramentas/renderizar.mjs";
 *     const { CartaoDeSlot } = await import("../src/components/CartaoDeSlot.jsx");
 *     const html = renderizar(<CartaoDeSlot ... />);   // sem JSX: criar(...)
 *
 * O teste é escrito em `.mjs` puro, sem JSX, e monta o elemento com `criar`
 * (o `createElement` do React). Um arquivo de teste em JSX precisaria dos
 * hooks para carregar a si mesmo, que é o ovo antes da galinha.
 *
 * `renderToStaticMarkup` não roda `useEffect` — de propósito. O que se testa
 * aqui é o DESENHO a partir das props, e componente do painel recebe dado por
 * prop (CLAUDE.md): quem busca é o App.
 */

import { register } from "node:module";

register("./hooks-jsx.mjs", import.meta.url);

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");

export const criar = createElement;

/** O HTML que o componente desenha, como o navegador o receberia. */
export function renderizar(elemento) {
  return renderToStaticMarkup(elemento);
}

/**
 * Renderiza e devolve só o TEXTO visível, sem tag nem atributo.
 *
 * É o que separa "a frase está na tela" de "a frase está no `title` de um
 * botão": um teste que procura a string no HTML cru passaria pelas duas.
 */
export function textoVisivel(elemento) {
  return renderizar(elemento)
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
