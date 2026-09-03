/**
 * As regras de exibição do painel.
 *
 * Tudo aqui é função pura, sem React e sem rede, e é por isso que dá para
 * testar com `node --test` sem montar componente nenhum. O que estes testes
 * protegem não é formatação: é a regra R3 — **o valor sugere, nunca decide** —
 * e o fato de os avisos avisarem sem bloquear.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  SLOTS,
  animacoesOferecidas,
  avisoDeCurva,
  avisoDeDirecao,
  contarAposentadas,
  combateDoEvento,
  corDaFaixa,
  faixaDeMoedas,
  formatarDelta,
  formatarLatencia,
  idDePreset,
  medianaDeLatencia,
  presentesRepetidos,
  saudeDaLatencia,
  slotsDoPreset,
} from "../src/lib/regras.js";

import { faixaDeMoedas as faixaDaPonte } from "../../bridge/src/dominio/regras.mjs";

/* -------------------------------------------------------------- */
/* R3 — faixa                                                      */
/* -------------------------------------------------------------- */

test("a faixa do painel é a mesma da ponte, moeda a moeda", () => {
  // Duplicar a regra em JavaScript dos dois lados é aceitável; divergir não é.
  // O painel coloriria por uma faixa e a ponte ordenaria por outra.
  for (const moedas of [0, 1, 9, 10, 99, 100, 999, 1000, 4999, 5000, 44999]) {
    assert.equal(faixaDeMoedas(moedas), faixaDaPonte(moedas), `${moedas} moedas`);
  }
});

test("a faixa do painel bate com a da ponte numa varredura ampla, moeda a moeda", () => {
  // A lista de pontos acima cobre as fronteiras; esta cobre tudo em volta
  // delas. É a "boa varredura de valores" que a divergência silenciosa entre
  // painel e ponte precisa para não passar despercebida.
  for (let moedas = 0; moedas <= 6000; moedas += 1) {
    assert.equal(faixaDeMoedas(moedas), faixaDaPonte(moedas), `${moedas} moedas`);
  }
});

test("as bordas das faixas são as do R3", () => {
  assert.deepEqual(
    [1, 9, 10, 99, 100, 999, 1000, 4999, 5000].map(faixaDeMoedas),
    [1, 1, 2, 2, 3, 3, 4, 4, 5],
  );
});

test("a cor da faixa é variável CSS, nunca hex", () => {
  // O white-label da Fase 3 troca o tokens.css e nada mais. Hex vazando para
  // o componente é o que obrigaria a caçar cor dentro de JSX depois.
  for (const faixa of [1, 2, 3, 4, 5]) {
    assert.equal(corDaFaixa(faixa), `var(--faixa-${faixa})`);
    assert.equal(corDaFaixa(faixa).includes("#"), false);
  }
});

/* -------------------------------------------------------------- */
/* Delta                                                           */
/* -------------------------------------------------------------- */

test("o delta positivo mostra o sinal, que é o que diferencia subida de descida", () => {
  assert.equal(formatarDelta(12), "+12");
  assert.equal(formatarDelta(-8), "-8");
  assert.equal(formatarDelta(200), "+200");
});

test("delta zero é o relance — sem sinal, para não parecer subida", () => {
  assert.equal(formatarDelta(0), "0");
});

/* -------------------------------------------------------------- */
/* R3 — o aviso avisa, não bloqueia                                */
/* -------------------------------------------------------------- */

test("presente barato com delta enorme vira aviso", () => {
  const aviso = avisoDeCurva({ moedas: 1, delta: 600 });
  assert.ok(aviso, "1 moeda movendo 600 plataformas está fora da curva");
  assert.match(aviso, /rajada/, "e o motivo é o que importa: presente barato chega em rajada");
});

test("presente caro com delta minúsculo vira aviso", () => {
  const aviso = avisoDeCurva({ moedas: 29999, delta: 2 });
  assert.ok(aviso);
  assert.match(aviso, /decepcionar/);
});

