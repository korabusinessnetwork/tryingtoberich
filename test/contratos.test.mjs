/**
 * Bloco 0 — os contratos.
 *
 * Um schema que não rejeita o que a regra proíbe não é contrato, é decoração.
 * Por isso cada regra tem duas asserções: o exemplo válido passa, e uma variação
 * que viola a regra é rejeitada.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  RAIZ,
  criarValidador,
  presentesRepetidos,
  problemasDeJogabilidade,
  referenciasInexistentes,
  referenciasNaoAprovadas,
  mapaPodeIrAoAr,
  faixaDeMoedas,
  FATOR_SALTO_VERTICAL,
} from "../scripts/validar-contratos.mjs";

const lerJson = async (...partes) => JSON.parse(await readFile(path.join(RAIZ, ...partes), "utf8"));
const clonar = (o) => structuredClone(o);

const { validar, schemas } = await criarValidador();
const acervo = await lerJson("data", "acervo.json");
const semente = await lerJson("data", "catalogo-presentes.seed.json");
const preset = await lerJson("data", "exemplos", "preset-escalada-padrao.json");
const mapa = await lerJson("data", "exemplos", "mapa-torre-vulcanica-01.json");
const look = await lerJson("data", "exemplos", "look-escalador-vulcanico.json");

/* -------------------------------------------------------------- */
/* Forma                                                           */
/* -------------------------------------------------------------- */

test("todo schema de data/schemas compila", () => {
  assert.ok(schemas.length >= 11, `esperava ao menos 11 schemas, achei ${schemas.length}`);
});

test("todo exemplo valida contra o próprio schema", async () => {
  const porPrefixo = { "preset-": "preset", "mapa-": "mapa", "look-": "look", "sessao-": "sessao" };
  const arquivos = (await readdir(path.join(RAIZ, "data", "exemplos"))).filter((f) => f.endsWith(".json"));
  assert.ok(arquivos.length > 0, "data/exemplos/ está vazio");

  for (const arquivo of arquivos) {
    const prefixo = Object.keys(porPrefixo).find((p) => arquivo.startsWith(p));
    const nome = prefixo ? porPrefixo[prefixo] : "animacoes";
    assert.deepEqual(validar(nome, await lerJson("data", "exemplos", arquivo)), [], `${arquivo} contra ${nome}`);
  }
});

test("acervo e semente de catálogo validam", () => {
  assert.deepEqual(validar("acervo", acervo), []);
  assert.deepEqual(validar("catalogo-presentes", semente), []);
});

test("todo evento das fixtures de cenário valida como evento normalizado", async () => {
  const dir = path.join(RAIZ, "data", "fixtures", "cenarios");
  const arquivos = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  assert.equal(arquivos.length, 7, "esperava os 7 cenários de R4, ADR-012 e F2");

  for (const arquivo of arquivos) {
    const cenario = await lerJson("data", "fixtures", "cenarios", arquivo);
    for (const [i, passo] of cenario.entrada.entries()) {
      assert.deepEqual(validar("evento-presente", passo.evento), [], `${arquivo} entrada[${i}]`);
    }
  }
});

/* -------------------------------------------------------------- */
/* R1 e R2 — preset e slots                                        */
/* -------------------------------------------------------------- */

test("preset: no máximo 6 slots (R1.1)", () => {
  const sete = clonar(preset);
  sete.slots.push({ posicao: 6, presenteId: "sem-corgi", animacaoId: "sub_mola", delta: 3, intensidade: 1 });
  assert.notDeepEqual(validar("preset", sete), []);
});

test("preset: menos de 6 slots preenchidos é válido (R1.3)", () => {
  const dois = clonar(preset);
  dois.slots = dois.slots.slice(0, 2);
  assert.deepEqual(validar("preset", dois), []);
});

test("preset: duas posições iguais são rejeitadas (R1)", () => {
  const colidido = clonar(preset);
  colidido.slots[1].posicao = 1;
  assert.notDeepEqual(validar("preset", colidido), []);
});

test("preset: o mesmo presente em dois slots é rejeitado (R1.4)", () => {
  assert.deepEqual(presentesRepetidos(preset), []);

  const repetido = clonar(preset);
  repetido.slots[1].presenteId = repetido.slots[0].presenteId;
  assert.deepEqual(presentesRepetidos(repetido), [repetido.slots[0].presenteId]);
});

