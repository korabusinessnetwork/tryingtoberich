/**
 * O contrato da i18n (ADR-P03).
 *
 * Traduzir é o tipo de trabalho onde o erro é sempre silencioso: a chave some
 * de um idioma, ninguém percebe, e o streamer espanhol vê `panel.slotCard.title`
 * escrito na tela no meio da live. Nenhum desses erros quebra build, nenhum
 * aparece em log. Por isso o catálogo tem teste, e o teste é chato de propósito.
 *
 * A lição do BUG-001 vale inteira aqui: contrato entre duas superfícies só é
 * contrato se algum teste ler os DOIS lados. Este arquivo lê o catálogo, o
 * código que o consome, e o schema — e compara os três.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { RAIZ, caminhoDeDados, lerJson } from "../bridge/src/repos/arquivo.mjs";
import { criarValidador } from "../bridge/src/repos/schemas.mjs";
import { IDIOMAS, IDIOMA_PADRAO, montarJs, montarLua } from "../scripts/gerar-i18n.mjs";

const executar = promisify(execFile);

const catalogos = {};
for (const idioma of IDIOMAS) {
  catalogos[idioma] = await lerJson(caminhoDeDados("i18n", `${idioma}.json`));
}

const chavesDe = (idioma) => new Set(Object.keys(catalogos[idioma].chaves));

/** Percorre um diretório recursivamente, devolvendo os arquivos com as extensões pedidas. */
async function listar(dir, extensoes) {
  const achados = [];
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === "node_modules" || entrada.name === "dist") continue;
      achados.push(...(await listar(completo, extensoes)));
    } else if (extensoes.some((e) => entrada.name.endsWith(e))) {
      achados.push(completo);
    }
  }
  return achados;
}

const CODIGO = [
  ...(await listar(path.join(RAIZ, "panel", "src"), [".jsx", ".js"])),
  ...(await listar(path.join(RAIZ, "game", "src"), [".lua"])),
  ...(await listar(path.join(RAIZ, "bridge", "src"), [".mjs"])),
].filter((c) => !c.includes(`i18n${path.sep}catalogo.js`) && !c.endsWith(`shared${path.sep}textos.lua`));

const fontes = new Map();
for (const caminho of CODIGO) fontes.set(caminho, await readFile(caminho, "utf8"));

const relativo = (caminho) => path.relative(RAIZ, caminho).split(path.sep).join("/");

// ---------------------------------------------------------------- paridade

test("os três idiomas têm exatamente o mesmo conjunto de chaves", () => {
  const referencia = chavesDe(IDIOMA_PADRAO);

  for (const idioma of IDIOMAS) {
    if (idioma === IDIOMA_PADRAO) continue;
    const atual = chavesDe(idioma);

    const faltando = [...referencia].filter((k) => !atual.has(k)).sort();
    const sobrando = [...atual].filter((k) => !referencia.has(k)).sort();

    assert.deepEqual(
      faltando,
      [],
      `${idioma}.json não tem ${faltando.length} chave(s) que o ${IDIOMA_PADRAO} tem: ${faltando.slice(0, 8).join(", ")}`,
    );
    assert.deepEqual(
      sobrando,
      [],
      `${idioma}.json tem ${sobrando.length} chave(s) que o ${IDIOMA_PADRAO} não tem: ${sobrando.slice(0, 8).join(", ")}`,
    );
  }
});

test("nenhuma tradução ficou igual à chave, que é o sintoma de tradução esquecida", () => {
  for (const idioma of IDIOMAS) {
    for (const [chave, texto] of Object.entries(catalogos[idioma].chaves)) {
      assert.notEqual(texto, chave, `${idioma}.json: a chave ${chave} tem a própria chave como texto`);
      assert.ok(texto.trim().length > 0, `${idioma}.json: a chave ${chave} está vazia`);
    }
  }
});

test("cada catálogo valida contra o schema, e declara o próprio idioma", async () => {
  const { validar } = await criarValidador();

  for (const idioma of IDIOMAS) {
    const problemas = validar("i18n", catalogos[idioma]);
    assert.deepEqual(problemas, [], `${idioma}.json fora do contrato: ${problemas.join("; ")}`);
    assert.equal(catalogos[idioma].idioma, idioma, `${idioma}.json declara idioma "${catalogos[idioma].idioma}"`);
  }
});

