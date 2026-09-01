/**
 * A busca dos binários que o botão "Abrir no Studio" precisa.
 *
 * Testado porque é exatamente onde o Windows morde: `spawn` sem shell não
 * resolve `.cmd`, e foi assim que o gate do painel morria com ENOENT. Se a
 * busca só olhasse `rojo` sem extensão, o botão diria "Rojo ausente" numa
 * máquina que tem o Rojo instalado.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { acharRojo, acharStudio } from "../src/roblox/estudio.mjs";

async function comPasta(corpo) {
  const pasta = await mkdtemp(path.join(os.tmpdir(), "kora-estudio-"));
  try {
    return await corpo(pasta);
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

test("acha o rojo pela extensão .cmd, que é como ele chega no Windows", async () => {
  await comPasta(async (pasta) => {
    await writeFile(path.join(pasta, "rojo.cmd"), "");
    assert.equal(acharRojo(pasta, "win32"), path.join(pasta, "rojo.cmd"));
  });
});

test("no Linux procura só o nome nu, sem inventar extensão do Windows", async () => {
  await comPasta(async (pasta) => {
    await writeFile(path.join(pasta, "rojo.cmd"), "");
    assert.equal(acharRojo(pasta, "linux"), null, ".cmd não é executável fora do Windows");

    await writeFile(path.join(pasta, "rojo"), "");
    assert.equal(acharRojo(pasta, "linux"), path.join(pasta, "rojo"));
  });
});

test("PATH sem rojo devolve null, e é isso que vira o recado de instalar", () => {
  assert.equal(acharRojo("", "win32"), null);
});

test("acha o Studio dentro de uma versão instalada do Roblox", async () => {
  await comPasta(async (pasta) => {
    const versao = path.join(pasta, "Roblox", "Versions", "version-abc");
    await mkdir(versao, { recursive: true });
    await writeFile(path.join(versao, "RobloxStudioBeta.exe"), "");

    assert.equal(acharStudio(pasta), path.join(versao, "RobloxStudioBeta.exe"));
  });
});

test("instalação só com o Player não passa por Studio", async () => {
  await comPasta(async (pasta) => {
    const versao = path.join(pasta, "Roblox", "Versions", "version-só-player");
    await mkdir(versao, { recursive: true });
    await writeFile(path.join(versao, "RobloxPlayerBeta.exe"), "");

    assert.equal(acharStudio(pasta), null, "o Player não edita o lugar; dizer que achou seria mentir");
  });
});

test("sem Roblox instalado não estoura, devolve null", () => {
  assert.equal(acharStudio(path.join(os.tmpdir(), "kora-nao-existe-mesmo")), null);
  // String vazia, não `undefined`: undefined cai no parâmetro padrão e vai ler
  // o LOCALAPPDATA de verdade da máquina, que numa máquina com Studio acha.
  assert.equal(acharStudio(""), null);
});
