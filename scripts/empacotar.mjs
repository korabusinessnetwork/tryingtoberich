#!/usr/bin/env node
/**
 * Monta o Kora Stream Games nas suas DUAS formas, do mesmo build.
 *
 *   npm run empacotar                  o pacote com o LEIA-ME em português
 *   npm run empacotar -- --idioma=en   o mesmo pacote com o README em inglês
 *
 * O que sai, em `dist/KoraStreamGames/`:
 *
 *   KoraStreamGames.exe               o portátil: copie e dê duplo clique
 *   KoraStreamGames-Setup-<v>.exe     o instalador (ADR-P04)
 *   latest.yml                        o índice que o atualizador automático lê
 *   LEIA-ME.txt (ou README.txt)       o texto que vai junto
 *
 * As duas formas são o MESMO programa; o que muda é onde ele guarda o dado do
 * streamer, e quem decide isso é o `app/principal.cjs`. Ver `acharRaiz` lá.
 *
 * COMO FUNCIONA, em quatro peças:
 *
 *   1. **O painel** é construído pelo Vite, como sempre.
 *   2. **A ponte** — dezenas de módulos ESM mais `express`, `ajv` e o
 *      `tiktok-live-connector` — é fundida num `ponte.cjs` pelo `rolldown`, que
 *      o Vite já trazia. É isso que dispensa levar `node_modules` junto. O
 *      `electron-updater` entra pelo mesmo caminho, num `atualizador.cjs`.
 *   3. **O Electron** dá a janela nativa e o runtime. O processo principal é o
 *      `app/principal.cjs`.
 *   4. **O `electron-builder`** junta tudo em dois executáveis, com ícone, nome
 *      e versão gravados no binário.
 *
 * Tudo MIT e gratuito, e só de desenvolvimento. Ver ADR-P07.
 *
 * O QUE ESTE SCRIPT NÃO RESOLVE, e é bom saber antes de rodar:
 *
 *   - **Nenhum dos dois exe é assinado**, e o SmartScreen avisa na primeira
 *     execução. Assinatura custa dinheiro e a decisão é do dono, e está no
 *     ADR-P07, junto com o texto que o cliente vê. No instalador o aviso pesa
 *     mais que no portátil, porque aparece antes de a pessoa ter visto o
 *     produto funcionar.
 *   - **Nada é publicado.** O `publish` abaixo só existe para o
 *     `electron-builder` gravar o `app-update.yml` dentro do pacote, que é o
 *     endereço que o atualizador consulta. Subir o release é passo do dono.
 */

import { execFile } from "node:child_process";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { RAIZ } from "../bridge/src/repos/arquivo.mjs";
import { gerarIcone } from "./gerar-icone.mjs";

const executar = promisify(execFile);

const BUILD = path.join(RAIZ, "build");
const APP = path.join(BUILD, "app");
const PROGRAMA = path.join(BUILD, "programa");
const MARCA = path.join(BUILD, "marca");
/** Onde o electron-builder cospe os intermediários dele (`win-unpacked` e cia). */
const PACOTE = path.join(BUILD, "pacote");
/** O que é entregue: os dois exe, o índice do atualizador e o LEIA-ME. */
const SAIDA = path.join(RAIZ, "dist", "KoraStreamGames");

const passo = (texto) => console.log(`\n▸ ${texto}`);
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Onde o atualizador automático procura versão nova (ADR-P04, `app/atualizador.cjs`).
 *
 * **GitHub Releases**, e a escolha é de custo: o projeto é bootstrap gratuito
 * (CLAUDE.md, Custo), o repositório já está no GitHub, e release público não
 * cobra banda nem pede servidor de ninguém. As alternativas, S3, Spaces e
 * "generic" apontado para um host próprio, todas começam com uma fatura.
 *
 * Fica em variável de ambiente com padrão porque o repositório de RELEASE não
 * precisa ser o repositório de código para sempre: no dia em que o código sair
 * do `tryingtoberich`, isto muda sem tocar em código.
 */
const PUBLICACAO = {
  dono: process.env.KORA_RELEASE_DONO ?? "korabusinessnetwork",
  repositorio: process.env.KORA_RELEASE_REPO ?? "tryingtoberich",
};