test("preset: a mesma animação em dois slots é permitida, e é intencional (R1.5)", () => {
  const duplicada = clonar(preset);
  duplicada.slots[1].animacaoId = duplicada.slots[0].animacaoId;
  duplicada.slots[1].delta = 30;
  assert.deepEqual(validar("preset", duplicada), []);
});

test("preset: delta 0 é rejeitado, porque presente que não move nada não é presente (R2)", () => {
  const parado = clonar(preset);
  parado.slots[0].delta = 0;
  assert.notDeepEqual(validar("preset", parado), []);
});

test("preset: delta fora de -200..200 e intensidade fora de 1..5 são rejeitados (R2)", () => {
  for (const [campo, valor] of [["delta", 201], ["delta", -201], ["intensidade", 0], ["intensidade", 6]]) {
    const fora = clonar(preset);
    fora.slots[0][campo] = valor;
    assert.notDeepEqual(validar("preset", fora), [], `${campo}=${valor} deveria ser rejeitado`);
  }
});

test("preset: animação de subida com delta negativo é permitida — a direção é o sinal do delta (R2)", () => {
  const invertido = clonar(preset);
  invertido.slots[0].animacaoId = "sub_pulo";
  invertido.slots[0].delta = -10;
  assert.deepEqual(validar("preset", invertido), [], "o painel avisa que está invertido, mas não bloqueia");
});

/* -------------------------------------------------------------- */
/* ADR-009 — o mapa é escalável sem presente nenhum                */
/* -------------------------------------------------------------- */

test("mapa de exemplo é jogável só com o pulo do jogador", () => {
  assert.deepEqual(problemasDeJogabilidade(mapa), []);
  assert.ok(
    mapa.plataformas.espacamentoVertical <= mapa.jumpHeight * FATOR_SALTO_VERTICAL,
    "o exemplo tem que respeitar a própria regra que documenta",
  );
});

test("mapa com salto acima do pulo é rejeitado, não arredondado (ADR-009.4)", () => {
  const intransponivel = clonar(mapa);
  intransponivel.plataformas.espacamentoVertical = 6;
  const problemas = problemasDeJogabilidade(intransponivel);
  assert.equal(problemas.length, 1);
  assert.match(problemas[0], /espacamentoVertical/);
});

test("subir o jumpHeight sobe o teto de espaçamento junto, pela fórmula (ADR-009.3)", () => {
  const aberto = clonar(mapa);
  aberto.jumpHeight = 10;
  aberto.plataformas.espacamentoVertical = 6;
  assert.deepEqual(problemasDeJogabilidade(aberto), [], "6 <= 10 × 0,7");
});

test("mapa com marco topo fora da última plataforma é rejeitado", () => {
  const torto = clonar(mapa);
  torto.marcos.at(-1).plataforma = 200;
  assert.match(problemasDeJogabilidade(torto).join(" "), /topo/);
});

test("mapa sem marco topo é rejeitado pelo schema", () => {
  const semTopo = clonar(mapa);
  semTopo.marcos = semTopo.marcos.filter((m) => m.tipo !== "topo");
  assert.notDeepEqual(validar("mapa", semTopo), []);
});

/* -------------------------------------------------------------- */
/* ADR-004 — o Gemini escolhe do acervo, nunca inventa             */
/* -------------------------------------------------------------- */

test("mapa de exemplo só referencia id que existe no acervo", () => {
  assert.deepEqual(referenciasInexistentes(mapa, acervo), []);
});

test("asset inventado pelo modelo é barrado (ADR-004)", () => {
  const inventado = clonar(mapa);
  inventado.skyboxAssetId = "skybox_cristal_submarino";
  inventado.props[0].tipo = "chuva_de_meteoro";
  const faltando = referenciasInexistentes(inventado, acervo);
  assert.equal(faltando.length, 2);
  assert.match(faltando.join(" "), /skybox_cristal_submarino/);
  assert.match(faltando.join(" "), /chuva_de_meteoro/);
});

test("acervo pendente de moderação impede o mapa de ir ao ar", () => {
  const resultado = mapaPodeIrAoAr(mapa, acervo);
  assert.equal(resultado.pode, false, "hoje o acervo inteiro está pendente-upload");
  assert.ok(resultado.motivos.some((m) => /pendente-upload/.test(m)));
});

