/**
 * O que a tela DESENHA, e não o que o arquivo diz.
 *
 * Este arquivo existe por causa do BUG-008: 504 testes verdes — paridade de
 * chave, chave órfã, chave morta, string cravada —, todos estáticos, e o painel
 * inteiro em português depois de trocar para espanhol. Nenhum deles
 * renderizava. Daqui em diante, tela nova nasce com pelo menos um teste que
 * monta o componente e lê o texto que sai.
 *
 * Duas telas estão cobertas aqui:
 *
 * 1. Os seis cartões numa INSTALAÇÃO LIMPA, onde a ponte ainda responde o
 *    catálogo semente e o preset padrão aponta para ids reais da TikTok. Era a
 *    primeira tela do cliente, e ela acusava seis presentes certos de não
 *    existirem.
 * 2. A tela de licença do ADR-P02, nos cinco estados do schema — inclusive o
 *    `indeterminada`, que não pode parecer acusação.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { criar, renderizar, textoVisivel } from "./ferramentas/renderizar.mjs";
import { definirIdioma, traduzir } from "../src/i18n/traduzir.js";
import { dataHora } from "../src/i18n/formatar.js";

// Depois do `register` dos hooks, nunca antes. Ver ferramentas/renderizar.mjs.
const { CartaoDeSlot } = await import("../src/components/CartaoDeSlot.jsx");
const { EditorDePreset } = await import("../src/components/EditorDePreset.jsx");
const { PainelDeLicenca } = await import("../src/components/PainelDeLicenca.jsx");

/* ---------------------------------------------------------------- */
/* Fixtures                                                          */
/* ---------------------------------------------------------------- */

/** Os ids são os do `data/presets/escalada-padrao.json`, que é o que o cliente abre. */
const SLOTS_DO_PADRAO = [
  { posicao: 1, presenteId: "6064", animacaoId: "sub_jato_propulsor", delta: 20, intensidade: 3 },
  { posicao: 2, presenteId: "5655", animacaoId: "des_braco_elastico", delta: -20, intensidade: 3 },
  { posicao: 3, presenteId: "5879", animacaoId: "sub_shuriken_vento", delta: 50, intensidade: 4 },
  { posicao: 4, presenteId: "14488", animacaoId: "des_punho_impacto", delta: -50, intensidade: 4 },
  { posicao: 5, presenteId: "5509", animacaoId: "sub_shuriken_vento", delta: 150, intensidade: 5 },
  { posicao: 6, presenteId: "5794", animacaoId: "des_meteoro_igneo", delta: -150, intensidade: 5 },
];

const PRESET_PADRAO = {
  presetId: "escalada-padrao",
  nome: "Escalada padrão",
  modalidade: "escalada",
  slots: SLOTS_DO_PADRAO,
};

/** Os ids da semente são inventados de propósito e nunca batem com os do preset. */
const CATALOGO_SEMENTE = {
  origem: "semente",
  presentes: [
    { presenteId: "sem-rose", nome: "Rosa", moedas: 1, ativo: true },
    { presenteId: "sem-tiktok", nome: "TikTok", moedas: 1, ativo: true },
  ],
};

const CATALOGO_REAL = {
  origem: "publico",
  presentes: [{ presenteId: "6064", nome: "Rose", moedas: 1, ativo: true }],
};

const ANIMACOES = [
  { id: "sub_jato_propulsor", nome: "Jato propulsor", direcao: "subida", pesoVisual: 3, duracaoBase: 1.2 },
];

const desenharEditor = (catalogo) =>
  textoVisivel(criar(EditorDePreset, { preset: PRESET_PADRAO, catalogo, animacoes: ANIMACOES }));

const desenharCartao = (props) =>
  textoVisivel(
    criar(CartaoDeSlot, {
      slot: SLOTS_DO_PADRAO[0],
      presente: null,
      animacao: ANIMACOES[0],
      ...props,
    }),
  );

