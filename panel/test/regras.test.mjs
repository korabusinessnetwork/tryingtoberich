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
  MOVIMENTO_PADRAO,
  SLOTS_MAX,
  SLOTS_PADRAO,
  comExcecao,
  deltaDaRegra,
  linhasDeMovimento,
  movimentoDoPreset,
  resumoDaTabela,
  semExcecao,
  animacoesOferecidas,
  avisoDeCurva,
  avisoDeDirecao,
  contarAposentadas,
  combateDoEvento,
  ehSlotExtra,
  avisoDeAncora,
  invadeACam,
  layoutComElemento,
  lerRespostaDoLayout,
  prenderNoPalco,
  semElemento,
  proximaPosicaoLivre,
  corDaFaixa,
  faixaDeMoedas,
  formatarDelta,
  formatarLatencia,
  idDePreset,
  medianaDeLatencia,
  opcoesDeCutscene,
  presentesRepetidos,
  primeiroPresenteLivre,
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
/* R1 emendada — 6 é o PADRÃO, 24 é o teto, e slot vazio é válido  */
/* -------------------------------------------------------------- */

test("o preset sempre tem pelo menos 6 posições, mesmo vazio", () => {
  assert.equal(SLOTS_PADRAO, 6, "o número de desejos que a TikTok exibe");
  assert.equal(SLOTS_MAX, 24, "o maxItems de data/schemas/preset.schema.json");
  assert.equal(slotsDoPreset(null).length, 6);
  assert.equal(slotsDoPreset({ slots: [] }).length, 6);
  assert.ok(slotsDoPreset(null).every((s) => s.vazio));
});

