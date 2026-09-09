#!/usr/bin/env node
/**
 * Relatório do estado dos contratos em data/.
 *
 * Este arquivo é uma CLI fina: a forma vem dos JSON Schemas e as regras
 * cruzadas vêm de `bridge/src/dominio/regras.mjs`. A dependência aponta para
 * o domínio de propósito — a regra existe num lugar só, e a ferramenta não
 * pode divergir da ponte que roda ao vivo.
 *
 * Uso: node scripts/validar-contratos.mjs [--silencioso]
 */

import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { RAIZ, lerJson } from "../bridge/src/repos/arquivo.mjs";
import { criarValidador } from "../bridge/src/repos/schemas.mjs";
import {
  faixaDeMoedas,
  mapaPodeIrAoAr,
  posicoesRepetidas,
  presentesRepetidos,
  problemasDeJogabilidade,
  referenciasInexistentes,
} from "../bridge/src/dominio/regras.mjs";

export { RAIZ, criarValidador };
export {
  FATOR_SALTO_VERTICAL,
  faixaDeMoedas,
  mapaPodeIrAoAr,
  posicoesRepetidas,
  presentesRepetidos,
  problemasDeJogabilidade,
  referenciasDeAcervo,
  referenciasInexistentes,
  referenciasNaoAprovadas,
} from "../bridge/src/dominio/regras.mjs";

async function principal() {
  const silencioso = process.argv.includes("--silencioso");
  const diz = (...args) => !silencioso && console.log(...args);
  const erros = [];

  const { validar, schemas } = await criarValidador();
  diz(`Schemas registrados: ${schemas.length}`);

  const emDados = (...partes) => lerJson(path.join(RAIZ, "data", ...partes));
  const acervo = await emDados("acervo.json");
  const semente = await emDados("catalogo-presentes.seed.json");
  const mapa = await emDados("exemplos", "mapa-torre-vulcanica-01.json");

  const checar = (rotulo, lista) => {
    if (lista.length) erros.push(`${rotulo}: ${lista.join(" · ")}`);
    diz(`  ${lista.length ? "✗" : "✓"} ${rotulo}`);
  };

  diz("\nContratos:");
  checar("data/acervo.json", validar("acervo", acervo));
  checar("data/catalogo-presentes.seed.json", validar("catalogo-presentes", semente));

  const dirExemplos = path.join(RAIZ, "data", "exemplos");
  for (const arquivo of (await readdir(dirExemplos)).filter((f) => f.endsWith(".json")).sort()) {
    const nomeSchema = arquivo.startsWith("preset-") ? "preset"
      : arquivo.startsWith("mapa-") ? "mapa"
      : arquivo.startsWith("look-") ? "look"
      : arquivo.startsWith("sessao-") ? "sessao"
      : "animacoes";
    checar(`data/exemplos/${arquivo}`, validar(nomeSchema, await emDados("exemplos", arquivo)));
  }

  //[[ O layout do overlay é OPCIONAL por construção.
  //
  // Quem nunca abriu o Estúdio de Overlay não tem o arquivo, e é o caso normal:
  // a ausência já é o padrão da página. Só validamos quando ele existe — um
  // relatório vermelho numa instalação limpa treinaria o dono a ignorar o
  // vermelho, que é o oposto do que este script serve para fazer. ]]
  const layout = await lerJson(path.join(RAIZ, "data", "overlay-layout.json")).catch((erro) => {
    if (erro.code === "ENOENT") return null;
    throw erro;
  });
  if (layout) checar("data/overlay-layout.json", validar("overlay-layout", layout));

  const dirCenarios = path.join(RAIZ, "data", "fixtures", "cenarios");
  for (const arquivo of (await readdir(dirCenarios)).filter((f) => f.endsWith(".json")).sort()) {
    const cenario = await emDados("fixtures", "cenarios", arquivo);
    const problemas = cenario.entrada.flatMap((passo, i) =>
      validar("evento-presente", passo.evento).map((e) => `entrada[${i}] ${e}`),
    );
    checar(`data/fixtures/cenarios/${arquivo}`, problemas);
  }

  diz("\nRegras cruzadas:");
  const presetExemplo = await emDados("exemplos", "preset-escalada-padrao.json");
  checar("preset sem presente repetido (R1.4)", presentesRepetidos(presetExemplo));
  // Entrou aqui quando saiu do JSON Schema: com o teto em 24, os pares
  // contains/maxContains virariam 24 blocos. Sem esta linha, a checagem de
  // posição some do relatório e ninguém percebe que a garantia mudou de lugar.
  checar("preset sem posição repetida (R1)", posicoesRepetidas(presetExemplo));
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
