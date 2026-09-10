/**
 * O catálogo de texturas de efeito (`game/src/shared/texturas.lua`).
 *
 * As 32 animações fazem geometria, hélice, onda, tremor e esteira, e nenhuma
 * usa textura: partícula, feixe e trilha saem no visual padrão do Roblox. É a
 * última coisa grande que falta para elas lerem como impacto de anime em vez de
 * efeito de engine.
 *
 * O catálogo é o encaixe. Ele está vazio de propósito, e é justamente por isso
 * que precisa de teste: **um arquivo cheio de string vazia é fácil de virar
 * lixo esquecido**, e mais fácil ainda de alguém contornar cravando um
 * `rbxassetid` no meio de um módulo de animação. É esse contorno que este
 * arquivo impede.
 *
 * O teste roda em Node lendo o Luau como texto. Luau de verdade só roda no
 * Studio, e o que aqui importa é acordo entre arquivos, não comportamento em
 * tempo de execução.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { RAIZ, listarArquivosRecursivo } from "../bridge/src/repos/arquivo.mjs";

const DIR_ANIMACOES = path.join(RAIZ, "game", "src", "animacoes");
const CAMINHO_CATALOGO = path.join(RAIZ, "game", "src", "shared", "texturas.lua");

const catalogo = await readFile(CAMINHO_CATALOGO, "utf8");

async function modulosDeAnimacao() {
  const nomes = await listarArquivosRecursivo(DIR_ANIMACOES);
  return nomes.filter((nome) => nome.endsWith(".lua"));
}

/** Os nomes que o catálogo conhece, lidos do próprio Luau. */
function nomesDoCatalogo(fonte) {
  const bloco = /local CATALOGO = \{([\s\S]*?)\n\}/.exec(fonte);
  if (!bloco) return [];
  return [...bloco[1].matchAll(/^\s*(\w+)\s*=/gm)].map((m) => m[1]);
}

test("o catálogo existe e tem nome de domínio, não nome de arquivo", () => {
  const nomes = nomesDoCatalogo(catalogo);

  assert.ok(nomes.length >= 10, `achei só ${nomes.length} nomes no catálogo`);
  for (const nome of ["faisca", "chama", "fumaca", "corte", "anel"]) {
    assert.ok(nomes.includes(nome), `falta o nome "${nome}", que é vocabulário de efeito`);
  }
});

test("nenhuma animação crava um id de asset, todas passam pelo catálogo", async () => {
  //[[ Este é o teste que dá razão de existir ao catálogo.
  //
  // Textura no Roblox é asset com upload e moderação (ADR-004), e o mesmo id
  // serve a várias animações. Cravar o número no módulo significa que trocar
  // uma sprite reprovada vira caçada em 32 arquivos, e que ninguém consegue
  // dizer quais texturas o jogo usa. ]]
  const cravaram = [];

  for (const nome of await modulosDeAnimacao()) {
    const fonte = await readFile(path.join(DIR_ANIMACOES, nome), "utf8");
    if (/rbxassetid:\/\/\d/.test(fonte)) cravaram.push(nome);
  }

  assert.deepEqual(
    cravaram,
    [],
    `animação com id de asset cravado, em vez de pedir pelo nome ao catálogo: ${cravaram.join(", ")}`,
  );
});

test("toda textura pedida por uma animação existe no catálogo", async () => {
  // Pedir um nome que o catálogo não conhece não quebra o jogo, porque
  // `Texturas.de` devolve vazio. Quebra a expectativa de quem escreveu o
  // efeito: ele acha que pediu faísca e recebe borrão, e nada avisa.
  const nomes = new Set(nomesDoCatalogo(catalogo));
  const desconhecidas = [];

  for (const arquivo of await modulosDeAnimacao()) {
    const fonte = await readFile(path.join(DIR_ANIMACOES, arquivo), "utf8");
    for (const [, pedida] of fonte.matchAll(/textura\s*=\s*"(\w+)"/g)) {
      if (!nomes.has(pedida)) desconhecidas.push(`${arquivo} pede "${pedida}"`);
    }
  }

  assert.deepEqual(desconhecidas, [], `textura pedida que o catálogo não conhece:\n  ${desconhecidas.join("\n  ")}`);
});

test("o catálogo nasce vazio, e isso é estado inicial e não pendência", () => {
  // Se um dia alguém preencher, este teste vira o lugar de decidir se as
  // animações que somam camadas por falta de sprite podem ser simplificadas.
  const preenchidas = [...catalogo.matchAll(/^\s*\w+ = "(.*)"/gm)]
    .map((m) => m[1])
    .filter((id) => id !== "");

  for (const id of preenchidas) {
    assert.match(id, /^rbxassetid:\/\/\d+$/, `id fora do formato do Roblox: ${id}`);
  }
});

test("o resolvedor de textura não vaza a chave `textura` para a engine", async () => {
  // `textura` é vocabulário nosso; o Roblox conhece `Texture`. Deixar a chave
  // passar faria a engine receber uma propriedade que não existe, e no Roblox
  // isso é erro em tempo de execução, engolido pelo `executarSeguro`: o efeito
  // inteiro some sem ninguém saber por quê.
  const efeitos = await readFile(path.join(RAIZ, "game", "src", "shared", "efeitos.lua"), "utf8");

  assert.match(efeitos, /local function resolverTextura\(props\)/);
  assert.match(efeitos, /if chave ~= "textura" then/, "a chave nossa tem que ser removida da cópia");
  assert.match(efeitos, /copia\.Texture = Texturas\.de\(props\.textura\)/);

  for (const primitiva of ["particula", "trilha", "feixe"]) {
    const corpo = new RegExp(`function Efeitos\\.${primitiva}\\([\\s\\S]{0,400}?resolverTextura\\(props\\)`);
    assert.match(efeitos, corpo, `${primitiva} precisa resolver a textura antes de aplicar as props`);
  }
});
