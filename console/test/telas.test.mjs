/**
 * O que a tela DESENHA, e não o que o arquivo diz.
 *
 * Este arquivo existe por causa do BUG-008: 504 testes verdes, todos estáticos,
 * e o painel inteiro em português depois de trocar para espanhol. Nenhum deles
 * renderizava. Tela nova nasce com pelo menos um teste que monta o componente e
 * lê o texto que sai, e o console nasce com esta regra já valendo.
 *
 * O que se prova aqui, e é o que importa nas duas telas da onda:
 *
 * 1. A ficha do item 2 mostra as SETE coisas do ADR-P05, inclusive quando o
 *    dado não existe. Campo ausente é escrito, nunca escondido.
 * 2. A lista do item 1 diz quem é, se a licença está de pé e se a pessoa ainda
 *    usa o produto.
 * 3. A pastilha da fonte não mente: com a base falsa ligada, a tela diz isso.
 * 4. Lista vazia por busca e lista vazia por base vazia são frases diferentes.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { criar, renderizar, textoVisivel } from "./ferramentas/renderizar.mjs";

// Depois do `register` dos hooks, nunca antes. Ver ferramentas/renderizar.mjs.
const { CabecalhoDoConsole } = await import("../src/components/CabecalhoDoConsole.jsx");
const { FichaDoAssinante } = await import("../src/components/FichaDoAssinante.jsx");
const { ListaDeAssinantes } = await import("../src/components/ListaDeAssinantes.jsx");
const { NavegacaoDoConsole } = await import("../src/components/NavegacaoDoConsole.jsx");
const { PaginaDaOnda3 } = await import("../src/components/PaginaDaOnda3.jsx");

const FICHA_CHEIA = {
  streamerId: "livia-parkour",
  email: "livia.parkour@gmail.com",
  usuarioTiktok: "livia.parkour",
  nome: "Lívia Ramos",
  idioma: "es",
  criadoEm: "2026-08-01T10:00:00.000Z",
  licenca: "KORA-2B55-A0F1-3C77",
  licencaEstado: "ativa",
  plano: "mensal",
  validaAte: "2026-10-01T10:00:00.000Z",
  ultimaConexao: "2026-09-09T10:00:00.000Z",
  versaoInstalada: "0.9.0",
  modalidades: ["escalada"],
};

/** Quem comprou e não instalou: sem licença, sem telemetria, sem plano. */
const FICHA_VAZIA = {
  streamerId: "novo-ainda-sem-instalar",
  email: "contato@subindoaovivo.com.br",
  usuarioTiktok: "subindo.aovivo",
  nome: "Rafael Antunes",
  idioma: null,
  criadoEm: "2026-09-09T10:00:00.000Z",
  licenca: null,
  licencaEstado: null,
  plano: null,
  validaAte: null,
  ultimaConexao: null,
  versaoInstalada: null,
  modalidades: [],
};

/* ---------------------------------------------------------------- */
/* Item 2: a ficha                                                   */
/* ---------------------------------------------------------------- */

test("a ficha desenha as sete coisas do ADR-P05", () => {
  const texto = textoVisivel(
    criar(FichaDoAssinante, { ficha: FICHA_CHEIA, streamerId: FICHA_CHEIA.streamerId }),
  );

  assert.match(texto, /Ativa/, "1. estado da licença");
  assert.match(texto, /Plano mensal/, "2. plano");
  assert.match(texto, /Início/, "3. data de início");
  assert.match(texto, /Última conexão/, "4. última conexão");
  assert.match(texto, /escalada/, "5. modalidades usadas");
  assert.match(texto, /Espanhol/, "6. idioma do perfil");
  assert.match(texto, /0\.9\.0/, "7. versão instalada");
});

test("a ficha mostra o idioma do PERFIL sem o console mudar de idioma", () => {
  // O assinante é espanhol e a tela continua em português. É o ADR-P05 na
  // prática: idioma do perfil é DADO, não é a língua da superfície.
  const texto = textoVisivel(
    criar(FichaDoAssinante, { ficha: FICHA_CHEIA, streamerId: FICHA_CHEIA.streamerId }),
  );
  assert.match(texto, /Idioma do perfil Espanhol/);
  assert.match(texto, /Última conexão/);
  assert.equal(/Idioma del perfil|Profile language/.test(texto), false);
});

test("campo ausente é escrito, nunca escondido", () => {
  const texto = textoVisivel(
    criar(FichaDoAssinante, { ficha: FICHA_VAZIA, streamerId: FICHA_VAZIA.streamerId }),
  );

  assert.match(texto, /Sem licença/);
  assert.match(texto, /Sem plano/);
  assert.match(texto, /Nunca conectou/);
  assert.match(texto, /Nunca reportou versão/);
  assert.match(texto, /Nenhuma ainda/);
  // Os rótulos continuam todos lá: é o que mantém a ficha com a mesma altura e
  // o operador sabendo onde procurar.
  assert.match(texto, /Versão instalada/);
  assert.match(texto, /Modalidades usadas/);
});

