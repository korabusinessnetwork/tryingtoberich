#!/usr/bin/env node
/**
 * Validação dos contratos do Bloco 0.
 *
 * Duas metades:
 *   1. O que o JSON Schema resolve sozinho — forma, tipo, faixa, campo obrigatório.
 *   2. O que não é expressável em JSON Schema e por isso mora aqui, em função
 *      pura e testada: unicidade de presenteId no preset (R1.4), a regra de
 *      jogabilidade do ADR-009 e a integridade referencial com o acervo (ADR-004).
 *
 * Nenhuma destas funções é caminho crítico de evento. Ver CLAUDE.md, Princípio nº1.
 *
 * Uso: node scripts/validar-contratos.mjs [--silencioso]
 */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR_SCHEMAS = path.join(RAIZ, "data", "schemas");

/** Margem do ADR-009: cobre latência de input, borda de plataforma e erro de posicionamento. */
export const FATOR_SALTO_VERTICAL = 0.7;
/** Teto de deriva horizontal em função do raio da plataforma. Ver P1. */
export const FATOR_DERIVA_HORIZONTAL = 1.2;

const lerJson = async (arquivo) => JSON.parse(await readFile(arquivo, "utf8"));

/** Monta o Ajv com todos os schemas registrados, para os $ref entre arquivos resolverem. */
export async function criarValidador() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);

  const arquivos = (await readdir(DIR_SCHEMAS)).filter((f) => f.endsWith(".schema.json")).sort();
  for (const arquivo of arquivos) {
    ajv.addSchema(await lerJson(path.join(DIR_SCHEMAS, arquivo)));
  }

  return {
    ajv,
    schemas: arquivos,
    /** Valida `dado` contra o schema de nome `nome` (ex.: "preset"). Devolve lista de erros legíveis. */
    validar(nome, dado) {
      const validador = ajv.getSchema(`https://kora.local/kora-stream-games/${nome}.schema.json`);
      if (!validador) throw new Error(`schema não registrado: ${nome}`);
      return validador(dado) ? [] : validador.errors.map((e) => `${e.instancePath || "/"} ${e.message}`);
    },
  };
}

/**
 * R1.4 — um mesmo presente não pode ocupar dois slots do mesmo preset.
 * Não é expressável em JSON Schema porque o conjunto de presenteId é aberto.
 */
export function presentesRepetidos(preset) {
  const vistos = new Set();
  const repetidos = new Set();
  for (const slot of preset.slots ?? []) {
    if (vistos.has(slot.presenteId)) repetidos.add(slot.presenteId);
    vistos.add(slot.presenteId);
  }
  return [...repetidos];
}

/**
 * ADR-009 — o mapa tem que ser escalável do início ao topo só com o pulo do jogador.
 * Rejeita, não corrige: spec fora da faixa volta para o Gemini.
 */
export function problemasDeJogabilidade(mapa) {
  const problemas = [];
  const { jumpHeight } = mapa;
  const { espacamentoVertical, variacaoHorizontal, raioBase } = mapa.plataformas;

  const tetoVertical = jumpHeight * FATOR_SALTO_VERTICAL;
  if (espacamentoVertical > tetoVertical) {
    problemas.push(
      `espacamentoVertical ${espacamentoVertical} passa do teto ${tetoVertical.toFixed(2)} ` +
        `(jumpHeight ${jumpHeight} × ${FATOR_SALTO_VERTICAL}). O mapa teria salto que o pulo não alcança.`,
    );
  }

  const tetoHorizontal = raioBase * FATOR_DERIVA_HORIZONTAL;
  if (variacaoHorizontal > tetoHorizontal) {
    problemas.push(
      `variacaoHorizontal ${variacaoHorizontal} passa do teto ${tetoHorizontal.toFixed(2)} ` +
        `(raioBase ${raioBase} × ${FATOR_DERIVA_HORIZONTAL}).`,
    );
  }

  const topo = (mapa.marcos ?? []).find((m) => m.tipo === "topo");
  if (topo && topo.plataforma !== mapa.totalPlataformas) {
    problemas.push(`marco topo está na plataforma ${topo.plataforma} e o mapa tem ${mapa.totalPlataformas}.`);
  }

  return problemas;
}

/** Todo id de acervo que o spec referencia, com o campo de onde veio. */
export function referenciasDeAcervo(mapa) {
  return [
    { campo: "skyboxAssetId", colecao: "skybox", id: mapa.skyboxAssetId },
    { campo: "plataformas.materialAssetId", colecao: "texturas", id: mapa.plataformas.materialAssetId },
    ...(mapa.props ?? []).map((p, i) => ({ campo: `props[${i}].tipo`, colecao: "props", id: p.tipo })),
  ];
}

/**
 * ADR-004 — o Gemini escolhe do acervo e vai tentar inventar id de asset.
 * Barrar isso é obrigação do código, não do prompt.
 */
export function referenciasInexistentes(mapa, acervo) {
  return referenciasDeAcervo(mapa)
    .filter(({ colecao, id }) => !acervo[colecao].some((item) => item.id === id))
    .map(({ campo, colecao, id }) => `${campo}: "${id}" não existe em acervo.${colecao}`);
}