test("o vínculo dentro da curva não avisa nada", () => {
  assert.equal(avisoDeCurva({ moedas: 1000, delta: 40 }), null);
  assert.equal(avisoDeCurva({ moedas: 1, delta: 2 }), null);
  assert.equal(avisoDeCurva({ moedas: 30, delta: 12 }), null);
});

test("o aviso é sempre TEXTO, nunca um booleano que trave o salvar", () => {
  // R3 e ADR-007: o vínculo é escolha explícita do streamer, e presente de 1
  // moeda que derruba tudo é uma piada boa de live. Se o retorno fosse
  // booleano, a próxima pessoa a mexer transformaria em bloqueio sem perceber.
  const aviso = avisoDeCurva({ moedas: 1, delta: 900 });
  assert.equal(typeof aviso, "string");
  assert.ok(aviso.length > 20, "e o texto diz o porquê, não só que está errado");
});

test("delta zero e entrada inválida não geram aviso", () => {
  // Delta 0 é recusado pelo schema antes de chegar aqui; o aviso não é o lugar
  // de reclamar disso, senão o streamer vê dois erros para o mesmo problema.
  assert.equal(avisoDeCurva({ moedas: 1, delta: 0 }), null);
  assert.equal(avisoDeCurva({ moedas: null, delta: 10 }), null);
  assert.equal(avisoDeCurva({}), null);
});

test("as fronteiras exatas do aviso de rajada (faixa I/II, força 250)", () => {
  // 250 é 5% da torre de 5000, a mesma proporção que os 50 de quando ela tinha
  // 1000 andares. O aviso mede o quanto do mapa o presente barato atravessa.
  assert.match(avisoDeCurva({ moedas: 99, delta: 250 }), /rajada/, "força 250 já avisa");
  assert.equal(avisoDeCurva({ moedas: 99, delta: 249 }), null, "força 249 ainda não avisa");
  // A força é o módulo do delta: descida grande num presente barato é a mesma
  // piada de live que subida grande, e merece o mesmo aviso.
  assert.match(avisoDeCurva({ moedas: 5, delta: -250 }), /rajada/, "delta negativo também conta pela força");
});

test("as fronteiras exatas do aviso de decepção (faixa IV/V, força 3)", () => {
  assert.match(avisoDeCurva({ moedas: 1000, delta: 3 }), /decepcionar/, "força 3 já avisa");
  assert.equal(avisoDeCurva({ moedas: 1000, delta: 4 }), null, "força 4 ainda não avisa");
});

test("a faixa III (100 a 999) nunca avisa, nem com delta grande — é a zona morta das duas regras", () => {
  assert.equal(avisoDeCurva({ moedas: 500, delta: 2000 }), null);
  assert.equal(avisoDeCurva({ moedas: 100, delta: -2000 }), null);
});

/* -------------------------------------------------------------- */
/* R2 — a direção é o sinal do delta                               */
/* -------------------------------------------------------------- */

test("animação de subida com delta negativo avisa, e vice-versa", () => {
  const subida = { direcao: "subida" };
  const descida = { direcao: "descida" };

  assert.match(avisoDeDirecao({ animacao: subida, delta: -10 }), /desce enquanto o efeito sobe/);
  assert.match(avisoDeDirecao({ animacao: descida, delta: 10 }), /sobe enquanto o efeito desce/);
  assert.equal(avisoDeDirecao({ animacao: subida, delta: 10 }), null);
  assert.equal(avisoDeDirecao({ animacao: descida, delta: -10 }), null);
});

test("a inversão avisa mas nunca bloqueia (R2, ADR-007): entrada incompleta não quebra, e o retorno nunca é boolean", () => {
  const subida = { direcao: "subida" };

  // Sem animação escolhida, sem delta ainda digitado, ou delta 0: nada para
  // comparar, então nada para avisar — não é o mesmo caso de "avisou e o
  // streamer ignorou", é "ainda não há o que checar".
  assert.equal(avisoDeDirecao({ animacao: null, delta: 10 }), null);
  assert.equal(avisoDeDirecao({ animacao: subida, delta: undefined }), null);
  assert.equal(avisoDeDirecao({ animacao: subida, delta: NaN }), null);
  assert.equal(avisoDeDirecao({ animacao: subida, delta: 0 }), null);

  // E quando avisa, o vínculo continua salvável: o retorno é texto, não um
  // booleano que a próxima pessoa a mexer transformaria em bloqueio.
  const aviso = avisoDeDirecao({ animacao: subida, delta: -5 });
  assert.equal(typeof aviso, "string");
});

