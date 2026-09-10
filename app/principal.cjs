/**
 * O processo principal do Kora Stream Games — o programa em si.
 *
 * Ele faz três coisas, nesta ordem: decide ONDE fica a pasta do streamer, sobe
 * a ponte, e abre a janela. Nada de lógica de produto mora aqui; a ponte inteira
 * está em `bridge/src/`, fundida num `ponte.cjs` na hora de empacotar.
 *
 * POR QUE ESTE ARQUIVO É CommonJS num projeto que é todo ESM: o Electron carrega
 * o processo principal antes de qualquer coisa nossa rodar, e é aqui que as duas
 * variáveis que dizem onde estão as pastas precisam ser escritas — ANTES do
 * `require("./ponte.cjs")`, cujo topo já lê a raiz. Com `import`, essa ordem não
 * existe: os módulos são avaliados antes do corpo do arquivo.
 *
 * NÃO existe janela preta de console. Um aplicativo do Windows não tem terminal,
 * e por isso todo erro que impede subir vira caixa de diálogo — a única coisa
 * que o cliente consegue ler quando não há para onde olhar. O log completo fica
 * em `kora.log`, ao lado do executável.
 */

const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

/**
 * A pasta do streamer.
 *
 * No pacote portátil o Windows executa uma cópia extraída num diretório
 * temporário, e `process.execPath` aponta para LÁ — usar isso deixaria o `data/`
 * do streamer num temporário que o Windows apaga. O empacotador resolve isso
 * publicando `PORTABLE_EXECUTABLE_DIR`, que é a pasta onde está o exe que a
 * pessoa clicou. É essa que vale.
 */
function acharRaiz() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  if (app.isPackaged) return path.dirname(app.getPath("exe"));
  return path.resolve(__dirname, "..", "..", ".."); // rodando de `build/app/` no repositório
}

/** Onde ficam o painel construído e a semente. Dentro do pacote, nunca editável. */
function acharRecursos() {
  return app.isPackaged ? path.join(process.resourcesPath, "programa") : path.join(__dirname, "programa");
}

const RAIZ = acharRaiz();
const RECURSOS = acharRecursos();

process.env.KORA_RAIZ = RAIZ;
process.env.KORA_RECURSOS = RECURSOS;

/**
 * O log em arquivo.
 *
 * Sem console, o `console.log` da ponte cairia no vazio — e é exatamente ele
 * que responde "por que a live não conectou". Vai para `kora.log`, truncado a
 * cada abertura para não crescer sem fim numa máquina que nunca é reiniciada.
 */
function abrirLog() {
  let fluxo = null;
  try {
    fluxo = fs.createWriteStream(path.join(RAIZ, "kora.log"), { flags: "w" });
  } catch {
    return; // pasta somente-leitura (pendrive travado): seguir sem log
  }

  for (const canal of ["log", "info", "warn", "error"]) {
    const anterior = console[canal].bind(console);
    console[canal] = (...partes) => {
      anterior(...partes);
      try {
        fluxo.write(`${partes.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ")}\n`);
      } catch {
        /* log nunca derruba o programa */
      }
    };
  }
}

let janela = null;
let ponte = null;

