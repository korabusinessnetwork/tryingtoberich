/**
 * As quatro regras que ninguém pode quebrar sem o teste acusar.
 *
 * 1. **A chave de serviço não chega ao navegador.** Ela ignora RLS e alcança a
 *    lista de assinantes com e-mail. O caminho pelo qual ela iria para lá é
 *    `import.meta.env.VITE_*`, porque o bundle do Vite é público por definição.
 * 2. **Sem uma linha de i18n** (ADR-P05). O console tem um usuário e ele é
 *    brasileiro.
 * 3. **Componente não toca a rede** (CLAUDE.md). Quem chama `api` é o `App`.
 * 4. **Os tokens são os mesmos do produto**, gerados de `data/tokens.json`, e
 *    não uma segunda cópia que já divergiu.
 *
 * As três primeiras são estáticas de propósito: o que elas pegam é a linha
 * ESCRITA, e a linha escrita é onde o erro entra. O que a tela desenha está em
 * `telas.test.mjs`, que renderiza, porque teste estático não sabe disso (BUG-008).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CONSOLE = path.resolve(AQUI, "..");

async function arquivosDe(pasta, extensoes) {
  const achados = [];
  for (const entrada of await readdir(pasta, { withFileTypes: true, recursive: true })) {
    if (!entrada.isFile()) continue;
    if (!extensoes.some((extensao) => entrada.name.endsWith(extensao))) continue;
    achados.push(path.join(entrada.parentPath ?? entrada.path, entrada.name));
  }
  return achados;
}

/**
 * Tira comentário antes de procurar.
 *
 * Sem isto, o teste acusaria justamente os arquivos que EXPLICAM a regra: o
 * cabeçalho de `dados/supabase.js` cita `import.meta.env.VITE_*` para dizer que
 * a chave nunca passa por ali, e um teste que lê comentário mandaria apagar a
 * explicação para ficar verde. O que interessa é a linha executada.
 *
 * A limpeza é conservadora de propósito: bloco `/* *\/` inteiro, e linha cujo
 * começo é `//` ou `*`. Não mexe em `//` no meio de linha, que é onde mora o
 * `https://` de uma string.
 */
function semComentarios(fonte) {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((linha) => {
      const limpa = linha.trim();
      return !limpa.startsWith("//") && !limpa.startsWith("*");
    })
    .join("\n");
}

const ler = async (arquivo) => ({
  arquivo,
  fonte: semComentarios(await readFile(arquivo, "utf8")),
});

/* ---------------------------------------------------------------- */
/* 1. A chave de serviço                                             */
/* ---------------------------------------------------------------- */

test("nada em src/ lê import.meta.env", async () => {
  const arquivos = await arquivosDe(path.join(CONSOLE, "src"), [".js", ".jsx"]);
  const culpados = [];

  for (const arquivo of arquivos) {
    const { fonte } = await ler(arquivo);
    if (fonte.includes("import.meta.env")) culpados.push(path.relative(CONSOLE, arquivo));
  }

  assert.deepEqual(
    culpados,
    [],
    "o bundle do Vite é público: nenhuma variável de ambiente entra no navegador",
  );
});

test("o módulo do banco não é importado por nenhum componente", async () => {
  const componentes = await arquivosDe(path.join(CONSOLE, "src", "components"), [".jsx"]);

  for (const arquivo of componentes) {
    const { fonte } = await ler(arquivo);
    assert.equal(
      fonte.includes("dados/supabase") || fonte.includes("dados/index"),
      false,
      `${path.basename(arquivo)} importa a camada de dados, que vive no Node`,
    );
  }
});

test("nenhuma chave, url de projeto ou token aparece cravado no código", async () => {
  const arquivos = [
    ...(await arquivosDe(path.join(CONSOLE, "src"), [".js", ".jsx"])),
    ...(await arquivosDe(path.join(CONSOLE, "servidor"), [".js"])),
  ];

  for (const arquivo of arquivos) {
    const { fonte } = await ler(arquivo);
    // `eyJ` é o começo de todo JWT do Supabase, anon e de serviço.
    assert.equal(fonte.includes("eyJ"), false, `chave cravada em ${path.basename(arquivo)}`);
    assert.equal(
      /https:\/\/[a-z0-9]{16,}\.supabase\.co/.test(fonte),
      false,
      `url de projeto cravada em ${path.basename(arquivo)}`,
    );
  }
});