test("com o acervo aprovado, o mesmo mapa passa a poder ir ao ar", () => {
  const aprovado = clonar(acervo);
  for (const colecao of ["skybox", "texturas"]) {
    for (const item of aprovado[colecao]) {
      item.status = "aprovado";
      item.assetId = 100000000;
    }
  }
  assert.deepEqual(referenciasNaoAprovadas(mapa, aprovado), []);
  assert.equal(mapaPodeIrAoAr(mapa, aprovado).pode, true);
});

test("acervo com item aprovado e assetId nulo é rejeitado pelo schema", () => {
  const quebrado = clonar(acervo);
  quebrado.skybox[0].status = "aprovado";
  assert.notDeepEqual(validar("acervo", quebrado), [], "aprovado sem assetId é mapa sem céu na live");
});

/* -------------------------------------------------------------- */
/* R3 — o valor sugere, nunca decide                               */
/* -------------------------------------------------------------- */

test("a faixa da semente é derivada das moedas, nunca escrita à mão (R3)", () => {
  for (const presente of semente.presentes) {
    assert.equal(presente.faixa, faixaDeMoedas(presente.moedas), presente.nome);
  }
});

test("a semente cobre as cinco faixas, para o painel poder testar as cores", () => {
  assert.deepEqual([...new Set(semente.presentes.map((p) => p.faixa))].sort(), [1, 2, 3, 4, 5]);
});

test("a semente nunca se declara confirmada", () => {
  assert.equal(semente.confirmado, false);
  const mentindo = clonar(semente);
  mentindo.confirmado = true;
  assert.notDeepEqual(validar("catalogo-presentes", mentindo), []);
});

/* -------------------------------------------------------------- */
/* 11_SEGURANCA — LGPD como forma de dado, não como boa intenção   */
/* -------------------------------------------------------------- */

test("o log de sessão não aceita nickname nem id de espectador", async () => {
  const sessao = await lerJson("data", "exemplos", "sessao-aberta.json");
  assert.deepEqual(validar("sessao", sessao), []);

  for (const campo of ["nomeDoador", "espectadorId", "uniqueId"]) {
    const vazando = clonar(sessao);
    vazando.eventos[0][campo] = "qualquer coisa";
    assert.notDeepEqual(validar("sessao", vazando), [], `${campo} não pode entrar no log persistido`);
  }
});

test("sessão encerrada não pode carregar detalhe por evento (F5)", async () => {
  const encerrada = await lerJson("data", "exemplos", "sessao-encerrada.json");
  assert.deepEqual(validar("sessao", encerrada), []);

  const naoDescartou = clonar(encerrada);
  naoDescartou.eventos = [
    { em: "2026-09-01T20:03:11Z", slot: 5, presenteId: "sem-galaxy", repeticoes: 1, delta: 40, animacaoId: "sub_cometa" },
  ];
  assert.notDeepEqual(validar("sessao", naoDescartou), []);

  const semResumo = clonar(encerrada);
  delete semResumo.resumo;
  assert.notDeepEqual(validar("sessao", semResumo), []);
});

test("o evento normalizado não tem onde guardar identificador persistente de espectador", () => {
  const base = { presenteId: "sem-rose", presenteNome: "Rose", repeticoes: 1, recebidoEm: 1756742591123 };
  assert.deepEqual(validar("evento-presente", base), []);
  assert.notDeepEqual(validar("evento-presente", { ...base, userId: "0000000000000000001" }), []);
  assert.notDeepEqual(validar("evento-presente", { ...base, profilePictureUrl: "https://exemplo.invalid/p.jpg" }), []);
});

test("nome de doador tem teto de tamanho antes de virar texto na tela do jogo", () => {
  const base = { presenteId: "sem-rose", presenteNome: "Rose", repeticoes: 1, recebidoEm: 1 };
  assert.notDeepEqual(validar("evento-presente", { ...base, nomeDoador: "x".repeat(25) }), []);
});

/* -------------------------------------------------------------- */
/* 07_APIS — as duas superfícies que o Roblox toca                 */
/* -------------------------------------------------------------- */

test("resposta de long-poll: delta 0 não chega ao jogo", () => {
  const resposta = {
    cursor: 412,
    eventos: [{ id: 412, animacaoId: "sub_cometa", delta: 15, intensidade: 3, emitidoEm: 1756742591123 }],
  };
  assert.deepEqual(validar("evento-jogo", resposta), []);

  const zerado = clonar(resposta);
  zerado.eventos[0].delta = 0;
  assert.notDeepEqual(validar("evento-jogo", zerado), []);
});

