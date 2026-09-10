/**
 * A implementação real, sem base de verdade em pé.
 *
 * O que dá para provar aqui é o que o console FAZ com a resposta: a URL que ele
 * monta, o cabeçalho que ele manda, e o que ele devolve quando o outro lado não
 * responde. O que não dá é provar que o Postgres executa a consulta, e isso
 * está dito no relatório da onda em vez de escondido num teste que finge.
 *
 * A regra defendida aqui é a do contrato: **erro nunca vira exceção solta.**
 * Uma exceção subindo pela tela do operador trocaria "não deu para perguntar"
 * por uma tela branca, e é justamente a diferença entre os dois que ele precisa
 * ver para saber se liga para o cliente ou espera a base voltar.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { MOTIVOS } from "../src/dados/contrato.js";
import { criarDadosDoSupabase, janelaDoMes } from "../src/dados/supabase.js";

const montar = (buscar) =>
  criarDadosDoSupabase({ url: "https://x.supabase.co", chave: "chave", buscar });

test("cabo na tomada vira motivo de rede, não exceção", async () => {
  const dados = montar(async () => {
    throw new Error("getaddrinfo ENOTFOUND");
  });
  const resposta = await dados.listarAssinantes({});

  assert.equal(resposta.ok, false);
  assert.equal(resposta.motivo, MOTIVOS.REDE);
});

test("estouro de tempo vira motivo de timeout", async () => {
  const dados = montar(async () => {
    const erro = new Error("tempo esgotado");
    erro.name = "TimeoutError";
    throw erro;
  });
  const resposta = await dados.buscarFicha("qualquer");

  assert.equal(resposta.ok, false);
  assert.equal(resposta.motivo, MOTIVOS.TIMEOUT);
});

test("recusa do PostgREST vira motivo http, com o status, e o corpo não vaza para a tela", async () => {
  const dados = montar(async () => ({
    ok: false,
    status: 401,
    text: async () => 'permission denied for view ficha_do_assinante',
  }));
  const resposta = await dados.listarAssinantes({});

  assert.equal(resposta.ok, false);
  assert.equal(resposta.motivo, MOTIVOS.HTTP);
  assert.equal(resposta.status, 401);
  // O corpo cita a visão e a policy. Ele fica no `detalhe`, para o log do
  // console, e a tela mostra a frase do `mensagemDeFalha`, nunca isto.
  assert.match(resposta.detalhe, /permission denied/);
});

test("corpo que não é JSON vira motivo próprio", async () => {
  const dados = montar(async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error("Unexpected token <");
    },
  }));
  const resposta = await dados.saudeDeConexao();

  assert.equal(resposta.ok, false);
  assert.equal(resposta.motivo, MOTIVOS.CORPO_ILEGIVEL);
});

test("sem url nem chave a real recusa antes de tocar a rede", async () => {
  let bateu = false;
  const dados = criarDadosDoSupabase({
    url: "",
    chave: "",
    buscar: async () => {
      bateu = true;
      return { ok: true, status: 200, json: async () => [] };
    },
  });

  const resposta = await dados.listarAssinantes({});
  assert.equal(resposta.ok, false);
  assert.equal(resposta.motivo, MOTIVOS.SEM_CONFIGURACAO);
  assert.equal(bateu, false);
});

test("a ficha traduz snake_case do banco para o domínio", async () => {
  const dados = montar(async () => ({
    ok: true,
    status: 200,
    json: async () => [
      {
        streamer_id: "livia-parkour",
        email: "livia@exemplo.com",
        usuario_tiktok: "livia.parkour",
        nome: "Lívia",
        idioma: "pt",
        criado_em: "2026-08-01T00:00:00Z",
        licenca: "KORA-2B55",
        licenca_estado: "ativa",
        plano: "mensal",
        valida_ate: "2026-10-01T00:00:00Z",
        ultima_conexao: "2026-09-10T09:00:00Z",
        versao_instalada: "0.9.0",
        modalidades: ["escalada"],
      },
    ],
  }));

  const { ficha } = await dados.buscarFicha("livia-parkour");

  assert.equal(ficha.streamerId, "livia-parkour");
  assert.equal(ficha.usuarioTiktok, "livia.parkour");
  assert.equal(ficha.licencaEstado, "ativa");
  assert.equal(ficha.versaoInstalada, "0.9.0");
  assert.deepEqual(ficha.modalidades, ["escalada"]);
  assert.equal(
    Object.keys(ficha).some((chave) => chave.includes("_")),
    false,
  );
});

test("modalidades nulas viram lista vazia, e não a ausência do campo", async () => {
  // `array_agg` devolve null quando não agregou nada. A tela quer poder dizer
  // "nenhuma modalidade", que é uma lista de zero.
  const dados = montar(async () => ({
    ok: true,
    status: 200,
    json: async () => [{ streamer_id: "kora-demo", modalidades: null }],
  }));

  const { ficha } = await dados.buscarFicha("kora-demo");
  assert.deepEqual(ficha.modalidades, []);
});

test("linha nenhuma na visão é ficha nula, e não falha", async () => {
  const dados = montar(async () => ({ ok: true, status: 200, json: async () => [] }));
  const resposta = await dados.buscarFicha("nao-existe");

  assert.equal(resposta.ok, true);
  assert.equal(resposta.ficha, null);
});

test("trocar plano só registra no log DEPOIS de o banco aceitar a escrita", async () => {
  const chamadas = [];
  const dados = criarDadosDoSupabase({
    url: "https://x.supabase.co",
    chave: "chave",
    buscar: async (url, opcoes) => {
      chamadas.push({ url, metodo: opcoes.method ?? "GET" });
      if (url.includes("licencas")) return { ok: false, status: 403, text: async () => "negado" };
      return {
        ok: true,
        status: 200,
        json: async () => [{ streamer_id: "livia-parkour", plano: "mensal" }],
      };
    },
  });

  const resposta = await dados.trocarPlano("livia-parkour", "anual", {});

  assert.equal(resposta.ok, false);
  // Registrar antes diria que houve troca quando o banco recusou, e é
  // justamente este log que responde "quem mexeu nessa conta".
  assert.equal(chamadas.some((c) => c.url.includes("log_administrativo")), false);
});

test("a janela do mês vira o ano certo em dezembro", () => {
  assert.deepEqual(janelaDoMes("2026-12"), {
    inicio: "2026-12-01T00:00:00.000Z",
    fim: "2027-01-01T00:00:00.000Z",
  });
  assert.deepEqual(janelaDoMes("2026-09"), {
    inicio: "2026-09-01T00:00:00.000Z",
    fim: "2026-10-01T00:00:00.000Z",
  });
});
