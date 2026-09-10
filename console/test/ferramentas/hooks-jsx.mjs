/**
 * Hooks de carregamento que deixam o `node --test` importar componente do
 * console sem Vite.
 *
 * É o mesmo mecanismo de `panel/test/ferramentas/hooks-jsx.mjs`, e existe pelo
 * mesmo motivo: o BUG-008, em que 504 testes verdes conviveram com o painel
 * quebrado porque nenhum deles renderizava. Tela nova nasce com pelo menos um
 * teste que monta o componente e lê o texto que sai.
 *
 * Duas traduções, e nada além delas:
 *
 * - `.jsx` passa pelo transformador do oxc (vem com o `rolldown`, que já é
 *   dependência da raiz) com o runtime automático do React.
 * - `.css` vira módulo vazio. O componente importa o próprio CSS (padrão do
 *   `CLAUDE.md`), e o Node não sabe o que fazer com isso. O que se testa aqui é
 *   a marcação; estilo se confere no navegador.
 */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { transformSync } = require("rolldown/experimental");

export async function load(url, contexto, proximo) {
  if (url.endsWith(".css")) {
    return { format: "module", shortCircuit: true, source: "export default {};" };
  }

  if (url.endsWith(".jsx")) {
    const caminho = fileURLToPath(url);
    const fonte = await readFile(caminho, "utf8");
    const { code, errors } = transformSync(caminho, fonte, { jsx: { runtime: "automatic" } });

    // Erro de sintaxe aqui é erro no componente. Deixar passar transformaria um
    // arquivo quebrado em "módulo vazio" e o teste acusaria a coisa errada.
    if (errors?.length) throw new Error(`JSX inválido em ${caminho}: ${JSON.stringify(errors)}`);

    return { format: "module", shortCircuit: true, source: code };
  }

  return proximo(url, contexto);
}