/* ---------------------------------------------------------------- */
/* Tarefa 1 — a instalação limpa                                     */
/* ---------------------------------------------------------------- */

test("instalação limpa: nenhum dos seis cartões acusa o presente de não existir", () => {
  const tela = desenharEditor(CATALOGO_SEMENTE);

  assert.ok(
    !tela.includes(traduzir("panel.slotCard.giftUnknown")),
    "a pastilha vermelha voltou: com a semente em mãos o painel não sabe se o presente existe",
  );
  assert.ok(
    !tela.includes(traduzir("panel.slotCard.giftMissing")),
    "'presente fora do catálogo' é uma afirmação que o painel não pode fazer sem a coleta",
  );

  // E o cartão continua identificando QUAL presente está ali.
  for (const slot of SLOTS_DO_PADRAO) {
    assert.ok(
      tela.includes(traduzir("panel.slotCard.giftById", { id: slot.presenteId })),
      `o cartão ${slot.posicao} não diz de que presente se trata`,
    );
  }
});

test("instalação limpa: a explicação aparece UMA vez, acima da grade", () => {
  const tela = desenharEditor(CATALOGO_SEMENTE);
  const frase = traduzir("panel.presetEditor.seedCatalog");

  const vezes = tela.split(frase).length - 1;
  assert.equal(vezes, 1, `a frase apareceu ${vezes} vezes — ela é da tela, não do cartão`);

  // Aviso sem saída é aviso pela metade: a frase tem que dizer o que fazer.
  assert.ok(
    frase.includes(traduzir("panel.giftPicker.refresh")),
    "a linha precisa nomear a ação que resolve",
  );
});

test("com catálogo REAL, a pastilha de presente desconhecido volta a valer", () => {
  // O contrário do teste de cima, e o mais importante dos dois: calar o aviso
  // sempre esconderia um slot morto na véspera da live.
  const tela = desenharEditor(CATALOGO_REAL);

  assert.ok(
    tela.includes(traduzir("panel.slotCard.giftUnknown")),
    "o slot 2 aponta para um id que não está no catálogo real e ninguém avisou",
  );
  assert.ok(
    !tela.includes(traduzir("panel.presetEditor.seedCatalog")),
    "a linha da semente não pode aparecer sobre um catálogo coletado",
  );
});

test("presente que SUMIU da live continua acusado, semente ou não", () => {
  // `ativo: false` é outra coisa: o presente foi encontrado, e a coleta diz que
  // ele saiu. Isso o painel sabe, e continua dizendo.
  const foraDaLive = { presenteId: "6064", nome: "Rose", moedas: 1, ativo: false };

  assert.ok(
    desenharCartao({ presente: foraDaLive }).includes(traduzir("panel.slotCard.giftInactive")),
    "presente fora da live tem que aparecer com catálogo real",
  );
  assert.ok(
    desenharCartao({ presente: foraDaLive, catalogoNaoColetado: true }).includes(
      traduzir("panel.slotCard.giftInactive"),
    ),
    "a semente cala o que o painel NÃO SABE, não o que a coleta afirmou",
  );
});

test("o cartão sem catálogo nenhum se comporta como antes", () => {
  // Prop ausente é o caso de todo componente que ainda não foi refiado: sem
  // este teste, `catalogoNaoColetado` chegando `undefined` poderia calar tudo.
  assert.ok(desenharCartao({}).includes(traduzir("panel.slotCard.giftUnknown")));
});

/* ---------------------------------------------------------------- */
/* Tarefa 2 — a tela de licença (ADR-P02)                            */
/* ---------------------------------------------------------------- */

const LICENCA_BASE = {
  streamerId: "local",
  chave: "KORA-1234-5678-90ab",
  plano: "Mensal",
  validaAte: "2026-10-09T00:00:00.000Z",
  verificadaEm: "2026-09-09T12:00:00.000Z",
  carenciaAte: null,
  motivo: null,
  versaoInstalada: "0.1.0",
  atualizadoEm: "2026-09-09T12:00:00.000Z",
};

