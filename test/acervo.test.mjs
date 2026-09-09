/**
 * O acervo, no que o schema não alcança (F0-1, `specs/f0-1-acervo-ja-esta-pronto.md`).
 *
 * O schema já faz o pesado: exige `status` e `assetId`, e exige as SEIS faces
 * quando um skybox tem `faces`. O que ele não consegue ver é **repetição**.
 *
 * E repetição é provável aqui, não teórica: montar o acervo é copiar 60 e tantos
 * números da interface do Roblox, um a um, à mão. Dois iguais deixam dois céus
 * idênticos com nomes diferentes, ou uma face pintada com a imagem de outra — e
 * nada reclama. O mapa vai ao ar, o schema aprova, e o sintoma é visual, no meio
 * de uma live. É a lição do BUG-001: `status: "aprovado"` é campo, não prova.
 *
 * ## Por que estes testes leem o git, e não o arquivo de trabalho
 *
 * `bridge/test/painel-novo.test.mjs` exercita a rota que EDITA o acervo, e para
 * isso escreve em `data/acervo.json` de verdade, restaurando no fim. Os arquivos
 * de teste rodam em paralelo: ler o arquivo de trabalho aqui faz estes testes
 * caírem quando calham de rodar dentro daquela janela — o que aconteceu em 1 de
 * cada 3 execuções antes desta mudança.
 *
 * Ler `HEAD` resolve, e é o alvo certo: o que se está afirmando é que **o acervo
 * que o projeto ENTREGA é coerente**, não o estado instantâneo de um arquivo que
 * outro teste está mexendo de propósito.
 *
 * O preço: uma edição ainda não commitada só é checada no commit seguinte. É
 * aceitável — `npm test` roda antes de commitar (CLAUDE.md), então a checagem
 * acontece antes de o estado errado virar história.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { RAIZ } from "../bridge/src/repos/arquivo.mjs";

const executar = promisify(execFile);

const { stdout } = await executar("git", ["show", "HEAD:data/acervo.json"], {
  cwd: RAIZ,
  maxBuffer: 8 * 1024 * 1024,
});
const acervo = JSON.parse(stdout);

const COLECOES_COM_UPLOAD = ["skybox", "texturas"];
const FACES = ["ft", "bk", "lf", "rt", "up", "dn"];

test("nenhum assetId principal se repete entre itens do acervo", () => {
  const onde = new Map();

  for (const colecao of COLECOES_COM_UPLOAD) {
    for (const item of acervo[colecao] ?? []) {
      if (item.assetId === null || item.assetId === undefined) continue;
      const chave = String(item.assetId);
      if (!onde.has(chave)) onde.set(chave, []);
      onde.get(chave).push(`${colecao}/${item.id}`);
    }
  }

  const repetidos = [...onde.entries()]
    .filter(([, itens]) => itens.length > 1)
    .map(([assetId, itens]) => `${assetId} em ${itens.join(" e ")}`)
    .sort();

  assert.deepEqual(
    repetidos,
    [],
    `assetId repetido: dois itens diferentes com a MESMA imagem, e nada na tela avisa — ${repetidos.join("; ")}`,
  );
});

test("as seis faces de um mesmo skybox são seis imagens diferentes", () => {
  // Duas faces iguais é o erro de colar na linha errada. O céu fica com a mesma
  // parede em dois lados, o que só aparece quando o streamer vira a câmera —
  // ao vivo.
  const problemas = [];

  for (const item of acervo.skybox ?? []) {
    if (!item.faces) continue; // sem `faces` = uma imagem única nas seis, legítimo

    const porId = new Map();
    for (const face of FACES) {
      const id = String(item.faces[face]);
      if (!porId.has(id)) porId.set(id, []);
      porId.get(id).push(face);
    }

    for (const [id, faces] of porId) {
      if (faces.length > 1) problemas.push(`${item.id}: ${faces.join(" e ")} usam o mesmo ${id}`);
    }
  }

  assert.deepEqual(problemas.sort(), [], `face repetida dentro do mesmo skybox: ${problemas.join("; ")}`);
});

test("props são nativos e por isso NÃO têm status nem assetId", () => {
  // O outro lado da moeda: se um prop ganhar `status`, alguém o tratou como
  // imagem e vai ficar esperando uma moderação que nunca vem (ADR-004).
  const errados = (acervo.props ?? [])
    .filter((prop) => "status" in prop || "assetId" in prop)
    .map((prop) => prop.id);

  assert.deepEqual(errados, [], `prop com campo de upload: ${errados.join(", ")}`);
});

test("todo item aprovado tem assetId", () => {
  // A metade que o sistema garante: `anotarItemDoAcervo` recusa aprovar sem
  // número, com uma mensagem boa. O teste existe para o caso de alguém editar o
  // JSON à mão, que é como o acervo foi montado.
  //
  // A recíproca — "todo item com assetId está aprovado" — NÃO é afirmada aqui,
  // e não é engano: ter o número e ainda estar `em-moderacao` é exatamente o
  // estado de quem enviou e está esperando o Roblox responder.
  const semNumero = [];

  for (const colecao of COLECOES_COM_UPLOAD) {
    for (const item of acervo[colecao] ?? []) {
      if (item.status === "aprovado" && (item.assetId === null || item.assetId === undefined)) {
        semNumero.push(`${colecao}/${item.id}`);
      }
    }
  }

  assert.deepEqual(semNumero.sort(), [], `aprovado sem assetId: ${semNumero.join(", ")}`);
});