test("assinante que não existe não vira tela de erro", () => {
  const texto = textoVisivel(
    criar(FichaDoAssinante, { ficha: null, streamerId: "nao-existe", carregando: false }),
  );
  assert.match(texto, /Não existe assinante/);
  assert.match(texto, /nao-existe/);
});

test("falha de rede na ficha diz o que fazer, e não 'Failed to fetch'", () => {
  const texto = textoVisivel(criar(FichaDoAssinante, { erro: "console_offline" }));
  assert.match(texto, /npm run console/);
  assert.equal(texto.includes("Failed to fetch"), false);
});

test("sem ninguém escolhido, a ficha explica o que vai aparecer ali", () => {
  const texto = textoVisivel(criar(FichaDoAssinante, { ficha: null, streamerId: null }));
  assert.match(texto, /Escolha um assinante/);
});

/* ---------------------------------------------------------------- */
/* Item 1: a lista                                                   */
/* ---------------------------------------------------------------- */

const LINHAS = [
  {
    streamerId: "livia-parkour",
    nome: "Lívia Ramos",
    email: "livia.parkour@gmail.com",
    usuarioTiktok: "livia.parkour",
    licencaEstado: "ativa",
    plano: "mensal",
    ultimaConexao: "2026-09-09T10:00:00.000Z",
  },
  {
    streamerId: "duda-sobe",
    nome: "Eduarda Prado",
    email: "duda.sobe@outlook.com",
    usuarioTiktok: "duda.sobe",
    licencaEstado: "cancelada",
    plano: "mensal",
    ultimaConexao: null,
  },
];

test("a lista mostra quem é, se a licença está de pé e se a pessoa ainda usa", () => {
  const texto = textoVisivel(criar(ListaDeAssinantes, { assinantes: LINHAS, busca: "" }));

  assert.match(texto, /Lívia Ramos/);
  assert.match(texto, /@livia\.parkour/);
  assert.match(texto, /livia\.parkour@gmail\.com/);
  assert.match(texto, /Ativa/);
  assert.match(texto, /Cancelada/);
  assert.match(texto, /Nunca conectou/);
  assert.match(texto, /2 assinantes/);
});

test("o campo de busca diz os três jeitos de procurar, sem pedir para escolher um", () => {
  const html = renderizar(criar(ListaDeAssinantes, { assinantes: LINHAS, busca: "" }));
  assert.match(html, /Usuário da TikTok, e-mail ou chave de licença/);
  // Nenhum seletor de "buscar por": obrigar a classificar antes de procurar é
  // uma escolha errada por vez que faz a busca não achar quem está lá.
  assert.equal(/<select/.test(html), false);
});

test("lista vazia por busca e lista vazia por base vazia são frases diferentes", () => {
  const porBusca = textoVisivel(criar(ListaDeAssinantes, { assinantes: [], busca: "zzz" }));
  const porBase = textoVisivel(criar(ListaDeAssinantes, { assinantes: [], busca: "" }));

  assert.match(porBusca, /Nenhum assinante casa com/);
  assert.match(porBusca, /zzz/);
  assert.match(porBase, /Nenhum assinante na base ainda/);
  assert.notEqual(porBusca, porBase);
});

test("a lista mantém as linhas na tela quando a base falha", () => {
  // Apagar a lista trocaria "a base caiu" por "não há assinante", que é a
  // confusão que o envelope do contrato existe para evitar.
  const texto = textoVisivel(
    criar(ListaDeAssinantes, { assinantes: LINHAS, busca: "", erro: "timeout" }),
  );
  assert.match(texto, /demorou demais/);
  assert.match(texto, /Lívia Ramos/);
});

/* ---------------------------------------------------------------- */
/* A fonte do dado, e a fronteira do v1                              */
/* ---------------------------------------------------------------- */

test("com a base falsa ligada, o cabeçalho diz isso na tela", () => {
  const texto = textoVisivel(criar(CabecalhoDoConsole, { fonte: "exemplo" }));
  assert.match(texto, /Dado de exemplo/);
});

test("o cabeçalho nunca chuta 'Base da Kora' quando não sabe", () => {
  const texto = textoVisivel(criar(CabecalhoDoConsole, { fonte: null }));
  assert.match(texto, /Verificando a fonte/);
  assert.equal(texto.includes("Base da Kora"), false);
});

test("a navegação mostra a fronteira inteira do v1, e marca o que falta", () => {
  const texto = textoVisivel(criar(NavegacaoDoConsole, { pagina: "assinantes" }));

  assert.match(texto, /Assinantes/);
  assert.match(texto, /Faturamento/);
  assert.match(texto, /Logs/);
  assert.match(texto, /Saúde de conexão/);
  assert.match(texto, /onda 3/);
});

test("a página reservada da onda 3 não finge ter carregado nada", () => {
  const texto = textoVisivel(criar(PaginaDaOnda3, { pagina: "saude" }));
  assert.match(texto, /Ainda não construída/);
  assert.match(texto, /risco nº 1/);
  // Nada de zero numa caixa de número: zero é um estado que o operador levaria
  // a sério, e "ninguém conectado agora" é um alarme de verdade.
  assert.equal(/\b0 conectados\b/.test(texto), false);
});
