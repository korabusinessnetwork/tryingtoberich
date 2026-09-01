#!/usr/bin/env node
/**
 * Cria o atalho do Kora na área de trabalho.
 *
 * O que ele resolve: hoje ligar o produto é abrir terminal, lembrar o comando e
 * depois achar a aba do painel. O atalho faz duplo clique virar "está no ar,
 * com o painel aberto".
 *
 * O atalho aponta para o `node.exe` DIRETO, sem `.bat` nem `.vbs` no meio. Dois
 * motivos: wrapper `.vbs` é padrão que antivírus marca, e cada camada a mais é
 * um lugar a mais onde o caminho com espaço (`OneDrive\Documentos\...`) quebra.
 *
 * Janela MINIMIZADA, não escondida. Esconder de vez deixaria uma falha de
 * inicialização invisível: o navegador abriria numa página morta e não haveria
 * onde ler o porquê. Minimizada fica fora do caminho, mas a um clique.
 *
 * Uso: node scripts/criar-atalho.mjs [--remover]
 */

import { execFile } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { RAIZ } from "../bridge/src/repos/arquivo.mjs";

const executar = promisify(execFile);
const NOME = "Kora Stream Games";

/**
 * Os valores vão por variável de ambiente, não interpolados no script.
 *
 * O caminho tem espaço e acento (`OneDrive\Documentos\Projetos`), e montar a
 * linha do PowerShell por concatenação é como se cria injeção de comando —
 * ainda que aqui a origem seja local, o hábito é o que evita o dia em que não é.
 */
async function powershell(script, variaveis) {
  const { stdout } = await executar(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { env: { ...process.env, ...variaveis } },
  );
  return stdout.trim();
}

/**
 * O caminho da área de trabalho NUNCA volta para o Node antes de ser usado.
 *
 * Custou um bug para descobrir: aqui ela é `OneDrive\Área de Trabalho`, e o
 * stdout do PowerShell sai na página de código do console, não em UTF-8. O
 * acento voltava como `?rea de Trabalho` e o `Save()` estourava
 * FileNotFoundException num diretório que existe. Calculando e usando o caminho
 * dentro do MESMO script, não há round-trip para corromper.
 *
 * O `OutputEncoding` em UTF-8 é só para a linha de confirmação chegar legível.
 */
const SCRIPT_CRIAR = `
  [Console]::OutputEncoding = [Text.Encoding]::UTF8
  $lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) ($env:KORA_NOME + '.lnk')
  $atalho = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
  $atalho.TargetPath = $env:KORA_NODE
  $atalho.Arguments = $env:KORA_ARGS
  $atalho.WorkingDirectory = $env:KORA_CWD
  $atalho.Description = 'Sobe a ponte e o painel do Kora Stream Games e abre o painel no navegador.'
  $atalho.IconLocation = $env:KORA_NODE
  $atalho.WindowStyle = 7
  $atalho.Save()
  Write-Output $lnk
`;

const SCRIPT_REMOVER = `
  [Console]::OutputEncoding = [Text.Encoding]::UTF8
  $lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) ($env:KORA_NOME + '.lnk')
  Remove-Item -LiteralPath $lnk -ErrorAction SilentlyContinue
  Write-Output $lnk
`;

async function principal() {
  if (process.platform !== "win32") {
    console.error("O atalho de área de trabalho só existe no Windows. No Linux/macOS use `npm start`.");
    process.exitCode = 1;
    return;
  }

  if (process.argv.includes("--remover")) {
    const removido = await powershell(SCRIPT_REMOVER, { KORA_NOME: NOME });
    console.log(`Atalho removido: ${removido}`);
    return;
  }

  const lnk = await powershell(SCRIPT_CRIAR, {
    KORA_NOME: NOME,
    KORA_NODE: process.execPath,
    KORA_ARGS: `"${path.join(RAIZ, "scripts", "subir-tudo.mjs")}" --abrir`,
    KORA_CWD: RAIZ,
  });

  console.log(`Atalho criado: ${lnk}`);
  console.log("Duplo clique sobe a ponte e o painel, e abre o painel no navegador.");
  console.log("A janela fica minimizada na barra de tarefas — é lá que aparece o erro, se houver.");
  console.log("Para fechar tudo: feche essa janela.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
