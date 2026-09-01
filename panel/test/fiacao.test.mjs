/**
 * A fiação do App contra os componentes.
 *
 * Os 11 componentes do painel foram escritos por 6 agentes em paralelo, cada um
 * dono dos seus arquivos, e o App foi fiado depois. Prop com nome errado não
 * quebra build nem teste: ela chega `undefined`, o componente renderiza o
 * estado vazio, e parece que a ponte não mandou dado. É o mesmo risco que
 * `sessao.lua` tem no jogo, e a defesa é a mesma — checar por fora.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PAINEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPONENTES = path.join(PAINEL, "src", "components");

const lerComponente = (nome) => readFile(path.join(COMPONENTES, nome), "utf8");

/** Os nomes que o componente desestrutura em `export function Nome({ ... })`. */
function propsAceitas(fonte, nome) {
  const inicio = fonte.indexOf(`export function ${nome}(`);
  if (inicio === -1) return null;

  const abre = fonte.indexOf("{", inicio);
  const fecha = fonte.indexOf("})", abre);
  if (abre === -1 || fecha === -1) return null;

  return new Set(
    fonte
      .slice(abre + 1, fecha)
      .split(",")
      .map((parte) => parte.split("=")[0].trim())
      .filter((nomeProp) => /^[A-Za-zÀ-ÿ_][\w]*$/.test(nomeProp)),
  );
}

/** Os nomes que o App passa em `<Nome prop={...} ...>`. */
function propsPassadas(app, nome) {
  const abre = app.indexOf(`<${nome}`);
  if (abre === -1) return null;
  const fecha = app.indexOf("/>", abre);
  const trecho = app.slice(abre, fecha === -1 ? app.indexOf(">", abre) : fecha);
  return new Set([...trecho.matchAll(/^\s*([a-zA-ZÀ-ÿ][\w]*)=/gm)].map((m) => m[1]));
}

test("todo componente do painel é montado por alguém", async () => {
  // Por ALGUÉM, não pelo App: composição é o esperado. O EditorDePreset monta
  // os cartões de slot, e o cartão monta o aviso de curva. O que este teste
  // proíbe é componente que ninguém monta — código morto que passa no build.
  const arquivos = (await readdir(COMPONENTES)).filter((f) => f.endsWith(".jsx"));
  assert.equal(arquivos.length, 11, "o 06_COMPONENTES lista 11 componentes");

  const app = await readFile(path.join(PAINEL, "src", "App.jsx"), "utf8");
  const fontes = await Promise.all(arquivos.map(lerComponente));
  const tudo = [app, ...fontes].join("\n");

  const soltos = arquivos
    .map((f) => f.replace(".jsx", ""))
    .filter((nome) => !new RegExp(`<${nome}[\\s/>]`).test(tudo));

  assert.deepEqual(soltos, []);
});

test("o aviso de curva é o componente dedicado, não uma cópia inline", async () => {
  // Dois agentes escreveram o mesmo aviso contra a mesma spec sem saber um do
  // outro: o CartaoDeSlot desenhava inline e o AvisoDeCurva ficava sem uso.
  // Paralelismo não gera conflito de escrita, gera duplicação silenciosa.
  const cartao = await lerComponente("CartaoDeSlot.jsx");
  assert.ok(cartao.includes("<AvisoDeCurva"), "o cartão monta o componente dedicado");

  const css = await readFile(path.join(COMPONENTES, "CartaoDeSlot.css"), "utf8");
  assert.equal(
    /\.cartao-slot-aviso\s*\{/.test(css),
    false,
    "o estilo do aviso mora em AvisoDeCurva.css, num lugar só",
  );
});

test("toda prop que o App passa existe no componente que a recebe", async () => {
  const app = await readFile(path.join(PAINEL, "src", "App.jsx"), "utf8");
  const arquivos = (await readdir(COMPONENTES)).filter((f) => f.endsWith(".jsx"));

  const desconhecidas = [];
  for (const arquivo of arquivos) {
    const nome = arquivo.replace(".jsx", "");
    const passadas = propsPassadas(app, nome);
    if (!passadas) continue;

    const aceitas = propsAceitas(await lerComponente(arquivo), nome);
    assert.ok(aceitas, `não consegui ler a assinatura de ${nome}`);

    for (const prop of passadas) {
      if (!aceitas.has(prop)) desconhecidas.push(`${nome}.${prop}`);
    }
  }

  assert.deepEqual(desconhecidas, [], "prop com nome errado chega undefined e vira estado vazio silencioso");
});

test("a checagem de prop morde de verdade", () => {
  // Guarda que nunca acusa passa sempre, e este projeto já foi mordido duas
  // vezes por isso.
  const fonteFalsa = "export function Falso({ certo, outro }) {\n  return null;\n}\n";
  const appFalso = '  <Falso\n    certo={1}\n    errado={2}\n  />\n';

  const aceitas = propsAceitas(fonteFalsa, "Falso");
  const passadas = propsPassadas(appFalso, "Falso");

  assert.deepEqual([...passadas].filter((p) => !aceitas.has(p)), ["errado"]);
});
