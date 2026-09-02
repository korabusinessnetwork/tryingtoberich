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
  assert.match(fonte, /aoComando = function\(tipo\)/);
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

  for (const face of ["SkyboxUp", "SkyboxDn", "SkyboxLf", "SkyboxRt", "SkyboxFt", "SkyboxBk"]) {
    assert.ok(fonte.includes(`ceu.${face} = url`), `falta a face ${face}`);
  }
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
