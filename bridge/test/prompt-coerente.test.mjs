/**
 * O prompt não pode ensinar o modelo a violar as regras.
 *
 * Isto existe por um bug real: o exemplo dentro do prompt mostrava
 * `jumpHeight: 7.2` com `variacaoHorizontal: 9`, quando o alcance horizontal do
 * pulo para esse jumpHeight é 6,07. O modelo copiava o exemplo e o próprio
 * validador da ponte rejeitava o mapa — duas vezes, e o streamer via
 * "o Gemini devolveu um mapa fora das regras" sem que a culpa fosse do Gemini.
 *
 * A causa foi deriva: `problemasDeJogabilidade` ganhou o teto de ALCANCE
 * (ADR-009.2) depois, e o prompt continuou anunciando só o de geometria.
 * Este teste amarra os dois lados para não desencostarem de novo.
 *
 * Com dois FORMATOS o risco dobrou, e a armadilha ficou pior: as regras do
 * `disco` e da `laje` são opostas — uma exige vão, a outra proíbe. Um exemplo
 * trocado não daria erro de sintaxe nem de tipo; daria um mapa reprovado nas
 * duas tentativas, com o streamer vendo "não consegui gerar". Por isso cada
 * formato é conferido contra a SUA regra, e nenhum passa por engano na do
 * outro.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { FORMATO, REGRAS_DE_PLATAFORMA, SYSTEM } from "../src/gemini/prompt.mjs";
import { alcanceHorizontalDoPulo, PADRAO_DO_MUNDO, problemasDeJogabilidade } from "../src/dominio/regras.mjs";

const FORMATOS = ["disco", "laje"];

/** O exemplo tem placeholders `<...>` onde o id do acervo entra. */
const exemplo = (formato) => JSON.parse(FORMATO(formato).replace(/"<[^>]*>"/g, '"x"'));

test("o exemplo de cada formato passa nas MESMAS regras que validam a resposta", () => {
  for (const formato of FORMATOS) {
    const mapa = exemplo(formato);
    assert.equal(mapa.plataformas.formato, formato, "o exemplo tem que declarar o próprio formato");
    assert.deepEqual(problemasDeJogabilidade(mapa), [], `o exemplo de "${formato}" não passa na regra dele`);
  }
});

test("os dois exemplos são REALMENTE diferentes: um tem vão, o outro não", () => {
  // Se um dia os dois exemplos convergirem, este arquivo inteiro vira teatro:
  // estaria conferindo a mesma torre duas vezes com nomes diferentes.
  const vaoDe = (mapa) => {
    const p = mapa.plataformas;
    return p.variacaoHorizontal - 2 * p.raioBase * (1 - p.variacaoRaio);
  };

  assert.ok(vaoDe(exemplo("disco")) > 0, "no disco o jogador PULA: tem que sobrar vão entre as bordas");
  // Negativo na passarela: os degraus se SOBREPÕEM, e é a sobreposição que
  // levanta a rampa. Vão positivo ali seria buraco no caminho.
  assert.ok(vaoDe(exemplo("laje")) < 0, "na passarela o jogador ANDA: degrau encosta no seguinte");
  // E a subida separa os dois: pular contra andar.
  assert.ok(exemplo("disco").plataformas.espacamentoVertical >= 3, "o disco é de pular");
  assert.equal(exemplo("laje").plataformas.espacamentoVertical, 2, "a passarela é de andar");
});

test("os números de um formato NÃO valem no outro: eles se excluem", () => {
  //[[ Antes esta afirmação valia só num sentido: os números da laje passavam
  // também como disco, porque a regra do disco nunca exigiu vão.
  //
  // Deixou de valer quando a passarela virou "subir ANDANDO": a subida dela é
  // exatamente a espessura do degrau (2), e a do disco não desce de 3, que é o
  // que separa escada de pular de rampa. Os dois ficaram mutuamente exclusivos
  // pelo eixo VERTICAL, e é isso que este teste tranca — se alguém afrouxar um
  // dos dois limites, os formatos voltam a se confundir em silêncio. ]]
  const discoComoLaje = exemplo("disco");
  discoComoLaje.plataformas.formato = "laje";
  assert.ok(
    problemasDeJogabilidade(discoComoLaje).length > 0,
    "os números do disco não podem valer como passarela",
  );

  const lajeComoDisco = exemplo("laje");
  lajeComoDisco.plataformas.formato = "disco";
  assert.ok(
    problemasDeJogabilidade(lajeComoDisco).length > 0,
    "os números da passarela não podem valer como disco",
  );
});

