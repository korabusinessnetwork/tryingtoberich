/**
 * A sonda do F0-7 (`specs/f0-7-sonda-de-localhost.md`).
 *
 * A medição em si exige o Roblox Studio e é do dono. O que dá para garantir
 * daqui é que o INSTRUMENTO não mente — e é justamente aí que estava o risco:
 * o teste tem quatro modos de falha parecidos, e um instrumento que os confunde
 * faz o ADR-002 ser fechado com a resposta errada.
 *
 * O caso que estes testes mais protegem: **401 é sucesso de alcance**. Para
 * tomar 401 o pacote precisou chegar na ponte. Uma sonda que reporte isso como
 * falha responde "não" a uma pergunta cuja resposta foi "sim".
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { RAIZ } from "../bridge/src/repos/arquivo.mjs";
import { criarAppDoJogo } from "../bridge/src/http/servidor.mjs";
import { Nucleo } from "../bridge/src/nucleo.mjs";

const TOKEN = "s".repeat(32);
const PORTA = 8787;

const config = {
  token: TOKEN, portaJogo: PORTA, portaPainel: 8788, host: "127.0.0.1",
  usuarioTiktok: "", chaveGemini: "",
  longpollTimeoutMs: 150, combateMaxMs: 2000,
};

const luau = await readFile(path.join(RAIZ, "game", "sonda-localhost.lua"), "utf8");
const local = await readFile(path.join(RAIZ, "scripts", "sondar-localhost.mjs"), "utf8");

/** Sobe o app do jogo numa porta efêmera, como o bridge/test/http faz. */
async function comPonte(rodar) {
  const nucleo = new Nucleo({ config });
  const app = criarAppDoJogo(nucleo, { token: TOKEN });
  const servidor = await new Promise((resolver) => {
    const s = app.listen(0, "127.0.0.1", () => resolver(s));
  });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    await rodar(base);
  } finally {
    await new Promise((resolver) => servidor.close(resolver));
    nucleo.encerrar?.();
  }
}

// ------------------------------------------------------------- a rota

test("a sonda responde 200 com o token certo, e diz em qual porta está", async () => {
  await comPonte(async (base) => {
    const resposta = await fetch(`${base}/jogo/sonda`, { headers: { "X-Bridge-Token": TOKEN } });
    assert.equal(resposta.status, 200);

    const corpo = await resposta.json();
    assert.equal(corpo.ok, true);
    assert.equal(corpo.porta, PORTA, "a porta identifica QUAL ponte respondeu");
  });
});

test("a sonda exige token como toda a superfície pública, e o 401 é a prova de alcance", async () => {
  await comPonte(async (base) => {
    const semToken = await fetch(`${base}/jogo/sonda`);
    assert.equal(semToken.status, 401, "docs/11_SEGURANCA: nada em /jogo/* responde sem token");

    const tokenErrado = await fetch(`${base}/jogo/sonda`, { headers: { "X-Bridge-Token": "x".repeat(32) } });
    assert.equal(tokenErrado.status, 401);
  });
});

test("a sonda responde na hora: nada de long-poll, disco ou rede", async () => {
  await comPonte(async (base) => {
    const inicio = Date.now();
    await fetch(`${base}/jogo/sonda`, { headers: { "X-Bridge-Token": TOKEN } });
    const gasto = Date.now() - inicio;

    // O long-poll do projeto segura 20s em produção e 150ms nestes testes. A
    // sonda tem que ser de outra natureza: se ela pendurar, quem a usa acha
    // que o Studio travou.
    assert.ok(gasto < 500, `a sonda levou ${gasto}ms — ela precisa responder imediatamente`);
  });
});

