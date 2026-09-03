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
  assert.equal(arquivos.length, 26, "o 06_COMPONENTES lista os 26 componentes do painel");

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
    // Sem prop nenhuma não há o que conferir — e exigir uma assinatura
    // desestruturada de um componente que não recebe nada (`PainelDeOverlay`
    // busca os próprios dados) seria cobrar do componente um limite do parser.
    if (!passadas || passadas.size === 0) continue;

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

test("a galeria do acervo mostra a FOTO de cada peça, servida pela ponte", async () => {
  //[[ "textura_pedra_musgo" e "textura_areia_compacta" são dois nomes; olhando,
  // são duas coisas. Sem a imagem, escolher o que vai no mapa era ler etiqueta
  // e torcer — e as texturas são desenhadas em código, então nem existe arquivo
  // para abrir e conferir. ]]
  const painel = await readFile(path.join(COMPONENTES, "PainelDeAcervo.jsx"), "utf8");

  assert.match(painel, /acervo-item-foto/, "falta a foto na linha do acervo");
  assert.match(
    painel,
    /\/api\/acervo\/imagem\/\$\{colecao\}\//,
    "a foto tem que vir da ponte, que é quem sabe desenhar a peça",
  );
  assert.match(painel, /loading="lazy"/, "22 imagens de uma vez sem lazy travam a abertura da página");

  // E o componente nunca monta caminho de rota à mão para DADO — só para
  // imagem, que é `src` e não `fetch`. A regra de `lib/api.js` continua de pé.
  assert.ok(!/fetch\(/.test(painel), "componente não chama fetch: quem fala com a ponte é lib/api.js");
});

test("o montador de mundo distingue 'vazio' de 'ainda não escolhi'", async () => {
  //[[ Bug real: `escolhidas.length > 0 ? escolhidas : doMapa` fazia tirar a
  // ÚLTIMA textura cair de volta na lista do mapa — o clique parecia não ter
  // feito nada, e não havia como chegar em zero para o botão avisar o que
  // falta. São dois estados diferentes e precisam de duas variáveis. ]]
  const fonte = await readFile(path.join(COMPONENTES, "SeletorDeMundo.jsx"), "utf8");

  assert.match(fonte, /const \[mexeu, definirMexeu\]/, "falta a marca de 'o streamer já escolheu'");
  assert.match(fonte, /mexeu \? escolhidas : doMapa/, "a lista vazia tem que valer depois do primeiro toque");

  //[[ E o formato tem que vir do mapa no ar: sem isto a tela mostrava "Escada"
  // num mundo de passarela, e montar o convertia sem ninguém ter pedido. ]]
  assert.match(
    fonte,
    /formato \?\? mapa\?\.plataformas\?\.formato/,
    "o formato do mundo no ar tem que semear a tela",
  );
});
