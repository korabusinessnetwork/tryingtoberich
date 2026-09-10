/**
 * O log administrativo é imutável, e o console **não tenta** editá-lo.
 *
 * A imutabilidade em si é do banco: `002-console.sql` põe um trigger de linha
 * que recusa `update` e `delete`, e um de comando que recusa `truncate`, e os
 * três valem inclusive para a chave de serviço, que é a deste console. Ou seja,
 * valem exatamente para quem teria motivo para sumir com a própria linha.
 *
 * **Este arquivo prova a outra metade, e ela é a metade que mora aqui:** que
 * nenhum caminho do console tenta. A diferença importa por dois motivos.
 * Primeiro, um console que tenta e recebe erro ensina o operador que o log
 * "às vezes deixa", e no dia em que alguém rodar o SQL num projeto sem os
 * triggers a tentativa passa. Segundo, o teste do item 5 precisa doer: sem ele,
 * a única prova de que o log é append-only seria um comentário.
 *
 * Duas provas, e as duas fazem falta:
 *
 * 1. **De execução.** Todas as funções do contrato rodam contra um cliente
 *    espião, e nenhuma chamada a `log_administrativo` sai com método de
 *    escrita destrutiva. Prova o que o código FAZ.
 * 2. **Estática.** Nenhum arquivo do console escreve `PATCH`, `DELETE` ou
 *    `truncate` perto do log, e a superfície de rede do navegador não tem
 *    função para isso. Prova o que o código não tem como fazer.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FUNCOES } from "../src/dados/contrato.js";
import { criarDadosDoSupabase } from "../src/dados/supabase.js";
import { criarDadosDeExemplo } from "../src/dados/exemplo.js";
import { escolherFaturamento } from "../src/faturamento/index.js";
import { trocarPlanoDoAssinante } from "../src/faturamento/troca.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CONSOLE = path.resolve(AQUI, "..");

/** Métodos que alteram ou apagam. Um log append-only não conhece nenhum deles. */
const DESTRUTIVOS = new Set(["PATCH", "PUT", "DELETE"]);

/**
 * Um cliente do PostgREST de mentira, que anota tudo e nunca sai da máquina.
 *
 * `linhas` decide o que cada caminho devolve. Sem isso, uma busca que não acha
 * ninguém interrompe a operação no meio e as chamadas seguintes, que são
 * justamente as que se quer inspecionar, nunca chegam a acontecer, e o teste
 * passaria vazio.
 */
function clienteEspiao(linhas = () => []) {
  const chamadas = [];
  return {
    chamadas,
    noLog() {
      return chamadas.filter((c) => c.caminho.startsWith("log_administrativo"));
    },
    async chamar(caminho, opcoes = {}) {
      chamadas.push({ caminho, metodo: (opcoes.method ?? "GET").toUpperCase() });
      return { ok: true, linhas: linhas(caminho) };
    },
  };
}

/** Uma base que responde o suficiente para a troca de plano correr até o fim. */
const baseCompleta = (caminho) => {
  if (caminho.startsWith("ficha_do_assinante")) {
    return [{ streamer_id: "livia-parkour", plano: "mensal", licenca_estado: "ativa" }];
  }
  if (caminho.startsWith("assinantes")) return [{ lemon_customer_id: "cus_exemplo_002" }];
  if (caminho.startsWith("log_administrativo")) {
    return [{ id: 1, operador: "dono", acao: "plano_trocado", em: "2026-09-10T12:00:00.000Z" }];
  }
  return [];
};

/* ---------------------------------------------------------------- */
/* 1. Prova de execução                                              */
/* ---------------------------------------------------------------- */

test("nenhuma função da camada de dados escreve por cima do log administrativo", async () => {
  const espiao = clienteEspiao(baseCompleta);
  const dados = criarDadosDoSupabase({ cliente: espiao });

  // Todas as funções do contrato, sem exceção: a lista vem do contrato para o
  // dia em que uma função nova entrar e este teste passar a cobri-la sozinho.
  await dados.listarAssinantes({});
  await dados.buscarFicha("livia-parkour");
  await dados.buscarCobranca("livia-parkour");
  await dados.trocarPlano("livia-parkour", "anual", { motivo: "teste" });
  await dados.resumoDeFaturamento({ mes: "2026-09" });
  await dados.listarEventos({});
  await dados.listarAcoesAdministrativas({});
  await dados.saudeDeConexao();
  await dados.registrarAcao({ acao: "licenca_reemitida", streamerId: "livia-parkour" });

  assert.equal(FUNCOES.length, 9, "o contrato mudou: acrescente a função nova ao roteiro acima");

  const noLog = espiao.noLog();
  assert.ok(noLog.length > 0, "nenhuma chamada tocou o log, o teste estaria passando à toa");

  for (const chamada of noLog) {
    assert.equal(
      DESTRUTIVOS.has(chamada.metodo),
      false,
      `o console mandou ${chamada.metodo} em ${chamada.caminho}, e o log é append-only`,
    );
    assert.ok(
      chamada.metodo === "GET" || chamada.metodo === "POST",
      `só GET e POST cabem num log append-only, e veio ${chamada.metodo}`,
    );
  }
});