/* -------------------------------------------------------------- */
/* R1 — seis slots, e slot vazio é válido                          */
/* -------------------------------------------------------------- */

test("o preset sempre tem 6 posições, mesmo vazio", () => {
  assert.equal(SLOTS, 6);
  assert.equal(slotsDoPreset(null).length, 6);
  assert.equal(slotsDoPreset({ slots: [] }).length, 6);
  assert.ok(slotsDoPreset(null).every((s) => s.vazio));
});

test("as posições preenchidas ficam no lugar certo, e o resto vem vazio", () => {
  const preset = { slots: [{ posicao: 3, presenteId: "sem-galaxy", delta: 40 }] };
  const slots = slotsDoPreset(preset);

  assert.equal(slots.length, 6);
  assert.equal(slots[2].presenteId, "sem-galaxy", "posição 3 é o índice 2");
  assert.ok(slots[0].vazio && slots[5].vazio);
  assert.deepEqual(slots.map((s) => s.posicao), [1, 2, 3, 4, 5, 6]);
});

test("preset com os 6 slots preenchidos não sobra nem falta posição", () => {
  const preset = {
    slots: Array.from({ length: 6 }, (_, i) => ({ posicao: i + 1, presenteId: `presente-${i + 1}`, delta: 10 })),
  };
  const slots = slotsDoPreset(preset);

  assert.equal(slots.length, 6);
  assert.ok(slots.every((s) => !s.vazio));
  assert.deepEqual(slots.map((s) => s.presenteId), [
    "presente-1", "presente-2", "presente-3", "presente-4", "presente-5", "presente-6",
  ]);
});

test("a ordem das posições no JSON não importa — o slot 1 é sempre o primeiro do retorno (R1.3)", () => {
  // O preset salvo em disco não promete slots em ordem de posição; quem edita
  // o JSON à mão, ou uma migração futura, pode gravar fora de ordem.
  const preset = {
    slots: [
      { posicao: 5, presenteId: "quinto" },
      { posicao: 1, presenteId: "primeiro" },
      { posicao: 3, presenteId: "terceiro" },
    ],
  };
  const slots = slotsDoPreset(preset);

  assert.deepEqual(slots.map((s) => s.posicao), [1, 2, 3, 4, 5, 6], "sempre em ordem de posição, não de chegada");
  assert.equal(slots[0].presenteId, "primeiro");
  assert.equal(slots[2].presenteId, "terceiro");
  assert.equal(slots[4].presenteId, "quinto");
  assert.ok(slots[1].vazio && slots[3].vazio && slots[5].vazio);
});

test("presente repetido em dois slots é detectado antes de a ponte recusar (R1.4)", () => {
  const preset = {
    slots: [
      { posicao: 1, presenteId: "sem-rose" },
      { posicao: 2, presenteId: "sem-galaxy" },
      { posicao: 4, presenteId: "sem-rose" },
    ],
  };
  assert.deepEqual(presentesRepetidos(preset), ["sem-rose"]);
  assert.deepEqual(presentesRepetidos({ slots: [] }), []);
  assert.deepEqual(presentesRepetidos(null), []);
});

/* -------------------------------------------------------------- */
/* Princípio nº1 — a latência na tela                              */
/* -------------------------------------------------------------- */

test("a saúde da latência segue o orçamento do Princípio nº1", () => {
  // Alvo de 600ms, teto de 1000ms. É o número que decide se o produto funciona:
  // acima disso o espectador não associa o efeito ao próprio presente.
  assert.equal(saudeDaLatencia(320), "ok");
  assert.equal(saudeDaLatencia(600), "ok");
  assert.equal(saudeDaLatencia(601), "atencao");
  assert.equal(saudeDaLatencia(1000), "atencao");
  assert.equal(saudeDaLatencia(1001), "erro");
  assert.equal(saudeDaLatencia(null), "desconhecida");
});

