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
const { NavegacaoDoConsole, PAGINAS } = await import("../src/components/NavegacaoDoConsole.jsx");
const { PaginaDeFaturamento } = await import("../src/components/PaginaDeFaturamento.jsx");
const { PaginaDeLogs } = await import("../src/components/PaginaDeLogs.jsx");
const { PaginaDeSaude } = await import("../src/components/PaginaDeSaude.jsx");
const { TrocaDePlano } = await import("../src/components/TrocaDePlano.jsx");

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

test("a navegação mostra a fronteira inteira do v1, e nada além dela", () => {
  const texto = textoVisivel(criar(NavegacaoDoConsole, { pagina: "assinantes" }));

  assert.match(texto, /Assinantes/);
  assert.match(texto, /Faturamento/);
  assert.match(texto, /Logs/);
  assert.match(texto, /Saúde de conexão/);

  // A fronteira congelada do ADR-P05, contada: quatro abas para seis itens, e
  // nenhuma quinta. Os itens 2 e 3 não têm aba porque a ficha abre pela lista e
  // a troca de plano acontece dentro dela.
  assert.equal(PAGINAS.length, 4);
  for (const entrada of PAGINAS) {
    assert.ok([1, 4, 5, 6].includes(entrada.item), `aba sem item do ADR-P05: ${entrada.id}`);
  }

  // Depois da onda 3 não sobra tela por construir, e a marca some junto: aba
  // dizendo "onda 3" com a tela pronta seria a tela mentindo sobre si mesma.
  assert.equal(/onda 3/.test(texto), false);
});

/* ---------------------------------------------------------------- */
/* Item 5: os dois logs                                              */
/* ---------------------------------------------------------------- */

const ACOES = [
  {
    id: 2,
    operador: "dono",
    acao: "plano_trocado",
    streamerId: "livia-parkour",
    detalhe: { de: "mensal", para: "anual", motivo: "upgrade pedido por e-mail" },
    em: "2026-09-10T11:00:00.000Z",
  },
  {
    id: 1,
    operador: "dono",
    acao: "plano_trocado_na_lemon",
    streamerId: "livia-parkour",
    detalhe: { de: "mensal", para: "anual", lemonCustomerId: "cus_exemplo_002", adaptador: "exemplo" },
    em: "2026-09-10T10:59:00.000Z",
  },
];

const EVENTOS = [
  {
    id: 9,
    streamerId: "livia-parkour",
    tipo: "queda",
    em: "2026-09-10T08:00:00.000Z",
    versaoInstalada: null,
    idioma: null,
    modalidade: null,
    motivo: "sala_encerrada",
  },
  {
    id: 8,
    streamerId: "matheus-bonato",
    tipo: "conexao",
    em: "2026-09-10T06:00:00.000Z",
    versaoInstalada: "0.9.0",
    idioma: "pt",
    modalidade: "escalada",
    motivo: null,
  },
];

test("a tela de logs mostra os dois logs, e diz qual é o imutável", () => {
  const texto = textoVisivel(criar(PaginaDeLogs, { acoes: ACOES, eventos: EVENTOS }));

  assert.match(texto, /Ações administrativas/);
  assert.match(texto, /Eventos de telemetria/);
  assert.match(texto, /Imutável no banco/);
  assert.match(texto, /plano_trocado/);
  assert.match(texto, /upgrade pedido por e-mail/);
  // `queda` e `desconexao` são opostos e não podem sair crus: um é a live
  // acabando, o outro é a live sendo perdida.
  assert.match(texto, /Caiu/);
  assert.match(texto, /Conectou/);
});

test("a tela de logs não oferece nenhum jeito de mexer no log administrativo", () => {
  // O banco recusaria de qualquer jeito. A tela não oferece porque oferecer e
  // receber erro ensinaria o operador que o log "às vezes deixa".
  const html = renderizar(criar(PaginaDeLogs, { acoes: ACOES, eventos: EVENTOS }));

  assert.equal(/<button/.test(html), false, "há botão na tela de logs");
  assert.equal(/<input/.test(html), false, "há campo editável na tela de logs");
  assert.equal(/Editar|Apagar|Excluir|Remover/.test(html), false);
});

test("log vazio por não haver ação e log vazio por falha são frases diferentes", () => {
  const semNada = textoVisivel(criar(PaginaDeLogs, { acoes: [], eventos: [] }));
  const comFalha = textoVisivel(criar(PaginaDeLogs, { acoes: [], eventos: [], erroDeAcoes: "timeout" }));

  assert.match(semNada, /Nenhuma ação administrativa registrada/);
  assert.match(comFalha, /demorou demais/);
  assert.notEqual(semNada, comFalha);
});

test("o log de evento mostra o identificador, nunca o @ nem o nome", () => {
  // Log de evento guarda tipo e valor, não a pessoa (CLAUDE.md, Segurança).
  const texto = textoVisivel(criar(PaginaDeLogs, { acoes: [], eventos: EVENTOS }));
  assert.match(texto, /livia-parkour/);
  assert.equal(texto.includes("@livia.parkour"), false);
  assert.equal(texto.includes("Lívia Ramos"), false);
});

/* ---------------------------------------------------------------- */
/* Item 6: saúde de conexão, que é alarme                            */
/* ---------------------------------------------------------------- */

test("a saúde de conexão dá o veredito ANTES dos números", () => {
  const texto = textoVisivel(
    criar(PaginaDeSaude, {
      saude: { conectadosAgora: 2, quedas24h: 1, serie: [{ hora: "2026-09-10T08:00", quedas: 1 }] },
    }),
  );

  assert.match(texto, /Conectados agora/);
  assert.match(texto, /Quedas em 24h/);
  // A frase do alarme vem antes do primeiro rótulo de número: painel que
  // entrega dois números e deixa a conclusão por conta de quem olha só funciona
  // nos dias em que alguém olha com atenção.
  assert.ok(texto.indexOf("queda nas últimas 24 horas") < texto.indexOf("Conectados agora"));
});

