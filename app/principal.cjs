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
 * O bilhete que a versão portátil deixa dizendo em que pasta ela roda.
 *
 * Ele mora no `userData`, que é o MESMO caminho nas duas formas do programa
 * (portátil e instalada), porque o Electron o deriva do `productName`. É esse
 * detalhe que faz a migração do item seguinte ser possível: sem ele, o
 * instalador não teria como adivinhar onde estava a pasta do portátil.
 */
const BILHETE_DO_PORTATIL = "pasta-do-portatil.txt";

/**
 * A pasta do streamer, que guarda `data/`, `game/`, `.env` e `kora.log`.
 * São três casos, e cada um por um motivo diferente:
 *
 *   1. **Portátil.** O Windows executa uma cópia extraída num diretório
 *      temporário, e `process.execPath` aponta para LÁ, e usar isso deixaria o
 *      `data/` do streamer num temporário que o Windows apaga. O empacotador
 *      resolve publicando `PORTABLE_EXECUTABLE_DIR`, a pasta do exe que a
 *      pessoa clicou. É essa que vale, e por isso ela vem primeiro.
 *
 *   2. **Instalado.** Aqui `PORTABLE_EXECUTABLE_DIR` NÃO EXISTE, e a pasta do
 *      executável é a pasta de instalação, que é o pior lugar possível para o
 *      dado do streamer: numa instalação por máquina ela fica dentro do
 *      `Program Files`, somente leitura para quem não é administrador, e em
 *      qualquer instalação ela é apagada pelo desinstalador. O `userData` é
 *      escrita garantida, é por usuário, e o desinstalador não encosta nele.
 *
 *   3. **Repositório.** `node`, sem pacote nenhum: a pasta do projeto.
 */
function acharRaiz() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  if (app.isPackaged) return app.getPath("userData");
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
    // A raiz da versão instalada é o `userData`, que pode ainda não existir na
    // primeira abertura. Sem esta linha, o log da primeira abertura, o único
    // que interessa quando a primeira abertura dá errado, se perderia.
    fs.mkdirSync(RAIZ, { recursive: true });
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

//[[ A ponte entre as duas formas do programa: portátil e instalada.
//
// Quem usa o portátil hoje tem `data/` ao lado do exe, com preset, acervo e
// histórico de live. No dia em que ele trocar pelo instalador, a versão
// instalada procura em `userData`, que é outro lugar, e encontraria uma pasta
// vazia. O dado não some do disco, mas some da tela, que dá na mesma para
// quem está olhando.
//
// A solução tem duas metades e nenhuma delas custa nada em tempo de abertura:
// o portátil ANOTA onde roda, e a versão instalada, se nascer vazia, LÊ essa
// anotação e traz a mudança. Depois disso o bilhete é ignorado para sempre,
// porque a condição de migrar é "ainda não tenho `data/` meu". ]]

/** Metade 1: o portátil anota onde está, toda abertura, para o dia da mudança. */
function anotarPastaDoPortatil() {
  try {
    const perfil = app.getPath("userData");
    fs.mkdirSync(perfil, { recursive: true });
    fs.writeFileSync(path.join(perfil, BILHETE_DO_PORTATIL), RAIZ, "utf8");
  } catch {
    /* migração é conveniência; nunca pode impedir o programa de abrir */
  }
}

/** Metade 2: a versão instalada traz `data/`, `game/` e `.env` do portátil. */
function trazerDoPortatil() {
  try {
    if (fs.existsSync(path.join(RAIZ, "data"))) return; // já tem vida própria

    const bilhete = path.join(RAIZ, BILHETE_DO_PORTATIL);
    if (!fs.existsSync(bilhete)) return;

    const origem = fs.readFileSync(bilhete, "utf8").trim();
    if (!origem || path.resolve(origem) === path.resolve(RAIZ)) return;
    if (!fs.existsSync(path.join(origem, "data"))) return;

    for (const item of ["data", "game", ".env"]) {
      const de = path.join(origem, item);
      if (fs.existsSync(de)) fs.cpSync(de, path.join(RAIZ, item), { recursive: true });
    }
    console.log(`Trouxe os seus arquivos da versão portátil: ${origem}`);
  } catch (erro) {
    // Falhar aqui custa os presets antigos, não a abertura. A pasta do portátil
    // continua intacta no disco, e o motivo fica no log.
    console.error(`Não consegui trazer os arquivos da versão portátil: ${erro?.message ?? erro}`);
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

  if (process.env.PORTABLE_EXECUTABLE_DIR) anotarPastaDoPortatil();
  else if (app.isPackaged) trazerDoPortatil();

  const iniciada = await require("./ponte.cjs").iniciar();
  ponte = iniciada;

  if (iniciada.envNovo) console.log("Criei o .env com um token novo, só desta instalação.");
  if (iniciada.escritos.length) console.log(`Arquivos preparados: ${iniciada.escritos.length}`);
  console.log(`Painel em ${iniciada.url}`);

  await criarJanela(iniciada.url);

  // Depois da janela, e nunca antes: a atualização é a última coisa que este
  // programa faz, e a única que pode falhar sem ninguém ficar sabendo. O
  // try/catch é sobre o `require`: um erro aqui cairia no `morrer()` e viraria
  // caixa de erro por causa de uma funcionalidade que o cliente nem pediu.
  try {
    require("./atualizador.cjs").ligarAtualizacao();
  } catch (erro) {
    console.warn(`Atualização: não consegui carregar o atualizador. ${erro?.message ?? erro}`);
  }
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
