/**
 * Consistência entre o jogo e o resto do sistema.
 *
 * O jogo é Luau e não roda aqui, mas três coisas dele são verificáveis de fora
 * e valem muito: que a sintaxe está válida, que os arquivos gerados batem com
 * a fonte, e que as constantes duplicadas em Luau e em JavaScript dizem o mesmo
 * número.
 *
 * Essa última é o bug silencioso clássico de sistema multi-linguagem: a ponte
 * aceita um mapa com espaçamento 5,04 e o jogo rejeita por usar 0,65 no lugar
 * de 0,7. Nada quebra, o mapa só nunca constrói.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { RAIZ } from "../bridge/src/repos/arquivo.mjs";
import { FATOR_SALTO_VERTICAL } from "../bridge/src/dominio/regras.mjs";
import { criarValidador } from "../bridge/src/repos/schemas.mjs";

const executar = promisify(execFile);
const lerJogo = (...partes) => readFile(path.join(RAIZ, "game", "src", ...partes), "utf8");

/** Extrai `Nome = valor` de um módulo Luau, para comparar número com número. */
const constanteLuau = (fonte, nome) => {
  const achado = new RegExp(`${nome}\\s*=\\s*([\\d.]+)`).exec(fonte);
  return achado ? Number.parseFloat(achado[1]) : null;
};

const listarLua = async (dir) => {
  const achados = [];
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) achados.push(...(await listarLua(completo)));
    else if (entrada.name.endsWith(".lua")) achados.push(completo);
  }
  return achados;
};

/* -------------------------------------------------------------- */
/* Sintaxe                                                         */
/* -------------------------------------------------------------- */

test("todo .lua do jogo passa no parser", async () => {
  try {
    await executar("luac5.1", ["-v"]);
  } catch {
    assert.fail("luac5.1 não está instalado; instale com: apt-get install lua5.1");
  }

  const arquivos = await listarLua(path.join(RAIZ, "game", "src"));
  assert.ok(arquivos.length >= 6, `esperava ao menos os módulos compartilhados, achei ${arquivos.length}`);

  const quebrados = [];
  for (const arquivo of arquivos) {
    try {
      await executar("luac5.1", ["-p", arquivo]);
    } catch (erro) {
      quebrados.push(`${path.relative(RAIZ, arquivo)}: ${String(erro.stderr ?? erro.message).trim()}`);
    }
  }
  assert.deepEqual(quebrados, [], "erro de sintaxe só apareceria quando o Studio carregasse o lugar");
});

/* -------------------------------------------------------------- */
/* Constantes duplicadas entre Luau e JavaScript                   */
/* -------------------------------------------------------------- */

test("a margem do ADR-009 é a mesma na ponte e no jogo", async () => {
  const fonte = await lerJogo("shared", "tipos.lua");
  assert.equal(
    constanteLuau(fonte, "Tipos.FATOR_SALTO_VERTICAL"),
    FATOR_SALTO_VERTICAL,
    "a ponte aceitaria um mapa que o jogo rejeita, e ninguém veria o erro",
  );
});

test("o alcance horizontal do pulo é o mesmo na ponte e no jogo", async () => {
  const fonte = await lerJogo("server", "jogabilidade.lua");
  const { alcanceHorizontalDoPulo, GRAVIDADE_ROBLOX, VELOCIDADE_ANDAR_ROBLOX } =
    await import("../bridge/src/dominio/regras.mjs");

  assert.equal(constanteLuau(fonte, "local GRAVIDADE"), GRAVIDADE_ROBLOX);
  assert.equal(constanteLuau(fonte, "local VELOCIDADE_HORIZONTAL_PADRAO"), VELOCIDADE_ANDAR_ROBLOX);

  // A conta em si é a mesma fórmula nos dois lados; se a constante bate, o
  // resultado bate. O que este teste impede é a ponte aceitar um spec que o
  // jogo depois recusa dentro do Studio, no meio da live.
  assert.equal(alcanceHorizontalDoPulo(7.2).toFixed(2), "6.07");
});

test("o exemplo de mapa respeita os dois tetos horizontais", async () => {
  const { alcanceHorizontalDoPulo, FATOR_DERIVA_HORIZONTAL } = await import("../bridge/src/dominio/regras.mjs");
  const mapa = JSON.parse(await readFile(path.join(RAIZ, "data", "exemplos", "mapa-torre-vulcanica-01.json"), "utf8"));
  const { variacaoHorizontal, raioBase } = mapa.plataformas;

  assert.ok(variacaoHorizontal <= raioBase * FATOR_DERIVA_HORIZONTAL, "teto de geometria");
  assert.ok(
    variacaoHorizontal <= alcanceHorizontalDoPulo(mapa.jumpHeight),
    "teto de alcance do pulo: é o que manda na prática, e é o que o doc dizia sem ninguém ter implementado",
  );
});

