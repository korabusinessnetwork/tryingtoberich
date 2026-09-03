/**
 * O ÚNICO módulo do projeto que importa `fs`. Ver ADR-003.
 *
 * Não existe transação em arquivo JSON, então toda escrita é atômica por
 * temporário + rename: ou o arquivo antigo inteiro, ou o novo inteiro, nunca
 * meio arquivo. Um preset truncado no meio de uma live é dado perdido.
 *
 * Quem chama fala em verbo de domínio (`salvarPreset`), nunca em caminho.
 */

import { createReadStream } from "node:fs";
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
 * Códigos que no Windows significam "tenta de novo daqui a pouco", não "falhou".
 *
 * O `rename` do POSIX sobre um destino existente é atômico e não briga com
 * ninguém. No Windows ele falha com EPERM/EACCES/EBUSY se QUALQUER handle
 * estiver aberto no destino naquele instante — e isso acontece o tempo todo:
 * duas escritas concorrentes no mesmo arquivo, o indexador, o antivírus, e
 * principalmente o sincronizador do OneDrive, que abre o arquivo assim que
 * percebe a mudança. Este repositório vive dentro do OneDrive.
 */
const TRANSITORIOS = new Set(["EPERM", "EACCES", "EBUSY"]);

/** Espera crescente, somando ~1,6s no pior caso. */
const ESPERAS_MS = [1, 2, 5, 10, 25, 50, 100, 200, 400, 800];

/**
 * Renomeia, insistindo enquanto o erro for transitório.
 *
 * Insistir é seguro aqui porque o rename é a ÚLTIMA etapa: o conteúdo já está
 * inteiro no temporário e já foi para o disco. Enquanto esta função tenta, o
 * arquivo de destino continua sendo a versão anterior, íntegra — nunca meio
 * arquivo. E nada disto está no caminho crítico do presente: escrita em disco é
 * fire-and-forget por regra (CLAUDE.md, Princípio nº1).
 */
async function renomearComRetentativa(de, para) {
  for (let tentativa = 0; ; tentativa += 1) {
    try {
      return await rename(de, para);
    } catch (erro) {
      if (!TRANSITORIOS.has(erro.code) || tentativa >= ESPERAS_MS.length) throw erro;
      await new Promise((seguir) => setTimeout(seguir, ESPERAS_MS[tentativa]));
    }
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
    await renomearComRetentativa(temporario, caminho);
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
    await renomearComRetentativa(temporario, caminho);
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

/**
 * Lê um arquivo cru, sem interpretar.
 *
 * Imagem do acervo não é JSON e não tem schema: é o PNG que o streamer pôs em
 * disco. Passa por aqui pelo mesmo motivo que todo o resto (ADR-003) — acesso a
 * arquivo mora num diretório só.
 */
export async function lerBinario(caminho) {
  return readFile(caminho);
}

/**
 * Abre um arquivo grande para servir por HTTP, em pedaços.
 *
 * Vídeo não cabe em memória e o navegador o pede por faixa (`Range`), então
 * quem serve precisa de um stream e do tamanho. Mora aqui pelo ADR-003: o
 * `createReadStream` é acesso a arquivo como qualquer outro, e concentrar isso
 * num diretório só é o que permite trocar disco por outra coisa na Fase 3 sem
 * caçar `fs` espalhado pela ponte.
 *
 * Devolve `null` quando o arquivo não existe — quem chama responde 404.
 */
export async function abrirParaStream(caminho) {
  let tamanho;
  try {
    tamanho = (await stat(caminho)).size;
  } catch {
    return null;
  }

  return {
    tamanho,
    /** `inicio` e `fim` são inclusivos, como no cabeçalho Range. */
    trecho: (inicio, fim) => createReadStream(caminho, { start: inicio, end: fim }),
    inteiro: () => createReadStream(caminho),
  };
}
