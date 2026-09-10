/**
 * O contrato de erro entre a ponte e o painel, nos dois lados.
 *
 * A ponte responde `{ erro: "<codigo>", mensagem: "<frase>" }` e o painel
 * traduz pelo CÓDIGO (`panel/src/i18n/erro.js`). Isso só funciona enquanto os
 * dois lados concordarem sobre quais códigos existem — e é exatamente o tipo de
 * acordo que apodrece em silêncio: um `ErroDeDominio` novo na ponte, sem chave
 * no catálogo, aparece em português na tela de um streamer inglês, e nada
 * quebra.
 *
 * É a lição do BUG-001: contrato entre processos só é contrato se algum teste
 * ler os DOIS lados.
 *
 * ## A metade que ficou de fora, e por quê
 *
 * Metade dos erros carrega um VALOR dentro da frase — `Não achei o mapa
 * "{id}"`, `Preset fora do contrato: {problemas}`. O valor não viaja separado
 * do texto no corpo da resposta, então o painel não tem como remontar a frase
 * em outro idioma.
 *
 * Eles continuam chegando em português. A lista abaixo existe para que isso
 * seja uma decisão registrada, e não um esquecimento: traduzi-los exige a ponte
 * mandar `detalhe` estruturado, que é mudança de contrato e rodada própria.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { RAIZ, caminhoDeDados, lerJson } from "../bridge/src/repos/arquivo.mjs";
import { emSlug } from "../panel/src/i18n/erro.js";

const pt = (await lerJson(caminhoDeDados("i18n", "pt.json"))).chaves;

/** Todo arquivo `.mjs` da ponte, para varrer os erros de domínio. */
async function fontesDaPonte(dir = path.join(RAIZ, "bridge", "src")) {
  const achados = [];
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) achados.push(...(await fontesDaPonte(completo)));
    else if (entrada.name.endsWith(".mjs")) achados.push(completo);
  }
  return achados;
}

/**
 * Os códigos que a ponte pode responder, separados por poderem ou não ser
 * traduzidos só pelo código.
 *
 * `${` na frase significa valor interpolado: a frase muda a cada ocorrência, e
 * o código sozinho não a reconstrói.
 */
async function codigosDaPonte() {
  const estaticos = new Map();
  const dinamicos = new Map();

  const padrao = /ErroDeDominio\(\s*"([a-z_]+)"\s*,\s*([`"])([\s\S]*?)\2/g;

  for (const caminho of await fontesDaPonte()) {
    const fonte = await readFile(caminho, "utf8");
    for (const achado of fonte.matchAll(padrao)) {
      const [, codigo, , frase] = achado;
      const alvo = frase.includes("${") ? dinamicos : estaticos;
      if (!alvo.has(codigo)) alvo.set(codigo, frase.trim());
    }
  }

  // Um código pode aparecer nos dois lados: se QUALQUER ocorrência é dinâmica,
  // ele é dinâmico — traduzir pelo código perderia o valor naquela ocorrência.
  for (const codigo of dinamicos.keys()) estaticos.delete(codigo);

  return { estaticos, dinamicos };
}

const { estaticos, dinamicos } = await codigosDaPonte();

test("a ponte tem erros de domínio para varrer", () => {
  // Se a varredura parar de achar nada — mudança de padrão, refactor —, os dois
  // testes abaixo passariam vazios e ninguém saberia.
  assert.ok(estaticos.size + dinamicos.size >= 40, `achei só ${estaticos.size + dinamicos.size} códigos`);
  assert.ok(estaticos.size >= 20, `achei só ${estaticos.size} códigos estáticos`);
});

test("todo erro de frase FIXA da ponte tem tradução no painel", () => {
  const semTraducao = [...estaticos.keys()]
    .filter((codigo) => pt[`panel.error.${emSlug(codigo)}`] === undefined)
    .sort();

  assert.deepEqual(
    semTraducao,
    [],
    `${semTraducao.length} código(s) sem chave panel.error.*: aparecem em português ` +
      `para quem usa o painel em outro idioma — ${semTraducao.join(", ")}`,
  );
});

test("a tradução diz a MESMA coisa que a ponte diz", () => {
  // A chave em português tem que ser a frase da ponte. Divergir aqui cria duas
  // verdades sobre o mesmo erro: a do log, que vem da ponte, e a da tela.
  const divergentes = [];

  for (const [codigo, frase] of estaticos) {
    const traduzida = pt[`panel.error.${emSlug(codigo)}`];
    if (traduzida === undefined) continue;

    // A frase da ponte é a íntegra; a do catálogo pode ser o começo dela,
    // porque algumas trazem instrução de ambiente que não cabe num aviso.
    const começo = frase.slice(0, 40);
    if (!frase.startsWith(traduzida.slice(0, 40)) && !traduzida.startsWith(começo)) {
      divergentes.push(`${codigo}:\n     ponte:    ${frase.slice(0, 70)}\n     catálogo: ${traduzida.slice(0, 70)}`);
    }
  }

  assert.deepEqual(divergentes, [], `tradução em PT diferente da frase da ponte:\n  ${divergentes.join("\n  ")}`);
});

test("os erros com valor na frase continuam sem tradução, e isso é registrado", () => {
  // Este teste não cobra tradução — ele cobra que a lista seja conhecida. Se um
  // dinâmico ganhar chave, ótimo, mas aí a chave precisa de parâmetro e este
  // teste vira o lugar de decidir isso.
  assert.ok(dinamicos.size > 0, "se não há mais erro dinâmico, esta decisão pode ser revisitada");

  const traduzidosPorEngano = [...dinamicos.keys()]
    .filter((codigo) => pt[`panel.error.${emSlug(codigo)}`] !== undefined)
    .sort();

  assert.deepEqual(
    traduzidosPorEngano,
    [],
    `código com valor na frase ganhou chave fixa — a tradução vai APAGAR o valor ` +
      `(o id, o motivo, a lista de problemas): ${traduzidosPorEngano.join(", ")}`,
  );
});

test("o painel traduz pelo código e cai na frase da ponte quando não conhece", async () => {
  const fonte = await readFile(path.join(RAIZ, "panel", "src", "i18n", "erro.js"), "utf8");

  assert.match(
    fonte,
    /PREFIXO\}\$\{emSlug\(codigo\)\}/,
    "a chave é montada a partir do código da ponte, convertido pelo MESMO emSlug que este teste usa",
  );
  assert.match(
    fonte,
    /traduzida === chave \? original : traduzida/,
    "chave ausente devolve a frase da ponte — melhor que uma mensagem genérica",
  );

  const app = await readFile(path.join(RAIZ, "panel", "src", "App.jsx"), "utf8");
  assert.match(app, /mensagemDoErro\(falha/, "o executar central precisa passar por aqui");
});
