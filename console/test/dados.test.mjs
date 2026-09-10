/**
 * A camada de dados: a regra de escolha, o contrato das duas implementações e
 * o envelope de erro.
 *
 * O que este arquivo defende é a lição do BUG-001: contrato existe para ser
 * testado dos DOIS lados. Uma implementação com uma função a mais que a outra
 * só se descobre no dia em que a tela chama a função que falta.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { FUNCOES, MOTIVOS } from "../src/dados/contrato.js";
import { criarDadosDeExemplo } from "../src/dados/exemplo.js";
import { criarDadosDoSupabase } from "../src/dados/supabase.js";
import { escolherDados } from "../src/dados/index.js";

const AGORA = new Date("2026-09-10T12:00:00.000Z");

/* ---------------------------------------------------------------- */
/* A regra de escolha                                                */
/* ---------------------------------------------------------------- */

test("sem SUPABASE_URL vale a falsa", () => {
  assert.equal(escolherDados({ SUPABASE_SERVICE_KEY: "chave" }).fonte, "exemplo");
});

test("sem chave de serviço vale a falsa", () => {
  assert.equal(escolherDados({ SUPABASE_URL: "https://x.supabase.co" }).fonte, "exemplo");
});

test("com variável vazia ou só espaço vale a falsa", () => {
  // Variável presente e vazia é o caso comum de um `.env` copiado do
  // `.env.example`. Ele não pode ligar a implementação real.
  const escolhida = escolherDados({ SUPABASE_URL: "  ", SUPABASE_SERVICE_KEY: "" });
  assert.equal(escolhida.fonte, "exemplo");
});

test("com as duas variáveis vale a real", () => {
  const escolhida = escolherDados({
    SUPABASE_URL: "https://x.supabase.co",
    SUPABASE_SERVICE_KEY: "chave-de-servico",
  });
  assert.equal(escolhida.fonte, "supabase");
});

test("não existe flag separada para ligar o mock", () => {
  // Flag separada é como se esquece o mock ligado em produção. A escolha é uma
  // consequência da configuração, e de mais nada.
  const comFlag = escolherDados({
    SUPABASE_URL: "https://x.supabase.co",
    SUPABASE_SERVICE_KEY: "chave",
    CONSOLE_MOCK: "1",
    USAR_EXEMPLO: "true",
  });
  assert.equal(comFlag.fonte, "supabase");
});

/* ---------------------------------------------------------------- */
/* As duas implementações têm a mesma cara                           */
/* ---------------------------------------------------------------- */

test("as duas implementações expõem exatamente as funções do contrato", () => {
  const falsa = criarDadosDeExemplo({ agora: AGORA });
  const real = criarDadosDoSupabase({ url: "https://x.supabase.co", chave: "k" });

  for (const nome of FUNCOES) {
    assert.equal(typeof falsa[nome], "function", `a falsa não tem ${nome}`);
    assert.equal(typeof real[nome], "function", `a real não tem ${nome}`);
  }
});

/* ---------------------------------------------------------------- */
/* A base falsa                                                      */
/* ---------------------------------------------------------------- */

test("a lista devolve o envelope do contrato", async () => {
  const dados = criarDadosDeExemplo({ agora: AGORA });
  const resposta = await dados.listarAssinantes({});

  assert.equal(resposta.ok, true);
  assert.ok(Array.isArray(resposta.assinantes));
  assert.ok(resposta.assinantes.length > 0);
  assert.equal("proximo" in resposta, true);
});

test("a lista vem em português de domínio, sem snake_case", async () => {
  const dados = criarDadosDeExemplo({ agora: AGORA });
  const { assinantes } = await dados.listarAssinantes({});
  const chaves = Object.keys(assinantes[0]);

  assert.ok(chaves.includes("streamerId"));
  assert.ok(chaves.includes("usuarioTiktok"));
  assert.equal(
    chaves.some((chave) => chave.includes("_")),
    false,
    "snake_case vazou para fora da camada de dados",
  );
});

test("o limite tem teto, e pedido absurdo não vira consulta absurda", async () => {
  const dados = criarDadosDeExemplo({ agora: AGORA });
  const resposta = await dados.listarAssinantes({ limite: 999_999 });
  assert.ok(resposta.assinantes.length <= 200);
});

test("a paginação por cursor não repete linha", async () => {
  const dados = criarDadosDeExemplo({ agora: AGORA });
  const primeira = await dados.listarAssinantes({ limite: 3 });
  assert.equal(primeira.assinantes.length, 3);
  assert.ok(primeira.proximo);

  const segunda = await dados.listarAssinantes({ limite: 3, cursor: primeira.proximo });
  const ids = new Set(primeira.assinantes.map((a) => a.streamerId));
  for (const assinante of segunda.assinantes) {
    assert.equal(ids.has(assinante.streamerId), false, `${assinante.streamerId} repetiu`);
  }
});

