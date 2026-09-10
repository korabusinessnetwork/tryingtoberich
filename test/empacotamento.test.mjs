/**
 * O executável portátil (ADR-P07, `scripts/empacotar.mjs`).
 *
 * O que se testa aqui é o que só falharia NA MÁQUINA DO CLIENTE, onde ninguém
 * está olhando: a semente escrita por cima do trabalho do streamer, o `.env`
 * saindo com o token do molde, o painel embutido engolindo a resposta de erro
 * da `/api`, e — a mais barata de todas — um `await` de topo que impede o
 * executável de sequer ser montado.
 *
 * O executável em si não cabe em teste: montá-lo leva um minuto e 94 MB. As
 * peças que decidem o comportamento dele cabem, e são estas.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { RAIZ } from "../bridge/src/repos/arquivo.mjs";
import { EMPACOTADO, embutido, indiceEmbutido } from "../bridge/src/empacotamento.mjs";
import { eDoPrograma, montarEnv, semear } from "../bridge/src/empacotado.mjs";
import { cacheDoArquivo, resolverChave, tipoDoArquivo } from "../bridge/src/http/painel-embutido.mjs";
import { listarSemente, removerAssinatura } from "../scripts/empacotar.mjs";

const temporario = () => mkdtemp(path.join(os.tmpdir(), "kora-portatil-"));

test("rodando do repositório, nada está empacotado", () => {
  assert.equal(EMPACOTADO, false);
  assert.equal(embutido("painel/index.html"), null);
  assert.deepEqual(indiceEmbutido(), { painel: [], semente: [] });
});

test("a raiz não é mais calculada a partir do arquivo — ela vem do empacotamento", async () => {
  // Dentro do exe não existe "três níveis acima deste arquivo". Se alguém
  // reintroduzir o cálculo antigo aqui, o executável passa a procurar `data/`
  // num caminho que não existe, e o dado do streamer some sem aviso.
  const fonte = await readFile(path.join(RAIZ, "bridge", "src", "repos", "arquivo.mjs"), "utf8");
  assert.ok(!/import\.meta\.url/.test(fonte), "arquivo.mjs não pode calcular a raiz sozinho");
  assert.match(fonte, /from "\.\.\/empacotamento\.mjs"/);
});

test("nem a ponte nem o arranque do exe podem ter await de topo", async () => {
  // CommonJS não tem await de topo, e o executável é montado a partir de UM
  // arquivo CommonJS. Um await de topo aqui não quebra teste nenhum: quebra o
  // `npm run empacotar`, que é onde ninguém está olhando.
  for (const relativo of ["bridge/src/index.mjs", "bridge/src/empacotado.mjs"]) {
    const fonte = await readFile(path.join(RAIZ, relativo), "utf8");
    const noTopo = fonte.split("\n").filter((linha) => /^await /.test(linha));
    assert.deepEqual(noTopo, [], `${relativo} tem await de topo`);
  }
});

test("importar o arranque do exe não sobe ponte nenhuma", async () => {
  // Este arquivo exporta funções que o teste importa. Enquanto ele arrancava no
  // topo, um `import` subia a ponte de verdade na 8787 — EADDRINUSE quando já
  // havia uma rodando, e o motivo perdido no meio de 500 testes.
  const fonte = await readFile(path.join(RAIZ, "bridge", "src", "empacotado.mjs"), "utf8");
  assert.match(fonte, /if \(EMPACOTADO \|\| chamadaDireta\) arrancarSemExplodir\(\)/);
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
    ".env.example",
  ]) {
    assert.equal(eDoPrograma(relativo), false, relativo);
  }
});

test("a semente nasce inteira numa pasta vazia", async () => {
  const raiz = await temporario();
  const conteudo = { "semente/data/presets/x.json": "{}", "semente/game/a.lua": "-- a" };
  const indice = { painel: [], semente: ["data/presets/x.json", "game/a.lua"] };

  const escritos = await semear({
    indice,
    raiz,
    ler: (chave) => (conteudo[chave] ? Buffer.from(conteudo[chave]) : null),
  });

  assert.deepEqual(escritos.sort(), ["data/presets/x.json", "game/a.lua"]);
  assert.equal(await readFile(path.join(raiz, "data", "presets", "x.json"), "utf8"), "{}");
});

test("o preset que o streamer editou sobrevive ao arranque seguinte", async () => {
  const raiz = await temporario();
  await mkdir(path.join(raiz, "data", "presets"), { recursive: true });
  await writeFile(path.join(raiz, "data", "presets", "x.json"), '{"meu":true}', "utf8");

  const escritos = await semear({ indice: { painel: [], semente: ["data/presets/x.json"] }, raiz, ler: () => Buffer.from("{}") });

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

  const escritos = await semear({ indice: { painel: [], semente: ["game/a.lua"] }, raiz, ler: () => Buffer.from("-- novo") });

  assert.deepEqual(escritos, ["game/a.lua"]);
  assert.equal(await readFile(path.join(raiz, "game", "a.lua"), "utf8"), "-- novo");
});

test("arquivo de programa idêntico não é reescrito", async () => {
  // Reescrever tudo a cada duplo clique faz o OneDrive sincronizar 800 KB e o
  // antivírus varrer junto, toda vez.
  const raiz = await temporario();
  await mkdir(path.join(raiz, "game"), { recursive: true });
  await writeFile(path.join(raiz, "game", "a.lua"), "-- igual", "utf8");

  const escritos = await semear({ indice: { painel: [], semente: ["game/a.lua"] }, raiz, ler: () => Buffer.from("-- igual") });

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

test("o painel embutido devolve o tipo certo, senão o navegador recusa o módulo", () => {
  // `text/plain` num .js faz o navegador recusar carregar o módulo, e a tela
  // abre branca sem erro nenhum de rede.
  assert.equal(tipoDoArquivo("assets/index-abc.js"), "text/javascript; charset=utf-8");
  assert.equal(tipoDoArquivo("assets/index-abc.css"), "text/css; charset=utf-8");
  assert.equal(tipoDoArquivo("index.html"), "text/html; charset=utf-8");
  assert.equal(tipoDoArquivo("sem-ponto"), "application/octet-stream");
});

test("o index.html nunca é guardado em cache; o assets com hash é guardado para sempre", () => {
  // O contrário faria o exe novo abrir o painel velho, pedindo um `assets/` que
  // já não está embutido: tela branca depois de atualizar.
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

test("a semente leva os gerados, e não leva os 65 MB de arte do streamer", async () => {
  const lista = await listarSemente();

  // Gerados a partir de `docs/`, que não vai no exe. Sem eles a ponte recusa
  // subir — na máquina do cliente, com a mensagem mais confusa possível.
  assert.ok(lista.includes("data/animacoes.json"), "falta a tabela de animações");
  assert.ok(lista.includes("data/tokens.json"), "faltam os tokens de design");
  assert.ok(lista.includes("data/schemas/preset.schema.json"), "faltam os schemas");
  assert.ok(lista.includes(".env.example"), "falta o molde do .env");
  assert.ok(lista.some((f) => f.startsWith("game/")), "falta a fonte do jogo");

  for (const pesado of ["data/acervo-imagens/", "data/cutscenes/", "data/icones/2"]) {
    assert.ok(!lista.some((f) => f.startsWith(pesado)), `${pesado} não pode entrar no executável`);
  }
});

test("a semente não leva lixo de teste para o cliente", async () => {
  // `data/presets/new.json` era um preset vazio criado num teste manual e
  // versionado sem querer. Ele ia junto no exe e aparecia na lista do cliente.
  const lista = await listarSemente();
  assert.ok(!lista.includes("data/presets/new.json"));
});

/** Um PE mínimo: só o suficiente para a tabela de certificados existir. */
function pePostico({ comAssinatura }) {
  const cabecalho = Buffer.alloc(0x200);
  cabecalho.writeUInt16LE(0x5a4d, 0); // "MZ"
  cabecalho.writeUInt32LE(0x80, 0x3c); // onde começa o "PE\0\0"
  cabecalho.writeUInt32LE(0x00004550, 0x80); // "PE\0\0"
  cabecalho.writeUInt16LE(0x20b, 0x80 + 24); // PE32+ (64 bits)

  const entrada = 0x80 + 24 + 112 + 4 * 8; // diretório de dados, entrada 4
  const corpo = Buffer.alloc(0x100, 0xaa);
  const assinatura = Buffer.alloc(0x40, 0xbb);

  if (comAssinatura) {
    cabecalho.writeUInt32LE(cabecalho.length + corpo.length, entrada);
    cabecalho.writeUInt32LE(assinatura.length, entrada + 4);
  }

  return { binario: Buffer.concat([cabecalho, corpo, comAssinatura ? assinatura : Buffer.alloc(0)]), entrada };
}