test("quedas juntas numa hora só viram alarme na tela, com todas as letras", () => {
  const texto = textoVisivel(
    criar(PaginaDeSaude, {
      saude: {
        conectadosAgora: 4,
        quedas24h: 6,
        serie: [
          { hora: "2026-09-10T14:00", quedas: 5 },
          { hora: "2026-09-10T20:00", quedas: 1 },
        ],
      },
    }),
  );

  assert.match(texto, /5 quedas concentradas numa hora só/);
  assert.match(texto, /é a plataforma/);
});

test("sem queda nenhuma, a saúde não desenha gráfico de altura zero", () => {
  const texto = textoVisivel(
    criar(PaginaDeSaude, { saude: { conectadosAgora: 3, quedas24h: 0, serie: [] } }),
  );

  assert.match(texto, /Nenhuma queda nas últimas 24 horas/);
  assert.match(texto, /indistinguível de gráfico que não carregou/);
});

test("saúde que não respondeu diz que o alarme está mudo", () => {
  const texto = textoVisivel(criar(PaginaDeSaude, { erro: "timeout" }));
  assert.match(texto, /alarme mudo parece calmaria/);
});

/* ---------------------------------------------------------------- */
/* Item 4: faturamento, e o número dizendo o que é                   */
/* ---------------------------------------------------------------- */

const RESUMO = {
  mes: "2026-09",
  mrrCentavos: 21_800,
  moeda: "USD",
  vendas: 2,
  cancelamentos: 1,
  serie: [
    { dia: "2026-09-02", valorCentavos: 19_900, vendas: 1, cancelamentos: 0 },
    { dia: "2026-09-06", valorCentavos: 1_900, vendas: 1, cancelamentos: 1 },
  ],
};

test("o faturamento mostra os três números do item 4", () => {
  const texto = textoVisivel(criar(PaginaDeFaturamento, { resumo: RESUMO, mes: "2026-09" }));

  assert.match(texto, /Vendas do mês/);
  assert.match(texto, /Cancelamentos/);
  // US$ 218,00 a partir de 21 800 centavos: a divisão por 100 acontece só na
  // hora de virar texto, e o valor nunca passa por ponto flutuante antes.
  assert.match(texto, /218,00/);
});

test("a tela diz, ela mesma, que o número é receita cobrada e não run-rate", () => {
  // A decisão do MRR está resolvida e escrita NA TELA: número de dinheiro sem
  // definição vira briga com o painel da Lemon Squeezy daqui a três meses.
  const texto = textoVisivel(criar(PaginaDeFaturamento, { resumo: RESUMO, mes: "2026-09" }));

  assert.match(texto, /receita cobrada, não run-rate/);
  assert.match(texto, /plano anual entra inteiro no mês/);
  assert.match(texto, /projeção da carteira não está aqui/);
  // E o rótulo do valor não chama isto de MRR, que seria a mentira de três
  // letras que ninguém desfaz depois.
  assert.equal(/\bMRR\b/.test(texto), false);
});

test("mês sem cobrança nenhuma não vira gráfico vazio", () => {
  const texto = textoVisivel(
    criar(PaginaDeFaturamento, {
      resumo: { mes: "2026-01", mrrCentavos: 0, moeda: "USD", vendas: 0, cancelamentos: 0, serie: [] },
      mes: "2026-01",
    }),
  );
  assert.match(texto, /Nenhum evento de cobrança neste mês/);
});

/* ---------------------------------------------------------------- */
/* Item 3: a troca de plano                                          */
/* ---------------------------------------------------------------- */

test("a troca de plano exige motivo, e diz por quê", () => {
  const html = renderizar(criar(TrocaDePlano, { ficha: FICHA_CHEIA }));
  const texto = textoVisivel(criar(TrocaDePlano, { ficha: FICHA_CHEIA }));

  assert.match(texto, /Motivo \(obrigatório\)/);
  // O botão nasce desligado porque o plano vem igual ao atual, e o motivo de
  // estar desligado é escrito: botão cinza sem explicação parece tela quebrada.
  assert.match(html, /disabled/);
  assert.match(texto, /Esse já é o plano atual/);
});

test("a troca de plano diz que grava no log imutável antes de o operador clicar", () => {
  const texto = textoVisivel(criar(TrocaDePlano, { ficha: FICHA_CHEIA }));
  assert.match(texto, /registra no log administrativo, que é imutável/);
});

test("troca em conta sem cliente na Lemon Squeezy não é dita como cobrança feita", () => {
  const texto = textoVisivel(
    criar(TrocaDePlano, {
      ficha: FICHA_CHEIA,
      resultado: {
        ficha: { ...FICHA_CHEIA, plano: "cortesia" },
        cobranca: { escrita: false, motivo: "sem_cliente_na_lemon", adaptador: "exemplo" },
      },
    }),
  );

  assert.match(texto, /Plano agora é cortesia/);
  assert.match(texto, /a troca valeu só na base da Kora/);
});

test("a ficha desenha a troca de plano no rodapé", () => {
  const texto = textoVisivel(
    criar(FichaDoAssinante, { ficha: FICHA_CHEIA, streamerId: FICHA_CHEIA.streamerId }),
  );
  assert.match(texto, /Trocar plano/);
  // E ela vem DEPOIS dos campos: a única ação de escrita do console não pode
  // ser a primeira coisa que a mão encontra.
  assert.ok(texto.indexOf("Versão instalada") < texto.indexOf("Trocar plano"));
});