const desenharLicenca = (props) => criar(PainelDeLicenca, { licenca: LICENCA_BASE, ...props });

test("os cinco estados do schema desenham rótulo e próximo passo", () => {
  const esperado = {
    ativa: ["panel.license.stateActive", "panel.license.adviceActive"],
    expirada: ["panel.license.stateExpired", "panel.license.adviceExpired"],
    cancelada: ["panel.license.stateCancelled", "panel.license.adviceCancelled"],
    sem_licenca: ["panel.license.stateNoLicense", "panel.license.adviceNoLicense"],
    indeterminada: ["panel.license.stateUnknown", "panel.license.adviceUnknown"],
  };

  for (const [estado, [rotulo, conselho]] of Object.entries(esperado)) {
    const tela = textoVisivel(desenharLicenca({ licenca: { ...LICENCA_BASE, estado } }));
    assert.ok(tela.includes(traduzir(rotulo)), `${estado} não mostra o próprio rótulo`);
    assert.ok(tela.includes(traduzir(conselho)), `${estado} não diz o que fazer`);
  }
});

test("chave recusada não recebe o discurso de instalação nova", () => {
  //[[ A ponte responde 200 com `sem_licenca` + `chave_invalida` quando a Kora
  // recusa a chave — é a resposta à pergunta que o painel fez, não um erro
  // HTTP (docs/07_APIS). Sem tratamento, o streamer colava a chave, errava um
  // caractere e a tela respondia "instalação nova começa assim, e isso não é
  // erro" — com a licença boa dele ainda gravada em disco. ]]
  const tela = textoVisivel(
    desenharLicenca({ licenca: { ...LICENCA_BASE, estado: "sem_licenca", motivo: "chave_invalida" } }),
  );

  assert.ok(tela.includes(traduzir("panel.license.adviceBadKey")), "falta dizer o que houve com a chave colada");
  assert.ok(
    !tela.includes(traduzir("panel.license.adviceNoLicense")),
    "o texto de instalação nova voltou por cima de uma chave recusada",
  );
  assert.ok(
    tela.includes(traduzir("panel.license.reasonBadKey")),
    "a linha do motivo é quem diz o que fazer com a chave errada",
  );
});

test("indeterminada não é vermelho, e não acusa o cliente", () => {
  //[[ A regra do enunciado do ADR-P02: `indeterminada` é o ÚNICO estado que não
  // é resposta da Kora. Vermelho ali diz "você está irregular" para alguém que
  // pagou e só ficou sem internet. ]]
  const html = renderizar(desenharLicenca({ licenca: { ...LICENCA_BASE, estado: "indeterminada" } }));

  assert.ok(!html.includes("pastilha-erro"), "o veredito de 'não deu para perguntar' saiu em vermelho");
  assert.ok(html.includes("pastilha-atencao"), "o estado tem que aparecer com cor E texto");

  // E o vermelho continua existindo para quem a Kora recusou.
  const recusada = renderizar(desenharLicenca({ licenca: { ...LICENCA_BASE, estado: "cancelada" } }));
  assert.ok(recusada.includes("pastilha-erro"), "cancelada é resposta da Kora, e essa é vermelha");
});

test("carência valendo aparece com a data; carência vencida não vira notícia velha", () => {
  const futuro = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const passado = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const comCarencia = textoVisivel(
    desenharLicenca({
      licenca: { ...LICENCA_BASE, estado: "indeterminada", carenciaAte: futuro, motivo: "kora_indisponivel" },
    }),
  );
  assert.ok(
    comCarencia.includes(traduzir("panel.license.graceUntil", { quando: dataHora(futuro) })),
    "sem a data da carência o streamer não sabe até quando pode dar live",
  );
  assert.ok(comCarencia.includes(traduzir("panel.license.reasonKoraDown")), "o motivo tem que estar traduzido");

  const vencida = textoVisivel(
    desenharLicenca({
      licenca: { ...LICENCA_BASE, estado: "indeterminada", carenciaAte: passado, motivo: "carencia_esgotada" },
    }),
  );
  assert.ok(
    vencida.includes(traduzir("panel.license.reasonGraceOver")),
    "carência esgotada precisa dizer que foi isso que aconteceu",
  );
  assert.ok(
    !vencida.includes(traduzir("panel.license.graceUntil", { quando: dataHora(passado) })),
    "'continua funcionando até' com data no passado é mentira na tela",
  );
});