function criarJanela(url) {
  janela = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    // A mesma cor de fundo do painel (`data/tokens.json`). Sem isto a janela
    // pisca branco antes da tela carregar, que é o tique que denuncia navegador.
    backgroundColor: "#111111",
    title: "Kora Stream Games",
    show: false,
    icon: path.join(RECURSOS, "icone.ico"),
    webPreferences: {
      // O painel é nosso, mas continua sendo uma página: sem Node dentro dela,
      // isolada do processo principal. Ver docs/11_SEGURANCA.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });

  // Só aparece pronta. Meio segundo de janela vazia é o que faz um programa
  // parecer lento mesmo quando não é.
  janela.once("ready-to-show", () => janela.show());

  //[[ Link externo abre no navegador do streamer, não dentro do aplicativo.
  //
  // O que sai daqui é documentação, o create.roblox.com e o painel da TikTok.
  // Abrir isso na própria janela transformaria o programa num navegador ruim,
  // sem barra de endereço e sem botão de voltar. ]]
  janela.webContents.setWindowOpenHandler(({ url: destino }) => {
    if (/^https?:/.test(destino)) shell.openExternal(destino);
    return { action: "deny" };
  });

  janela.webContents.on("will-navigate", (evento, destino) => {
    if (!destino.startsWith(url)) {
      evento.preventDefault();
      shell.openExternal(destino);
    }
  });

  ligarAtalhos(janela.webContents);

  janela.on("closed", () => {
    janela = null;
  });

  return janela.loadURL(url);
}

/**
 * Sem barra de menu nenhuma — "Arquivo / Editar / Ajuda" é vocabulário de
 * navegador, e o produto não tem nada para pôr ali.
 */
function tirarMenu() {
  Menu.setApplicationMenu(null);
}

/**
 * Os dois atalhos que sobrevivem à falta de menu, e por que:
 *
 *   F5              recarrega. É o "tenta de novo" de quem vê a tela travada,
 *                   e sem ele a única saída seria fechar e abrir o programa.
 *   Ctrl+Shift+I    ferramentas de desenvolvedor. É como eu leio um erro na
 *                   máquina do cliente sem pedir para ele instalar nada.
 *
 * Por `before-input-event` e não por menu invisível: menu invisível ainda
 * aparece no Alt, e Alt é o caminho que a pessoa tenta quando procura opções.
 */
function ligarAtalhos(conteudo) {
  conteudo.on("before-input-event", (evento, tecla) => {
    if (tecla.type !== "keyDown") return;

    if (tecla.key === "F5") {
      conteudo.reload();
      evento.preventDefault();
    }

    if (tecla.control && tecla.shift && tecla.key.toUpperCase() === "I") {
      conteudo.toggleDevTools();
      evento.preventDefault();
    }
  });
}

function explicar(erro) {
  const motivo = String(erro?.message ?? erro);

  // Porta ocupada é o erro mais provável e o mais mal explicado pelo Node.
  if (/EADDRINUSE/.test(motivo)) {
    return (
      "Já existe um Kora Stream Games rodando nesta máquina.\n\n" +
      "Feche o outro — ou, se ele não aparecer, encerre 'Kora Stream Games' " +
      "no Gerenciador de Tarefas — e abra de novo."
    );
  }

  return `${motivo}\n\nO detalhe está em kora.log, na pasta do programa.`;
}

async function arrancar() {
  abrirLog();
  tirarMenu();

  console.log(`Kora Stream Games — pasta: ${RAIZ}`);

  const iniciada = await require("./ponte.cjs").iniciar();
  ponte = iniciada;

  if (iniciada.envNovo) console.log("Criei o .env com um token novo, só desta instalação.");
  if (iniciada.escritos.length) console.log(`Arquivos preparados: ${iniciada.escritos.length}`);
  console.log(`Painel em ${iniciada.url}`);

  await criarJanela(iniciada.url);
}

//[[ Uma instância só.
//
// Duas cópias abertas disputam a porta 8787, e a segunda morre com um erro que
// não diz que a culpa é da primeira. Com a trava, o segundo duplo clique traz a
// janela que já existe para a frente — que é o que a pessoa queria. ]]
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!janela) return;
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  });

  app.whenReady().then(
    () => arrancar().catch(morrer),
    morrer,
  );

  // O programa É a janela. Fechou, acabou — inclusive no macOS, porque sem a
  // janela não há como ver a live nem parar a sessão.
  app.on("window-all-closed", () => app.quit());

  app.on("before-quit", async (evento) => {
    if (!ponte) return;
    // Encerrar a sessão de verdade é o que descarta o dado de espectador (F5).
    const encerrando = ponte.encerrar;
    ponte = null;
    evento.preventDefault();
    await encerrando().catch(() => {});
    app.quit();
  });
}

function morrer(erro) {
  console.error(erro);
  dialog.showErrorBox("Kora Stream Games não conseguiu abrir", explicar(erro));
  app.exit(1);
}
