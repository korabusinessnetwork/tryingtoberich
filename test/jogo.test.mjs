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
import { acharParser, comoInstalarParser } from "../scripts/verificar-luau.mjs";

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
  // A busca é a MESMA do `npm run luau`, importada e não recopiada: duas listas
  // de nomes de binário divergem, e a que envelhece é sempre a do teste.
  const parser = await acharParser();
  if (!parser) {
    assert.fail(`Parser de Lua não encontrado; instale com: ${comoInstalarParser()}`);
  }

  const arquivos = await listarLua(path.join(RAIZ, "game", "src"));
  assert.ok(arquivos.length >= 6, `esperava ao menos os módulos compartilhados, achei ${arquivos.length}`);

  const quebrados = [];
  for (const arquivo of arquivos) {
    try {
      await executar(parser, ["-p", arquivo]);
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

test("a fórmula do ADR-009 dá o mesmo número nas TRÊS linguagens", async () => {
  // Ela vive em JavaScript duas vezes (ponte e painel) e em Luau uma. O painel
  // não importa do Node e o Luau não importa de ninguém, então a duplicação é
  // assumida — e é justamente por isso que precisa de trava.
  //
  // Divergir aqui não quebra nada de forma visível: o painel só desenharia uma
  // barra mentindo sobre um mapa que a ponte já aprovou e o jogo já construiu.
  const ponte = await import("../bridge/src/dominio/regras.mjs");
  const painel = await import("../panel/src/lib/regras.js");
  const luau = await lerJogo("server", "jogabilidade.lua");

  assert.equal(painel.FATOR_SALTO_VERTICAL, ponte.FATOR_SALTO_VERTICAL);
  assert.equal(painel.GRAVIDADE_ROBLOX, ponte.GRAVIDADE_ROBLOX);
  assert.equal(painel.VELOCIDADE_ANDAR_ROBLOX, ponte.VELOCIDADE_ANDAR_ROBLOX);
  assert.equal(constanteLuau(luau, "local GRAVIDADE"), painel.GRAVIDADE_ROBLOX);

  for (const jumpHeight of [7, 7.2, 9, 10, 12]) {
    assert.equal(
      painel.alcanceHorizontalDoPulo(jumpHeight).toFixed(6),
      ponte.alcanceHorizontalDoPulo(jumpHeight).toFixed(6),
      `jumpHeight ${jumpHeight}`,
    );
  }
});

test("a faixa de moedas é a mesma no painel e na ponte (R3)", async () => {
  const ponte = await import("../bridge/src/dominio/regras.mjs");
  const painel = await import("../panel/src/lib/regras.js");

  for (const moedas of [0, 1, 9, 10, 99, 100, 999, 1000, 4999, 5000, 29999, 44999]) {
    assert.equal(painel.faixaDeMoedas(moedas), ponte.faixaDeMoedas(moedas), `${moedas} moedas`);
  }
});

test("o exemplo de mapa cabe no pulo E forma degrau, não coluna", async () => {
  const { alcanceHorizontalDoPulo, problemasDeJogabilidade } = await import("../bridge/src/dominio/regras.mjs");
  const mapa = JSON.parse(await readFile(path.join(RAIZ, "data", "exemplos", "mapa-torre-vulcanica-01.json"), "utf8"));
  const { variacaoHorizontal, raioBase, variacaoRaio } = mapa.plataformas;

  // O que o pulo precisa vencer é o VÃO entre as bordas, não a distância entre
  // os centros: os dois raios entram no meio. Comparar centro a centro era o
  // erro que deixava a torre bem mais apertada do que o Roblox comporta.
  // Raio MÍNIMO: o pior caso do vão é o disco pequeno. Usar o máximo aqui
  // aprovava spec que a torre construída depois reprovava.
  const vao = variacaoHorizontal - 2 * raioBase * (1 - variacaoRaio);
  assert.ok(
    vao <= alcanceHorizontalDoPulo(mapa.jumpHeight),
    `vão de ${vao.toFixed(2)} passa do alcance do pulo`,
  );

  // O teto de geometria (raioBase × 1,2) saiu: descrevia discos largos colados
  // no eixo, que é o oposto do caracol. O que vale agora é a regra do DEGRAU —
  // passo maior que o RAIO, não que o diâmetro. Degrau de escada se toca nas
  // bordas; o que não pode é um cobrir o anterior inteiro.
  assert.ok(
    raioBase * (1 + variacaoRaio) < variacaoHorizontal,
    "disco com raio maior que o passo cobre o anterior inteiro: vira coluna",
  );

  assert.deepEqual(problemasDeJogabilidade(mapa), []);
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

/**
 * O tamanho da biblioteca não é constante: ela cresce quando entra animação
 * nova. Fixar o número aqui só faria o teste quebrar a cada linha somada na
 * tabela do doc, que é justamente a operação que o doc manda fazer. O que
 * importa é que doc, JSON, índice Luau e módulos digam O MESMO número — então
 * a contagem esperada sai da tabela do doc, que é a fonte de verdade.
 */
const contarNaTabelaDoDoc = async () => {
  const doc = await readFile(
    path.join(RAIZ, "docs", "03_REGRAS_DE_NEGOCIO", "biblioteca-animacoes.md"),
    "utf8",
  );
  return (doc.match(/^\|\s*`(sub|des)_[a-z_]+`\s*\|/gm) ?? []).length;
};

test("o índice Luau tem as mesmas animações que o JSON e que o doc", async () => {
  const fonte = await lerJogo("shared", "indiceAnimacoes.lua");
  const json = JSON.parse(await readFile(path.join(RAIZ, "data", "animacoes.json"), "utf8"));

  assert.equal(json.animacoes.length, await contarNaTabelaDoDoc());
  for (const animacao of json.animacoes) {
    assert.ok(fonte.includes(`id = "${animacao.id}"`), `${animacao.id} não está no índice Luau`);
    assert.ok(
      fonte.includes(`duracaoBase = ${animacao.duracaoBase}`),
      `duração de ${animacao.id} não bate: o watchdog do R11 sai do índice`,
    );
  }
});

test("a coluna Ativa do doc chega inteira no JSON e no índice Luau", async () => {
  const doc = await readFile(
    path.join(RAIZ, "docs", "03_REGRAS_DE_NEGOCIO", "biblioteca-animacoes.md"),
    "utf8",
  );
  const json = JSON.parse(await readFile(path.join(RAIZ, "data", "animacoes.json"), "utf8"));
  const fonte = await lerJogo("shared", "indiceAnimacoes.lua");

  // A tabela do doc é a fonte: `| \`id\` | nome | peso | duração | delta | ativa |`.
  const naTabela = new Map();
  for (const linha of doc.split("\n")) {
    const campos = /^\|\s*`((?:sub|des)_[a-z_]+)`\s*\|[^|]*\|[^|]*\|[^|]*\|\s*(?:sim|não)\s*\|\s*(sim|não)\s*\|/.exec(linha);
    if (campos) naTabela.set(campos[1], campos[2] === "sim");
  }

  assert.equal(naTabela.size, json.animacoes.length, "linha da tabela sem a coluna Ativa preenchida");

  for (const animacao of json.animacoes) {
    assert.equal(animacao.ativa, naTabela.get(animacao.id), `${animacao.id}: doc e JSON discordam sobre Ativa`);
    assert.ok(
      fonte.includes(`id = "${animacao.id}", nome = "${animacao.nome}"`),
      `${animacao.id} não está no índice Luau`,
    );
  }

  // O índice Luau carrega a mesma contagem. Se ele e o JSON discordassem, o
  // painel ofereceria uma animação que o jogo já considera aposentada.
  const ativasNoLuau = (fonte.match(/ativa = true/g) ?? []).length;
  assert.equal(ativasNoLuau, json.animacoes.filter((a) => a.ativa).length);
});

test("aposentar é diferente de apagar: o módulo da inativa continua lá e tocável", async () => {
  // A regra é a mesma do `ativo` do presente no catálogo. Preset salvo e sessão
  // no histórico guardam o animacaoId; apagar o módulo transformaria os dois em
  // referência quebrada, e o jogo deixaria de tocar algo que ele prometeu tocar.
  const json = JSON.parse(await readFile(path.join(RAIZ, "data", "animacoes.json"), "utf8"));
  const modulos = new Set(
    (await readdir(path.join(RAIZ, "game", "src", "animacoes"))).filter((f) => f.endsWith(".lua")),
  );

  const aposentadas = json.animacoes.filter((a) => a.ativa === false);
  assert.ok(aposentadas.length > 0, "o teste não vale nada com a biblioteca inteira ativa");

  for (const animacao of aposentadas) {
    assert.ok(modulos.has(`${animacao.id}.lua`), `${animacao.id} foi aposentada E apagada — preset antigo quebra`);
  }
});

test("toda animação da tabela existe como módulo e concorda com o índice", async () => {
  const json = JSON.parse(await readFile(path.join(RAIZ, "data", "animacoes.json"), "utf8"));
  const dir = path.join(RAIZ, "game", "src", "animacoes");
  const modulos = (await readdir(dir)).filter((f) => f.endsWith(".lua"));

  assert.equal(
    modulos.length,
    json.animacoes.length,
    "sobrou ou faltou módulo .lua em game/src/animacoes para o tamanho da biblioteca",
  );

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
/* Consistência entre os módulos do servidor                       */
/* -------------------------------------------------------------- */

test("o orquestrador só chama função que existe nos outros módulos", async () => {
  // O jogo foi escrito por agentes em paralelo, cada um dono de um arquivo, e
  // sessao.lua é o único que conhece todos. Uma assinatura que não bate só
  // apareceria quando o Studio carregasse o lugar e a sessão tentasse subir.
  const modulos = {
    ConstrutorMapa: "construtorMapa",
    Movimento: "movimento",
    Personagem: "personagem",
    Plataformas: "plataformas",
    Ponte: "ponte",
  };

  const sessao = await lerJogo("server", "sessao.lua");
  const faltando = [];

  for (const [nome, arquivo] of Object.entries(modulos)) {
    const fonte = await lerJogo("server", `${arquivo}.lua`);
    const chamadas = new Set([...sessao.matchAll(new RegExp(`${nome}\\.(\\w+)\\(`, "g"))].map((m) => m[1]));

    assert.ok(chamadas.size > 0, `sessao.lua não usa ${nome}: o orquestrador deveria amarrar todos`);
    for (const funcao of chamadas) {
      if (!new RegExp(`function ${nome}\\.${funcao}\\b`).test(fonte)) faltando.push(`${nome}.${funcao}`);
    }
  }

  assert.deepEqual(faltando, []);
});

test("todo RemoteEvent do contrato tem os dois lados ligados", async () => {
  // O outro lado do mesmo risco: HUD escutando um RemoteEvent que ninguém
  // dispara é feature morta sem erro nenhum. Foi exatamente o que aconteceu
  // com COMBATE_ANULADO até a síntese.
  //
  // Casa por NOME da constante e não por padrão de chamada: o código real liga
  // por variável intermediária (`local remoto = Eventos.obter(...)` e depois
  // `remoto.OnClientEvent`), e um regex preso à forma da chamada passa vazio —
  // que é pior que não ter teste, porque parece verde.
  const contrato = await lerJogo("shared", "eventos.lua");
  const definidos = [...contrato.matchAll(/^Eventos\.([A-Z_]+)\s*=\s*"/gm)].map((m) => m[1]);
  assert.ok(definidos.length >= 8, `esperava os eventos do contrato, achei ${definidos.length}`);

  const juntar = async (subdir) => {
    const arquivos = (await readdir(path.join(RAIZ, "game", "src", subdir))).filter((f) => f.endsWith(".lua"));
    const partes = await Promise.all(arquivos.map((a) => lerJogo(subdir, a)));
    return partes.join("\n");
  };

  // efeitos.lua dispara TREMOR, CAMERA e FLASH, e mora em shared/ porque as
  // animações o usam. Para efeito de "quem emite", ele conta como servidor.
  const ladoServidor = `${await juntar("server")}\n${await juntar("shared")}`;
  const ladoCliente = await juntar("client");

  const soltos = [];
  for (const evento of definidos) {
    const usa = (fonte) => new RegExp(`Eventos\\.${evento}\\b`).test(fonte);
    const noServidor = usa(ladoServidor);
    const noCliente = usa(ladoCliente);
    // PASTA é o nome da Folder, não um evento.
    if (evento === "PASTA") continue;
    if (noCliente && !noServidor) soltos.push(`${evento}: cliente escuta, ninguém dispara`);
    if (noServidor && !noCliente) soltos.push(`${evento}: servidor dispara, ninguém escuta`);
  }

  assert.deepEqual(soltos, []);
});

test("o teste de evento solto pega um evento solto", async () => {
  // Guarda que nunca acusa passa sempre — e o anterior já passou vazio uma vez
  // por regex preso à forma da chamada. Este confere que ele morde.
  const contrato = 'Eventos.INVENTADO = "Inventado"\nEventos.PRESENTE = "Presente"\n';
  const definidos = [...contrato.matchAll(/^Eventos\.([A-Z_]+)\s*=\s*"/gm)].map((m) => m[1]);

  assert.deepEqual(definidos, ["INVENTADO", "PRESENTE"]);
  assert.equal(/Eventos\.INVENTADO\b/.test("nada aqui"), false);
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

test("o estado que o jogo PUBLICA é o estado que o schema aceita", async () => {
  // O irmão do teste acima, no sentido contrário — e este nasceu de um bug
  // real: `montarEstado` mandava `totalPlataformas` e `sessaoAtiva`, o
  // estado-jogo.schema.json é `additionalProperties: false` e não tinha os
  // dois. Resultado: TODO POST /jogo/estado era recusado na validação, a rota
  // respondia 204 como se estivesse tudo bem, e o painel ficava com a
  // plataforma em "—" para sempre. Silencioso dos dois lados.
  //
  // Por isso a checagem parte da FONTE do jogo, e não de um objeto escrito à
  // mão aqui: um campo novo em `montarEstado` que ninguém puser no schema
  // quebra este teste no mesmo commit.
  const fonte = await lerJogo("server", "sessao.lua");
  const bloco = fonte.slice(fonte.indexOf("local function montarEstado()"));
  const corpo = bloco.slice(0, bloco.search(/^end$/m));

  // Duas tabulações: são os campos da tabela devolvida, e não as locais da
  // função nem o `return`.
  const publicados = [...corpo.matchAll(/^\t\t([a-zA-Z][a-zA-Z0-9]*)\s*=/gm)].map((m) => m[1]);
  assert.ok(publicados.includes("plataformaReferencia"), "não consegui ler montarEstado()");

  const schema = JSON.parse(await readFile(path.join(RAIZ, "data", "schemas", "estado-jogo.schema.json"), "utf8"));
  const aceitos = new Set(Object.keys(schema.properties));

  const recusados = publicados.filter((campo) => !aceitos.has(campo));
  assert.deepEqual(
    recusados,
    [],
    "campo que o jogo publica e o schema não conhece derruba o payload INTEIRO, sem erro visível",
  );

  // E o payload completo passa de verdade, não só campo a campo.
  const { validar } = await criarValidador();
  assert.deepEqual(
    validar("estado-jogo", {
      plataformaReferencia: 12, plataformaMaxima: 40, quedasNaturais: 3,
      emAnimacao: false, totalPlataformas: 40, sessaoAtiva: true, vitoria: false,
    }),
    [],
  );
});

test("a checagem de estado publicado morde de verdade", () => {
  // Guarda que nunca acusa passa sempre, e este projeto já foi mordido três
  // vezes por isso (o gate do painel, o teste de RemoteEvent, e o próprio bug
  // que o teste acima existe para pegar). Aqui a MESMA leitura roda contra uma
  // fonte de mentira com um campo que o schema não conhece.
  const fonteFalsa = [
    "local function montarEstado()",
    "\tlocal total = 0",
    "\treturn {",
    "\t\tplataformaReferencia = 1,",
    "\t\tinventado = true,",
    "\t}",
    "end",
  ].join("\n");

  const bloco = fonteFalsa.slice(fonteFalsa.indexOf("local function montarEstado()"));
  const corpo = bloco.slice(0, bloco.search(/^end$/m));
  const publicados = [...corpo.matchAll(/^\t\t([a-zA-Z][a-zA-Z0-9]*)\s*=/gm)].map((m) => m[1]);

  assert.deepEqual(publicados, ["plataformaReferencia", "inventado"]);
  assert.deepEqual(
    publicados.filter((campo) => !new Set(["plataformaReferencia"]).has(campo)),
    ["inventado"],
  );
});

test("R6 — a vitória sai de ENCOSTAR no topo, e o jogo não reinicia sozinho", async () => {
  const fonte = await lerJogo("server", "sessao.lua");

  // A referência é a última plataforma que o boneco ENCOSTOU (R9.2). Ler
  // altura aqui entregaria a vitória a quem passou voando por cima no pulo.
  assert.match(fonte, /vitoria = total > 0 and Plataformas\.referencia\(\) >= total/);

  // R6 é explícito: chegar ao topo não reinicia sozinho, o streamer decide no
  // painel. Um `reiniciarCorrida` disparado pela própria detecção de vitória
  // seria a regra invertida — e é um erro fácil de cometer depois.
  const detecta = fonte.indexOf("vitoria = total > 0");
  const trecho = fonte.slice(detecta, detecta + 400);
  assert.doesNotMatch(trecho, /reiniciarCorrida/, "a vitória não pode chamar o reinício: quem decide é o painel");

  // Quem chama o reinício é o comando que veio da ponte, e mais ninguém.
  // `quantidade` entrou como segundo parâmetro: um donate de placar pode valer
  // N rodadas (R4). A afirmação continua sendo "existe UM ponto de entrada de
  // comando", que é o que este teste protege.
  assert.match(fonte, /aoComando = function\(tipo(?:, quantidade)?\)/);
  assert.match(fonte, /Plataformas\.reiniciarCorrida/);
});

/* -------------------------------------------------------------- */
/* Aplicação do acervo: textura e céu (ADR-004)                    */
/* -------------------------------------------------------------- */

test("a textura é uma INSTÂNCIA Texture, não uma propriedade de Part", async () => {
  // `Part` não tem propriedade `Texture` no Roblox. Escrever `parte.Texture =`
  // não dá erro de sintaxe e não aplica nada: a plataforma fica lisa e não há
  // o que depurar. O comentário deste módulo chegou a descrever essa API que
  // não existe, e é por isso que a checagem virou teste.
  const fonte = await lerJogo("server", "construtorMapa.lua");

  assert.match(fonte, /Instance\.new\("Texture"\)/);
  assert.doesNotMatch(fonte, /parte\.Texture\s*=/, "Part não tem .Texture; use uma Texture filha");
  assert.match(fonte, /StudsPerTileU/, "sem StudsPerTile a imagem estica em vez de ladrilhar");
});

test("o céu preenche as SEIS faces: um Sky com faces vazias não aparece", async () => {
  const fonte = await lerJogo("server", "construtorMapa.lua");

  //[[ As seis continuam obrigatórias; o que mudou foi de ONDE vem cada uma.
  //
  // Antes era a mesma `url` nas seis, porque o acervo guardava uma imagem por
  // céu. Agora a peça pode ter seis faces distintas — céu de verdade tem
  // horizonte, e horizonte não existe com a mesma imagem no teto e no chão.
  // Face vazia some do Sky e deixa buraco, então nenhuma pode faltar. ]]
  for (const face of ["SkyboxUp", "SkyboxDn", "SkyboxLf", "SkyboxRt", "SkyboxFt", "SkyboxBk"]) {
    // `includes` e não regex: o que importa é a face receber ALGUMA coisa, e
    // escapar ponto e barra numa string montada só criou chance de errar.
    assert.ok(fonte.includes(`ceu.${face} = `), `falta a face ${face}`);
  }
  assert.match(fonte, /local function faceOu/, "a face precisa cair na imagem única quando não há seis");
});

test("limpar() também tira o céu, que vive fora da pasta da torre", async () => {
  // O Sky fica em Lighting, então Destroy() na pasta da torre não o alcança.
  // Sem isto, o céu do mapa anterior fica sobre a torre nova.
  const fonte = await lerJogo("server", "construtorMapa.lua");
  const limpar = fonte.slice(fonte.indexOf("function ConstrutorMapa.limpar"));

  assert.match(limpar.slice(0, 600), /Lighting:FindFirstChild\(ConstrutorMapa\.CEU\)/);
});

test("o assetId vira string com %d, nunca com tostring", async () => {
  // tostring num id grande sai em notação científica e
  // "rbxassetid://1.8294e+10" não carrega nada, sem erro nenhum.
  const fonte = await lerJogo("server", "construtorMapa.lua");
  const url = fonte.slice(fonte.indexOf("local function urlDeAsset"));

  assert.match(url.slice(0, 400), /string\.format\("%d"/);
});

test("a ponte carrega a config sob demanda, não só no iniciar", async () => {
  // Regressão de um bug que nunca deixou o jogo subir: `Sessao.iniciar` busca o
  // mapa ANTES de ligar o laço de eventos (ordem correta — evento chegando sem
  // torre não tem onde ser aplicado), mas quem preenchia a config era o laço.
  // O primeiro passo falhava sempre com "ponte não configurada", em qualquer
  // máquina, com a KoraConfig perfeitamente montada.
  const fonte = await lerJogo("server", "ponte.lua");

  assert.match(fonte, /local function garantirConfiguracao/);

  // `requisitar` é o portão de TODA chamada HTTP: é ele que tem que garantir.
  const requisitar = fonte.slice(fonte.indexOf("local function requisitar"));
  assert.match(requisitar.slice(0, 500), /garantirConfiguracao\(\)/);

  // E o motivo real tem que subir: a mensagem genérica escondia qual Folder ou
  // StringValue faltava, que é a única informação acionável.
  assert.doesNotMatch(
    requisitar.slice(0, 500),
    /return nil, nil, "ponte não configurada"/,
    "o erro de Configuracao.carregar não pode ser trocado por texto genérico",
  );
});

test("buscar o mapa vem antes de ligar o laço de eventos", async () => {
  // A ordem importa e é o oposto do intuitivo: evento de presente chegando
  // antes de a torre existir não tem plataforma para aplicar.
  const fonte = await lerJogo("server", "sessao.lua");
  const iniciar = fonte.slice(fonte.indexOf("function Sessao.iniciar"));

  assert.ok(
    iniciar.indexOf("Ponte.buscarMapa") < iniciar.indexOf("Ponte.iniciar("),
    "o mapa tem que ser buscado antes do laço começar",
  );
});

test("as DUAS checagens do jogo medem a mesma coisa: o vão, não os centros", async () => {
  // Esta regra vive em três lugares — regras.mjs, verificarSpec e
  // verificarConstruido — e já divergiu duas vezes. Nas duas, o sintoma foi o
  // mesmo: a torre travada em passos muito menores do que o pulo do Roblox
  // alcança, porque alguém comparou distância entre CENTROS com o alcance,
  // esquecendo que os dois raios entram no meio.
  const fonte = await lerJogo("server", "jogabilidade.lua");

  const spec = fonte.slice(fonte.indexOf("function Jogabilidade.verificarSpec"), fonte.indexOf("function Jogabilidade.verificarConstruido"));
  const construido = fonte.slice(fonte.indexOf("function Jogabilidade.verificarConstruido"));

  assert.match(spec, /vao/, "verificarSpec tem que medir o vão");
  assert.match(construido, /vao/, "verificarConstruido sempre mediu o vão");

  // O erro concreto: comparar variacaoHorizontal cru com o alcance.
  assert.doesNotMatch(
    spec,
    /p\.variacaoHorizontal > distanciaHorizontalMax/,
    "comparar centro a centro com o alcance ignora os dois raios",
  );
});

test("a ponte e o jogo concordam no vão para o mesmo mapa", async () => {
  // A conta da ponte, aplicada ao exemplo, tem que dar o mesmo veredito que a
  // fórmula escrita no Luau. Divergir aqui é o mapa passar num lado e ser
  // recusado no outro — que foi exatamente o que aconteceu.
  const { problemasDeJogabilidade, alcanceHorizontalDoPulo } = await import("../bridge/src/dominio/regras.mjs");
  const mapa = JSON.parse(await readFile(path.join(RAIZ, "data", "exemplos", "mapa-torre-vulcanica-01.json"), "utf8"));
  const p = mapa.plataformas;

  const vao = p.variacaoHorizontal - 2 * p.raioBase * (1 - p.variacaoRaio);
  const cabeNoJogo = vao <= alcanceHorizontalDoPulo(mapa.jumpHeight) && p.raioBase * (1 + p.variacaoRaio) < p.variacaoHorizontal;

  assert.equal(problemasDeJogabilidade(mapa).length === 0, cabeNoJogo);
});

test("o vão usa o raio MÍNIMO e a cobertura o MÁXIMO: piores casos opostos", async () => {
  // Regressão de um erro que só apareceu na torre construída: o spec passava
  // com vão de 4,2 e a construção reprovava com vão de 9,7. Causa: a validação
  // do spec media o vão com o disco GRANDE, e `variacaoRaio` sorteia para baixo
  // também — dois discos pequenos abrem um vão bem maior que a média.
  const { problemasDeJogabilidade } = await import("../bridge/src/dominio/regras.mjs");

  const base = {
    jumpHeight: 12,
    totalPlataformas: 100,
    marcos: [{ plataforma: 100, tipo: "topo" }],
    plataformas: { raioBase: 8, variacaoRaio: 0.5, espacamentoVertical: 8, variacaoHorizontal: 20 },
  };

  // Com variacaoRaio 0,5 o disco pode encolher para 4: vão de 20 - 8 = 12,
  // muito acima do alcance 7,83. Tem que reprovar.
  assert.match(problemasDeJogabilidade(base).join(" "), /vão/, "disco pequeno abre vão grande demais");

  // Com o mesmo passo e variação baixa, o pior vão cai para 5,6 e passa.
  const estavel = { ...base, plataformas: { ...base.plataformas, variacaoRaio: 0.1 } };
  assert.deepEqual(problemasDeJogabilidade(estavel), []);
});

test("a torre é uma escada QUADRADA, e o quadrado sai do passo", async () => {
  const fonte = await lerJogo("server", "construtorMapa.lua");

  assert.match(fonte, /local function pontoNoQuadrado/);
  assert.match(fonte, /DEGRAUS_POR_VOLTA/);

  // O caracol circular saiu: nada de cos/sen posicionando plataforma. Se
  // voltarem, é sinal de que alguém reintroduziu a órbita redonda por engano.
  const construir = fonte.slice(fonte.indexOf("local function construirPlataforma"));
  assert.doesNotMatch(construir.slice(0, 900), /math\.cos|math\.sin/, "posição não usa mais trigonometria");

  // O tamanho do quadrado é DERIVADO do passo, não um número solto: assim
  // mexer só na distância entre degraus redimensiona a torre coerentemente.
  assert.match(fonte, /meioLado = \(DEGRAUS_POR_VOLTA \* mapa\.plataformas\.variacaoHorizontal\) \/ 8/);
});

test("com 24 degraus por volta, cada lado do quadrado leva 6 degraus inteiros", async () => {
  // Espelha pontoNoQuadrado do Luau. A propriedade que importa: meio-lado é
  // 3×passo, então o lado é 6×passo e nenhum degrau fica atravessado numa
  // quina — para QUALQUER passo, inclusive os que o painel de afinação produz.
  const pontoNoQuadrado = (distancia, meioLado) => {
    const lado = 2 * meioLado;
    const d = distancia % (4 * lado);
    if (d < lado) return [meioLado, -meioLado + d];
    if (d < 2 * lado) return [meioLado - (d - lado), meioLado];
    if (d < 3 * lado) return [-meioLado, meioLado - (d - 2 * lado)];
    return [-meioLado + (d - 3 * lado), -meioLado];
  };

  for (const passo of [12, 18, 25.5]) {
    const meioLado = (24 * passo) / 8;

    for (let i = 1; i <= 48; i += 1) {
      const [x1, z1] = pontoNoQuadrado((i - 1) * passo, meioLado);
      const [x2, z2] = pontoNoQuadrado(i * passo, meioLado);
      const distancia = Math.hypot(x2 - x1, z2 - z1);

      assert.ok(
        distancia <= passo + 1e-9,
        `passo ${passo}, degrau ${i}: distância ${distancia.toFixed(3)} passou do passo`,
      );
    }
  }
});

test("as DUAS guardas do vestiário leem aoVivo, não sessaoAtiva", async () => {
  // Regressão: a guarda do servidor foi corrigida para `aoVivo` e a do cliente
  // ficou em `sessaoAtiva`. O botão continuou recusando em todo teste no Studio
  // — onde a sessão roda e live não existe — e parecia que a correção não tinha
  // funcionado. São duas guardas de propósito (o servidor recusa o pedido, o
  // cliente evita o botão mentir), mas as duas têm que ler o MESMO campo.
  const cliente = await lerJogo("client", "vestiario.client.lua");
  const inicio = await lerJogo("server", "inicio.server.lua");

  assert.match(cliente, /aoVivoExplicito/, "o cliente tem que ler aoVivo");
  assert.doesNotMatch(cliente, /dados\.sessaoAtiva/, "sessaoAtiva é só 'tem sessão', não 'tem plateia'");
  assert.match(inicio, /Sessao\.estado\(\)\.aoVivo/, "o servidor idem");
});

test("aoVivo é sessão E live: os dois campos existem e são diferentes", async () => {
  // Se um dia alguém fizer aoVivo = rodando, a distinção some sem quebrar nada
  // visível — e o vestiário volta a travar no Studio.
  const fonte = await lerJogo("server", "sessao.lua");
  const bloco = fonte.slice(fonte.indexOf("local function montarEstado()"));
  const corpo = bloco.slice(0, bloco.search(/^end$/m));

  assert.match(corpo, /sessaoAtiva = estado\.rodando/);
  assert.match(corpo, /aoVivo = estado\.rodando and Ponte\.liveConectada\(\)/);
});

test("todo ScreenGui declara ZIndexBehavior.Sibling", async () => {
  // Esta é a classe de bug mais silenciosa que apareceu no projeto: em Global,
  // o ZIndex é comparado na TELA INTEIRA e não entre irmãos, então um filho sem
  // ZIndex (1) desaparece atrás do próprio pai (2). O vestiário abria como um
  // retângulo preto — 57 elementos construídos, nenhum visível, nenhum erro no
  // Output e nada para depurar.
  const clientes = ["vestiario.client.lua", "ajustes.client.lua", "hud.client.lua", "flash.client.lua"];

  for (const arquivo of clientes) {
    const fonte = await lerJogo("client", arquivo);
    if (!fonte.includes("ScreenGui")) continue;

    assert.match(
      fonte,
      /ZIndexBehavior\s*=\s*Enum\.ZIndexBehavior\.Sibling/,
      `${arquivo} cria ScreenGui sem declarar ZIndexBehavior`,
    );
  }
});

test("o vestiário é dividido em abas, e cada uma rola sozinha", async () => {
  // As duas colunas eram o problema: tudo de uma vez, e a coluna direita
  // sozinha levava seis cores, quatro botões de efeito, cor, intensidade e
  // salvar. Em janela estreita algo saía cortado — e o corte era mudo.
  const fonte = await lerJogo("client", "vestiario.client.lua");

  for (const aba of ["Itens", "Cores", "Efeito", "Salvar"]) {
    assert.ok(fonte.includes(`criarAba("${aba}"`), `falta a aba ${aba}`);
  }

  // Canvas automático: nada depende da altura da janela.
  assert.match(fonte, /AutomaticCanvasSize = Enum\.AutomaticSize\.Y/);

  // TODA função que `abrirVestiario` chama nasce depois dela, junto com a GUI.
  // Sem declaração adiantada vira busca de global e estoura só ao abrir — e
  // isso já aconteceu duas vezes, com `mostrarAba` e com `pedirGaleria`.
  const corpoAbrir = fonte.slice(fonte.indexOf("local function abrirVestiario"));
  const chamadas = [...corpoAbrir.slice(0, 500).matchAll(/^	(\w+)\(/gm)].map((m) => m[1]);

  for (const chamada of chamadas) {
    const declaracao = fonte.indexOf(`local ${chamada}`);
    assert.ok(
      declaracao !== -1 && declaracao < fonte.indexOf("local function abrirVestiario"),
      `${chamada} é chamada por abrirVestiario sem ter sido declarada antes`,
    );
  }
  assert.ok(chamadas.length >= 2, "o teste tem que estar vendo as chamadas de verdade");
});

test("todo comando do contrato chega inteiro na sessão do jogo", async () => {
  // O bug que este teste tranca: a ponte do jogo filtrava por
  // `comando.tipo == "reiniciar"` com um comentário dizendo "só reiniciar
  // existe hoje". Nasceram mais quatro, cada um tratado na sessão, e ninguém
  // voltou nesta linha. Os três botões do painel e o vínculo de placar por
  // presente saíam da ponte, chegavam no jogo e morriam no transporte — sem
  // erro, sem aviso, sem nada na tela.
  //
  // A regra que sobrou: o transporte NÃO escolhe comando. Quem ignora o que
  // não conhece é a sessão, que é onde o significado mora.
  const contrato = JSON.parse(
    await readFile(path.join(RAIZ, "data", "schemas", "evento-jogo.schema.json"), "utf8"),
  );
  const tipos = JSON.stringify(contrato).match(/"enum":\s*\[\s*"reiniciar"[^\]]*\]/)?.[0];
  assert.ok(tipos, "o contrato precisa continuar listando os tipos de comando");
  const listados = [...tipos.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]).filter((t) => t !== "enum");
  assert.ok(listados.length >= 5, `esperava os cinco comandos, achei ${listados.join(", ")}`);

  const ponte = await lerJogo("server", "ponte.lua");
  const laco = ponte.slice(ponte.indexOf("corpo.comandos"), ponte.indexOf("corpo.comandos") + 400);
  for (const tipo of listados) {
    assert.ok(
      !laco.includes(`== "${tipo}"`),
      `o transporte está escolhendo comando por nome ("${tipo}") em vez de repassar todos`,
    );
  }

  // `==` para tratar, `~=` para o último, que é o `reiniciar` por exclusão.
  const sessao = await lerJogo("server", "sessao.lua");
  for (const tipo of listados) {
    assert.ok(
      new RegExp(`tipo [=~]= "${tipo}"`).test(sessao),
      `a sessão não trata o comando "${tipo}", que o contrato promete entregar`,
    );
  }
});

test("nenhum acessório é montado com AccessoryType.Unknown", async () => {
  // `Unknown` é o valor que a API DEVOLVE quando não sabe, não um valor que
  // `SetAccessories` aceita: o Roblox recusa a tabela inteira com "Input table
  // contained an invalid accessory type!" e o acessório some sem erro. O look
  // do vestiário e a skin da galeria caíam os dois nisso.
  const fonte = await lerJogo("server", "personagem.lua");
  const montagem = fonte.slice(0, fonte.indexOf("--[[\n\tPersonagem.definirAlturaDePulo"));

  assert.ok(
    !/AccessoryType\.Unknown/.test(montagem.replace(/--\[\[[\s\S]*?\]\]/g, "").replace(/^\s*--.*$/gm, "")),
    "AccessoryType.Unknown fora de comentário: o Roblox recusa a lista e a peça não entra",
  );
});

test("aplicar look e skin esperam o personagem estar no DataModel", async () => {
  // `ApplyDescription` recusa modelo solto com "DataModel was not available".
  // O `CharacterAdded` dispara com o personagem ainda sendo pendurado no
  // workspace: sem esperar, as duas primeiras tentativas do ADR-010 morriam
  // nisso e o look inteiro caía para "só cor de corpo", com os itens intactos.
  const fonte = await lerJogo("server", "personagem.lua");
  assert.match(fonte, /IsDescendantOf\(game\)/, "falta a espera pelo DataModel");

  for (const funcao of ["Personagem.aplicarSkin", "Personagem.aplicarLook"]) {
    const inicio = fonte.indexOf(`function ${funcao}`);
    assert.notEqual(inicio, -1, `${funcao} sumiu`);
    const corpo = fonte.slice(inicio, inicio + 1400);
    assert.ok(
      corpo.includes("esperarNoDataModel"),
      `${funcao} aplica a description sem esperar o personagem entrar no mundo`,
    );
  }
});

test("os dois formatos existem nas TRÊS camadas, com a mesma bifurcação", async () => {
  // A deriva entre JS e Luau já mordeu este projeto duas vezes: a ponte
  // aprovava o spec e o jogo reprovava a torre que ele gerou. Com dois
  // formatos de regra OPOSTA o risco dobra — se uma das camadas não conhecer
  // "laje", ela roda a regra do disco num mapa de laje e reprova por
  // "plataformas se cobrem", que na laje é justamente o objetivo.
  const contrato = JSON.parse(
    await readFile(path.join(RAIZ, "data", "schemas", "mapa.schema.json"), "utf8"),
  );
  assert.deepEqual(
    contrato.properties.plataformas.properties.formato.enum,
    ["disco", "laje"],
    "o contrato é quem lista os formatos",
  );

  const regras = await readFile(path.join(RAIZ, "bridge", "src", "dominio", "regras.mjs"), "utf8");
  const jogabilidade = await lerJogo("server", "jogabilidade.lua");
  const construtor = await lerJogo("server", "construtorMapa.lua");

  for (const formato of contrato.properties.plataformas.properties.formato.enum) {
    assert.ok(regras.includes(`"${formato}"`), `a ponte não conhece o formato "${formato}"`);
    assert.ok(jogabilidade.includes(`"${formato}"`), `jogabilidade.lua não conhece o formato "${formato}"`);
  }

  // E o construtor tem que CONSTRUIR diferente, não só validar diferente.
  assert.match(construtor, /p\.formato == "laje"/, "o construtor não ramifica por formato");
});

test("a regra da laje é a mesma nas duas linguagens: fundo IGUAL ao passo", async () => {
  //[[ Não basta as duas conhecerem a palavra: elas têm que reprovar as MESMAS
  // torres. E esta regra nasceu errada uma vez — pedia só "sem vão", o que
  // deixava passar a torre que ENTERRA: fundo 24 com passo 20 sobrepõe 4
  // studs, sobra 1 stud de folga vertical, e o boneco de 5 studs fica dentro
  // da laje de cima. Sobreposição e vão são o mesmo eixo, e só um valor serve
  // nos dois sentidos. ]]
  const regras = semComentarios(
    await readFile(path.join(RAIZ, "bridge", "src", "dominio", "regras.mjs"), "utf8"),
  );
  const jogabilidade = semComentarios(await lerJogo("server", "jogabilidade.lua"));

  for (const [nome, fonte] of [["a ponte", regras], ["o jogo", jogabilidade]]) {
    const trecho = fonte.slice(fonte.indexOf('"laje"'));
    assert.match(trecho, /variacaoRaio !== 0|variacao ~= 0/, `${nome} não exige variacaoRaio zero na laje`);
    assert.match(trecho, /2 \* (p\.)?raioBase/, `${nome} não compara o fundo da laje com o passo`);
    assert.match(trecho, /variacaoHorizontal/, `${nome} não usa o passo na regra da laje`);
  }
});

/**
 * O Luau sem comentário nenhum.
 *
 * Estes testes leem a FONTE, e este arquivo comenta muito de propósito: um
 * comentário que explica o bug antigo ("antes esta linha chamava
 * encerrarRodada") faz a asserção casar com a explicação em vez do código, e o
 * teste passa a proteger nada. Os dois primeiros testes do portal caíram
 * exatamente nisso.
 */
const semComentarios = (fonte) =>
  fonte.replace(/--\[\[[\s\S]*?\]\]/g, "").replace(/--.*/g, "");

test("voltar ao pé da torre ABRE o portal, não conta derrota", async () => {
  // A mudança inteira em uma linha: antes, `plataformaReferencia <= 1` chamava
  // `encerrarRodada("derrota")` e o momento mais dramático da live acontecia
  // sozinho. Agora ele ergue o portal, e a derrota tem que ser comprada.
  const fonte = semComentarios(await lerJogo("server", "sessao.lua"));

  const inicio = fonte.indexOf("estado.saiuDoPrimeiro and atual.plataformaReferencia <= 1");
  assert.notEqual(inicio, -1, "a condição de voltar ao pé da torre sumiu");
  const trecho = fonte.slice(inicio, inicio + 300);

  assert.match(trecho, /Portal\.abrir/, "voltar ao pé da torre tem que abrir o portal");
  assert.doesNotMatch(
    trecho,
    /encerrarRodada\("derrota"\)/,
    "voltar ao pé da torre não pode mais contar derrota sozinho",
  );
});

test("o portal se ergue na BEIRADA da plataforma 1, virado para o fim do mapa", async () => {
  //[[ Ele nascia no MEIO da plataforma 1, na altura de pouso do boneco. Duas
  // coisas erradas de uma vez: o meio da plataforma é exatamente onde o respawn
  // acontece — a moldura fechava em volta do próprio streamer — e a altura de
  // pouso soma a folga do rig, então ela ainda ficava flutuando acima do chão.
  //
  // Agora ela se apoia no TOPO e anda até a borda voltada ao fim da torre,
  // atravessada no caminho: quem sobe passa por dentro dela. ]]
  const sessao = semComentarios(await lerJogo("server", "sessao.lua"));
  const plataformas = semComentarios(await lerJogo("server", "plataformas.lua"));
  const portal = semComentarios(await lerJogo("server", "portal.lua"));

  assert.match(
    sessao,
    /local base = Plataformas\.topoDe\(1\)/,
    "o portal tem que se apoiar no topo da plataforma, não na altura de pouso do boneco",
  );
  //[[ De COSTAS para a subida, por decisão do dono.
  //
  // `beiradaDe` aponta para onde a torre CONTINUA — o certo para cenário que se
  // atravessa subindo. O portal quer o contrário: fica no fim do caminho,
  // virado para fora, de frente para quem ainda está subindo. É dali que a
  // derrota vem. ]]
  assert.match(
    sessao,
    /Portal\.abrir\(base, vidaDoPortal\(\), beiradaDeCosta\(1\)\)/,
    "sem a beirada o portal volta para o meio da plataforma, em cima do respawn",
  );
  assert.match(sessao, /local function beiradaDeCosta/, "falta a inversão da frente");
  assert.match(
    sessao.slice(sessao.indexOf("local function beiradaDeCosta"), sessao.indexOf("local function beiradaDeCosta") + 500),
    /frente = -beirada\.frente/,
    "a frente do portal tem que ser o INVERSO da direção em que a torre continua",
  );

  assert.match(plataformas, /function Plataformas\.topoDe\(indice\)/, "topoDe sumiu");
  assert.match(plataformas, /function Plataformas\.beiradaDe\(indice\)/, "beiradaDe sumiu");
  // A direção é "onde está o próximo degrau", que é o que faz o portal olhar
  // para o fim do mapa em vez de para um eixo do mundo.
  assert.match(
    plataformas,
    /local seguinte = entradaDe\(entrada\.indice \+ 1\)/,
    "a frente da beirada tem que sair da plataforma seguinte",
  );

  // Girar e avançar, nessa ordem — e o avanço desconta a própria espessura,
  // senão a moldura nasce com metade do corpo para fora da plataforma.
  assert.match(portal, /CFrame\.lookAt\(centro, centro \+ direcao\)/, "o portal não gira para o caminho");
  assert.match(
    portal,
    /math\.max\(0, meiaExtensao - PROFUNDIDADE \* 0\.5 - RECUO_DA_BEIRADA\)/,
    "o avanço tem que parar antes da borda, e nunca ser negativo",
  );
});

test("só presente NEGATIVO machuca o portal, e o dano é o empurrão", async () => {
  const fonte = semComentarios(await lerJogo("server", "sessao.lua"));
  const inicio = fonte.indexOf("function aplicarPresente");
  const trecho = fonte.slice(inicio, inicio + 900);

  assert.match(trecho, /evento\.delta < 0 and Portal\.aberto\(\)/, "presente de subida não pode tocar no portal");
  assert.match(trecho, /Portal\.danificar\(-evento\.delta\)/, "o dano é o tamanho do empurrão, em andares");

  //[[ A ORDEM importa e é o bug que este teste evita.
  //
  // O dano tem que acontecer ANTES de `limitarPlataforma`: no pé da torre o
  // delta negativo é comido pelo limite, a função sai cedo por "destino ==
  // origem" — e é exatamente ali que o portal está. Machucar depois seria
  // machucar em todo lugar menos onde ele existe. ]]
  const ondeDana = trecho.indexOf("Portal.danificar");
  const ondeLimita = trecho.indexOf("limitarPlataforma");
  assert.notEqual(ondeDana, -1, "o dano sumiu de aplicarPresente");
  assert.notEqual(ondeLimita, -1, "o limite de plataforma sumiu de aplicarPresente");
  assert.ok(ondeDana < ondeLimita, "o dano tem que vir antes do limite de plataforma, senão nunca acontece no andar 1");
});

test("a vida do portal é o MESMO número na ponte e no jogo", async () => {
  // Terceira vez que este projeto duplica uma constante entre JS e Luau. As
  // duas anteriores derivaram e custaram uma sessão de depuração cada.
  const regras = await readFile(path.join(RAIZ, "bridge", "src", "dominio", "regras.mjs"), "utf8");
  const tipos = await lerJogo("shared", "tipos.lua");

  const daPonte = Number(regras.match(/VIDA_PADRAO_DO_PORTAL = (\d+)/)?.[1]);
  const doJogo = Number(tipos.match(/VIDA_PADRAO_DO_PORTAL = (\d+)/)?.[1]);

  assert.ok(Number.isInteger(daPonte), "a ponte não declara a vida padrão do portal");
  assert.equal(doJogo, daPonte, "a vida padrão do portal desencostou entre a ponte e o jogo");
});

test("um donate de N rodadas é cobrado UMA a UMA, não somado no número", async () => {
  // "Fico descendo até acabar as 6": o dono pediu seis quedas, não +6 no
  // placar. Somar de uma vez daria o mesmo número e nenhum espetáculo.
  const fonte = semComentarios(await lerJogo("server", "sessao.lua"));

  assert.match(fonte, /estado\.fila = \{ tipo = tipo, restantes = devidas \}/, "o donate tem que virar fila");
  assert.match(fonte, /function cobrarProximaDaFila/, "falta quem cobra a fila");

  // E a fila tem que ser cobrada DEPOIS do reinício, senão as seis rodadas
  // acontecem no mesmo instante e viram uma só na tela.
  const inicio = fonte.indexOf("Plataformas.reiniciarCorrida(\"fim de rodada:");
  const trecho = fonte.slice(inicio, inicio + 300);
  assert.match(trecho, /cobrarProximaDaFila\(\)/, "a próxima rodada devida sai depois do reinício da anterior");
});

test("quantidade atravessa a ponte inteira: nenhum elo a descarta em silêncio", async () => {
  // Ela passa por quatro mãos, e três delas têm lista fechada de campos. Um elo
  // que esqueça `quantidade` não dá erro nenhum: seis derrotas viram uma.
  const despachante = await readFile(path.join(RAIZ, "bridge", "src", "fila", "despachante.mjs"), "utf8");
  const registro = await readFile(path.join(RAIZ, "bridge", "src", "longpoll", "registro.mjs"), "utf8");
  const ponte = await lerJogo("server", "ponte.lua");
  const sessao = await lerJogo("server", "sessao.lua");

  assert.match(despachante, /quantidade/, "a ponte não deriva quantidade da rajada");
  assert.match(registro, /comandos\.map\(\(\{ id, tipo, quantidade, emitidoEm \}\)/, "o envelope descarta quantidade");
  assert.match(ponte, /chamarComSeguranca\(aoComando, comando\.tipo, comando\.quantidade\)/, "o transporte do jogo descarta quantidade");
  assert.match(sessao, /aoComando = function\(tipo, quantidade\)/, "a sessão não recebe quantidade");

  const contrato = JSON.parse(
    await readFile(path.join(RAIZ, "data", "schemas", "evento-jogo.schema.json"), "utf8"),
  );
  assert.ok(contrato.$defs.comando.properties.quantidade, "o contrato não conhece quantidade");
});

test("a vida padrão do portal é o mesmo número nas TRÊS camadas", async () => {
  // Ponte, jogo e painel escrevem 2000 cada um. É a quarta constante duplicada
  // deste projeto, e as três anteriores derivaram — cada uma custou uma sessão
  // de depuração de "por que os dois lados discordam?".
  const regras = await readFile(path.join(RAIZ, "bridge", "src", "dominio", "regras.mjs"), "utf8");
  const tipos = await lerJogo("shared", "tipos.lua");
  const editor = await readFile(
    path.join(RAIZ, "panel", "src", "components", "EditorDePlacar.jsx"), "utf8",
  );

  const numeros = [regras, tipos, editor].map(
    (fonte) => Number(fonte.match(/VIDA_PADRAO_DO_PORTAL = (\d+)/)?.[1]),
  );
  assert.ok(numeros.every(Number.isInteger), `alguma camada não declara a vida padrão: ${numeros}`);
  assert.equal(new Set(numeros).size, 1, `a vida padrão desencostou entre as camadas: ${numeros}`);
});

test("todo WaitForChild aponta para um nome que o Rojo REALMENTE cria", async () => {
  //[[ Esta é a falha mais cara que o jogo sabe ter, e a mais silenciosa.
  //
  // `portal.lua` esperava por uma pasta "Kora"; ela se chama
  // "KoraCompartilhado". `WaitForChild` não erra — ele PENDURA. O servidor
  // parou no meio da subida, nenhum RemoteEvent foi criado, e o Output encheu
  // de "RemoteEvent 'Estado' não apareceu" vindo de sete arquivos que estavam
  // todos certos. O único aviso do erro de verdade era um "Infinite yield
  // possible" perdido no meio, quinze linhas acima.
  //
  // Nome de topo é o que importa: é ele que o Rojo cria e é ele que não
  // aparece nunca se estiver escrito errado. ]]
  const projeto = JSON.parse(
    await readFile(path.join(RAIZ, "game", "default.project.json"), "utf8"),
  );

  const nomesCriados = new Set();
  const varrer = (no) => {
    if (!no || typeof no !== "object") return;
    for (const [chave, valor] of Object.entries(no)) {
      if (chave.startsWith("$")) continue;
      nomesCriados.add(chave);
      varrer(valor);
    }
  };
  varrer(projeto.tree ?? projeto);

  // Os serviços do próprio Roblox são esperados o tempo todo e não estão no
  // projeto: eles já existem.
  const SERVICOS = new Set([
    "ReplicatedStorage", "ServerScriptService", "StarterPlayer", "StarterPlayerScripts",
    "StarterGui", "Workspace", "Lighting", "Players", "SoundService", "Teams",
  ]);

  const arquivos = await listarLua(path.join(RAIZ, "game", "src"));
  const errados = [];

  for (const arquivo of arquivos) {
    const fonte = await readFile(arquivo, "utf8");
    for (const achado of fonte.matchAll(/WaitForChild\("([^"]+)"\)/g)) {
      const nome = achado[1];
      if (SERVICOS.has(nome) || nomesCriados.has(nome)) continue;
      // Filhos criados em tempo de execução (RemoteEvents, partes do rig do
      // personagem) não estão no projeto e são esperados por nome também.
      if (/^[A-Z]/.test(nome) && !nome.startsWith("Kora")) continue;
      errados.push(`${path.basename(arquivo)}: WaitForChild("${nome}")`);
    }
  }

  assert.deepEqual(errados, [], "nome que o Rojo não cria pendura o servidor inteiro, sem erro");
});

test("acessório rígido não leva Order: o Roblox recusa a entrada inteira", async () => {
  //[[ "IsLayered is required to be true for entries where order is specified".
  //
  // Ordem só existe para roupa em CAMADA, que precisa saber o que fica por cima
  // do quê. Acessório rígido pendura numa Attachment e não empilha nada. Mandar
  // ordem nele fazia o Roblox descartar a peça em SILÊNCIO — o vestiário
  // parecendo não fazer nada, com o Output mostrando um aviso e nada mais. ]]
  const fonte = semComentarios(await lerJogo("server", "personagem.lua"));

  for (const achado of fonte.matchAll(/\{[^{}]*AssetId[^{}]*\}/g)) {
    const entrada = achado[0];
    if (!entrada.includes("Order")) continue;
    assert.match(
      entrada,
      /IsLayered = true/,
      `entrada com Order sem IsLayered = true: o Roblox recusa\n${entrada}`,
    );
  }

  // E a montagem em camada tem que existir de verdade, senão o teste acima
  // passa por não ter o que conferir.
  assert.match(fonte, /entrada\.IsLayered = true/, "sumiu o caminho da roupa em camada");
  assert.match(fonte, /entrada\.Order = /, "roupa em camada sem ordem não empilha certo");
});

test("o efeito permanente é sempre reaplicado, inclusive quando não há nenhum", async () => {
  //[[ Três bugs somados faziam a aura ser indelével, e nenhum aparecia como erro:
  //
  //   1. a sessão lia `estado.look` UMA vez e nunca mais: salvar no vestiário
  //      gravava em disco e o respawn vestia o look de antes;
  //   2. `ligarEfeitoPermanente` só era chamado quando havia efeito NOVO, então
  //      o antigo nunca era destruído;
  //   3. o vestiário não tinha caminho de volta — botão para escolher efeito,
  //      nenhum para desfazer.
  //
  // Este teste tranca o (1) e o (2). ]]
  const sessao = semComentarios(await lerJogo("server", "sessao.lua"));

  assert.doesNotMatch(
    sessao,
    /if estado\.look and estado\.look\.efeitoPermanente then/,
    "com essa guarda, look sem efeito nunca destrói o efeito anterior",
  );
  assert.match(sessao, /Personagem\.ligarEfeitoPermanente\(personagem, estado\.look and/,
    "o efeito tem que ser reaplicado sempre, mesmo nil");

  assert.match(sessao, /function Sessao\.recarregarLook/, "a sessão precisa saber reler o look");

  const vestiario = semComentarios(await lerJogo("server", "vestiario.lua"));
  assert.match(vestiario, /aoSalvarLook/, "o vestiário não avisa ninguém quando salva");

  const inicio = semComentarios(await lerJogo("server", "inicio.server.lua"));
  assert.match(inicio, /aoSalvar = function/, "ninguém liga o save do vestiário à sessão");
  assert.match(inicio, /Sessao\.recarregarLook\(\)/, "o aviso do vestiário não chega na sessão");
});

test("o vestiário tem caminho de volta ao padrão", async () => {
  const fonte = semComentarios(await lerJogo("client", "vestiario.client.lua"));

  assert.match(fonte, /local function restaurarPadrao/, "falta o botão de restaurar");
  assert.match(fonte, /botaoRestaurar\.MouseButton1Click:Connect\(restaurarPadrao\)/, "o botão não está ligado");

  // Tem que zerar as TRÊS coisas que compõem o look. Zerar só o efeito
  // deixaria as cores de corpo presas do mesmo jeito.
  const inicio = fonte.indexOf("local function restaurarPadrao");
  const corpo = fonte.slice(inicio, inicio + 900);
  assert.match(corpo, /itensEquipadosLista = \{\}/, "restaurar não limpa os itens");
  assert.match(corpo, /coresCorpoDefinidas = \{\}/, "restaurar não limpa as cores de corpo");
  assert.match(corpo, /tipoEfeitoAtual = nil/, "restaurar não limpa o efeito");
});

test("a passarela é uma RAMPA RETA, sem buraco e sem pulo", async () => {
  //[[ O teste que existe porque o spec passava e a torre não funcionava.
  //
  // Três versões erradas antes desta: lajes fundas que enterravam e prendiam o
  // boneco; a volta no quadrado, que o dono recusou ("sem caracol"); e o
  // vaivém, que também não era o pedido — "em linha reta até a lua".
  //
  // Ele MONTA a passarela em vez de procurar uma no disco. A primeira versão
  // lia `data/mapas/` e afirmava ter conferido algo; no dia em que o painel
  // passou a montar o mundo sob demanda, não sobrou mapa de passarela no disco
  // e o teste virou uma asserção sobre nada. A geometria é da montagem, então é
  // ela que tem que ser conferida. ]]
  const { montarMundo } = await import("../bridge/src/dominio/mundo.mjs");
  const { problemasDeJogabilidade } = await import("../bridge/src/dominio/regras.mjs");
  const ESPESSURA = 2;

  const mapa = montarMundo({
    skybox: "skybox_minecraft_dia",
    texturas: ["textura_bloco_minecraft"],
    formato: "laje",
    totalPlataformas: 1000,
  });
  const p = mapa.plataformas;

  assert.equal(p.formato, "laje");
  assert.ok(
    p.espacamentoVertical <= ESPESSURA,
    `subida ${p.espacamentoVertical} obriga a pular; a passarela é para andar`,
  );
  assert.ok(p.variacaoHorizontal > 0, "avanço zero empilharia todos os degraus no mesmo lugar");
  assert.ok(
    p.variacaoHorizontal <= 2 * p.raioBase,
    `avanço ${p.variacaoHorizontal} passa do degrau de ${2 * p.raioBase} e abre buraco`,
  );

  //[[ Reta, e não longe demais: avanço igual à subida dá 45 graus. Muito maior
  // deitaria a rampa a ponto de o fim ficar a 100 mil studs da origem, onde o
  // Roblox já não posiciona com precisão. ]]
  const comprimento = mapa.totalPlataformas * p.variacaoHorizontal;
  assert.ok(comprimento <= 30000, `a rampa terminaria a ${comprimento} studs da origem — longe demais`);

  // E o spec montado tem que passar nas mesmas regras que validam qualquer mapa.
  assert.deepEqual(problemasDeJogabilidade(mapa), []);
});

test("a espessura do degrau é o mesmo número nas TRÊS camadas", async () => {
  // Ela virou REGRA quando a passarela passou a exigir subida igual à
  // espessura. Constante duplicada entre JS e Luau já derivou quatro vezes
  // neste projeto.
  const regras = await readFile(path.join(RAIZ, "bridge", "src", "dominio", "regras.mjs"), "utf8");
  const tipos = await lerJogo("shared", "tipos.lua");
  const construtor = await lerJogo("server", "construtorMapa.lua");

  const numeros = [
    Number(regras.match(/ESPESSURA_DO_DEGRAU = (\d+)/)?.[1]),
    Number(tipos.match(/ESPESSURA_DO_DEGRAU = (\d+)/)?.[1]),
    Number(construtor.match(/ESPESSURA_DISCO = (\d+)/)?.[1]),
  ];
  assert.ok(numeros.every(Number.isInteger), `alguma camada não declara a espessura: ${numeros}`);
  assert.equal(new Set(numeros).size, 1, `a espessura do degrau desencostou: ${numeros}`);
});

test("a passarela NÃO usa o caminho do caracol", async () => {
  // Pedido explícito do dono: "sem caracol", "em linha reta". O caracol
  // continua sendo o caminho do disco; a passarela vai reto.
  const fonte = semComentarios(await lerJogo("server", "construtorMapa.lua"));

  assert.match(fonte, /local function pontoNaPassarela/, "a passarela precisa de caminho próprio");
  const corpo = fonte.slice(fonte.indexOf("local function pontoNaPassarela"));
  assert.match(corpo.slice(0, 120), /return distancia, 0/, "a passarela tem que ir reto, num eixo só");

  const inicio = fonte.indexOf('if p.formato == "laje" then');
  assert.notEqual(inicio, -1, "o construtor não ramifica por formato na posição");
  const trecho = fonte.slice(inicio, inicio + 200);
  assert.match(trecho, /pontoNaPassarela/, "a passarela está usando o caminho errado");
  assert.doesNotMatch(trecho, /pontoNoQuadrado/, "a passarela não pode dar a volta no quadrado");
});

test("trocar o formato converte o mapa que já existe, sem regerar", async () => {
  // O botão só marcava a preferência para a PRÓXIMA geração, e de quem clica a
  // leitura era simples: ele não faz nada.
  const regras = await readFile(path.join(RAIZ, "bridge", "src", "dominio", "regras.mjs"), "utf8");
  assert.match(regras, /export const PADROES_POR_FORMATO/, "os padrões de cada formato precisam ter um lugar só");
  assert.match(regras, /export function comFormato/, "falta a conversão");

  const nucleo = await readFile(path.join(RAIZ, "bridge", "src", "nucleo.mjs"), "utf8");
  assert.match(nucleo, /async converterFormatoDoMapa/, "a ponte não sabe converter");
  // E a torre tem que se reerguer sozinha quando é o mapa que está no ar.
  const inicio = nucleo.indexOf("async converterFormatoDoMapa");
  assert.match(nucleo.slice(inicio, inicio + 1200), /this\.recarregarMapa\(\)/, "converter sem reerguer a torre não muda nada na tela");

  //[[ O painel deixou de converter mapa: ele MONTA.
  //
  // O gerador por texto e a lista de mundos gerados saíram; no lugar entrou o
  // `SeletorDeMundo`, onde o streamer escolhe céu, plataformas e formato
  // olhando a foto de cada peça. A conversão continua na ponte porque o mapa em
  // disco pode ter nascido do gerador antigo — mas ninguém mais a chama pela
  // tela, e o formato passou a ser uma das escolhas da montagem. ]]
  const app = await readFile(path.join(RAIZ, "panel", "src", "App.jsx"), "utf8");
  assert.match(app, /aoMontar=\{montarMundo\}/, "o painel não está ligado na montagem do mundo");
  assert.match(app, /api\.montarMundo\(escolhas\)/, "a montagem tem que passar pela ponte");
});

test("com VÁRIAS texturas o degrau não é tingido: a variedade é da textura", async () => {
  //[[ Pedido do dono: "plataformas variadas de cada bloco que existe".
  //
  // A cor da paleta MULTIPLICA a textura no Roblox. Com uma textura só isso é o
  // gradiente da torre e é bom. Com nove blocos diferentes é o contrário: todos
  // puxados para o mesmo verde viram nove tons do mesmo bloco, e a variedade
  // que o streamer pediu desaparece exatamente onde deveria aparecer. ]]
  const fonte = semComentarios(await lerJogo("server", "construtorMapa.lua"));

  assert.match(fonte, /if #urls <= 1 then/, "o construtor não distingue uma textura de várias");
  const inicio = fonte.indexOf("local cor = Color3.new(1, 1, 1)");
  const trecho = fonte.slice(inicio, inicio + 220);
  assert.match(trecho, /Color3\.new\(1, 1, 1\)/, "com várias texturas o degrau tem que sair sem tingimento");
  assert.match(trecho, /corDoEixo/, "com uma textura só, o gradiente da paleta continua valendo");

  // E o revezamento tem que ser por índice, senão todos recebem a primeira.
  assert.match(fonte, /local vez = \(\(indice - 1\) % #urls\) \+ 1/, "as texturas não revezam degrau a degrau");
});

test("todo degrau leva o próprio número, e o último diz FINAL", async () => {
  const fonte = semComentarios(await lerJogo("server", "construtorMapa.lua"));

  assert.match(fonte, /local function escreverNumero/, "falta escrever o número no degrau");
  assert.match(
    fonte,
    /escreverNumero\(parte, indice, mapa\.totalPlataformas, mapa\.paleta\)/,
    "o número tem que sair para TODO degrau, dentro de construirPlataforma",
  );

  const inicio = fonte.indexOf("local function escreverNumero");
  const corpo = fonte.slice(inicio, inicio + 1600);

  assert.match(corpo, /indice >= total/, "o último degrau precisa ser reconhecido");
  assert.match(corpo, /"FINAL"/, "o último degrau tem que dizer FINAL");
  //[[ FLUTUANDO acima do degrau, não pintado nele.
  //
  // Deitado na face de cima o número aparecia de esguelha, sumia sob o boneco,
  // e nas formas de vários pedaços (o anel, as tábuas) caía em cima da emenda.
  // Pior: a textura da peça é o assunto da plataforma, e o número pintado por
  // cima disputava com ela. ]]
  assert.match(corpo, /BillboardGui/, "o número tem que flutuar, não ser pintado na face");
  assert.match(corpo, /AlwaysOnTop = true/, "sem isto o número some atrás do próprio degrau");
  assert.match(corpo, /StudsOffsetWorldSpace/, "o número precisa subir acima do degrau");

  //[[ Duas mil instâncias a mais numa torre de mil degraus. `MaxDistance` é o
  // que faz o Roblox desenhar só as perto da câmera — sem ele, a torre inteira
  // renderiza texto o tempo todo. ]]
  assert.match(corpo, /MaxDistance/, "sem MaxDistance, mil placas de texto desenham juntas");

  //[[ O tamanho vai em STUDS, e não em pixels.
  //
  // `fromOffset` dá tamanho fixo na TELA: o degrau lá longe fica minúsculo e o
  // número dele continua enorme, e a torre vira uma parede de números
  // empilhados. Em studs ele encolhe junto com o mundo. ]]
  assert.match(corpo, /placa\.Size = UDim2\.fromScale/, "o número tem que encolher com a distância");
  assert.ok(!/placa\.Size = UDim2\.fromOffset/.test(corpo), "em pixels o número não encolhe e empilha na tela");

  //[[ Sem influência de luz: o número não pode escurecer junto com o mapa,
  // senão some justamente nos temas noturnos, que são metade do acervo. ]]
  assert.match(corpo, /LightInfluence = 0/, "o número escureceria nos mapas noturnos");
});

test("o teto de plataformas é o MESMO no mapa e no estado do jogo", async () => {
  //[[ Já quebrou duas vezes, e as duas do mesmo jeito: o teto do mapa subiu e o
  // do estado ficou para trás.
  //
  // O efeito é sempre o mesmo e é o pior possível: TODO estado que o jogo manda
  // é recusado na entrada da ponte, o painel congela no último número válido, e
  // o único sinal é um `estado_do_jogo_descartado` no log — que ninguém lê no
  // meio de uma live. A torre continua funcionando; só o mundo de fora para de
  // saber dela. ]]
  const ler = async (arquivo) =>
    JSON.parse(await readFile(path.join(RAIZ, "data", "schemas", arquivo), "utf8"));

  const mapa = await ler("mapa.schema.json");
  const estado = await ler("estado-jogo.schema.json");

  const teto = mapa.properties.totalPlataformas.maximum;
  assert.ok(Number.isInteger(teto), "o mapa precisa declarar o teto de plataformas");

  for (const campo of ["plataformaReferencia", "plataformaMaxima", "totalPlataformas"]) {
    assert.equal(
      estado.properties[campo].maximum,
      teto,
      `estado-jogo.${campo} tem teto ${estado.properties[campo].maximum} e o mapa vai até ${teto}: ` +
        `todo estado acima disso seria descartado na entrada da ponte`,
    );
  }

  // E o marco do topo tem que caber na torre mais alta possível.
  assert.equal(
    mapa.properties.marcos.items.properties.plataforma.maximum,
    teto,
    "marco acima do topo da torre não existe, e abaixo dele o topo não teria marco",
  );
});

test("a corrida começa na plataforma 1, e a queda sempre tem para onde voltar", async () => {
  //[[ Dois sintomas, uma raiz. O contador ficava em "0 / 5000" com o boneco
  // parado em cima do primeiro degrau, e a queda "não pegava o checkpoint".
  //
  // A referência começava em `PLATAFORMA_MIN` = 0, e ela só andava por TOQUE
  // (R9.2) — mas o boneco nasce já apoiado no degrau 1, sem transição de
  // contato, então o `Touched` podia nunca disparar. Sem referência,
  // `posicaoDePouso(0)` não existe, e o respawn saía sem destino: o boneco
  // caía para sempre. Um empate: sem tocar não há referência, e sem referência
  // não há para onde voltar. ]]
  const tipos = semComentarios(await lerJogo("shared", "tipos.lua"));
  assert.match(tipos, /Tipos\.PLATAFORMA_INICIAL = 1/, "falta o ponto de partida da corrida");
  assert.match(tipos, /Tipos\.PLATAFORMA_MIN = 0/, "o piso do contrato continua sendo 0");

  const sessao = semComentarios(await lerJogo("server", "sessao.lua"));
  assert.match(
    sessao,
    /Plataformas\.definirReferencia\(Tipos\.PLATAFORMA_INICIAL/,
    "a sessão precisa partir do primeiro degrau, não do zero",
  );

  // E a queda precisa de rede: sem checkpoint válido, o pé da torre.
  const plataformas = semComentarios(await lerJogo("server", "plataformas.lua"));
  const inicio = plataformas.indexOf("local function reposicionar");
  const corpo = plataformas.slice(inicio, inicio + 1400);
  assert.match(corpo, /ordenadas\[1\]\.indice/, "sem checkpoint, a queda tem que cair no pé da torre");
});

test("o portal do topo é cenário: não apanha, não quebra, não conta nada", async () => {
  //[[ Dois portais, um mecanismo só. O do chão é a disputa da derrota; o do
  // topo existe para o último degrau ser reconhecível de LONGE — o "FINAL"
  // escrito em cima só se lê de perto.
  //
  // Compartilham a geometria de propósito: duplicá-la faria os dois divergirem
  // no primeiro ajuste de tamanho, e aí seriam dois portais diferentes num
  // jogo que promete o mesmo. ]]
  const portal = semComentarios(await lerJogo("server", "portal.lua"));

  assert.match(portal, /local function montarPortal/, "os dois portais têm que sair da mesma montagem");
  assert.match(portal, /function Portal\.decorarFinal/, "falta o portal do topo");
  assert.match(portal, /Portal\.NOME_DO_FINAL/, "o portal do topo precisa de nome próprio");

  // O do topo NÃO pode mexer no estado da disputa.
  // Só o CORPO dela: uma janela por tamanho fixo vazava para a `fechar`, que
  // mexe no estado por dever de ofício, e o teste acusava a função errada.
  const inicio = portal.indexOf("function Portal.decorarFinal");
  const depois = portal.indexOf("function Portal.", inicio + 10);
  const corpo = portal.slice(inicio, depois === -1 ? portal.length : depois);
  for (const proibido of ["estado.vida", "estado.aberto", "estado.parte"]) {
    assert.ok(!corpo.includes(proibido), `o portal do topo tocou em ${proibido}: ele é só cenário`);
  }

  const sessao = semComentarios(await lerJogo("server", "sessao.lua"));
  assert.match(sessao, /Portal\.decorarFinal\(/, "ninguém ergue o portal do topo");
  assert.match(sessao, /Portal\.limparFinal\(\)/, "o portal do topo não é derrubado com a torre");
});

test("presente que não move devolve o detector de queda, sempre", async () => {
  //[[ O bug que fazia o boneco "sair das plataformas num combate de frente".
  //
  // `aplicarPresente` suspende o detector de queda e o efeito permanente ANTES
  // de mover, e a restauração morava só no `aoTerminar`. `Movimento.aplicar`
  // devolve false em vários casos — destino sem posição no mundo, personagem
  // sem raiz — e nesses o `aoTerminar` nunca roda.
  //
  // O detector ficava suspenso PARA SEMPRE: dali em diante nenhuma queda
  // devolvia o boneco ao checkpoint, e ele caía da torre sem volta. Aparecia
  // num combate porque é ali que o líquido negativo grande leva o destino para
  // fora da faixa. ]]
  const fonte = semComentarios(await lerJogo("server", "sessao.lua"));
  const inicio = fonte.indexOf("function aplicarPresente");
  const corpo = fonte.slice(inicio, fonte.indexOf("local function acompanharJogador"));

  assert.match(corpo, /local moveu = Movimento\.aplicar/, "o resultado do movimento tem que ser olhado");
  assert.match(corpo, /if not moveu then/, "movimento recusado precisa devolver o controle");

  const recusa = corpo.slice(corpo.indexOf("if not moveu then"), corpo.indexOf("if not moveu then") + 400);
  assert.match(recusa, /Plataformas\.suspenderDetector\(false\)/, "o detector de queda fica suspenso para sempre");
  assert.match(recusa, /Personagem\.suspenderEfeito\(personagem, false\)/, "o efeito permanente fica suspenso para sempre");
});

test("o destino de um presente nunca cai abaixo do PÉ da torre", async () => {
  //[[ `limitarPlataforma` para em `PLATAFORMA_MIN` = 0, que é o piso do
  // CONTRATO — existe para o delta negativo ter onde parar. Plataforma 0 não
  // existe no mundo: `posicaoDePouso(0)` é nil, o movimento recusa, e (antes
  // da correção acima) o detector ficava suspenso.
  //
  // O piso do MOVIMENTO é o primeiro degrau que o construtor entregou. ]]
  const sessao = semComentarios(await lerJogo("server", "sessao.lua"));
  const inicio = sessao.indexOf("function aplicarPresente");
  const corpo = sessao.slice(inicio, inicio + 1400);

  assert.match(corpo, /Plataformas\.primeira\(\)/, "o destino precisa parar no pé da torre");
  assert.match(corpo, /if destino < pe then/, "falta o piso do movimento");

  const plataformas = semComentarios(await lerJogo("server", "plataformas.lua"));
  assert.match(plataformas, /function Plataformas\.primeira/, "falta quem sabe qual é o pé da torre");
});

test("vitória e derrota tocam a animação escolhida, sem mover o boneco", async () => {
  //[[ Os dois instantes mais altos da live aconteciam com o boneco parado.
  //
  // Vitória e derrota não têm delta — ninguém sobe nem desce por ter chegado ao
  // topo — e por isso passavam longe do caminho de animação, que é todo
  // construído em cima do movimento. `tocarSolta` existe para isso: mesmo
  // contexto, sem mover e sem tomar o controle do personagem, porque a contagem
  // regressiva já está correndo por cima. ]]
  const movimento = semComentarios(await lerJogo("server", "movimento.lua"));
  assert.match(movimento, /function Movimento\.tocarSolta/, "falta tocar animação sem mover");

  const corpo = movimento.slice(movimento.indexOf("function Movimento.tocarSolta"));
  const ateOFim = corpo.slice(0, corpo.indexOf("\nfunction Movimento."));
  assert.ok(!ateOFim.includes("tomarControle"), "a animação de fim de rodada não pode ancorar o boneco");

  const sessao = semComentarios(await lerJogo("server", "sessao.lua"));
  assert.match(sessao, /Movimento\.tocarSolta\(personagem, animacaoId/, "a rodada não toca a animação");
  assert.match(sessao, /estado\.mapa\.animacoesDeRodada/, "a escolha do streamer não chega na rodada");

  // E a escolha viaja do preset até o jogo pelo mesmo caminho do portal.
  const nucleo = await readFile(path.join(RAIZ, "bridge", "src", "nucleo.mjs"), "utf8");
  assert.match(nucleo, /animacoesDeRodada: \{/, "a ponte não manda as animações de rodada");
  assert.match(nucleo, /this\.#preset\?\.animacaoDeVitoria/, "a vitória não sai do preset");

  const contrato = JSON.parse(
    await readFile(path.join(RAIZ, "data", "schemas", "preset.schema.json"), "utf8"),
  );
  assert.ok(contrato.properties.animacaoDeVitoria, "o contrato não guarda a animação de vitória");
  assert.ok(contrato.properties.animacaoDeDerrota, "o contrato não guarda a animação de derrota");
});

test("a forma do degrau sai do acervo e é montada com primitivas", async () => {
  //[[ Pedido do dono: "a rosquinha ela era redonda igual uma rosquinha".
  //
  // Um quadrado com a foto de uma rosquinha não é uma rosquinha. A forma é da
  // PEÇA — mora no acervo, ao lado da imagem que ela veste — e o construtor a
  // monta com primitivas do Roblox: nada de mesh (que é asset para subir) e
  // nada de union em tempo de execução (que derrubaria o carregamento de mil
  // degraus). ]]
  const fonte = semComentarios(await lerJogo("server", "construtorMapa.lua"));

  assert.match(fonte, /local function montarForma/, "falta o montador de formas");
  for (const forma of ["anel", "disco", "hexagono", "tabuas", "placa"]) {
    assert.ok(fonte.includes(`"${forma}"`), `a forma "${forma}" não é construída`);
  }
  assert.ok(!/MeshPart|UnionAsync|SubtractAsync/.test(fonte), "mesh e union não entram: um é asset, o outro derruba o carregamento");

  //[[ O furo da rosquinha é DESENHO, não armadilha.
  //
  // Decisão do dono: "o que muda é a foto". Uma peça que derruba o jogador
  // mudaria a jogabilidade, e escolher a textura deixaria de ser escolha
  // estética — a rosquinha viraria a plataforma difícil e ninguém a usaria por
  // isso. Uma base invisível e sólida enche o furo: vê-se o buraco e pisa-se
  // no chão. ]]
  const anel = fonte.slice(fonte.indexOf('if forma == "anel" then'), fonte.indexOf('if forma == "hexagono"'));
  assert.match(anel, /base\.Transparency = 1/, "o furo do anel precisa de chão invisível embaixo");
  assert.match(anel, /base\.CastShadow = false/, "base invisível com sombra denuncia o truque");
  assert.match(anel, /return partes, Vector3\.new\(0, 0, 0\)/, "com base, o pouso volta ao centro");

  const plataformas = semComentarios(await lerJogo("server", "plataformas.lua"));
  assert.match(plataformas, /entrada\.pouso/, "o respawn ignora o deslocamento da forma e cai no furo");

  //[[ E TODOS os pedaços contam como chão: o anel tem 16 segmentos e a madeira
  // 5 tábuas. Ligar o `Touched` só no primeiro faria o jogador pisar e a
  // referência não andar — e o detector de queda o traria de volta. ]]
  assert.match(plataformas, /entrada\.partes/, "o rastreio só olha um pedaço do degrau");
});

test("o vão da torre construída mede a PEGADA do degrau, não o primeiro pedaço", async () => {
  //[[ O bug que derrubou a sessão inteira: "torre construída ficou
  // intransponível", mil linhas de vão de 17,68 contra alcance 7,83, num mapa
  // perfeitamente jogável.
  //
  // `Jogabilidade.raioDe` media `partes[1].Size`. Isso valia enquanto todo
  // degrau era um bloco só. Com as formas do acervo o primeiro pedaço deixou de
  // ser o degrau: no disco é um Cylinder DEITADO (Size.X é a espessura, 2), nas
  // tábuas é uma tábua de um quinto. O raio medido caía para ~1 e o vão inflava
  // até reprovar tudo.
  //
  // Todas as formas ocupam a MESMA pegada — é o que faz a forma ser escolha
  // estética, não de dificuldade. Então o número certo é o `raio` que o
  // construtor usou, e ele viaja no registro da plataforma. ]]
  const construtor = semComentarios(await lerJogo("server", "construtorMapa.lua"));
  const jogabilidade = semComentarios(await lerJogo("server", "jogabilidade.lua"));

  assert.match(
    construtor,
    /return \{ indice = indice,[^}]*raio = raio \}/,
    "o construtor tem que mandar o raio junto no registro da plataforma",
  );

  const medida = jogabilidade.slice(
    jogabilidade.indexOf("function Jogabilidade.raioDe"),
    jogabilidade.indexOf("function Jogabilidade.verificarSpec"),
  );
  assert.match(medida, /entrada\.raio/, "raioDe voltou a adivinhar o raio em vez de receber");
  assert.ok(
    medida.indexOf("entrada.raio") < medida.indexOf("parte.Size"),
    "o Size é reserva: adivinhar antes de ler o raio é o bug de volta",
  );

  //[[ E a conta, com os números do exemplo e três formas revezando — que é
  // exatamente o mapa que falhou. Espelha `montarForma`: o que cada forma põe
  // como PRIMEIRO pedaço, e a pegada real que ela ocupa. ]]
  const ESPESSURA = 2;
  const primeiroPedaco = {
    // Cylinder deitado: (espessura, diâmetro, diâmetro).
    disco: (raio) => [ESPESSURA, 2 * raio],
    // Uma tábua de cinco, menos a fresta.
    tabuas: (raio) => [(2 * raio) / 5 - 0.12, 2 * raio],
    // Um dos três blocos cruzados.
    hexagono: (raio) => [2 * raio, 1.16 * raio],
    // A base invisível do anel, e o bloco de sempre: já eram a pegada inteira.
    anel: (raio) => [2 * raio, 2 * raio],
    bloco: (raio) => [2 * raio, 2 * raio],
  };

  const mapa = JSON.parse(await readFile(path.join(RAIZ, "data", "exemplos", "mapa-torre-vulcanica-01.json"), "utf8"));
  const { alcanceHorizontalDoPulo } = await import("../bridge/src/dominio/regras.mjs");
  const alcance = alcanceHorizontalDoPulo(mapa.jumpHeight);
  const passo = mapa.plataformas.variacaoHorizontal;
  const raio = mapa.plataformas.raioBase;

  for (const forma of Object.keys(primeiroPedaco)) {
    const [x, z] = primeiroPedaco[forma](raio);
    const adivinhado = Math.min(x, z) / 2;

    // Pela pegada de verdade, todo degrau passa — a torre sempre foi jogável.
    assert.ok(
      passo - 2 * raio <= alcance,
      `forma "${forma}": a pegada real ${raio} tinha que caber no pulo`,
    );

    // E a medida antiga reprovava justamente as formas montadas em pedaços.
    if (forma === "disco" || forma === "tabuas" || forma === "hexagono") {
      assert.ok(
        passo - 2 * adivinhado > alcance,
        `forma "${forma}": este é o caso que derrubava a sessão; o teste não morde mais`,
      );
    }
  }
});

test("torre reconstruída religa o rastreio: sem isso não há contador nem checkpoint", async () => {
  //[[ O bug que matava as duas coisas ao mesmo tempo.
  //
  // As conexões de `Touched` apontam para Parts. Reconstruir a torre cria Parts
  // novos, e as conexões velhas passam a escutar plataformas que não existem
  // mais. `Plataformas.iniciar` sabe se religar sozinho — mas só enquanto ainda
  // conhece o personagem, e o `pararDeAcompanhar()` que vinha logo antes dele
  // apagava exatamente isso.
  //
  //   sem `Touched`   -> a referência não anda: o contador congela e as
  //                      plataformas lá em cima não entram na conta.
  //   sem `Heartbeat` -> `passo` não roda: o detector de queda morre junto e o
  //                      checkpoint deixa de existir.
  //
  // Subir a sessão do zero nunca passou por aí (lá o personagem chega depois do
  // mapa, e `prepararPersonagem` religa), então só quebrava ao TROCAR de mundo
  // pelo painel — que é o caminho que o dono usa o tempo todo. ]]
  const fonte = semComentarios(await lerJogo("server", "sessao.lua"));

  assert.match(fonte, /local function religarRastreio/, "sumiu quem religa o rastreio");

  let reconstrucoes = 0;
  for (const achado of fonte.matchAll(/Plataformas\.pararDeAcompanhar\(\)/g)) {
    const janela = fonte.slice(achado.index, achado.index + 900);
    if (!janela.includes("Plataformas.iniciar(")) continue;
    reconstrucoes += 1;
    assert.match(
      janela,
      /religarRastreio\(\)/,
      "quem para de acompanhar e reinicia o mapa TEM que religar o rastreio na torre nova",
    );
  }
  assert.ok(reconstrucoes >= 2, "os dois caminhos que reconstroem a torre com a sessão de pé sumiram");

  //[[ E o ouvinte entra UMA vez. `aoMudar` empilha, e `iniciar` zera a corrida,
  // não a lista de quem escuta: registrar a cada troca de mundo fazia
  // `publicarEstado` rodar várias vezes por mudança, publicando o mesmo estado
  // repetido para a ponte e para todos os clientes. ]]
  const registros = [...fonte.matchAll(/Plataformas\.aoMudar\(publicarEstado\)/g)];
  assert.equal(registros.length, 1, "publicarEstado tem que ser registrado uma única vez por sessão");
});