test("o VÃO do exemplo de disco cabe no pulo — e é o vão, não a distância entre centros", () => {
  const mapa = exemplo("disco");
  const p = mapa.plataformas;
  const alcance = alcanceHorizontalDoPulo(mapa.jumpHeight);
  // Raio MÍNIMO: disco pequeno abre o maior vão, e é ele o pior caso.
  const vao = p.variacaoHorizontal - 2 * p.raioBase * (1 - p.variacaoRaio);

  assert.ok(vao <= alcance, `vão ${vao.toFixed(2)} passa do alcance ${alcance.toFixed(2)}`);

  // E o passo entre CENTROS pode passar do alcance sem problema nenhum: são os
  // dois raios que entram no meio. Foi confundir os dois que apertou a torre.
  assert.ok(p.variacaoHorizontal > alcance, "o exemplo exercita justamente esse caso");
});

test("o texto do prompt ANUNCIA as regras que reprovam o mapa, em cada formato", () => {
  // Sem isto o modelo satisfaz a regra que recebeu e mesmo assim é rejeitado.
  for (const formato of FORMATOS) {
    const texto = SYSTEM(formato);
    assert.match(texto, /vão/i, `o prompt de "${formato}" não fala de vão`);
    assert.ok(
      texto.includes(REGRAS_DE_PLATAFORMA[formato]),
      `o prompt de "${formato}" não traz a receita dele`,
    );
    assert.ok(
      !texto.includes(REGRAS_DE_PLATAFORMA[formato === "disco" ? "laje" : "disco"]),
      `o prompt de "${formato}" está levando junto a receita do outro formato`,
    );
  }

  // A forma da torre tem que estar no prompt: sem ela o modelo devolve números
  // que passam nas regras mas descrevem outra coisa.
  assert.match(SYSTEM("disco"), /escada quadrada/i);
  assert.match(SYSTEM("laje"), /passarela/i);

  //[[ E os números da tabela têm que ser os que o código calcula, não copiados.
  //
  // As duas pontas que importam: o jumpHeight PADRÃO — o que o modelo vai usar
  // de fato, e sem ele na tabela o prompt manda escolher um passo às cegas — e
  // o teto do contrato, que é o outro extremo da faixa. ]]
  for (const jumpHeight of [PADRAO_DO_MUNDO.jumpHeight, 12]) {
    assert.ok(
      SYSTEM("disco").includes(alcanceHorizontalDoPulo(jumpHeight).toFixed(1)),
      `a tabela do prompt não traz o alcance de jumpHeight ${jumpHeight}`,
    );
  }
});

test("a config padrão do mundo mora num lugar só, e o prompt a interpola", async () => {
  //[[ O prompt tinha os números escritos à mão e `PADROES_POR_FORMATO` tinha os
  // dele. Já discordaram: o mundo montado na galeria saía com uma geometria e o
  // gerado pela IA com outra, os dois "certos" segundo o código que os produziu.
  //
  // Pior no texto da laje, que dizia "use EXATAMENTE 20" e três linhas abaixo
  // "use 2" — o modelo recebia as duas ordens na mesma regra.
  //
  // Agora o número existe uma vez e todo mundo interpola. Este teste é o que
  // impede o literal de voltar. ]]
  const { PADROES_POR_FORMATO } = await import("../src/dominio/regras.mjs");
  const { montarMundo } = await import("../src/dominio/mundo.mjs");
  const fonte = await readFile(new URL("../src/gemini/prompt.mjs", import.meta.url), "utf8");

  // O compositor da galeria parte do padrão, sem número próprio.
  const padrao = montarMundo({ skybox: "ceu", texturas: ["tex"] });
  assert.equal(padrao.jumpHeight, PADRAO_DO_MUNDO.jumpHeight);
  assert.equal(padrao.totalPlataformas, PADRAO_DO_MUNDO.totalPlataformas);
  for (const [campo, valor] of Object.entries(PADROES_POR_FORMATO.disco)) {
    assert.equal(padrao.plataformas[campo], valor, `o mundo padrão não usou o ${campo} do formato`);
  }

  // E o mundo padrão é jogável — a config padrão nunca pode nascer reprovada.
  assert.deepEqual(problemasDeJogabilidade(padrao), []);

  // Nenhum número de geometria escrito à mão no prompt.
  for (const campo of ["jumpHeight", "totalPlataformas", "raioBase", "variacaoRaio", "espacamentoVertical", "variacaoHorizontal"]) {
    assert.doesNotMatch(
      fonte,
      new RegExp(`"${campo}":\s*\d`),
      `"${campo}" está com número fixo no prompt em vez de sair da constante`,
    );
  }
});