test("latência ausente vira travessão, não NaN na tela do streamer", () => {
  assert.equal(formatarLatencia(620), "620ms");
  assert.equal(formatarLatencia(619.6), "620ms");
  assert.equal(formatarLatencia(null), "—");
  assert.equal(formatarLatencia(undefined), "—");
});

/* -------------------------------------------------------------- */
/* ADR-012 — combate, e a latência do Princípio nº1                */
/* -------------------------------------------------------------- */

test("os dois formatos de combate viram a mesma leitura (ADR-012)", () => {
  // Eles chegam por caminhos diferentes de propósito: disputa contestada vem
  // junto do presente que moveu o boneco; empate exato vem sozinho, porque
  // delta 0 não existe no contrato com o jogo.
  const contestado = combateDoEvento({
    delta: -49,
    disputa: { contestado: true, somaSubida: 19, somaDescida: -68, liquido: -49, participantes: 5 },
  });
  assert.deepEqual(contestado, {
    empate: false, somaSubida: 19, somaDescida: -68, liquido: -49, participantes: 5,
  });

  const empate = combateDoEvento({ anulado: true, somaSubida: 40, somaDescida: -40, participantes: 2 });
  assert.equal(empate.empate, true);
  assert.equal(empate.liquido, 0, "empate é zero por definição: ninguém andou");
});

test("presente comum não é disputa: combate de um lado só devolve null", () => {
  assert.equal(combateDoEvento({ delta: 40, disputa: null }), null);
  assert.equal(combateDoEvento({ delta: 40 }), null);
  assert.equal(
    combateDoEvento({ delta: 15, disputa: { contestado: false, somaSubida: 15, somaDescida: 0 } }),
    null,
    "sem os dois lados ninguém brigou, e a etiqueta de disputa se gastaria à toa",
  );
});

test("a latência típica é a mediana, e um pico não pinta o painel de vermelho", () => {
  // Nove presentes no prazo e um pico de 3s: a média daria 840ms, acima do
  // alvo. A mediana diz o que a plateia está sentindo.
  const amostras = [520, 540, 560, 580, 600, 610, 620, 640, 660, 3000];
  assert.equal(medianaDeLatencia(amostras), 605);
  assert.equal(saudeDaLatencia(medianaDeLatencia(amostras)), "atencao");

  const media = amostras.reduce((s, v) => s + v, 0) / amostras.length;
  assert.equal(saudeDaLatencia(media), "atencao");
  assert.ok(media > medianaDeLatencia(amostras), "a média é arrastada pelo pico; a mediana não");
});

test("sem amostra válida a latência é desconhecida, não zero", () => {
  // Zero seria a melhor latência possível, e envenenaria a leitura para baixo.
  assert.equal(medianaDeLatencia([]), null);
  assert.equal(medianaDeLatencia([undefined, null, NaN]), null);
  assert.equal(saudeDaLatencia(medianaDeLatencia([])), "desconhecida");
});

/* ------------------------------------------------------------------ */
/* O nome digitado vira o id do arquivo                                */
/* ------------------------------------------------------------------ */

test("o nome vira um id que o schema aceita: sem espaço, sem acento, sem maiúscula", () => {
  assert.equal(idDePreset("Escalada da Madrugada"), "escalada-da-madrugada");
  assert.equal(idDePreset("Escalada padrão"), "escalada-padrao");
  // A cedilha vira "c", não some: quem escreve "Ação" espera achar "acao".
  assert.equal(idDePreset("  Ação!!  "), "acao");
});

test("todo id gerado passa no padrão do identificador de comuns.schema.json", () => {
  // É o mesmo padrão que a ponte valida. Um id que não passa aqui vira um erro
  // de JSON Schema na cara do streamer, e ele não tem o que fazer com isso.
  const PADRAO = /^[a-z0-9][a-z0-9-]*$/;
  const nomes = [
    "Escalada", "TESTE 2", "live de 6ª", "a---b", "Ç", "Escalada #2",
    "  espaços  em  volta  ", "acentuação é comum", "1 2 3",
  ];

  for (const nome of nomes) {
    const id = idDePreset(nome);
    assert.match(id, PADRAO, `"${nome}" gerou "${id}", que a ponte recusaria`);
    assert.ok(id.length <= 64, "o identificador tem teto de 64 no schema");
  }
});