/**
 * O texto que vai na caixa, nos dois idiomas.
 *
 * **O padrão é português**, e não inglês, apesar de o funil da Fase 1 ser em
 * inglês (ADR-P03). O motivo é quem recebe o pacote HOJE: o dono e os primeiros
 * testadores, todos daqui. É a mesma leitura do ADR-P07, que registrou a falta
 * do inglês como "não bloqueante enquanto os testadores forem daqui". Um texto
 * no idioma errado dentro do pacote é pior que um sinalizador na linha de
 * comando, porque ninguém percebe até estar na máquina do cliente.
 *
 * O nome do arquivo muda junto com o idioma de propósito: `LEIA-ME.txt` numa
 * pasta de quem lê inglês é um arquivo que não se abre.
 */
export const LEIA_ME = {
  pt: { modelo: "leia-me-do-portatil.txt", nome: "LEIA-ME.txt" },
  en: { modelo: "readme-portable.txt", nome: "README.txt" },
};

/**
 * O termo de uso, que vai no pacote junto com o exe.
 *
 * Não é formalidade jurídica: é a **mitigação nº 3 do ADR-P06**, e o ADR é
 * explícito sobre o custo de pulá-la. O acesso à live da TikTok é não oficial e
 * pode ser cortado sem aviso; o item 4 do termo diz o que acontece com a
 * assinatura quando isso acontecer. Sem esse texto, a primeira quebra vira
 * pedido de reembolso com razão, e reembolso pedido com razão vira chargeback.
 *
 * Vai como arquivo ao lado do exe, e não escondido dentro do pacote, porque
 * termo que ninguém acha é termo que ninguém leu.
 */
export const TERMO = {
  pt: { modelo: "termo-de-uso.txt", nome: "TERMO-DE-USO.txt" },
  en: { modelo: "terms-of-use.txt", nome: "TERMS-OF-USE.txt" },
};

export const IDIOMA_PADRAO = "pt";

/** Lê `--idioma=en` da linha de comando, ou `KORA_IDIOMA`, ou fica no padrão. */
export function escolherIdioma(argumentos = [], ambiente = {}) {
  const daLinha = argumentos.map((a) => /^--idioma[=:](.+)$/.exec(a)?.[1]).find(Boolean);
  const pedido = (daLinha ?? ambiente.KORA_IDIOMA ?? IDIOMA_PADRAO).toLowerCase();

  if (!LEIA_ME[pedido]) {
    throw new Error(`Idioma "${pedido}" não existe. Os que existem: ${Object.keys(LEIA_ME).join(", ")}.`);
  }
  return pedido;
}

/**
 * Os arquivos da semente: o que o Git versiona em `data/` e `game/`, mais os
 * gerados que o aplicativo não tem como gerar sozinho.
 *
 * Por que o Git e não uma varredura: o `.gitignore` já sabe distinguir o que é
 * do produto do que é da INSTALAÇÃO — a arte do streamer, o catálogo coletado
 * da live, o dado de sessão. Repetir essa lista aqui seria mantê-la em dois
 * lugares e embutir 65 MB de vídeo e imagem que não são nossos.
 */
export async function listarSemente(raiz = RAIZ) {
  let versionados;
  try {
    const { stdout } = await executar("git", ["ls-files", "-z", "data", "game", ".env.example"], {
      cwd: raiz,
      maxBuffer: 32 * 1024 * 1024,
    });
    versionados = stdout.split("\u0000").filter(Boolean);
  } catch {
    throw new Error("Não consegui listar a semente: este build precisa do `git` no PATH.");
  }

  // Gerados a partir de `docs/`, e o aplicativo não leva `docs/` junto. Sem
  // eles a ponte recusa subir, com a mensagem certa e no lugar mais confuso
  // possível: na máquina do cliente.
  const gerados = ["data/animacoes.json", "data/tokens.json"];

  return [...new Set([...versionados, ...gerados])].sort();
}

/**
 * Funde um módulo e tudo que ele importa num arquivo CommonJS só.
 *
 * `externos` é o que NÃO pode ser fundido: o `electron` não existe em disco
 * como pacote comum, ele é injetado pelo runtime. Fundi-lo daria um bundle que
 * quebra na primeira linha.
 */
