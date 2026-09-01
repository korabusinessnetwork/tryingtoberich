/**
 * O ÚNICO módulo do projeto que importa `fs`. Ver ADR-003.
 *
 * Não existe transação em arquivo JSON, então toda escrita é atômica por
 * temporário + rename: ou o arquivo antigo inteiro, ou o novo inteiro, nunca
 * meio arquivo. Um preset truncado no meio de uma live é dado perdido.
 *
 * Quem chama fala em verbo de domínio (`salvarPreset`), nunca em caminho.
 */

import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

/** Raiz do repositório: bridge/src/repos → ../../.. */
export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const DIR_DADOS = path.join(RAIZ, "data");

export const caminhoDeDados = (...partes) => path.join(DIR_DADOS, ...partes);

export async function garantirDiretorio(dir) {
  await mkdir(dir, { recursive: true });
}

export async function existe(caminho) {
  try {
    await stat(caminho);
    return true;
  } catch {
    return false;
  }
}

export async function lerJson(caminho) {
  return JSON.parse(await readFile(caminho, "utf8"));
}

/** Devolve `padrao` quando o arquivo não existe. Erro de JSON quebrado continua subindo. */
export async function lerJsonOuPadrao(caminho, padrao = null) {
  try {
    return await lerJson(caminho);
  } catch (erro) {
    if (erro.code === "ENOENT") return padrao;
    throw erro;
  }
}

/**
 * Escrita atômica: grava num temporário do MESMO diretório (rename entre
 * sistemas de arquivos não é atômico), força para o disco e renomeia por cima.
 */
export async function escreverJsonAtomico(caminho, dado) {
  const dir = path.dirname(caminho);
  await garantirDiretorio(dir);

  const temporario = path.join(dir, `.${path.basename(caminho)}.${randomBytes(6).toString("hex")}.tmp`);
  const conteudo = `${JSON.stringify(dado, null, 2)}\n`;

  let arquivo;
  try {
    arquivo = await open(temporario, "w");
    await arquivo.writeFile(conteudo, "utf8");
    await arquivo.sync();
  } finally {
    await arquivo?.close();
  }

  try {
    await rename(temporario, caminho);
  } catch (erro) {
    await rm(temporario, { force: true });
    throw erro;
  }
}

/** Escrita atômica de binário. Usada só pelo cache de ícone. */
export async function escreverBinarioAtomico(caminho, buffer) {
  const dir = path.dirname(caminho);
  await garantirDiretorio(dir);
  const temporario = path.join(dir, `.${path.basename(caminho)}.${randomBytes(6).toString("hex")}.tmp`);
  await writeFile(temporario, buffer);
  try {
    await rename(temporario, caminho);
  } catch (erro) {
    await rm(temporario, { force: true });
    throw erro;
  }
}

/** Nomes de arquivo .json de um diretório, sem os temporários. Diretório ausente devolve []. */
export async function listarJson(dir) {
  try {
    return (await readdir(dir))
      .filter((nome) => nome.endsWith(".json") && !nome.startsWith("."))
      .sort();
  } catch (erro) {
    if (erro.code === "ENOENT") return [];
    throw erro;
  }
}

export async function apagar(caminho) {
  await rm(caminho, { force: true });
}

/** Só para o repositório de schemas, que precisa varrer um diretório inteiro. */
export async function lerTodosOsJson(dir) {
  const nomes = await listarJson(dir);
  return Object.fromEntries(await Promise.all(nomes.map(async (nome) => [nome, await lerJson(path.join(dir, nome))])));
}