test("nome sem nada aproveitável devolve vazio, e não um id inválido", () => {
  // Vazio é a resposta honesta: quem chama trata como "ainda não dá para
  // criar". Devolver "-" ou "preset" mandaria a ponte gravar um arquivo que o
  // streamer não pediu.
  assert.equal(idDePreset("🔥🔥"), "");
  assert.equal(idDePreset("   "), "");
  assert.equal(idDePreset("---"), "");
  assert.equal(idDePreset(null), "");
  assert.equal(idDePreset(undefined), "");
});

test("o corte em 64 não deixa traço na ponta", () => {
  // O padrão exige começar em [a-z0-9] e o traço final é feio no nome do
  // arquivo; cortar no meio de uma palavra pode deixar exatamente isso.
  // 63 letras + " bbbb" passa de 64: o corte cai exatamente em cima do traço
  // que o espaço virou, e o que sobra tem 63 — a limpeza acontece DEPOIS de
  // cortar, de propósito.
  const id = idDePreset(`${"a".repeat(63)} bbbb`);
  assert.equal(id.length, 63);
  assert.doesNotMatch(id, /-$/);
  assert.match(id, /^[a-z0-9][a-z0-9-]*$/);

  // E um nome longo que não cai no traço usa os 64 inteiros.
  assert.equal(idDePreset("b".repeat(80)).length, 64);
});

/* ---------------------------------------------------------------- */
/* Animação aposentada — a mesma regra do `ativo` do catálogo        */
/* ---------------------------------------------------------------- */

const BIBLIOTECA = [
  { id: "sub_lanca_raios", direcao: "subida", ativa: true },
  { id: "sub_pulo", direcao: "subida", ativa: false },
  { id: "des_meteoro_igneo", direcao: "descida", ativa: true },
  { id: "des_buraco_negro", direcao: "descida", ativa: false },
];

test("o painel só oferece animação ativa, mesmo recebendo a biblioteca inteira", () => {
  // /api/animacoes serve tudo de propósito: o cartão do slot precisa do NOME de
  // uma aposentada para conseguir mostrá-la. Quem filtra é quem oferece escolha.
  assert.deepEqual(
    animacoesOferecidas(BIBLIOTECA).map((a) => a.id),
    ["sub_lanca_raios", "des_meteoro_igneo"],
  );
});

test("a aposentada que já está no slot continua na lista — senão o slot fica sem seleção", () => {
  assert.deepEqual(
    animacoesOferecidas(BIBLIOTECA, "sub_pulo").map((a) => a.id),
    ["sub_lanca_raios", "sub_pulo", "des_meteoro_igneo"],
  );

  // Só a do slot volta, não as aposentadas em geral.
  assert.ok(!animacoesOferecidas(BIBLIOTECA, "sub_pulo").some((a) => a.id === "des_buraco_negro"));
});

test("`ativa` ausente conta como ativa: índice velho em disco não pode esvaziar o seletor", () => {
  // data/animacoes.json é artefato gerado e não é versionado. Uma cópia gerada
  // antes da coluna Ativa existir chegaria sem o campo, e tratar isso como
  // aposentada deixaria o streamer sem NENHUMA animação para escolher.
  const semCampo = [{ id: "sub_pulo", direcao: "subida" }, { id: "des_tropeco", direcao: "descida" }];
  assert.equal(animacoesOferecidas(semCampo).length, 2);
  assert.equal(contarAposentadas(semCampo), 0);
});

test("entrada que não é lista não quebra a tela", () => {
  for (const lixo of [null, undefined, "x", 7, {}]) {
    assert.deepEqual(animacoesOferecidas(lixo), []);
    assert.equal(contarAposentadas(lixo), 0);
  }
});

test("contarAposentadas conta só as desligadas", () => {
  assert.equal(contarAposentadas(BIBLIOTECA), 2);
});