test("estado do jogo fora da faixa do mapa é rejeitado, para ser descartado e não corrigido", () => {
  const estado = { plataformaReferencia: 184, plataformaMaxima: 191, emAnimacao: false, quedasNaturais: 12 };
  assert.deepEqual(validar("estado-jogo", estado), []);
  assert.notDeepEqual(validar("estado-jogo", { ...estado, plataformaReferencia: -1 }), []);
  assert.notDeepEqual(validar("estado-jogo", { ...estado, plataformaReferencia: 401 }), []);
});

/* -------------------------------------------------------------- */
/* ADR-010 e ADR-011 — o personagem                                */
/* -------------------------------------------------------------- */

test("look sem fallback é rejeitado: item despublicado não pode deixar o boneco pelado numa live", () => {
  assert.deepEqual(validar("look", look), []);
  const semRede = clonar(look);
  semRede.fallbackItens = [];
  assert.notDeepEqual(validar("look", semRede), []);
});

test("roupaCustomizada continua null enquanto a rota paga não for aprovada, e o campo já existe", () => {
  assert.equal(look.roupaCustomizada, null);
  const pago = clonar(look);
  pago.roupaCustomizada = 987654321;
  assert.deepEqual(validar("look", pago), [], "o campo existe para não exigir migração quando o dono decidir");
});

test("o preset referencia um look, nunca a composição inline (ADR-011)", () => {
  assert.deepEqual(Object.keys(preset.personagem), ["lookId"]);
  const inline = clonar(preset);
  inline.personagem = { itensCatalogo: [123456] };
  assert.notDeepEqual(validar("preset", inline), []);
});

/* -------------------------------------------------------------- */
/* Biblioteca de animações                                         */
/* -------------------------------------------------------------- */

test("animação acima de 3,5s é rejeitada: empilha e estica o bloqueio de controle do R11", async () => {
  const indice = await lerJson("data", "exemplos", "animacoes.json");
  assert.deepEqual(validar("animacoes", indice), []);

  const longa = clonar(indice);
  longa.animacoes[0].duracaoBase = 4;
  assert.notDeepEqual(validar("animacoes", longa), []);
});

/* -------------------------------------------------------------- */
/* ADR-003 — fs só existe em bridge/src/repos                      */
/* -------------------------------------------------------------- */

test("nenhum arquivo de bridge, panel ou game importa fs fora de bridge/src/repos", async () => {
  const EXTENSOES = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".lua"]);
  const IMPORTA_FS = /(?:require\(\s*|from\s+)['"](?:node:)?fs(?:\/promises)?['"]/;

  // A regra é sobre o código que roda ao vivo: trocar JSON por banco na Fase 3
  // tem que ser reescrever um diretório só. Diretório de teste fica de fora
  // porque teste de corrupção de arquivo precisa corromper arquivo, e isso não
  // participa da migração.
  const IGNORADOS = new Set(["node_modules", "dist", "test"]);
  const PERMITIDO = path.join(RAIZ, "bridge", "src", "repos");

  const infratores = [];
  const varrer = async (dir) => {
    for (const entrada of await readdir(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (!IGNORADOS.has(entrada.name)) await varrer(completo);
      } else if (EXTENSOES.has(path.extname(entrada.name)) && !completo.startsWith(PERMITIDO)) {
        if (IMPORTA_FS.test(await readFile(completo, "utf8"))) infratores.push(path.relative(RAIZ, completo));
      }
    }
  };

  for (const raiz of ["bridge", "panel", "game"]) await varrer(path.join(RAIZ, raiz));
  assert.deepEqual(infratores, [], "trocar JSON por banco na Fase 3 tem que ser reescrever um diretório só");
});

test("o guarda do ADR-003 realmente varre o código da ponte", async () => {
  // Um guarda que não olha nada passa sempre. Este teste existe para o anterior
  // não virar verde vazio se a varredura quebrar.
  const arquivos = [];
  const varrer = async (dir) => {
    for (const entrada of await readdir(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) await varrer(completo);
      else if (completo.endsWith(".mjs")) arquivos.push(completo);
    }
  };
  await varrer(path.join(RAIZ, "bridge", "src"));

  assert.ok(arquivos.length >= 20, `esperava dezenas de arquivos em bridge/src, achei ${arquivos.length}`);
  const emRepos = arquivos.filter((a) => a.includes(`${path.sep}repos${path.sep}`));
  assert.ok(emRepos.length >= 5, "e a camada de repositório existindo de verdade");
});