/**
 * Prontidão para ir ao ar: existir no acervo não basta, o item precisa estar
 * aprovado e com assetId. Skybox pendente de moderação vira mapa sem céu na live.
 * Props são nativos e não passam por moderação, então não entram nesta checagem.
 */
export function referenciasNaoAprovadas(mapa, acervo) {
  return referenciasDeAcervo(mapa)
    .filter(({ colecao }) => colecao !== "props")
    .map(({ campo, colecao, id }) => ({ campo, item: acervo[colecao].find((i) => i.id === id) }))
    .filter(({ item }) => item && (item.status !== "aprovado" || item.assetId === null))
    .map(({ campo, item }) => `${campo}: "${item.id}" está ${item.status}, não aprovado`);
}

/** Verdadeiro só quando o spec é válido, jogável e todo asset referenciado está aprovado. */
export function mapaPodeIrAoAr(mapa, acervo) {
  const motivos = [
    ...problemasDeJogabilidade(mapa),
    ...referenciasInexistentes(mapa, acervo),
    ...referenciasNaoAprovadas(mapa, acervo),
  ];
  return { pode: motivos.length === 0, motivos };
}

/** Faixa I a V derivada das moedas. Campo de EXIBIÇÃO. Nenhuma regra de jogo lê isto. Ver R3. */
export function faixaDeMoedas(moedas) {
  if (moedas >= 5000) return 5;
  if (moedas >= 1000) return 4;
  if (moedas >= 100) return 3;
  if (moedas >= 10) return 2;
  return 1;
}

/* ------------------------------------------------------------------ */
/* Modo CLI: relatório do estado dos contratos em data/.                */
/* ------------------------------------------------------------------ */

async function principal() {
  const silencioso = process.argv.includes("--silencioso");
  const diz = (...args) => !silencioso && console.log(...args);
  const erros = [];

  const { validar, schemas } = await criarValidador();
  diz(`Schemas registrados: ${schemas.length}`);

  const acervo = await lerJson(path.join(RAIZ, "data", "acervo.json"));
  const semente = await lerJson(path.join(RAIZ, "data", "catalogo-presentes.seed.json"));
  const mapa = await lerJson(path.join(RAIZ, "data", "exemplos", "mapa-torre-vulcanica-01.json"));

  const checar = (rotulo, lista) => {
    if (lista.length) erros.push(`${rotulo}: ${lista.join(" · ")}`);
    diz(`  ${lista.length ? "✗" : "✓"} ${rotulo}`);
  };

  diz("\nContratos:");
  checar("data/acervo.json", validar("acervo", acervo));
  checar("data/catalogo-presentes.seed.json", validar("catalogo-presentes", semente));

  for (const arquivo of (await readdir(path.join(RAIZ, "data", "exemplos"))).filter((f) => f.endsWith(".json")).sort()) {
    const nomeSchema = arquivo.startsWith("preset-") ? "preset"
      : arquivo.startsWith("mapa-") ? "mapa"
      : arquivo.startsWith("look-") ? "look"
      : arquivo.startsWith("sessao-") ? "sessao"
      : "animacoes";
    checar(`data/exemplos/${arquivo}`, validar(nomeSchema, await lerJson(path.join(RAIZ, "data", "exemplos", arquivo))));
  }

  const dirCenarios = path.join(RAIZ, "data", "fixtures", "cenarios");
  for (const arquivo of (await readdir(dirCenarios)).filter((f) => f.endsWith(".json")).sort()) {
    const cenario = await lerJson(path.join(dirCenarios, arquivo));
    const problemas = cenario.entrada.flatMap((passo, i) =>
      validar("evento-presente", passo.evento).map((e) => `entrada[${i}] ${e}`),
    );
    checar(`data/fixtures/cenarios/${arquivo}`, problemas);
  }

  diz("\nRegras cruzadas:");
  checar("preset sem presente repetido (R1.4)", presentesRepetidos(
    await lerJson(path.join(RAIZ, "data", "exemplos", "preset-escalada-padrao.json")),
  ));
  checar("mapa jogável sem presente (ADR-009)", problemasDeJogabilidade(mapa));
  checar("mapa só referencia o acervo (ADR-004)", referenciasInexistentes(mapa, acervo));
  checar("semente com faixa coerente com moedas (R3)",
    semente.presentes.filter((p) => p.faixa !== faixaDeMoedas(p.moedas)).map((p) => p.nome));

  const aoAr = mapaPodeIrAoAr(mapa, acervo);
  diz("\nProntidão para ir ao ar:");
  diz(`  ${aoAr.pode ? "✓ o mapa de exemplo pode ir ao ar" : "⏳ o mapa de exemplo AINDA NÃO pode ir ao ar"}`);
  for (const motivo of aoAr.motivos) diz(`     - ${motivo}`);
  if (!aoAr.pode) diz("     O acervo é trabalho manual de véspera (ADR-004): subir e aprovar as imagens no Roblox,\n     preencher assetId e mudar status para aprovado em data/acervo.json.");

  if (erros.length) {
    console.error(`\n${erros.length} contrato(s) quebrado(s):`);
    for (const erro of erros) console.error(`  - ${erro}`);
    process.exitCode = 1;
    return;
  }
  diz("\nTodos os contratos válidos.");
}

if (import.meta.url === `file://${process.argv[1]}`) await principal();