test("os extras entram depois dos 6, e os 6 continuam de pé mesmo vazios", () => {
  // O piso é 6 e não a contagem real: os seis primeiros são o painel de
  // desejos da TikTok e continuam existindo na tela sem presente nenhum.
  const preset = { slots: [{ posicao: 9, presenteId: "nono", delta: 5 }] };
  const slots = slotsDoPreset(preset);

  assert.equal(slots.length, 9, "vai até a maior posição usada");
  assert.deepEqual(slots.map((s) => s.posicao), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(slots[8].presenteId, "nono");
  assert.ok(slots.slice(0, 8).every((s) => s.vazio), "os buracos, dentro e fora dos 6, vêm marcados vazio");
});

test("um preset só com o slot 20 desenha as 20 posições", () => {
  const slots = slotsDoPreset({ slots: [{ posicao: 20, presenteId: "vinte", delta: 1 }] });

  assert.equal(slots.length, 20);
  assert.equal(slots[19].presenteId, "vinte");
  assert.ok(slots[0].vazio && slots[6].vazio);
});

test("posição impossível não vira cartão", () => {
  // O preset é editado à mão em disco (ADR-003). O que preocupa não é o valor
  // negativo — ele nunca casaria com o índice —, é o `posicao: 5000`: sem
  // teto, ele pediria cinco mil cartões e travaria a aba antes de alguém ver
  // que o JSON estava errado.
  const preset = {
    slots: [
      { posicao: 5000, presenteId: "absurdo" },
      { posicao: -3, presenteId: "negativo" },
      { posicao: 2.5, presenteId: "fracionario" },
      { posicao: 7, presenteId: "valido" },
    ],
  };
  const slots = slotsDoPreset(preset);

  assert.equal(slots.length, 7, "só o slot 7 conta para o tamanho da grade");
  assert.equal(slots[6].presenteId, "valido");
});

test("extra é o que passou dos 6 — é ele que ganha o botão de remover", () => {
  assert.equal(ehSlotExtra(6), false);
  assert.equal(ehSlotExtra(7), true);
  assert.equal(ehSlotExtra(24), true);
  assert.equal(ehSlotExtra(undefined), false);
});

test("a próxima posição livre tapa o buraco dos 6 antes de abrir um sétimo", () => {
  // Cartão vazio à vista com uma linha nova embaixo é a mesma informação
  // ocupando o dobro da tela.
  const comBuraco = { slots: [1, 2, 4, 5, 6].map((posicao) => ({ posicao, presenteId: `p${posicao}` })) };
  assert.equal(proximaPosicaoLivre(comBuraco), 3);

  const cheios = { slots: Array.from({ length: 6 }, (_, i) => ({ posicao: i + 1, presenteId: `p${i}` })) };
  assert.equal(proximaPosicaoLivre(cheios), 7);

  assert.equal(proximaPosicaoLivre(null), 1);
});

test("no teto de 24 não há posição livre, e o painel não oferece a 25ª", () => {
  const noTeto = {
    slots: Array.from({ length: SLOTS_MAX }, (_, i) => ({ posicao: i + 1, presenteId: `p${i + 1}` })),
  };
  assert.equal(proximaPosicaoLivre(noTeto), null);
  assert.equal(slotsDoPreset(noTeto).length, SLOTS_MAX);
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

/* -------------------------------------------------------------- */
/* ADR-014 — cutscenes: a pasta é a lista                          */
/* -------------------------------------------------------------- */

const PASTA = [
  { id: "vitoria", arquivo: "vitoria.mp4" },
  { id: "derrota", arquivo: "derrota.mp4" },
];

test("as opções de cutscene são o que está na pasta, com o nome do arquivo", () => {
  assert.deepEqual(opcoesDeCutscene(PASTA, null), [
    { id: "vitoria", arquivo: "vitoria.mp4", ausente: false },
    { id: "derrota", arquivo: "derrota.mp4", ausente: false },
  ]);
});

test("a escolhida que sumiu da pasta continua na lista, marcada — senão o select troca a escolha em silêncio", () => {
  const opcoes = opcoesDeCutscene(PASTA, "final-boss");
  assert.equal(opcoes.length, 3);
  assert.deepEqual(opcoes.at(-1), { id: "final-boss", arquivo: "final-boss", ausente: true });

  // A que está na pasta não é duplicada.
  assert.equal(opcoesDeCutscene(PASTA, "vitoria").length, 2);
});

test("pasta vazia ou lixo não quebram a tela, e escolha nula não inventa opção", () => {
  assert.deepEqual(opcoesDeCutscene([], null), []);
  assert.deepEqual(opcoesDeCutscene([], "vitoria"), [{ id: "vitoria", arquivo: "vitoria", ausente: true }]);
  for (const lixo of [null, undefined, "x", 7, {}]) assert.deepEqual(opcoesDeCutscene(lixo, null), []);
  assert.deepEqual(opcoesDeCutscene([{ semId: true }, null], ""), []);
});

/* ---------------------------------------------------------------- */
/* ADR-016 — a tabela de movimento                                   */
/* ---------------------------------------------------------------- */

const CATALOGO_DA_TABELA = {
  presentes: [
    { presenteId: "rosa", nome: "Rose", moedas: 1, faixa: 1, ativo: true },
    { presenteId: "perfume", nome: "Perfume", moedas: 20, faixa: 2, ativo: true },
    { presenteId: "galaxia", nome: "Galaxy", moedas: 1000, faixa: 4, ativo: true },
    { presenteId: "gratis", nome: "TikTok", moedas: 0, faixa: 1, ativo: true },
  ],
};

const PRESET_DA_TABELA = {
  presetId: "p",
  slots: [{ posicao: 1, presenteId: "galaxia", animacaoId: "sub_shuriken_vento", delta: 50, intensidade: 4 }],
  movimento: { ativo: true, multiplicador: 10, intensidade: 2, excecoes: [{ presenteId: "perfume", delta: -60 }] },
};

test("o padrão da tabela é o mesmo dos dois lados: 10 andares por moeda", () => {
  // O número vive aqui E em bridge/src/dominio/movimento.mjs. Divergir faria a
  // tela mostrar um delta e o jogo andar outro — o pior bug para achar ao vivo.
  assert.equal(MOVIMENTO_PADRAO.multiplicador, 10);
  assert.equal(deltaDaRegra(1, MOVIMENTO_PADRAO.multiplicador), 10);
  assert.equal(deltaDaRegra(20, 10), 200);
  assert.equal(deltaDaRegra("lixo", 10), 0);
});

test("cada linha diz de onde veio o número: do slot, da mão, ou da conta", () => {
  const linhas = linhasDeMovimento(CATALOGO_DA_TABELA, PRESET_DA_TABELA);
  const porId = new Map(linhas.map((linha) => [linha.presenteId, linha]));

  assert.deepEqual(
    linhas.map((linha) => linha.presenteId),
    ["galaxia", "perfume", "rosa", "gratis"],
    "ordenado pelo valor, do mais caro para o mais barato",
  );

  assert.equal(porId.get("galaxia").origem, "slot");
  assert.equal(porId.get("galaxia").delta, 50, "o delta do slot, não os 10.000 da conta");
  assert.equal(porId.get("galaxia").slot, 1);

  assert.equal(porId.get("perfume").origem, "excecao");
  assert.equal(porId.get("perfume").delta, -60);
  assert.equal(porId.get("perfume").daRegra, 200, "a conta continua visível, para dar como desfazer");

  assert.equal(porId.get("rosa").origem, "regra");
  assert.equal(porId.get("rosa").delta, 10);

  assert.equal(porId.get("gratis").delta, 0, "presente de graça não move nada");
});

test("preset sem tabela mostra a conta padrão, para o streamer ver antes de ligar", () => {
  const linhas = linhasDeMovimento(CATALOGO_DA_TABELA, { presetId: "p", slots: [] });
  assert.equal(linhas.find((linha) => linha.presenteId === "rosa").delta, 10);
  assert.equal(movimentoDoPreset(null).multiplicador, 10);
});

test("escrever o número da própria conta APAGA a exceção em vez de gravá-la", () => {
  // É o que faz o multiplicador continuar valendo para quem nunca foi tocado.
  const igual = comExcecao(PRESET_DA_TABELA, "rosa", 10, 10);
  assert.equal(igual.excecoes.some((e) => e.presenteId === "rosa"), false);

  const diferente = comExcecao(PRESET_DA_TABELA, "rosa", -5, 10);
  assert.deepEqual(diferente.excecoes.find((e) => e.presenteId === "rosa"), { presenteId: "rosa", delta: -5 });

  // Zero NÃO é "igual à regra": é o presente silenciado, e vira exceção.
  const zerado = comExcecao(PRESET_DA_TABELA, "rosa", 0, 10);
  assert.deepEqual(zerado.excecoes.find((e) => e.presenteId === "rosa"), { presenteId: "rosa", delta: 0 });

  // Uma exceção por presente, nunca duas.
  const trocada = comExcecao(PRESET_DA_TABELA, "perfume", -80, 200);
  assert.equal(trocada.excecoes.filter((e) => e.presenteId === "perfume").length, 1);
  assert.equal(semExcecao(PRESET_DA_TABELA, "perfume").excecoes.length, 0);
});

test("o resumo conta o que a lista longa esconde, inclusive quem varre a torre sozinho", () => {
  const linhas = linhasDeMovimento(CATALOGO_DA_TABELA, PRESET_DA_TABELA);
  const resumo = resumoDaTabela(linhas, 1000);

  assert.equal(resumo.movem, 3, "o de graça não conta");
  assert.equal(resumo.parados, 1);
  assert.equal(resumo.excecoes, 1);
  assert.equal(resumo.maior.presenteId, "perfume", "o maior é por tamanho, não por sinal");
  assert.equal(resumo.varremATorre, 0, "nenhum dos três chega a 1000 andares");

  // Com a galáxia solta na conta, ela sozinha anda dez torres.
  const semSlot = linhasDeMovimento(CATALOGO_DA_TABELA, { ...PRESET_DA_TABELA, slots: [] });
  assert.equal(resumoDaTabela(semSlot, 1000).varremATorre, 1);
  // Sem mapa gerado não há torre para comparar: a conta não é inventada.
  assert.equal(resumoDaTabela(semSlot, null).varremATorre, null);
});

/* -------------------------------------------------------------- */
/* Estúdio de overlay — a caixa arrastável                         */
/* -------------------------------------------------------------- */

test("prenderNoPalco não deixa a caixa sair por nenhum dos quatro lados", () => {
  const tamanho = { largura: 30, altura: 10 };

  // Esquerda e topo: arrastar para fora vira zero, nunca negativo. Elemento
  // com x negativo é desenhado fora da cena e simplesmente não aparece no OBS.
  assert.deepEqual(prenderNoPalco({ x: -12, y: -3, ...tamanho }), { x: 0, y: 0 });

  // Direita e base: o teto é 100 menos o TAMANHO, porque x/y são o canto
  // superior esquerdo. Prender só a origem deixaria a caixa pendurada fora.
  assert.deepEqual(prenderNoPalco({ x: 140, y: 200, ...tamanho }), { x: 70, y: 90 });

  // Quem cabe fica exatamente onde foi solto.
  assert.deepEqual(prenderNoPalco({ x: 12.3, y: 41.6, ...tamanho }), { x: 12.3, y: 41.6 });
});

test("prenderNoPalco arredonda a uma casa — o arquivo não guarda ruído de pixel", () => {
  // O x vem de uma conta de pixel do ponteiro dividida pela largura do palco.
  // Sem arredondar, o JSON guardaria 37.41999999999996.
  assert.deepEqual(prenderNoPalco({ x: 37.41999999999996, y: 8.06, largura: 10, altura: 5 }), {
    x: 37.4,
    y: 8.1,
  });

  // Caixa maior que o palco fica em 0 em vez de virar teto negativo.
  assert.deepEqual(prenderNoPalco({ x: 40, y: 40, largura: 140, altura: 130 }), { x: 0, y: 0 });

  // Sem número não há posição: NaN viraria `left: NaN%` e a caixa sumiria.
  assert.deepEqual(prenderNoPalco({ x: Number.NaN, y: undefined, largura: 10, altura: 10 }), {
    x: 0,
    y: 0,
  });
});

test("voltar ao padrão APAGA a chave do elemento, não grava a posição padrão nela", () => {
  // É o que mantém o arquivo com só as exceções, como a tabela do ADR-016.
  // Gravar a posição padrão congelaria o desenho de hoje: no dia em que a
  // página do OBS mudasse um elemento de lugar, quem clicou "voltar ao padrão"
  // uma vez ficaria preso no padrão velho sem nada dizendo por quê.
  const elementos = {
    placar: { x: 10, y: 20, escala: 1, visivel: true },
    portal: { x: 60, y: 70, escala: 1.5, visivel: false },
  };

  const semPlacar = semElemento(elementos, "placar");
  assert.equal("placar" in semPlacar, false, "voltar ao padrão tem que APAGAR a chave");
  assert.deepEqual(Object.keys(semPlacar), ["portal"]);

  // Sem mutar o original: o estado do React compara referência.
  assert.deepEqual(Object.keys(elementos).sort(), ["placar", "portal"]);

  // Apagar quem nunca foi mexido não inventa chave nem quebra.
  assert.deepEqual(semElemento({}, "vs"), {});
});

test("layoutComElemento escreve um elemento sem perder o que já havia nele", () => {
  const so_escala = layoutComElemento({}, "vs", { x: 5, y: 5, escala: 2 });
  assert.deepEqual(so_escala.vs, { x: 5, y: 5, escala: 2, visivel: true });

  // Mexer na visibilidade não pode apagar a posição já arrastada — seria o
  // elemento pulando de volta para o padrão a cada clique na caixinha.
  const depois = layoutComElemento(so_escala, "vs", { visivel: false });
  assert.deepEqual(depois.vs, { x: 5, y: 5, escala: 2, visivel: false });

  // E não mexe nos vizinhos.
  const comOutro = layoutComElemento(depois, "portal", { x: 1, y: 2 });
  assert.deepEqual(comOutro.vs, { x: 5, y: 5, escala: 2, visivel: false });
  assert.equal(comOutro.portal.x, 1);
});

test("invadeACam acusa a caixa que encosta na faixa da cam, e só ela (ADR-015)", () => {
  // Nada é desenhado sobre a cam de propósito: ali o elemento fica atrás do
  // rosto do streamer e a live inteira passa com o placar escondido.
  assert.equal(invadeACam({ y: 0, altura: 6 }, 33), true, "colado no topo está dentro da cam");
  assert.equal(invadeACam({ y: 30, altura: 6 }, 33), true, "encostar de raspão também vale aviso");
  assert.equal(invadeACam({ y: 33, altura: 6 }, 33), false, "logo abaixo da faixa está livre");
  assert.equal(invadeACam({ y: 80, altura: 6 }, 33), false);

  // Sem cam declarada não há faixa proibida, e o aviso não pode aparecer do nada.
  assert.equal(invadeACam({ y: 0, altura: 6 }, 0), false);
  assert.equal(invadeACam({ y: 0, altura: 6 }, null), false);
});

test("lerRespostaDoLayout acha o catálogo e as exceções nas DUAS formas da rota", () => {
  // O corpo que `GET /api/overlay/layout` devolve hoje: o catálogo em
  // `elementos` (lista) e as exceções dentro de `layout`. Lendo `elementos`
  // como exceção, o estúdio abria com o palco vazio e "8 fora do padrão" sem
  // ninguém ter arrastado nada — e sem erro nenhum na tela.
  const comoARotaResponde = {
    layout: {
      streamerId: "local",
      atualizadoEm: "2026-09-04T12:00:00.000Z",
      elementos: { placar: { x: 10, y: 40, escala: 1, visivel: true } },
    },
    elementos: [
      { id: "placar", rotulo: "Placar (V / D)", x: 2.5, y: 34.1, largura: 16, altura: 2.25, ancora: "esquerda-topo" },
      { id: "vs", rotulo: "Disputa da rodada (VS)", x: 27, y: 34.1, largura: 46, altura: 2.25, ancora: "centro-topo" },
    ],
    cam: 33,
  };

  const daRota = lerRespostaDoLayout(comoARotaResponde);
  assert.equal(daRota.catalogo.length, 2, "o catálogo não pode chegar vazio: é o que se arrasta");
  assert.deepEqual(daRota.elementos, { placar: { x: 10, y: 40, escala: 1, visivel: true } });

  // A forma que o 07_APIS descreve, e que prevalece: `elementos` é o que o
  // streamer moveu, o catálogo vem ao lado. As duas leituras têm que dar no
  // mesmo, senão alinhar a rota à doc quebraria a tela de novo.
  const comoADocDescreve = {
    elementos: { placar: { x: 10, y: 40, escala: 1, visivel: true } },
    catalogo: comoARotaResponde.elementos,
    cam: 33,
  };

  const daDoc = lerRespostaDoLayout(comoADocDescreve);
  assert.equal(daDoc.catalogo.length, 2);
  assert.deepEqual(daDoc.elementos, daRota.elementos);

  // Quem nunca abriu o estúdio tem exceção nenhuma, e isso é `{}` — não nulo,
  // que quebraria o `Object.keys` do contador de "fora do padrão".
  assert.deepEqual(lerRespostaDoLayout({ elementos: [], cam: 33 }).elementos, {});
  assert.deepEqual(lerRespostaDoLayout(null), { catalogo: null, elementos: {} });
});

test("avisoDeAncora fala só de quem troca de âncora e pula no primeiro arrastar", () => {
  // A promessa é do catálogo da ponte ("o painel avisa quem é assim") e do
  // 02_DESIGN_SYSTEM, seção C. Sem isto o pulo acontece na cara do streamer e
  // ele acha que o estúdio errou o lugar.
  assert.equal(avisoDeAncora("direita-topo"), "à direita");
  assert.equal(avisoDeAncora("direita-base"), "à direita e à base");
  assert.equal(avisoDeAncora("esquerda-base"), "à base");
  assert.equal(avisoDeAncora("centro-topo"), "pelo centro");
  assert.equal(avisoDeAncora("faixa-topo"), "pela largura inteira");

  // Quem já nasce preso pela esquerda e pelo topo não pula: aviso aqui seria
  // ruído em quatro dos oito elementos.
  assert.equal(avisoDeAncora("esquerda-topo"), null);
  // Âncora nova ou ausente não vira aviso inventado.
  assert.equal(avisoDeAncora(undefined), null);
  assert.equal(avisoDeAncora("diagonal-inedita"), null);
});

test("primeiroPresenteLivre pula quem já está em slot E quem já está no placar (R1.4)", () => {
  const catalogo = [
    { presenteId: "rose", nome: "Rosa" },
    { presenteId: "leao", nome: "Leão" },
    { presenteId: "foguete", nome: "Foguete" },
  ];

  // O caso que estourava no Salvar: o único presente fora dos slots é o de
  // vitória, que vive no placar. A ponte varre as duas listas na mesma passada
  // e devolveria `presente_repetido` falando de dois SLOTS — enquanto a colisão
  // real está no placar, que o editor de slots nem mostra ao lado.
  const preset = {
    slots: [{ posicao: 1, presenteId: "rose" }],
    placar: [{ presenteId: "leao", efeito: "vitoria" }],
  };
  assert.equal(primeiroPresenteLivre(catalogo, preset)?.presenteId, "foguete");

  // Sem placar, é o primeiro fora dos slots, como antes.
  assert.equal(primeiroPresenteLivre(catalogo, { slots: preset.slots })?.presenteId, "leao");

  // Preset zerado: o primeiro do catálogo, e nada de estourar sem slots.
  assert.equal(primeiroPresenteLivre(catalogo, null)?.presenteId, "rose");

  // Tudo vinculado devolve null — é o que vira o aviso na tela em vez de um
  // slot com `presenteId: undefined`, que o schema recusaria no Salvar.
  const cheio = {
    slots: [{ posicao: 1, presenteId: "rose" }, { posicao: 2, presenteId: "foguete" }],
    placar: [{ presenteId: "leao", efeito: "derrota" }],
  };
  assert.equal(primeiroPresenteLivre(catalogo, cheio), null);

  // Id numérico de um lado e texto do outro é o normal do catálogo da TikTok:
  // a comparação é por texto, senão o repetido passaria batido.
  assert.equal(
    primeiroPresenteLivre([{ presenteId: 5655 }, { presenteId: 6064 }], { slots: [{ presenteId: "5655" }] })
      ?.presenteId,
    6064,
  );
});