// ------------------------------------------------------- código x catálogo

/**
 * Toda chave citada no código. Pega as quatro formas de chamar tradução que o
 * projeto usa: `t("...")` e `traduzir("...")` no painel, `Textos.t("...")` no
 * Luau, e o acesso por índice `T["..."]` no overlay servido pela ponte.
 */
function chavesCitadas() {
  const citadas = new Map();

  // Chave escrita como literal em QUALQUER lugar do código conta como citada.
  //
  // A primeira versão só reconhecia `t("...")`, e acusou 38 chaves mortas que
  // estavam vivíssimas: o painel guarda chave em tabela de lookup
  // (`{ id: "aprovado", chave: "panel.assetLibrary.statusApproved" }`) e em
  // helper de plural (`plural(n, "…coinsOne", "…coinsMany")`). Exigir a chamada
  // literal puniria justamente o código bem escrito.
  //
  // O preço é que chave citada só em comentário passa por usada. É barato
  // perto de um teste que mente sobre 38 chaves.
  const formato = /["'`](panel|game|hud|common)\.[a-zA-Z0-9]+\.[a-zA-Z0-9]+["'`]/g;

  for (const [caminho, fonte] of fontes) {
    for (const achado of fonte.matchAll(formato)) {
      const chave = achado[0].slice(1, -1);
      // `hud.client.lua` tem a forma de chave e é nome de arquivo. Sem esta
      // linha, todo caminho citado no código vira chave inexistente.
      if (/\.(lua|jsx?|mjs|json|css|html|md)$/.test(chave)) continue;
      if (!citadas.has(chave)) citadas.set(chave, new Set());
      citadas.get(chave).add(relativo(caminho));
    }
  }
  return citadas;
}

test("toda chave citada no código existe no catálogo", () => {
  const existentes = chavesDe(IDIOMA_PADRAO);
  const orfas = [];

  for (const [chave, arquivos] of chavesCitadas()) {
    if (!existentes.has(chave)) orfas.push(`${chave} (em ${[...arquivos].join(", ")})`);
  }

  assert.deepEqual(
    orfas.sort(),
    [],
    `${orfas.length} chave(s) usada(s) no código e ausente(s) do catálogo — viram texto cru na tela`,
  );
});

/**
 * Chaves montadas em tempo de execução, que a análise estática não enxerga.
 * Lista explícita e com motivo: sem ela, o teste de chave morta acusaria falso
 * positivo; grande demais, ele deixa de valer alguma coisa.
 */
const CHAVES_DINAMICAS = new Set([
  // SeletorDeIdioma monta `panel.language.${codigo}` sobre IDIOMAS.
  ...IDIOMAS.map((codigo) => `panel.language.${codigo}`),
]);

test("toda chave do catálogo é usada em algum lugar", () => {
  const citadas = new Set([...chavesCitadas().keys(), ...CHAVES_DINAMICAS]);
  const mortas = [...chavesDe(IDIOMA_PADRAO)].filter((k) => !citadas.has(k)).sort();

  assert.deepEqual(
    mortas,
    [],
    `${mortas.length} chave(s) no catálogo sem uso no código — cada uma custa três traduções à toa`,
  );
});

const FORMATO_DE_CHAVE = /^(panel|game|hud|common)\.[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/;

test("toda chave segue <superficie>.<contexto>.<slug>, em inglês", () => {
  const formato = FORMATO_DE_CHAVE;
  const fora = [...chavesDe(IDIOMA_PADRAO)].filter((k) => !formato.test(k)).sort();

  assert.deepEqual(fora, [], `chave(s) fora do formato do ADR-P03: ${fora.join(", ")}`);
});

// ------------------------------------------------ nenhuma string cravada

/**
 * As exceções, uma a uma e com motivo. Lista curta de propósito: ela é a porta
 * dos fundos deste teste, e porta dos fundos grande deixa de ser exceção.
 */
const CRAVADAS_PERMITIDAS = [
  // O painel só monta a lista de idiomas; o nome de cada um vem do catálogo.
  "panel/src/i18n/",
];

const ATRIBUTOS_VISIVEIS = /\s(?:title|placeholder|aria-label|alt)\s*=\s*"([^"{}]*[a-zà-úA-ZÀ-Ú]{3,}[^"{}]*)"/g;
// O `>` precisa ser mesmo o fim de uma tag. Sem a exclusão do que vem antes,
// a seta de `(preenchido, indice) => (` vira "fim de tag" e o nome do
// parâmetro é acusado de texto de tela.
const TEXTO_ENTRE_TAGS = /(?<![=!<>-])>\s*([^<>{}\n]*[a-zà-úA-ZÀ-Ú]{3,}[^<>{}\n]*?)\s*</g;

/**
 * O detector é heurístico, e o falso positivo dele custa caro: manda alguém
 * caçar fantasma no arquivo errado. Duas classes precisam ser descartadas.
 *
 * A primeira é EXPRESSÃO DE JAVASCRIPT. `TEXTO_ENTRE_TAGS` não sabe distinguir
 * o `>` que fecha uma tag do `>` que compara dois números, então
 * `{total > 0 && !presetId && (` chega aqui parecendo texto de tela.
 *
 * A segunda é TOKEN TÉCNICO que aparece na tela de propósito e não se traduz:
 * `.env`, `data/presets/`, `ROBLOX_API_KEY`, `assetId`, `biblioteca.md`. Esses
 * são o mesmo nome nos três idiomas — traduzi-los seria o erro.
 */
const ehTextoDeTela = (bruto) => {
  const texto = bruto.trim();
  if (texto.length < 3) return false;

  // Expressão de JavaScript, não frase.
  if (/[?&|=(){}[\]<>"'`]/.test(texto)) return false;

  // Caminho, extensão, constante de ambiente, identificador camelCase.
  if (/[/\\]/.test(texto)) return false;
  if (/^\./.test(texto)) return false;
  if (/^[A-Z0-9_]+$/.test(texto)) return false;
  if (/^[a-z]+[A-Z]/.test(texto)) return false;
  if (/^\S+\.[a-z]{2,4}$/i.test(texto)) return false;

  // Sobra frase de verdade: ao menos uma palavra alfabética de 3 letras.
  return /(^|\s)[a-zà-úA-ZÀ-Ú]{3,}(\s|$|[.,:;!?…])/.test(texto);
};

test("nenhuma string visível cravada sobrou no JSX do painel", () => {
  const sobras = [];

  for (const [caminho, fonte] of fontes) {
    const rel = relativo(caminho);
    if (!rel.startsWith("panel/src/") || !rel.endsWith(".jsx")) continue;
    if (CRAVADAS_PERMITIDAS.some((p) => rel.startsWith(p))) continue;

    for (const achado of fonte.matchAll(TEXTO_ENTRE_TAGS)) {
      const texto = achado[1].trim();
      if (!ehTextoDeTela(texto)) continue;
      sobras.push(`${rel}: texto "${texto}"`);
    }
    for (const achado of fonte.matchAll(ATRIBUTOS_VISIVEIS)) {
      const texto = achado[1].trim();
      if (!ehTextoDeTela(texto)) continue;
      sobras.push(`${rel}: atributo "${texto}"`);
    }
  }

  assert.deepEqual(
    sobras.sort(),
    [],
    `${sobras.length} string(s) visível(is) ainda cravada(s) no JSX — o ADR-P03 manda zero`,
  );
});

/**
 * Rótulo passado como PROP, que o detector de texto entre tags não enxerga.
 *
 * O painel monta listas de itens de tela em objeto — `{ id: "aovivo", rotulo:
 * "Ao vivo" }` — e os 8 itens do menu principal atravessaram o retrofit
 * inteiro assim, invisíveis para o teste. `rotulo` e `titulo` são a convenção
 * do projeto para "isto aparece na tela", então valem a mesma regra do JSX.
 */
test("nenhum rótulo visível cravado em prop de objeto", () => {
  const ROTULO_CRAVADO = /\b(?:rotulo|titulo)\s*:\s*"([^"]*[a-zà-úA-ZÀ-Ú]{3,}[^"]*)"/g;
  const sobras = [];

  for (const [caminho, fonte] of fontes) {
    const rel = relativo(caminho);
    if (!rel.startsWith("panel/src/") || !rel.endsWith(".jsx")) continue;

    for (const achado of fonte.matchAll(ROTULO_CRAVADO)) {
      const texto = achado[1].trim();
      // Guardar a CHAVE no campo `rotulo` e resolver na hora de desenhar é o
      // padrão certo, não uma sobra. É o que o painel faz nas listas de opção.
      if (FORMATO_DE_CHAVE.test(texto)) continue;
      if (!ehTextoDeTela(texto)) continue;
      sobras.push(`${rel}: rótulo "${texto}"`);
    }
  }

  assert.deepEqual(sobras.sort(), [], `${sobras.length} rótulo(s) de tela ainda cravado(s) em prop`);
});

// ----------------------------------------------------- limite do HUD

test("rótulo de presente do HUD cabe em 8 caracteres nos três idiomas", () => {
  // A regra é do docs/02_DESIGN_SYSTEM: rótulo curto é o que faz o HUD ler num
  // vídeo vertical comprimido de 6 polegadas. Tradução longa quebra a tela do
  // espectador, não a do streamer — e ninguém percebe até estar ao vivo.
  const estourou = [];

  for (const idioma of IDIOMAS) {
    for (const [chave, texto] of Object.entries(catalogos[idioma].chaves)) {
      if (!chave.startsWith("hud.giftLabel.")) continue;
      if (texto.length > 8) estourou.push(`${idioma}: ${chave} = "${texto}" (${texto.length} caracteres)`);
    }
  }

  assert.deepEqual(estourou, [], `rótulo de presente acima de 8 caracteres: ${estourou.join("; ")}`);
});

// -------------------------------------------------- BUG-008: o provider

/**
 * O idioma inicial é calculado UMA vez, e o módulo espelha o ESTADO.
 *
 * O BUG-008 nasceu do contrário disso: `inicial` era recalculado no corpo do
 * componente, que roda a cada render, e o módulo era sincronizado com ele. Logo
 * depois de trocar para espanhol, o render seguinte recalculava `inicial` a
 * partir de `navigator.language` — ainda "pt" — e devolvia tudo para português.
 *
 * O sintoma era cruel: o botão do idioma ficava marcado (estado do React mudou)
 * e a tela inteira continuava em português (o módulo tinha voltado).
 *
 * **Os 504 testes da suíte passavam.** Todos são estáticos: paridade de chave,
 * chave órfã, chave morta, string cravada. Nenhum renderiza. O bug só apareceu
 * ao abrir o painel no navegador, no F0-3 — e por isso este teste existe.
 */
test("o idioma inicial é calculado uma vez, e o módulo espelha o estado", async () => {
  const provider = await readFile(
    path.join(RAIZ, "panel", "src", "i18n", "TraducaoProvider.jsx"),
    "utf8",
  );

  // O cálculo do inicial precisa estar DENTRO do inicializador preguiçoso.
  assert.match(
    provider,
    /useState\(\(\)\s*=>\s*\n?\s*normalizarIdioma\(idiomaGravado \?\? idiomaDoNavegador\(\)\)/,
    "calcular o inicial fora do useState(() => …) faz ele rodar a cada render — é o BUG-008",
  );

  // E o espelho tem que comparar com o ESTADO, nunca com um valor recalculado.
  assert.match(
    provider,
    /if \(idiomaAtivo\(\) !== idioma\) definirIdioma\(idioma\)/,
    "o módulo espelha o estado; espelhar um `inicial` recalculado é o BUG-008 de volta",
  );

  // A forma exata que causou o bug não pode reaparecer.
  assert.ok(
    !/const inicial = normalizarIdioma/.test(provider),
    "`const inicial` no corpo do componente é a linha que causou o BUG-008",
  );
});

// ------------------------------------------------------- locale do número

/**
 * Nenhum locale cravado fora do formatador.
 *
 * Este é o erro que sobrevive a um retrofit inteiro: a frase fica em inglês e o
 * número continua em `pt-BR`. O streamer americano lê "1.372" como um decimal —
 * mil e trezentos vira um vírgula três — e nada quebra, nada avisa.
 *
 * O único lugar onde o nome de um locale pode aparecer é o mapa de
 * `panel/src/i18n/formatar.js`, que é justamente quem traduz idioma em locale.
 */
test("nenhum locale cravado fora do formatador", () => {
  const LOCALE_CRAVADO = /toLocale\w*\(\s*["'][a-z]{2}-[A-Z]{2}["']/g;
  const sobras = [];

  for (const [caminho, fonte] of fontes) {
    const rel = relativo(caminho);
    if (!rel.startsWith("panel/src/") && !rel.startsWith("bridge/src/")) continue;
    if (rel === "panel/src/i18n/formatar.js") continue;

    for (const achado of fonte.matchAll(LOCALE_CRAVADO)) {
      sobras.push(`${rel}: ${achado[0]}`);
    }
  }

  assert.deepEqual(
    sobras.sort(),
    [],
    `${sobras.length} formatação com locale cravado — use panel/src/i18n/formatar.js`,
  );
});

// ------------------------------------------------------------- gerador

test("o gerador é determinístico e o que está em disco bate com a fonte", async () => {
  const js = montarJs(catalogos);
  const lua = montarLua(catalogos);

  assert.equal(montarJs(catalogos), js, "montarJs mudou entre duas execuções com a mesma fonte");
  assert.equal(montarLua(catalogos), lua, "montarLua mudou entre duas execuções com a mesma fonte");

  const jsEmDisco = await readFile(path.join(RAIZ, "panel", "src", "i18n", "catalogo.js"), "utf8");
  const luaEmDisco = await readFile(path.join(RAIZ, "game", "src", "shared", "textos.lua"), "utf8");

  assert.equal(jsEmDisco, js, "panel/src/i18n/catalogo.js está desatualizado — rode npm run gerar");
  assert.equal(luaEmDisco, lua, "game/src/shared/textos.lua está desatualizado — rode npm run gerar");
});

test("os arquivos gerados avisam que são gerados", async () => {
  for (const alvo of [
    path.join(RAIZ, "panel", "src", "i18n", "catalogo.js"),
    path.join(RAIZ, "game", "src", "shared", "textos.lua"),
  ]) {
    const fonte = await readFile(alvo, "utf8");
    assert.match(fonte, /GERADO por scripts\/gerar-i18n\.mjs/, `${path.basename(alvo)} sem cabeçalho de gerado`);
    assert.match(fonte, /Não editar à mão/, `${path.basename(alvo)} sem o aviso de não editar`);
  }
});

test("o textos.lua gerado passa no parser do subconjunto Lua 5.1", async () => {
  const { acharParser } = await import("../scripts/verificar-luau.mjs");
  const parser = await acharParser();
  if (!parser) return; // sem parser instalado, o gate de sintaxe já avisa por conta própria

  const alvo = path.join(RAIZ, "game", "src", "shared", "textos.lua");
  await executar(parser, ["-p", alvo]);
});

// -------------------------------------------- o contrato do idioma (BUG-001)

test("o campo idioma do painel é o mesmo que o schema de configuração aceita", async () => {
  const { validar } = await criarValidador();
  const schema = await lerJson(caminhoDeDados("schemas", "configuracao.schema.json"));

  // Lado A: os idiomas que o gerador e o catálogo conhecem.
  // Lado B: o que o schema aceita. Divergência aqui é o BUG-001 de novo: o
  // painel manda "es", o schema recusa o objeto INTEIRO, e a configuração
  // simplesmente não salva.
  const doSchema = schema.properties.idioma.oneOf.find((r) => Array.isArray(r.enum))?.enum;
  assert.deepEqual([...doSchema].sort(), [...IDIOMAS].sort(), "o enum do schema não bate com IDIOMAS");

  for (const idioma of IDIOMAS) {
    const problemas = validar("configuracao", { streamerId: "local", idioma });
    assert.deepEqual(problemas, [], `o schema recusou o idioma ${idioma}: ${problemas.join("; ")}`);
  }

  // Configuração legada, sem o campo, continua válida.
  assert.deepEqual(validar("configuracao", { streamerId: "local" }), []);
  // E idioma que não existe é recusado, senão o enum não estaria fazendo nada.
  assert.notDeepEqual(validar("configuracao", { streamerId: "local", idioma: "fr" }), []);
});