test("a assinatura do Node sai do executável, e o resto do arquivo fica intacto", () => {
  // Assinatura CORROMPIDA é pior que assinatura nenhuma: é o que antivírus lê
  // como binário adulterado. Sem assinatura, o Windows só dá o aviso normal.
  const { binario, entrada } = pePostico({ comAssinatura: true });
  const antes = binario.length;

  const { binario: limpo, removidos } = removerAssinatura(binario);

  assert.equal(removidos, 0x40);
  assert.equal(limpo.length, antes - 0x40);
  assert.equal(limpo.readUInt32LE(entrada), 0, "a entrada do diretório foi zerada");
  assert.equal(limpo.readUInt32LE(entrada + 4), 0);
  assert.equal(limpo[0x200], 0xaa, "o corpo do binário não foi tocado");
});

test("remover assinatura de quem não tem não estraga nada", () => {
  // Roda em Linux, em macOS e num Node compilado em casa. Nenhum desses pode
  // sair com o arquivo truncado.
  const semAssinatura = pePostico({ comAssinatura: false });
  const depois = removerAssinatura(semAssinatura.binario);
  assert.equal(depois.removidos, 0);
  assert.equal(depois.binario.length, semAssinatura.binario.length);

  for (const nada of [Buffer.alloc(0), Buffer.alloc(1024), Buffer.from("MZ")]) {
    assert.equal(removerAssinatura(nada).removidos, 0);
  }
});