test("o teto de duração do jogo é o mesmo que o schema aceita", async () => {
  const fonte = await lerJogo("shared", "tipos.lua");
  const schema = JSON.parse(await readFile(path.join(RAIZ, "data", "schemas", "animacoes.schema.json"), "utf8"));

  assert.equal(
    constanteLuau(fonte, "Tipos.DURACAO_MAX"),
    schema.$defs.animacao.properties.duracaoBase.maximum,
    "3,5s é o teto da biblioteca e por tabela o do bloqueio de controle do R11",
  );
});

test("o teto de intensidade é o mesmo nos três lugares", async () => {
  const fonte = await lerJogo("shared", "tipos.lua");
  const comuns = JSON.parse(await readFile(path.join(RAIZ, "data", "schemas", "comuns.schema.json"), "utf8"));
  const { REGRAS } = await import("../bridge/src/config.mjs");

  assert.equal(constanteLuau(fonte, "Tipos.INTENSIDADE_MAX"), comuns.$defs.intensidade.maximum);
  assert.equal(REGRAS.INTENSIDADE_MAX, comuns.$defs.intensidade.maximum);
});

/* -------------------------------------------------------------- */
/* Arquivos gerados                                                */
/* -------------------------------------------------------------- */

test("o índice Luau tem as mesmas 20 animações que o JSON", async () => {
  const fonte = await lerJogo("shared", "indiceAnimacoes.lua");
  const json = JSON.parse(await readFile(path.join(RAIZ, "data", "animacoes.json"), "utf8"));

  assert.equal(json.animacoes.length, 20);
  for (const animacao of json.animacoes) {
    assert.ok(fonte.includes(`id = "${animacao.id}"`), `${animacao.id} não está no índice Luau`);
    assert.ok(
      fonte.includes(`duracaoBase = ${animacao.duracaoBase}`),
      `duração de ${animacao.id} não bate: o watchdog do R11 sai do índice`,
    );
  }
});

test("as 20 animações existem como módulo e concordam com o índice", async () => {
  const json = JSON.parse(await readFile(path.join(RAIZ, "data", "animacoes.json"), "utf8"));
  const dir = path.join(RAIZ, "game", "src", "animacoes");
  const modulos = (await readdir(dir)).filter((f) => f.endsWith(".lua"));

  assert.equal(modulos.length, 20, "a biblioteca tem 20 animações");

  const campo = (fonte, nome, padrao) => (new RegExp(`${nome}\\s*=\\s*${padrao}`).exec(fonte) ?? [])[1];

  /**
   * O campo pode ser literal (`duracaoBase = 0.4`) ou uma constante do próprio
   * módulo (`duracaoBase = DURACAO_BASE`). A segunda forma é melhor código —
   * mantém metadado e efeito em sincronia dentro do arquivo — então o teste
   * resolve a constante em vez de exigir literal.
   */
  const numero = (fonte, nome) => {
    const bruto = campo(fonte, nome, "([A-Za-z0-9_.]+)");
    if (bruto === undefined) return NaN;
    if (/^[0-9.]+$/.test(bruto)) return Number(bruto);
    const constante = campo(fonte, `local ${bruto}`, "([0-9.]+)");
    return constante === undefined ? NaN : Number(constante);
  };

  for (const esperado of json.animacoes) {
    const arquivo = path.join(dir, `${esperado.id}.lua`);
    assert.ok(modulos.includes(`${esperado.id}.lua`), `falta o módulo de ${esperado.id}`);

    const fonte = await readFile(arquivo, "utf8");
    assert.deepEqual(
      {
        nome: campo(fonte, "nome", '"([^"]+)"'),
        direcao: campo(fonte, "direcao", '"(\\w+)"'),
        pesoVisual: numero(fonte, "pesoVisual"),
        duracaoBase: numero(fonte, "duracaoBase"),
        aceitaDeltaVariavel: campo(fonte, "aceitaDeltaVariavel", "(true|false)") === "true",
      },
      {
        nome: esperado.nome,
        direcao: esperado.direcao,
        pesoVisual: esperado.pesoVisual,
        duracaoBase: esperado.duracaoBase,
        aceitaDeltaVariavel: esperado.aceitaDeltaVariavel,
      },
      `${esperado.id}: a duração do índice é o que arma o watchdog do R11; divergir devolve o controle na hora errada`,
    );
  }
});

test("nenhuma animação depende de asset com upload nem toma o controle do boneco", async () => {
  const dir = path.join(RAIZ, "game", "src", "animacoes");
  const arquivos = (await readdir(dir)).filter((f) => f.endsWith(".lua"));

  const semComentario = (fonte) =>
    fonte.split("\n").filter((linha) => !/^\s*--/.test(linha)).join("\n");

  const infratores = [];
  for (const arquivo of arquivos) {
    const fonte = semComentario(await readFile(path.join(dir, arquivo), "utf8"));

    // ADR-004: asset visual passa por moderação e não é automatizável. Id
    // inventado vira erro em runtime, no meio da live.
    if (/rbxassetid:\/\/\d/.test(fonte)) infratores.push(`${arquivo}: rbxassetid inventado`);

    // ADR-005: quem move e ancora o boneco é movimento.lua, sozinho. Animação
    // que mexe nisso disputa a posição com o Tween.
    for (const proibido of ["AssemblyLinearVelocity", "\\.Anchored%s*=%s*true.*HumanoidRootPart", "Humanoid\\.WalkSpeed", "Humanoid\\.JumpPower"]) {
      if (new RegExp(proibido).test(fonte)) infratores.push(`${arquivo}: mexe em ${proibido}`);
    }
  }

  assert.deepEqual(infratores, []);
});

