/**
 * Hooks de carregamento que deixam o `node --test` importar componente do
 * painel sem Vite.
 *
 * Existe por causa do BUG-008: 504 testes verdes, todos estáticos, e a tela
 * inteira em português depois de trocar para espanhol. Teste que lê o arquivo
 * como texto não sabe o que a tela desenha — e o painel só é conferido de
 * verdade quando alguém RENDERIZA.
 *
 * Duas traduções, e nada além delas:
 *
 * - `.jsx` passa pelo transformador do oxc (vem com o `rolldown`, que já é
 *   dependência da raiz) com o runtime automático do React. É o mesmo JSX que
 *   o Vite compila, sem a máquina do Vite junto.
 * - `.css` vira módulo vazio. O componente importa o próprio CSS (padrão do
 *   `CLAUDE.md`), e o Node não sabe o que fazer com isso. O que se testa aqui
 *   é a marcação; estilo se confere no navegador.
 *
 * Nada disto é usado em produção: o painel de verdade é montado pelo Vite.
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

    // Erro de sintaxe aqui é erro no componente. Deixar passar transformaria
    // um arquivo quebrado em "módulo vazio" e o teste acusaria a coisa errada.
    if (errors?.length) throw new Error(`JSX inválido em ${caminho}: ${JSON.stringify(errors)}`);

    return { format: "module", shortCircuit: true, source: code };
  }

  return proximo(url, contexto);
}