test("a ficha traz as sete coisas que o ADR-P05 pede", async () => {
  const dados = criarDadosDeExemplo({ agora: AGORA });
  const { ficha } = await dados.buscarFicha("matheus-bonato");

  assert.equal(ficha.licencaEstado, "ativa");
  assert.equal(ficha.plano, "anual");
  assert.ok(ficha.criadoEm);
  assert.ok(ficha.ultimaConexao);
  assert.deepEqual(ficha.modalidades, ["escalada"]);
  assert.equal(ficha.idioma, "pt");
  assert.equal(ficha.versaoInstalada, "0.9.0");
});

test("ficha de quem não existe é null, e não é falha", async () => {
  const dados = criarDadosDeExemplo({ agora: AGORA });
  const resposta = await dados.buscarFicha("nao-existe");

  // A tela precisa distinguir "esse assinante não existe" de "não deu para
  // perguntar". Um `ok: false` aqui apagaria a diferença.
  assert.equal(resposta.ok, true);
  assert.equal(resposta.ficha, null);
});

test("a base falsa não vaza o próprio estado pela ficha", async () => {
  const dados = criarDadosDeExemplo({ agora: AGORA });
  const primeira = await dados.buscarFicha("matheus-bonato");
  primeira.ficha.plano = "mexido por fora";

  const segunda = await dados.buscarFicha("matheus-bonato");
  assert.equal(segunda.ficha.plano, "anual");
});

test("trocar plano na base falsa registra no log administrativo", async () => {
  // Exigência do contrato, seção 4: a falsa registra do mesmo jeito que a real.
  // Sem isso o teste do item 5 passaria por acidente.
  const dados = criarDadosDeExemplo({ agora: AGORA });
  const antes = await dados.listarAcoesAdministrativas({});
  assert.equal(antes.acoes.length, 0);

  const troca = await dados.trocarPlano("livia-parkour", "anual", { motivo: "upgrade pedido por e-mail" });
  assert.equal(troca.ok, true);
  assert.equal(troca.ficha.plano, "anual");

  const depois = await dados.listarAcoesAdministrativas({});
  assert.equal(depois.acoes.length, 1);
  assert.equal(depois.acoes[0].acao, "plano_trocado");
  assert.equal(depois.acoes[0].streamerId, "livia-parkour");
  assert.deepEqual(depois.acoes[0].detalhe, {
    de: "mensal",
    para: "anual",
    motivo: "upgrade pedido por e-mail",
  });
});

test("trocar plano de quem não existe não registra nada", async () => {
  const dados = criarDadosDeExemplo({ agora: AGORA });
  const resposta = await dados.trocarPlano("nao-existe", "anual", {});

  assert.equal(resposta.ok, false);
  assert.equal(resposta.motivo, MOTIVOS.NAO_ENCONTRADO);
  const log = await dados.listarAcoesAdministrativas({});
  assert.equal(log.acoes.length, 0);
});

test("a ação do log é verbo em snake_case, nunca frase", async () => {
  const dados = criarDadosDeExemplo({ agora: AGORA });
  const recusada = await dados.registrarAcao({ acao: "Trocou o plano do cliente" });

  assert.equal(recusada.ok, false);
  assert.equal(recusada.motivo, MOTIVOS.PEDIDO_INVALIDO);
});

test("dinheiro sai em centavos inteiros, com a moeda ao lado", async () => {
  const dados = criarDadosDeExemplo({ agora: AGORA });
  const resposta = await dados.resumoDeFaturamento({ mes: "2026-09" });

  assert.equal(resposta.ok, true);
  assert.equal(Number.isInteger(resposta.mrrCentavos), true);
  assert.match(resposta.moeda, /^[A-Z]{3}$/);
  assert.equal(typeof resposta.vendas, "number");
  assert.equal(typeof resposta.cancelamentos, "number");
  assert.ok(Array.isArray(resposta.serie));
});

test("a saúde de conexão conta conectados e quedas de 24h", async () => {
  const dados = criarDadosDeExemplo({ agora: AGORA });
  const resposta = await dados.saudeDeConexao();

  assert.equal(resposta.ok, true);
  assert.equal(typeof resposta.conectadosAgora, "number");
  assert.equal(typeof resposta.quedas24h, "number");
  assert.ok(Array.isArray(resposta.serie));
});

test("os eventos da telemetria filtram por assinante", async () => {
  const dados = criarDadosDeExemplo({ agora: AGORA });
  const resposta = await dados.listarEventos({ streamerId: "livia-parkour" });

  assert.equal(resposta.ok, true);
  assert.ok(resposta.eventos.length > 0);
  for (const evento of resposta.eventos) assert.equal(evento.streamerId, "livia-parkour");
});