test("a troca de plano inteira, com os dois sistemas, só acrescenta linha no log", async () => {
  const espiao = clienteEspiao(baseCompleta);
  const dados = criarDadosDoSupabase({ cliente: espiao });
  // Sem `LEMON_API_KEY`, o adaptador falso. E ele grava no log igual ao real,
  // que é a exigência da seção 4 do contrato da onda 2.
  const faturamento = escolherFaturamento({}, { registrarAcao: dados.registrarAcao });

  const resposta = await trocarPlanoDoAssinante({
    dados,
    faturamento,
    streamerId: "livia-parkour",
    plano: "anual",
    motivo: "upgrade pedido por e-mail",
  });
  assert.equal(resposta.ok, true);

  const noLog = espiao.noLog();
  // Duas linhas, dois sistemas: a da Lemon Squeezy e a da base da Kora. Uma só
  // esconderia a metade que ficou, se o processo morrer entre as duas.
  assert.equal(noLog.length, 2, "a troca deveria escrever duas linhas no log");
  for (const chamada of noLog) assert.equal(chamada.metodo, "POST");
});

test("a base falsa também não oferece jeito de apagar ou editar ação", async () => {
  // A falsa é a que está ligada hoje. Se ela tivesse um `apagarAcao`, alguém
  // acabaria chamando, e a real quebraria só em produção.
  const dados = criarDadosDeExemplo({ agora: new Date("2026-09-10T12:00:00.000Z") });

  for (const nome of ["apagarAcao", "editarAcao", "removerAcao", "limparLog"]) {
    assert.equal(typeof dados[nome], "undefined", `a base falsa tem ${nome}`);
  }
  for (const nome of FUNCOES) {
    assert.equal(/apagar|editar|remover|limpar/.test(nome), false, `${nome} soa destrutivo`);
  }
});

/* ---------------------------------------------------------------- */
/* 2. Prova estática                                                 */
/* ---------------------------------------------------------------- */

async function arquivosDe(pasta, extensoes) {
  const achados = [];
  for (const entrada of await readdir(pasta, { withFileTypes: true, recursive: true })) {
    if (!entrada.isFile()) continue;
    if (!extensoes.some((extensao) => entrada.name.endsWith(extensao))) continue;
    achados.push(path.join(entrada.parentPath ?? entrada.path, entrada.name));
  }
  return achados;
}

/** Mesma limpeza dos invariantes: o que interessa é a linha executada. */
function semComentarios(fonte) {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((linha) => {
      const limpa = linha.trim();
      return !limpa.startsWith("//") && !limpa.startsWith("*");
    })
    .join("\n");
}

/**
 * Quantos caracteres depois do nome da tabela ainda pertencem àquela chamada.
 *
 * A janela é estreita de propósito. Procurar `PATCH` no arquivo inteiro acusaria
 * `dados/supabase.js`, que escreve PATCH em `licencas` — uma tabela que PODE ser
 * alterada, e é justamente o que a troca de plano faz. O que precisa ser
 * verdade é mais específico: nenhuma chamada QUE MENCIONA o log leva método
 * destrutivo junto.
 */
const JANELA = 300;

test("nenhuma chamada que cita o log administrativo leva método destrutivo", async () => {
  const arquivos = [
    ...(await arquivosDe(path.join(CONSOLE, "src"), [".js", ".jsx"])),
    ...(await arquivosDe(path.join(CONSOLE, "servidor"), [".js"])),
  ];

  let inspecionadas = 0;

  for (const arquivo of arquivos) {
    const fonte = semComentarios(await readFile(arquivo, "utf8"));
    const nome = path.relative(CONSOLE, arquivo);

    // A palavra `truncate` é proibida só onde poderia virar consulta. Nos
    // componentes ela aparece em texto de tela, e ali ela é a EXPLICAÇÃO da
    // regra: a tela de logs diz ao operador que o banco recusa truncate. Um
    // teste que proibisse a palavra em todo lugar mandaria apagar justamente a
    // frase que ensina a regra, para ficar verde.
    if (!arquivo.endsWith(".jsx")) {
      assert.equal(/\btruncate\b/i.test(fonte), false, `${nome} cita truncate`);
    }

    let posicao = fonte.indexOf("log_administrativo");
    while (posicao !== -1) {
      inspecionadas += 1;
      const trecho = fonte.slice(posicao, posicao + JANELA);
      for (const metodo of ["PATCH", "PUT", "DELETE"]) {
        assert.equal(
          trecho.includes(metodo),
          false,
          `${nome} manda ${metodo} numa chamada ao log administrativo`,
        );
      }
      posicao = fonte.indexOf("log_administrativo", posicao + 1);
    }
  }

  assert.ok(inspecionadas > 0, "nenhuma chamada ao log foi encontrada, o teste passaria à toa");
});

test("a superfície de rede do navegador não tem função que altere ação", async () => {
  const fonte = semComentarios(await readFile(path.join(CONSOLE, "src", "lib", "api.js"), "utf8"));

  // `registrarAcao` acrescenta e é a única escrita que o log aceita. Qualquer
  // verbo de alteração aqui seria a porta pela qual a tentativa entraria.
  assert.match(fonte, /registrarAcao/);
  for (const proibido of ["apagarAcao", "editarAcao", "removerAcao", "limparLog"]) {
    assert.equal(fonte.includes(proibido), false, `api.js expõe ${proibido}`);
  }
  assert.equal(/method:\s*"(PATCH|PUT|DELETE)"/.test(fonte), false);
});

test("nenhuma rota do console aceita PATCH, PUT ou DELETE", async () => {
  const fonte = semComentarios(await readFile(path.join(CONSOLE, "servidor", "rotas.js"), "utf8"));

  // O roteador compara `req.method` com uma lista fechada. Enquanto essa lista
  // for só GET e POST, não existe caminho HTTP para apagar nada, nem no log nem
  // em lugar nenhum do console.
  for (const metodo of ["PATCH", "PUT", "DELETE"]) {
    assert.equal(
      fonte.includes(`req.method === "${metodo}"`),
      false,
      `rotas.js aceita ${metodo}`,
    );
  }
});
