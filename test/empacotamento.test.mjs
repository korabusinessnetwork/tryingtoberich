/**
 * O aplicativo nas suas duas formas, portátil e instalada (ADR-P07, ADR-P04,
 * `scripts/empacotar.mjs`, `app/principal.cjs`, `app/atualizador.cjs`).
 *
 * O que se testa aqui é o que só falharia NA MÁQUINA DO CLIENTE, onde ninguém
 * está olhando: a semente escrita por cima do trabalho do streamer, o `.env`
 * saindo com o token do molde, o painel embutido engolindo a resposta de erro
 * da `/api`, a pasta do streamer indo parar num temporário que o Windows apaga
 * ou numa pasta que o desinstalador leva junto, e a atualização automática
 * reiniciando o programa no meio de uma live.
 *
 * O executável em si não cabe em teste: montá-lo leva uns dois minutos e 200 MB.
 * As peças que decidem o comportamento dele cabem, e são estas.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { RAIZ, listarArquivosRecursivo } from "../bridge/src/repos/arquivo.mjs";
import { EMPACOTADO, RECURSOS } from "../bridge/src/empacotamento.mjs";
import { carregarPainel, eDoPrograma, montarEnv, semear } from "../bridge/src/aplicativo.mjs";
import { cacheDoArquivo, resolverChave, tipoDoArquivo } from "../bridge/src/http/painel-embutido.mjs";
import { IDIOMA_PADRAO, LEIA_ME, TERMO, configDoBuilder, escolherIdioma, listarSemente } from "../scripts/empacotar.mjs";
import { desenhar, montarIco, montarPng } from "../scripts/gerar-icone.mjs";

const temporario = () => mkdtemp(path.join(os.tmpdir(), "kora-portatil-"));

const PALETA = { fundo: "#1B1B1B", degraus: ["#3B82F6", "#8B5CF6", "#EAB308"] };

test("rodando do repositório, nada está empacotado e as duas raízes coincidem", () => {
  assert.equal(EMPACOTADO, false);
  assert.equal(RECURSOS, RAIZ, "sem pacote não há separação entre programa e dado a fazer");
});

test("a raiz não é mais calculada dentro do repositório de arquivos", async () => {
  // Dentro do aplicativo o `data/` do streamer fica ao lado do executável, não
  // três níveis acima de um arquivo de código. Se alguém reintroduzir o cálculo
  // antigo aqui, o dado do streamer some sem aviso.
  const fonte = await readFile(path.join(RAIZ, "bridge", "src", "repos", "arquivo.mjs"), "utf8");
  assert.ok(!/import\.meta\.url/.test(fonte), "arquivo.mjs não pode calcular a raiz sozinho");
  assert.match(fonte, /from "\.\.\/empacotamento\.mjs"/);
});

test("a ponte não pode ter await de topo — é o que impede montar o aplicativo", async () => {
  // CommonJS não tem await de topo, e a ponte inteira é fundida num arquivo
  // CommonJS. Um await de topo aqui não quebra teste nenhum: quebra o
  // `npm run empacotar`, que é onde ninguém está olhando.
  for (const relativo of ["bridge/src/index.mjs", "bridge/src/aplicativo.mjs"]) {
    const fonte = await readFile(path.join(RAIZ, relativo), "utf8");
    const noTopo = fonte.split("\n").filter((linha) => /^await /.test(linha));
    assert.deepEqual(noTopo, [], `${relativo} tem await de topo`);
  }
});

test("importar o arranque do aplicativo não sobe ponte nenhuma", async () => {
  // Este arquivo importa `aplicativo.mjs` por causa do `semear`. Se algum dia
  // ele arrancar no topo, o `npm test` passa a subir a ponte de verdade na
  // 8787 — EADDRINUSE quando já há uma rodando, e o motivo perdido em 500
  // testes. Foi o que aconteceu na primeira versão do empacotamento.
  const fonte = await readFile(path.join(RAIZ, "bridge", "src", "aplicativo.mjs"), "utf8");
  assert.ok(!/^iniciar\(\)/m.test(fonte), "aplicativo.mjs só exporta; quem chama é o app/principal.cjs");
});

const lerPrincipal = () => readFile(path.join(RAIZ, "app", "principal.cjs"), "utf8");
const lerAtualizador = () => readFile(path.join(RAIZ, "app", "atualizador.cjs"), "utf8");
const acharRaizDoFonte = (fonte) => /function acharRaiz\(\) \{[\s\S]*?\n\}/.exec(fonte)[0];

test("a pasta do streamer nunca é o diretório temporário da extração", async () => {
  // O portátil roda a partir de uma cópia extraída no %TEMP%, e o Windows apaga
  // aquilo. `process.execPath` ali dentro apontaria para o temporário, e o
  // `data/` do streamer iria junto na próxima faxina do sistema.
  const acharRaiz = acharRaizDoFonte(await lerPrincipal());

  assert.match(acharRaiz, /PORTABLE_EXECUTABLE_DIR/, "é esta variável que aponta para a pasta do exe clicado");
  assert.ok(
    acharRaiz.indexOf("PORTABLE_EXECUTABLE_DIR") < acharRaiz.indexOf("getPath"),
    "e ela tem que ser consultada ANTES do caminho do executável",
  );
});

test("na versão instalada a pasta do streamer não é a pasta do programa", async () => {
  // `PORTABLE_EXECUTABLE_DIR` NÃO existe no instalador, e ali a regra antiga
  // (`path.dirname(app.getPath("exe"))`) apontaria para a pasta de instalação:
  // somente leitura numa instalação por máquina, e apagada pelo desinstalador
  // em qualquer uma. O `userData` é escrita garantida e o desinstalador não
  // encosta nele (`deleteAppDataOnUninstall: false`).
  const acharRaiz = acharRaizDoFonte(await lerPrincipal());

  assert.match(acharRaiz, /getPath\("userData"\)/, "a versão instalada guarda o dado do streamer no userData");
  assert.ok(!/getPath\("exe"\)/.test(acharRaiz), "a pasta do executável nunca pode ser a pasta do streamer");
});

test("quem vem do portátil não perde o data/ ao instalar", async () => {
  // As duas metades da migração: o portátil deixa um bilhete dizendo onde roda,
  // e a versão instalada, se nascer vazia, lê o bilhete e traz os arquivos. Sem
  // as duas, o streamer instala e vê a lista de presets vazia.
  const fonte = await lerPrincipal();

  assert.match(fonte, /function anotarPastaDoPortatil\(\)/);
  assert.match(fonte, /function trazerDoPortatil\(\)/);
  assert.match(fonte, /BILHETE_DO_PORTATIL/);

  const trazer = /function trazerDoPortatil\(\) \{[\s\S]*?\n\}/.exec(fonte)[0];
  assert.match(trazer, /existsSync\(path\.join\(RAIZ, "data"\)\)/, "só migra quando ainda não há data/ próprio");
  for (const item of ['"data"', '"game"', '"\\.env"']) {
    assert.match(trazer, new RegExp(item), `a migração precisa levar ${item}`);
  }
});

test("a atualização automática nunca reinicia sozinha nem vira tela de erro", async () => {
  // Uma atualização que trava o programa no dia da live é pior que não ter
  // atualização. As três regras que este teste guarda: não reinicia, não abre
  // caixa de diálogo, e não roda no portátil (onde o exe não pode se trocar
  // enquanto está aberto).
  const fonte = await lerAtualizador();

  assert.ok(!/quitAndInstall/.test(fonte), "reiniciar no meio da live é o pior resultado possível");
  assert.ok(!/showErrorBox|showMessageBox/.test(fonte), "falha de atualização é linha de log, nunca tela");
  assert.match(fonte, /autoInstallOnAppQuit = true/, "a instalação acontece quando o streamer já fechou o programa");
  assert.match(fonte, /!process\.env\.PORTABLE_EXECUTABLE_DIR/, "o portátil se atualiza trocando o arquivo, à mão");
  assert.match(fonte, /setTimeout\(/, "a checagem não pode estar no caminho do arranque");
});

test("o atualizador some sozinho quando não há com o que falar", async () => {
  // Build sem o `electron-updater`, release sem `latest.yml`, máquina sem rede:
  // os três têm de acabar em `catch`. Um `require` no topo transformaria o
  // primeiro numa tela de erro na máquina do cliente.
  const fonte = await lerAtualizador();

  assert.ok(!/^const .*require\("electron-updater"\)/m.test(fonte), "o require não pode ser de topo");
  assert.match(fonte, /try \{\s*\(\{ autoUpdater \} = require\("electron-updater"\)\);\s*\} catch/);
  assert.match(fonte, /checkForUpdates\(\)\.catch\(/, "a checagem não pode rejeitar para o vazio");
  assert.match(fonte, /autoUpdater\.on\("error"/, "e o evento de erro precisa de dono");
});

test("o instalador não pede administrador e não apaga o trabalho do streamer", () => {
  const { nsis, win, publish } = configDoBuilder();

  assert.deepEqual(win.target, ["portable", "nsis"], "as duas formas saem do mesmo build");

  // Por usuário: o produto não instala driver nem escreve serviço, então UAC
  // seria pedir uma permissão que não vai ser usada.
  assert.equal(nsis.perMachine, false);
  assert.equal(nsis.allowElevation, false);

  // Com assistente, e a pasta é escolhida.
  assert.equal(nsis.oneClick, false);
  assert.equal(nsis.allowToChangeInstallationDirectory, true);

  // Atalho nos dois lugares, senão o programa some depois de instalado.
  assert.equal(nsis.createDesktopShortcut, true);
  assert.equal(nsis.createStartMenuShortcut, true);

  // "Desinstale e instale de novo" é o primeiro conselho de qualquer suporte.
  // Se ele apagar presets e histórico, o conselho vira dano irreversível.
  assert.equal(nsis.deleteAppDataOnUninstall, false);

  // O atualizador precisa do endereço gravado no pacote, e ele é gratuito.
  assert.equal(publish[0].provider, "github");
  assert.ok(publish[0].owner && publish[0].repo);
});

test("o LEIA-ME existe nos dois idiomas, e o nome do arquivo muda junto", async () => {
  assert.equal(IDIOMA_PADRAO, "pt", "quem recebe o pacote hoje é o dono e os testadores daqui");
  assert.equal(escolherIdioma([], {}), "pt");
  assert.equal(escolherIdioma(["--idioma=en"], {}), "en");
  assert.equal(escolherIdioma([], { KORA_IDIOMA: "EN" }), "en", "a linha de comando e o ambiente valem igual");
  assert.throws(() => escolherIdioma(["--idioma=tlh"], {}), /não existe/);

  // `LEIA-ME.txt` na pasta de quem lê inglês é um arquivo que não se abre.
  assert.notEqual(LEIA_ME.pt.nome, LEIA_ME.en.nome);

  for (const [idioma, { modelo }] of Object.entries(LEIA_ME)) {
    const texto = await readFile(path.join(RAIZ, "scripts", "modelos", modelo), "utf8");
    assert.ok(texto.length > 500, `${idioma} está vazio demais para ser um LEIA-ME`);
    // O aviso do SmartScreen é a primeira coisa que o cliente vê, e o texto tem
    // que ser o que está NA TELA dele, não uma tradução do nosso.
    const aviso = idioma === "en" ? /Windows protected your PC/ : /O Windows protegeu o computador/;
    assert.match(texto, aviso, `${idioma} precisa do aviso do SmartScreen com o texto oficial`);
    assert.match(texto, idioma === "en" ? /Run anyway/ : /Executar assim mesmo/);
    // E os dois têm de dizer onde o dado do streamer mora na versão instalada.
    assert.match(texto, /%APPDATA%\\Kora Stream Games/, `${idioma} não diz onde ficam os arquivos`);
  }
});

test("o que é do programa é reescrito; o que é do streamer, nunca", () => {
  for (const relativo of [
    "game/src/shared/tokens.lua",
    "game/default.project.json",
    "data/schemas/preset.schema.json",
    "data/i18n/en.json",
    "data/animacoes.json",
    "data/tokens.json",
  ]) {
    assert.equal(eDoPrograma(relativo), true, relativo);
  }

  for (const relativo of [
    "data/presets/escalada-padrao.json",
    "data/acervo.json",
    "data/configuracao.json",
    "data/catalogo-presentes.seed.json",
    "data/mapas/torre.json",
  ]) {
    assert.equal(eDoPrograma(relativo), false, relativo);
  }
});

test("a semente nasce inteira numa pasta vazia", async () => {
  const raiz = await temporario();
  const conteudo = { "data/presets/x.json": "{}", "game/a.lua": "-- a" };

  const escritos = await semear({
    indice: ["data/presets/x.json", "game/a.lua"],
    raiz,
    ler: (relativo) => (conteudo[relativo] ? Buffer.from(conteudo[relativo]) : null),
  });

  assert.deepEqual(escritos.sort(), ["data/presets/x.json", "game/a.lua"]);
  assert.equal(await readFile(path.join(raiz, "data", "presets", "x.json"), "utf8"), "{}");
});

test("o preset que o streamer editou sobrevive à abertura seguinte", async () => {
  const raiz = await temporario();
  await mkdir(path.join(raiz, "data", "presets"), { recursive: true });
  await writeFile(path.join(raiz, "data", "presets", "x.json"), '{"meu":true}', "utf8");

  const escritos = await semear({ indice: ["data/presets/x.json"], raiz, ler: () => Buffer.from("{}") });

  assert.deepEqual(escritos, [], "nada foi reescrito");
  assert.equal(await readFile(path.join(raiz, "data", "presets", "x.json"), "utf8"), '{"meu":true}');
});

test("a fonte do jogo é atualizada quando o exe é trocado por um novo", async () => {
  // É esta linha que faz "substitua o exe pelo novo" funcionar. Sem ela o
  // `game/` velho fica em disco e o Studio monta um jogo que não bate com a
  // ponte nova — e o sintoma só aparece no Play, dentro do Studio.
  const raiz = await temporario();
  await mkdir(path.join(raiz, "game"), { recursive: true });
  await writeFile(path.join(raiz, "game", "a.lua"), "-- velho", "utf8");

  const escritos = await semear({ indice: ["game/a.lua"], raiz, ler: () => Buffer.from("-- novo") });

  assert.deepEqual(escritos, ["game/a.lua"]);
  assert.equal(await readFile(path.join(raiz, "game", "a.lua"), "utf8"), "-- novo");
});

test("arquivo de programa idêntico não é reescrito", async () => {
  // Reescrever tudo a cada abertura faz o OneDrive sincronizar quase um mega e
  // o antivírus varrer junto, toda vez.
  const raiz = await temporario();
  await mkdir(path.join(raiz, "game"), { recursive: true });
  await writeFile(path.join(raiz, "game", "a.lua"), "-- igual", "utf8");

  const escritos = await semear({ indice: ["game/a.lua"], raiz, ler: () => Buffer.from("-- igual") });

  assert.deepEqual(escritos, []);
});

test("o .env de cada instalação sai com um token próprio", () => {
  const molde = "# Ponte\nBRIDGE_TOKEN=troque_por_32_bytes_aleatorios\nTIKTOK_USERNAME=x\nBRIDGE_PORT=8787\n";

  const um = montarEnv(molde);
  const outro = montarEnv(molde);

  assert.notEqual(um, outro, "duas instalações não podem sair com o mesmo token");
  assert.ok(!um.includes("troque_por_32_bytes_aleatorios"), "o molde não pode vazar para o .env");

  const token = /^BRIDGE_TOKEN=(.*)$/m.exec(um)[1];
  assert.ok(token.length >= 32, `token curto demais: ${token.length}`);
  assert.match(um, /^TIKTOK_USERNAME=x$/m, "o resto do molde continua igual");
  assert.match(um, /^BRIDGE_PORT=8787$/m);
});

test("o painel é carregado com as chaves que a URL usa", async () => {
  // Barra normal, sem prefixo. Uma barra invertida aqui — e no Windows é o que
  // o `path.join` produz — nunca casaria com `/assets/index-abc.js`.
  const painel = await carregarPainel(path.join(RAIZ, "panel", "dist"));
  if (painel.size === 0) return; // painel ainda não construído nesta máquina

  assert.ok(painel.has("index.html"));
  for (const chave of painel.keys()) assert.ok(!chave.includes("\\"), chave);
});

test("o painel embutido devolve o tipo certo, senão o navegador recusa o módulo", () => {
  // `text/plain` num .js faz o navegador recusar carregar o módulo, e a tela
  // abre branca sem erro nenhum de rede.
  assert.equal(tipoDoArquivo("assets/index-abc.js"), "text/javascript; charset=utf-8");
  assert.equal(tipoDoArquivo("assets/index-abc.css"), "text/css; charset=utf-8");
  assert.equal(tipoDoArquivo("index.html"), "text/html; charset=utf-8");
  assert.equal(tipoDoArquivo("sem-ponto"), "application/octet-stream");
});

test("o index.html nunca é guardado em cache; o assets com hash é guardado para sempre", () => {
  // O contrário faria a versão nova abrir o painel velho, pedindo um `assets/`
  // que já não existe: tela branca depois de atualizar.
  assert.equal(cacheDoArquivo("index.html"), "no-cache");
  assert.match(cacheDoArquivo("assets/index-abc.js"), /immutable/);
});

test("a raiz e o index.html são a mesma coisa; o que não existe não é inventado", () => {
  const chaves = new Set(["index.html", "assets/index-abc.js"]);
  assert.equal(resolverChave("/", chaves), "index.html");
  assert.equal(resolverChave("/index.html", chaves), "index.html");
  assert.equal(resolverChave("/assets/index-abc.js", chaves), "assets/index-abc.js");
  assert.equal(resolverChave("/assets/nao-existe.js", chaves), null);
});

test("listar recursivo devolve barra normal, e pasta que não existe é lista vazia", async () => {
  assert.deepEqual(await listarArquivosRecursivo(path.join(RAIZ, "nao", "existe")), []);

  const nomes = await listarArquivosRecursivo(path.join(RAIZ, "data", "schemas"));
  assert.ok(nomes.length > 0);
  for (const nome of nomes) assert.ok(!nome.includes("\\"), nome);
});

test("a semente leva os gerados, e não leva os 65 MB de arte do streamer", async () => {
  const lista = await listarSemente();

  // Gerados a partir de `docs/`, que não vai no aplicativo. Sem eles a ponte
  // recusa subir — na máquina do cliente, com a mensagem mais confusa possível.
  assert.ok(lista.includes("data/animacoes.json"), "falta a tabela de animações");
  assert.ok(lista.includes("data/tokens.json"), "faltam os tokens de design");
  assert.ok(lista.includes("data/schemas/preset.schema.json"), "faltam os schemas");
  assert.ok(lista.includes(".env.example"), "falta o molde do .env");
  assert.ok(lista.some((f) => f.startsWith("game/")), "falta a fonte do jogo");

  for (const pesado of ["data/acervo-imagens/", "data/cutscenes/", "data/icones/2"]) {
    assert.ok(!lista.some((f) => f.startsWith(pesado)), `${pesado} não pode entrar no aplicativo`);
  }
});

test("a semente não leva lixo de teste para o cliente", async () => {
  // `data/presets/new.json` era um preset vazio criado num teste manual e
  // versionado sem querer. Ele ia junto no pacote e aparecia na lista do cliente.
  const lista = await listarSemente();
  assert.ok(!lista.includes("data/presets/new.json"));
});

test("o PNG do ícone é um PNG de verdade, com o tamanho que diz ter", () => {
  const png = montarPng(desenhar(32, PALETA), 32);

  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "assinatura PNG");
  assert.equal(png.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(png.readUInt32BE(16), 32, "largura");
  assert.equal(png.readUInt32BE(20), 32, "altura");
  assert.equal(png.subarray(png.length - 8, png.length - 4).toString("ascii"), "IEND");
});

test("o .ico aponta para cada PNG no lugar certo", () => {
  // Um deslocamento errado aqui dá um ícone que o Explorer mostra em branco — e
  // "meu programa não tem ícone" é a cara de programa que ninguém instalou.
  const imagens = [16, 256].map((lado) => ({ lado, png: montarPng(desenhar(lado, PALETA), lado) }));
  const ico = montarIco(imagens);

  assert.equal(ico.readUInt16LE(2), 1, "tipo 1 = ícone");
  assert.equal(ico.readUInt16LE(4), 2, "duas imagens");

  imagens.forEach(({ lado, png }, i) => {
    const base = 6 + i * 16;
    // 256 não cabe num byte e é escrito como 0. É a convenção do formato.
    assert.equal(ico[base], lado >= 256 ? 0 : lado, `largura da imagem ${i}`);
    assert.equal(ico.readUInt32LE(base + 8), png.length, `tamanho da imagem ${i}`);

    const inicio = ico.readUInt32LE(base + 12);
    assert.deepEqual(ico.subarray(inicio, inicio + png.length), png, `a imagem ${i} está onde diz estar`);
  });
});

test("o ícone tem canto arredondado — transparente fora, opaco no meio", () => {
  // Quadrado perfeito na barra de tarefas é a cara de ícone que ninguém
  // desenhou. O canto vem do recorte, e o recorte é o que este teste protege.
  const rgba = desenhar(64, PALETA);
  const alfa = (x, y) => rgba[(y * 64 + x) * 4 + 3];

  assert.equal(alfa(0, 0), 0, "o canto superior esquerdo é vazio");
  assert.equal(alfa(63, 63), 0, "e o inferior direito também");
  assert.equal(alfa(32, 32), 255, "o meio é opaco");
});

test("o termo de uso vai no pacote, nos dois idiomas", async () => {
  //[[ Mitigação nº 3 do ADR-P06, e ela não é formalidade.
  //
  // O acesso à live da TikTok é não oficial e pode ser cortado sem aviso. Sem um
  // texto dizendo isso ao cliente ANTES, a primeira quebra vira pedido de
  // reembolso com razão, e reembolso pedido com razão vira chargeback. O ADR é
  // explícito: é a nº 3 e a nº 5 que transformam uma quebra técnica nisso. ]]
  assert.deepEqual(Object.keys(TERMO).sort(), Object.keys(LEIA_ME).sort(), "um termo para cada LEIA-ME");

  for (const [idioma, { modelo }] of Object.entries(TERMO)) {
    const texto = await readFile(path.join(RAIZ, "scripts", "modelos", modelo), "utf8");

    // O que não pode faltar, e cada um é uma promessa que o ADR-P06 obriga.
    assert.ok(texto.length > 1500, `${idioma}: termo curto demais para dizer o que precisa`);
    assert.match(texto, /TikTok/, `${idioma}: precisa nomear a plataforma de que depende`);
    assert.match(
      texto,
      idioma === "pt" ? /não oficial/i : /unofficial/i,
      `${idioma}: precisa dizer, com essa palavra, que o acesso não é oficial`,
    );
    assert.match(
      texto,
      idioma === "pt" ? /pausad/i : /paused/i,
      `${idioma}: precisa dizer o que acontece com a cobrança quando o serviço cai`,
    );
    assert.ok(
      !/oficial da TikTok(?! nem)/i.test(texto) || /não é|not an official/i.test(texto),
      `${idioma}: mitigação nº 2, nunca se anunciar como integração oficial`,
    );
  }
});

test("a política de quebra existe, e diz o que fazer em cada degrau", async () => {
  // Mitigação nº 5. "Decidir isso no calor da quebra é decidir errado", e um
  // documento que existe mas não decide nada é o mesmo que não existir.
  const texto = await readFile(path.join(RAIZ, "docs", "00_VISAO", "politica-de-quebra.md"), "utf8");

  assert.match(texto, /24 horas/, "o degrau que pausa a cobrança");
  assert.match(texto, /7 dias/, "o degrau em que o cliente escolhe");
  assert.match(texto, /chargeback/i, "o motivo de a política existir precisa estar escrito nela");
  assert.match(texto, /ADR-P05/, "ela depende do alarme de saúde, e isso tem que estar dito");
});