test("os tokens visuais são os mesmos no Luau e no CSS", async () => {
  const tokens = JSON.parse(await readFile(path.join(RAIZ, "data", "tokens.json"), "utf8"));
  const lua = await lerJogo("shared", "tokens.lua");
  const css = await readFile(path.join(RAIZ, "panel", "src", "styles", "tokens.css"), "utf8");

  for (const [numero, faixa] of Object.entries(tokens.faixas)) {
    const n = Number.parseInt(faixa.cor.slice(1), 16);
    const rgb = `Color3.fromRGB(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    assert.ok(lua.includes(rgb), `faixa ${numero} não está em tokens.lua`);
    assert.ok(css.includes(`--faixa-${numero}: ${faixa.cor}`), `faixa ${numero} não está em tokens.css`);
  }
});

test("os arquivos gerados avisam que são gerados", async () => {
  for (const arquivo of [["shared", "tokens.lua"], ["shared", "indiceAnimacoes.lua"]]) {
    const fonte = await lerJogo(...arquivo);
    assert.match(fonte, /GERADO por scripts\//, `${arquivo.join("/")} sem o aviso: alguém vai editar à mão`);
  }
});

/* -------------------------------------------------------------- */
/* Segurança                                                       */
/* -------------------------------------------------------------- */

test("nenhum script Luau versionado carrega token, chave ou URL de túnel", async () => {
  const arquivos = await listarLua(path.join(RAIZ, "game", "src"));

  // Instrução de setup precisa mostrar a cara de uma URL de túnel para o
  // streamer saber o que colar. Um subdomínio que se anuncia como exemplo não
  // é segredo; o que este teste procura é alguém tendo colado o dele de verdade.
  const EH_EXEMPLO = /(?:seu-|sua-|meu-|exemplo|example|invalid|xxx|abc123)/i;

  const infratores = [];
  for (const arquivo of arquivos) {
    const fonte = await readFile(arquivo, "utf8");
    const relativo = path.relative(RAIZ, arquivo);

    for (const url of fonte.match(/https?:\/\/[\w.-]*(?:trycloudflare|ngrok|cfargotunnel)[\w.-]*/gi) ?? []) {
      if (!EH_EXEMPLO.test(url)) infratores.push(`${relativo}: URL de túnel de verdade`);
    }

    for (const literal of fonte.match(/(?:token|apikey|api_key)\s*=\s*["'][A-Za-z0-9_-]{16,}["']/gi) ?? []) {
      if (!EH_EXEMPLO.test(literal)) infratores.push(`${relativo}: token literal`);
    }
  }

  assert.deepEqual(infratores, [], "isto vai para o git; segredo mora no ServerStorage (11_SEGURANCA, camada 2)");
});

test("o teste de segredo pega um segredo de verdade", async () => {
  // Um guarda que nunca acusa passa sempre. Este confere que o anterior morde.
  const EH_EXEMPLO = /(?:seu-|sua-|meu-|exemplo|example|invalid|xxx|abc123)/i;
  const vazado = 'local url = "https://tempestade-de-rocha.trycloudflare.com"';

  const achados = (vazado.match(/https?:\/\/[\w.-]*(?:trycloudflare|ngrok|cfargotunnel)[\w.-]*/gi) ?? [])
    .filter((url) => !EH_EXEMPLO.test(url));

  assert.equal(achados.length, 1);
});

/* -------------------------------------------------------------- */
/* Contrato com a ponte                                            */
/* -------------------------------------------------------------- */

test("o que o jogo valida como evento é o que a ponte promete mandar", async () => {
  const { validar } = await criarValidador();
  const fonte = await lerJogo("shared", "tipos.lua");

  // Se a ponte passar a mandar um campo que o jogo não lê, o jogo ignora e
  // segue. Mas se o jogo LER um campo que a ponte não manda, ele quebra em
  // produção e ninguém percebe até a live.
  const lidosPeloJogo = ["id", "animacaoId", "delta", "intensidade", "efeitoCurto", "nomeDoador", "presenteNome", "emitidoEm"];
  for (const campo of lidosPeloJogo) {
    assert.ok(fonte.includes(`bruto.${campo}`), `tipos.lua deveria ler ${campo}`);
  }

  const doContrato = {
    cursor: 1,
    eventos: [Object.fromEntries([
      ["id", 1], ["animacaoId", "sub_cometa"], ["delta", 15], ["intensidade", 3],
      ["efeitoCurto", false], ["nomeDoador", "theuz"], ["presenteNome", "Galaxy"], ["emitidoEm", 1],
    ])],
  };
  assert.deepEqual(validar("evento-jogo", doContrato), [], "e o schema tem que aceitar exatamente esses campos");
});