/* ---------------------------------------------------------------- */
/* 2. Sem i18n                                                       */
/* ---------------------------------------------------------------- */

test("o console não tem uma linha de i18n", async () => {
  const arquivos = [
    ...(await arquivosDe(path.join(CONSOLE, "src"), [".js", ".jsx"])),
    ...(await arquivosDe(path.join(CONSOLE, "servidor"), [".js"])),
  ];

  // Não é preciosismo de nome: é a fronteira do ADR-P05. Cada string traduzida
  // nesta superfície é trabalho gasto em plateia de uma pessoa, e a primeira
  // chave introduzida arrasta o resto atrás.
  const proibidos = [/from "\.\.?\/i18n/, /useTraducao/, /\btraduzir\(/, /i18next/, /\bdefinirIdioma\(/];

  for (const arquivo of arquivos) {
    const { fonte } = await ler(arquivo);
    for (const proibido of proibidos) {
      assert.equal(
        proibido.test(fonte),
        false,
        `${path.relative(CONSOLE, arquivo)} traz i18n (${proibido}), e o console é português apenas`,
      );
    }
  }
});

test("não existe pasta de i18n no console", async () => {
  const pastas = await readdir(path.join(CONSOLE, "src"), { withFileTypes: true });
  assert.equal(pastas.some((entrada) => entrada.isDirectory() && entrada.name === "i18n"), false);
});

/* ---------------------------------------------------------------- */
/* 3. Componente não toca a rede                                     */
/* ---------------------------------------------------------------- */

test("nenhum componente chama fetch nem importa a api", async () => {
  const componentes = await arquivosDe(path.join(CONSOLE, "src", "components"), [".jsx"]);
  assert.ok(componentes.length > 0, "não achei componente nenhum, o teste estaria passando à toa");

  for (const arquivo of componentes) {
    const { fonte } = await ler(arquivo);
    const nome = path.basename(arquivo);
    assert.equal(/\bfetch\(/.test(fonte), false, `${nome} chama fetch`);
    assert.equal(fonte.includes('from "../lib/api.js"'), false, `${nome} importa a api`);
  }
});

/* ---------------------------------------------------------------- */
/* 4. Os tokens do produto, e não uma segunda cópia                  */
/* ---------------------------------------------------------------- */

test("tokens.css do console está em dia com data/tokens.json", async () => {
  const { montarCss, CAMINHO_DO_CSS, CAMINHO_DO_JSON } = await import("../scripts/gerar-tokens.mjs");
  const tokens = JSON.parse(await readFile(CAMINHO_DO_JSON, "utf8"));
  const emDisco = await readFile(CAMINHO_DO_CSS, "utf8");

  // Existem dois geradores hoje, o da raiz e o do console, e é este teste que
  // impede os dois divergirem em silêncio. Quando o da raiz passar a escrever
  // os três destinos, este teste some junto com o gerador daqui.
  assert.equal(
    emDisco.replace(/\r\n/g, "\n"),
    montarCss(tokens),
    "rode `npm run --workspace @kora/console pretest` para regerar tokens.css",
  );
});

test("nenhum CSS do console traz cor literal", async () => {
  const folhas = await arquivosDe(path.join(CONSOLE, "src"), [".css"]);

  for (const arquivo of folhas) {
    if (path.basename(arquivo) === "tokens.css") continue; // é ele quem define
    const { fonte } = await ler(arquivo);
    // Cor de marca literal no componente é o que impede o white-label da Fase 3
    // sem reescrever componente (02_DESIGN_SYSTEM).
    assert.equal(
      /#[0-9a-fA-F]{3,8}\b/.test(fonte),
      false,
      `${path.basename(arquivo)} tem cor literal, e toda cor sai de token`,
    );
    assert.equal(/\brgba?\(/.test(fonte), false, `${path.basename(arquivo)} tem cor literal`);
  }
});