async function fundir(entrada, saida, externos = []) {
  const { rolldown } = await import("rolldown");

  const pacote = await rolldown({
    input: entrada,
    platform: "node",
    external: externos,
    // O `bufferutil`, o `utf-8-validate` e o `supports-color` são aceleradores
    // opcionais do `ws` e do `debug`, pedidos dentro de try/catch. Não existem
    // aqui e não vão existir lá; o try/catch cobre, e avisar sobre eles a cada
    // build treina a gente a ignorar aviso de build. Vale o mesmo para o
    // `electron-updater` quando ele não estiver instalado: o `atualizador.cjs`
    // pede dentro de try/catch justamente para o programa abrir sem ele.
    onwarn(aviso, padrao) {
      if (aviso.code === "UNRESOLVED_IMPORT") return;
      padrao(aviso);
    },
  });

  const { output } = await pacote.write({ format: "cjs", file: saida, codeSplitting: false });
  await pacote.close();
  return output[0].code.length;
}

/**
 * O `package.json` que o Electron lê ao abrir.
 *
 * É gerado, e não versionado, porque nome, versão e descrição são os MESMOS do
 * `package.json` da raiz — e um segundo arquivo à mão viraria a versão que
 * ninguém lembra de subir.
 */
async function montarPackageDoApp() {
  const raiz = JSON.parse(await readFile(path.join(RAIZ, "package.json"), "utf8"));

  return {
    name: "kora-stream-games",
    productName: "Kora Stream Games",
    version: raiz.version,
    description: "Painel e ponte do Kora Stream Games.",
    author: "Kora Business Network",
    license: "UNLICENSED",
    private: true,
    main: "principal.cjs",
  };
}

export function configDoBuilder() {
  return {
    appId: "network.kora.streamgames",
    productName: "Kora Stream Games",
    copyright: `Copyright © ${new Date().getFullYear()} Kora Business Network`,
    directories: {
      app: path.relative(RAIZ, APP),
      output: path.relative(RAIZ, PACOTE),
      buildResources: path.relative(RAIZ, MARCA),
    },
    //[[ O painel e a semente vão como RECURSO, fora do `app.asar`.
    //
    // Dentro do asar eles até seriam lidos — o Electron remenda o `fs` para
    // isso — mas remendo de `fs` é exatamente o tipo de coisa que funciona até
    // o dia em que não funciona, e o `repos/arquivo.mjs` usa `open`, `stat` e
    // `createReadStream`. Fora do asar é `fs` de verdade, sem surpresa. ]]
    extraResources: [{ from: path.relative(RAIZ, PROGRAMA), to: "programa" }],
    asar: true,
    // Não há dependência nativa: a ponte inteira virou um arquivo.
    npmRebuild: false,
    compression: "maximum",
    //[[ O endereço que o atualizador consulta, e NADA além disso.
    //
    // Este bloco não publica: ele faz o electron-builder gravar o
    // `app-update.yml` dentro do pacote e escrever o `latest.yml` ao lado do
    // instalador. Publicar é `build({ publish: "never" })` mais o dono subindo
    // o release à mão, e é assim de propósito, porque publicar sozinho exigiria
    // um GH_TOKEN nesta máquina (CLAUDE.md, Segurança). ]]
    publish: [
      {
        provider: "github",
        owner: PUBLICACAO.dono,
        repo: PUBLICACAO.repositorio,
        // Só release de verdade. Rascunho e pré-lançamento existem para o dono
        // testar, e o cliente não pode ser cobaia do teste.
        releaseType: "release",
      },
    ],
    win: {
      // As duas formas saem do MESMO build: o portátil para experimentar e
      // levar no pendrive, o instalador para quem vai usar de verdade, que é
      // o destino do ADR-P04, e o único dos dois que se atualiza sozinho.
      target: ["portable", "nsis"],
      icon: path.relative(RAIZ, path.join(MARCA, "icon.ico")),
      // Sem isto o Windows mostra "Electron" nas propriedades do arquivo.
      legalTrademarks: "Kora Business Network",
    },
    portable: { artifactName: "KoraStreamGames.exe" },
    //[[ O instalador, e as quatro decisões que ele obrigou a tomar.
    //
    // 1. POR USUÁRIO (`perMachine: false`, `allowElevation: false`).
    //    O produto não precisa de administrador para NADA: não instala driver,
    //    não escreve serviço, não mexe em registro de máquina. Pedir UAC seria
    //    pedir uma permissão que não vai ser usada, e é a tela onde streamer
    //    desiste, ainda mais logo depois do aviso do SmartScreen. Instalar por
    //    usuário também põe o programa fora do `Program Files`, o que evita a
    //    pergunta "por que não consigo escrever aqui".
    //
    // 2. COM ASSISTENTE, E A PASTA É ESCOLHIDA (`oneClick: false`,
    //    `allowToChangeInstallationDirectory: true`).
    //    O instalador de um clique instala e abre sem perguntar nada, e é
    //    exatamente o comportamento que um programa sem assinatura NÃO pode ter:
    //    somado ao "O Windows protegeu o computador", ele fica com cara do que
    //    a pessoa foi treinada a temer. O assistente também é onde ela lê o
    //    nome do fabricante e escolhe o disco, e "o disco" não é detalhe para
    //    quem tem SSD pequeno e o Studio já ocupando espaço.
    //
    // 3. ATALHO NOS DOIS LUGARES (`createDesktopShortcut`, `createStartMenuShortcut`).
    //    O menu iniciar é o que faz o programa ser encontrado pela busca do
    //    Windows, que é como metade das pessoas abre qualquer coisa. A área de
    //    trabalho é o que faz ele ser encontrado pela outra metade, e é onde a
    //    live começa. Nenhum dos dois custa nada e a falta de qualquer um vira
    //    ticket de suporte no primeiro dia.
    //
    // 4. DESINSTALAR NÃO APAGA O QUE É DO STREAMER (`deleteAppDataOnUninstall: false`).
    //    Preset, acervo e histórico de live moram no `userData` (ver `acharRaiz`
    //    no `app/principal.cjs`), e desinstalar para reinstalar é o primeiro
    //    conselho de qualquer suporte. Se o desinstalador levar o `data/` junto,
    //    esse conselho destrói o trabalho do cliente, e é irreversível. ]]
    nsis: {
      artifactName: "KoraStreamGames-Setup-${version}.exe",
      oneClick: false,
      perMachine: false,
      allowElevation: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: "Kora Stream Games",
      uninstallDisplayName: "Kora Stream Games ${version}",
      deleteAppDataOnUninstall: false,
      // A última tela do assistente abre o programa. É o que transforma
      // "instalei" em "vi funcionando" sem a pessoa ter de procurar o atalho.
      runAfterFinish: true,
      // O `guid` sai do `appId` e é o que faz a versão nova RECONHECER a antiga
      // e substituí-la, em vez de aparecerem duas entradas em "Aplicativos".
      // Não fixar um valor aqui é o certo: mudá-lo depois quebraria isso.
      differentialPackage: false,
    },
  };
}