test("a sonda está sob o mesmo rate limit das outras rotas do jogo", async () => {
  // Não é firula: uma rota pública sem limite vira o caminho mais barato para
  // floodar a porta que o túnel publica.
  const fonte = await readFile(path.join(RAIZ, "bridge", "src", "http", "servidor.mjs"), "utf8");
  assert.match(
    fonte,
    /app\.use\("\/jogo",\s*limitarTaxa\(\)[\s\S]{0,60}rotasDoJogo/,
    "a sonda herda limitarTaxa por estar dentro do router /jogo",
  );
});

// -------------------------------------------------------- o Luau da sonda

test("o Luau trata 401 como ALCANCE, que é o achado que evita a conclusão errada", () => {
  const trecho = /codigo == 401[\s\S]{0,220}/.exec(luau);
  assert.ok(trecho, "o Luau precisa tratar 401 explicitamente");
  assert.match(trecho[0], /"ALCANCA"/, "401 tem que classificar como ALCANCA, não como falha");
  assert.match(trecho[0], /CHEGOU|sucesso/i, "e tem que DIZER isso na tela, com todas as letras");
});

test("o Luau separa as quatro causas que se parecem", () => {
  for (const causa of ["CONFIG", "PONTE", "BLOQUEADO", "ALCANCA"]) {
    assert.ok(luau.includes(`"${causa}"`), `falta a classificação ${causa}`);
  }
  // Cada uma precisa de um sintoma reconhecível, senão a classificação é
  // decorativa e tudo cai no genérico.
  assert.match(luau, /not enabled|Http requests/, "HttpService desligado tem texto próprio do Roblox");
  assert.match(luau, /ConnectFail|refused/, "conexão recusada é ponte fora do ar, não bloqueio");
  assert.match(luau, /Timedout|timeout/, "timeout é o sintoma de pacote que não chegou");
  assert.match(luau, /DnsResolve|Unknown host/, "localhost em IPv6 falha na resolução, não no alcance");
});

test("o Luau sonda 127.0.0.1 E localhost, e reporta cada um", () => {
  assert.match(luau, /127\.0\.0\.1/, "o alvo principal do F0-7");
  assert.match(luau, /localhost/, "os dois podem se comportar diferente (IPv6)");
  assert.match(luau, /CANDIDATOS\s*=\s*\{/, "os dois vêm de uma lista percorrida, não de código repetido");
});

test("o Luau roda sem token configurado, e diz que isso não impede a resposta", () => {
  assert.match(
    luau,
    /Token do KoraConfig: AUSENTE[\s\S]{0,80}401/,
    "sem token o 401 responde igual — e o dono precisa ler isso antes de configurar nada",
  );
});

test("nenhum token é impresso pela sonda", () => {
  // O `11_SEGURANCA` proíbe token em log. Ferramenta de diagnóstico é
  // exatamente onde alguém imprimiria "só para ajudar a depurar".
  //
  // A checagem persegue o VALOR, não a palavra: dizer "Token: encontrado" é
  // desejável, e uma regra que proíba a palavra "token" perto de um print
  // proíbe justamente a mensagem que o dono precisa ler.
  const VALOR_NO_LUAU = /\.\.\s*token\b|print\s*\(\s*token\b|tostring\s*\(\s*token\b/;
  assert.ok(!VALOR_NO_LUAU.test(luau), "o Luau não pode concatenar nem imprimir o valor do token");

  const VALOR_NO_NODE = /console\.(log|error)\([^)]*\$\{\s*token\s*\}|console\.(log|error)\(\s*token\b/;
  assert.ok(!VALOR_NO_NODE.test(local), "o comando local também não imprime o valor do token");

  assert.match(luau, /não será impresso|nao sera impresso/, "e os dois dizem que não imprimem");
  assert.match(local, /não será impresso|nao sera impresso/);
});

// ------------------------------------------------------ o comando local

test("o comando local usa a porta real e a injeta no Luau impresso", () => {
  assert.match(local, /BRIDGE_PORT/, "a porta vem do ambiente, não de chute");
  assert.match(
    local,
    /replace\(\s*\/\^local PORTA = \\d\+\$\/m/,
    "e substitui a porta padrão no Luau antes de imprimir",
  );
});

test("o comando local falha com mensagem acionável quando a ponte está fora do ar", () => {
  assert.match(local, /npm run ponte/, "precisa dizer o comando que resolve");
  assert.match(local, /process\.exitCode = 1/, "e sair com erro, para não parecer sucesso");
  assert.match(
    local,
    /a resposta do F0-7 sai errada|nao e o\s*\n.*da pergunta/,
    "e explicar POR QUE ir ao Studio agora daria resposta errada",
  );
});

test("o comando local distingue 401 de ponte fora do ar", () => {
  assert.match(local, /resultado\.status === 401/, "401 é 'no ar com token errado', não 'fora do ar'");
  assert.match(local, /ESTA no ar/, "e precisa dizer isso");
});

test("a sonda Luau não é parte do jogo e avisa disso", () => {
  assert.match(luau, /NAO E PARTE DO JOGO|NÃO É PARTE DO JOGO/, "senão alguém a sincroniza para o place");
  assert.ok(
    !luau.includes("script.Parent"),
    "ferramenta de barra de comandos não tem Parent — usar isso indicaria que virou script do place",
  );
});