test("os seis motivos da ponte têm texto, e nenhum deles vaza chave crua", () => {
  const codigos = [
    "sem_chave",
    "chave_invalida",
    "licenca_expirada",
    "licenca_cancelada",
    "kora_indisponivel",
    "carencia_esgotada",
  ];

  for (const idioma of ["pt", "es", "en"]) {
    definirIdioma(idioma);
    for (const motivo of codigos) {
      const tela = textoVisivel(desenharLicenca({ licenca: { ...LICENCA_BASE, estado: "expirada", motivo } }));
      assert.ok(
        !tela.includes("panel.license."),
        `${idioma}: a chave crua apareceu na tela com motivo ${motivo}`,
      );
      assert.ok(tela.length > 40, `${idioma}: a tela de licença saiu vazia com motivo ${motivo}`);
    }
  }
  definirIdioma("pt");
});

test("a chave nunca aparece inteira: o painel fica aberto durante a live", () => {
  const html = renderizar(desenharLicenca({ licenca: { ...LICENCA_BASE, estado: "ativa" } }));

  assert.ok(!html.includes(LICENCA_BASE.chave), "a chave inteira foi para a tela");
  assert.ok(html.includes("90ab"), "sem o fim da chave o streamer não reconhece qual está ativa");
});

test("desativar só existe quando há chave para esquecer", () => {
  const comChave = textoVisivel(desenharLicenca({ licenca: { ...LICENCA_BASE, estado: "ativa" } }));
  assert.ok(comChave.includes(traduzir("panel.license.deactivateButton")));

  const semChave = textoVisivel(
    desenharLicenca({ licenca: { ...LICENCA_BASE, estado: "sem_licenca", chave: null, motivo: "sem_chave" } }),
  );
  assert.ok(
    !semChave.includes(traduzir("panel.license.deactivateButton")),
    "instalação nova não pode oferecer desativar o que ela não tem",
  );
});

test("falha de leitura mostra o erro da ponte E o que fazer, com botão de tentar de novo", () => {
  const tela = textoVisivel(
    desenharLicenca({ licenca: null, erro: "A ponte não respondeu.", aoRecarregar: () => {} }),
  );

  assert.ok(tela.includes("A ponte não respondeu."), "a frase da ponte é o que diz o que falhou");
  assert.ok(tela.includes(traduzir("panel.license.adviceLoadFailed")), "erro sem próximo passo vira ticket");
  assert.ok(tela.includes(traduzir("common.action.retry")), "falta o botão de tentar de novo");
});

test("sem licença carregada, a tela diz que está carregando — e não inventa veredito", () => {
  const tela = textoVisivel(desenharLicenca({ licenca: null }));

  assert.ok(tela.includes(traduzir("common.state.loading")));
  for (const rotulo of ["stateActive", "stateExpired", "stateCancelled", "stateNoLicense"]) {
    assert.ok(!tela.includes(traduzir(`panel.license.${rotulo}`)), `chutou ${rotulo} sem dado`);
  }
});

test("estado fora do enum cai em 'não deu para confirmar', nunca em vermelho", () => {
  // Ponte mais nova que o painel, resposta truncada, campo ausente: a leitura
  // honesta é "não sei", e "não sei" não acusa ninguém.
  const html = renderizar(desenharLicenca({ licenca: { ...LICENCA_BASE, estado: "algo_novo" } }));

  assert.ok(html.includes(traduzir("panel.license.stateUnknown")));
  assert.ok(!html.includes("pastilha-erro"));
});
