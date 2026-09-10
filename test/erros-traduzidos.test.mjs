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
 * ## Os erros que carregam valor
 *
 * Metade deles tem um valor dentro da frase: "Não achei o mapa X", "Preset fora
 * do contrato: Y". Durante um tempo esses 26 ficaram sem tradução, e a lista
 * deles morava aqui como dívida registrada, porque o valor vinha grudado no
 * texto em português e o painel não tinha como remontar a frase.
 *
 * A ponte passou a mandar os valores separados, em `detalhe`, e a dívida virou
 * contrato: agora este arquivo COBRA que cada um tenha chave, e que cada
 * `{parametro}` da chave seja um campo que a ponte realmente manda.
 *
 * A cobrança é pela INTERSEÇÃO dos pontos de lançamento, não pela união. Um
 * mesmo código sai de lugares diferentes do código, e um parâmetro que só
 * existe em um deles apareceria cru na tela, como `{colecao}`, exatamente no
 * outro. Foi por isso que a interseção virou a regra.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { RAIZ, caminhoDeDados, lerJson } from "../bridge/src/repos/arquivo.mjs";
import { emSlug } from "../panel/src/i18n/erro.js";

const pt = (await lerJson(caminhoDeDados("i18n", "pt.json"))).chaves;
const es = (await lerJson(caminhoDeDados("i18n", "es.json"))).chaves;
const en = (await lerJson(caminhoDeDados("i18n", "en.json"))).chaves;

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
/** A chamada inteira, do `ErroDeDominio(` até o parêntese que o fecha. */
function chamadaInteira(fonte, inicio) {
  let profundidade = 0;
  for (let i = inicio; i < fonte.length; i += 1) {
    if (fonte[i] === "(") profundidade += 1;
    else if (fonte[i] === ")") {
      profundidade -= 1;
      if (profundidade === 0) return fonte.slice(inicio, i + 1);
    }
  }
  return fonte.slice(inicio);
}

/**
 * Os campos que a chamada manda em `detalhe`.
 *
 * Lê tanto `{ id, colecao }` quanto `{ presetId: req.params.id }`. O espalhamento
 * (`...detalhe`) é ignorado de propósito: não dá para saber daqui o que ele
 * traz, e chutar transformaria este teste em adivinhação.
 */
function camposDoDetalhe(chamada) {
  const achado = /detalhe:\s*\{([^{}]*)\}/.exec(chamada);
  if (!achado) return /\bdetalhe\b/.test(chamada) ? null : new Set();

  const campos = new Set();
  for (const parte of achado[1].split(",")) {
    const limpo = parte.trim();
    if (!limpo || limpo.startsWith("...")) continue;
    campos.add(limpo.split(":")[0].trim());
  }
  return campos;
}

async function codigosDaPonte() {
  const estaticos = new Map();
  const dinamicos = new Map();

  const padrao = /ErroDeDominio\(\s*"([a-z_]+)"\s*,\s*([`"])([\s\S]*?)\2/g;

  for (const caminho of await fontesDaPonte()) {
    const fonte = await readFile(caminho, "utf8");
    for (const achado of fonte.matchAll(padrao)) {
      const [, codigo, , frase] = achado;
      if (!frase.includes("${")) {
        if (!estaticos.has(codigo)) estaticos.set(codigo, frase.trim());
        continue;
      }

      const campos = camposDoDetalhe(chamadaInteira(fonte, achado.index));
      const anterior = dinamicos.get(codigo);

      // Interseção: parâmetro que só um dos pontos manda apareceria cru no outro.
      const comuns = anterior
        ? new Set([...(anterior.campos ?? [])].filter((c) => campos?.has(c)))
        : (campos ?? new Set());

      dinamicos.set(codigo, {
        frase: anterior?.frase ?? frase.trim(),
        campos: comuns,
        pontos: (anterior?.pontos ?? 0) + 1,
      });
    }
  }

  // Um código pode aparecer nos dois lados: se QUALQUER ocorrência é dinâmica,
  // ele é dinâmico — traduzir sem os valores perderia o miolo naquela ocorrência.
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

test("todo erro com valor na frase também tem tradução", () => {
  // Esta era a dívida registrada do retrofit de i18n: 26 erros que chegavam em
  // português para quem usa o painel em inglês. Agora é contrato.
  assert.ok(dinamicos.size > 0, "se não há mais erro dinâmico, esta decisão pode ser revisitada");

  const semTraducao = [...dinamicos.keys()]
    .filter((codigo) => pt[`panel.error.${emSlug(codigo)}`] === undefined)
    .sort();

  assert.deepEqual(
    semTraducao,
    [],
    `${semTraducao.length} erro(s) com valor na frase sem chave panel.error.*: ` +
      `aparecem em português para quem usa o painel em outro idioma — ${semTraducao.join(", ")}`,
  );
});

test("todo erro com valor na frase manda o valor separado, em detalhe", () => {
  // Sem `detalhe`, a chave traduzida APAGA o valor: "Não achei o mapa" sem
  // dizer qual mapa é pior que a frase em português, porque some a informação
  // que resolve o problema.
  const semDetalhe = [...dinamicos]
    .filter(([, dado]) => dado.campos === null || dado.campos.size === 0)
    .map(([codigo]) => codigo)
    .sort();

  // `gemini_indisponivel` é o único cuja frase traduzida não usa parâmetro: os
  // dois pontos de lançamento contam coisas diferentes (status HTTP num,
  // tentativas no outro) e nenhuma delas muda o que o streamer faz.
  const aceitos = new Set(["gemini_indisponivel"]);
  const faltando = semDetalhe.filter((codigo) => !aceitos.has(codigo));

  assert.deepEqual(faltando, [], `erro com valor na frase e sem detalhe: ${faltando.join(", ")}`);
});

test("os parâmetros da tradução são os campos que a ponte manda, nos TRÊS idiomas", () => {
  // O acordo é: `{mapaId}` na chave só funciona se a ponte mandar `mapaId` no
  // detalhe. Errar o nome não quebra nada em teste de unidade e nem no build:
  // aparece um `{mapaId}` cru na tela do streamer, em produção.
  const catalogos = { pt, es, en };
  const quebrados = [];

  for (const [codigo, dado] of dinamicos) {
    const chave = `panel.error.${emSlug(codigo)}`;

    for (const [idioma, catalogo] of Object.entries(catalogos)) {
      const texto = catalogo[chave];
      if (texto === undefined) continue;

      for (const [, parametro] of texto.matchAll(/\{(\w+)\}/g)) {
        if (dado.campos === null) {
          quebrados.push(`${chave} (${idioma}) usa {${parametro}}, mas não dá para saber o que a ponte manda`);
        } else if (!dado.campos.has(parametro)) {
          const manda = [...dado.campos].join(", ") || "nada";
          quebrados.push(
            `${chave} (${idioma}) usa {${parametro}}, mas a ponte manda ${manda}` +
              (dado.pontos > 1 ? ` em TODOS os ${dado.pontos} pontos onde lança ${codigo}` : ""),
          );
        }
      }
    }
  }

  assert.deepEqual(quebrados, [], `parâmetro sem valor correspondente:\n  ${quebrados.join("\n  ")}`);
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