async function principal(argumentos = process.argv.slice(2)) {
  if (process.platform !== "win32") {
    console.log(`Atenção: rodando em ${process.platform}. O aplicativo sai para ESTA plataforma, não para Windows.`);
  }

  const idioma = escolherIdioma(argumentos, process.env);

  await rm(BUILD, { recursive: true, force: true });
  await rm(SAIDA, { recursive: true, force: true });
  for (const dir of [APP, PROGRAMA, MARCA, PACOTE, SAIDA]) await mkdir(dir, { recursive: true });

  passo("Gerando os artefatos (animações, tokens, i18n)");
  for (const script of ["gerar-animacoes.mjs", "gerar-tokens.mjs", "gerar-i18n.mjs"]) {
    await executar(process.execPath, [path.join(RAIZ, "scripts", script), "--silencioso"], { cwd: RAIZ });
  }

  passo("Desenhando o ícone");
  const icone = await gerarIcone(path.join(MARCA, "icon.ico"));
  console.log(`  ${icone.tamanhos.join(", ")} px`);
  await cp(path.join(MARCA, "icon.ico"), path.join(PROGRAMA, "icone.ico"));

  passo("Construindo o painel");
  // O Vite direto, e não `npm run build:painel`: o Node 24 recusa spawnar um
  // `.cmd` sem shell, e com shell os argumentos vão concatenados na linha de
  // comando — que é justamente o que ele deprecou.
  const vite = path.join(RAIZ, "node_modules", "vite", "bin", "vite.js");
  await executar(process.execPath, [vite, "build"], { cwd: path.join(RAIZ, "panel"), maxBuffer: 8 * 1024 * 1024 });
  await cp(path.join(RAIZ, "panel", "dist"), path.join(PROGRAMA, "painel"), { recursive: true });

  passo("Fundindo a ponte num arquivo só");
  console.log(`  ponte        ${kb(await fundir(path.join(RAIZ, "bridge", "src", "aplicativo.mjs"), path.join(APP, "ponte.cjs")))}`);

  // O `electron-updater` vem fundido pelo mesmo caminho, e é isso que mantém a
  // promessa do ADR-P07 de o pacote não levar `node_modules` nenhum.
  console.log(`  atualizador  ${kb(await fundir(path.join(RAIZ, "app", "atualizador.cjs"), path.join(APP, "atualizador.cjs"), ["electron"]))}`);

  await cp(path.join(RAIZ, "app", "principal.cjs"), path.join(APP, "principal.cjs"));

  const pacote = await montarPackageDoApp();
  await writeFile(path.join(APP, "package.json"), `${JSON.stringify(pacote, null, 2)}\n`, "utf8");

  passo("Reunindo a semente");
  const semente = await listarSemente();
  for (const relativo of semente) {
    await cp(path.join(RAIZ, relativo), path.join(PROGRAMA, "semente", relativo));
  }
  console.log(`  ${semente.length} arquivos`);

  passo("Montando os executáveis (Electron)");
  const { build, Platform } = await import("electron-builder");
  const feitos = await build({
    targets: Platform.WINDOWS.createTarget(["portable", "nsis"]),
    config: configDoBuilder(),
    projectDir: RAIZ,
    // Nunca publica. O `publish` da config existe só para gravar o endereço do
    // atualizador dentro do pacote; subir o release é passo do dono.
    publish: "never",
  });

  //[[ O que vai para `dist/`, e por que a lista é fechada.
  //
  // O `electron-builder` deixa em `build/pacote/` um monte de intermediário:
  // `win-unpacked`, `builder-debug.yml`, `.blockmap`. Copiar a pasta inteira
  // entregaria isso ao cliente. Aqui só passa o que ele precisa. ]]
  const entregar = [
    { padrao: /KoraStreamGames\.exe$/, nome: "KoraStreamGames.exe", rotulo: "portátil" },
    { padrao: /KoraStreamGames-Setup-.*\.exe$/, nome: null, rotulo: "instalador" },
  ];

  passo("Entregando");
  for (const { padrao, nome, rotulo } of entregar) {
    const cru = feitos.find((arquivo) => padrao.test(arquivo));
    if (!cru) throw new Error(`O build não produziu o ${rotulo}. Saiu: ${feitos.join(", ")}`);

    const destino = path.join(SAIDA, nome ?? path.basename(cru));
    await cp(cru, destino);
    console.log(`  ${path.basename(destino).padEnd(34)} ${mb((await stat(destino)).size)}  ${rotulo}`);
  }

  //[[ O `latest.yml` é pescado do disco, e não da lista de artefatos.
  //
  // Com `publish: "never"` o electron-builder escreve o arquivo mas NÃO o
  // devolve como artefato, porque na cabeça dele ele só existe para ser
  // publicado. Ele é o índice que todo cliente instalado consulta: sem ele no
  // release, ninguém nunca recebe a versão nova. Um build que "deu certo" e
  // esqueceu este arquivo é a pior forma de falha, porque só aparece na
  // atualização seguinte, na máquina dos outros. ]]
  const indice = path.join(PACOTE, "latest.yml");
  if (!(await stat(indice).catch(() => null))) {
    throw new Error("O build não escreveu o latest.yml. Sem ele, ninguém recebe atualização.");
  }
  await cp(indice, path.join(SAIDA, "latest.yml"));
  console.log(`  ${"latest.yml".padEnd(34)} índice do atualizador`);

  for (const grupo of [LEIA_ME, TERMO]) {
    const { modelo, nome } = grupo[idioma];
    await cp(path.join(RAIZ, "scripts", "modelos", modelo), path.join(SAIDA, nome));
    console.log(`  ${nome.padEnd(34)} texto em ${idioma}`);
  }

  console.log(`\n✓ ${path.relative(RAIZ, SAIDA)}`);
  console.log("  Portátil: copie o exe para a máquina do cliente e mande dar duplo clique.");
  console.log("  Instalado: mande o Setup. Ele instala só para o usuário, sem pedir administrador.");
  console.log("  Atualização automática: publique o Setup E o latest.yml no mesmo release do GitHub.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
