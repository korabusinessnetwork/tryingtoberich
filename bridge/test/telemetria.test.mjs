/**
 * Telemetria: fire-and-forget de verdade, e a fronteira de privacidade.
 *
 * "Fire-and-forget" é fácil de escrever no comentário e fácil de quebrar no
 * código — basta alguém trocar um `registrar()` por um `await`. Estes testes
 * cobram as duas metades: que a falha NÃO propaga, e que nada de espectador sai
 * da máquina nem quando quem chama insiste em mandar.
 *
 * O cliente da Kora é falso em todos eles. Nenhuma linha aqui toca a rede.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { Telemetria } from "../src/repos/telemetria.mjs";
import { criarValidador } from "../src/repos/schemas.mjs";

const CONTEXTO = () => ({ streamerId: "local", versaoInstalada: "0.1.0", idioma: "pt", chave: "KORA-TESTE-0001" });

/** Uma Kora que aceita tudo e guarda o que recebeu. */
function koraQueAceita() {
  const recebidos = [];
  return {
    recebidos,
    cliente: {
      configurado: true,
      inserir: async (tabela, linhas) => {
        recebidos.push(...linhas);
        return { ok: true, linhas: [] };
      },
    },
  };
}

test("registrar é síncrono e não devolve promessa: nada para esperar", () => {
  const { cliente } = koraQueAceita();
  const telemetria = new Telemetria({ cliente, contexto: CONTEXTO });

  assert.equal(telemetria.registrar("conexao", { modalidade: "escalada" }), undefined);
  assert.equal(telemetria.pendentes, 1);
  telemetria.parar();
});

test("Kora recusando o lote não propaga, e o evento fica para a próxima", async () => {
  const cliente = { configurado: true, inserir: async () => ({ ok: false, motivo: "http", status: 503 }) };
  const telemetria = new Telemetria({ cliente, contexto: CONTEXTO });

  telemetria.registrar("queda", { modalidade: "escalada" });
  // Sem `assert.rejects`: o ponto é que NÃO há rejeição a capturar.
  const resultado = await telemetria.descarregar();

  assert.equal(resultado.enviados, 0);
  assert.equal(telemetria.pendentes, 1, "o ADR-P02 pede que a telemetria acumule para enviar depois");
  telemetria.parar();
});

test("cliente que EXPLODE também não derruba quem chamou", async () => {
  const cliente = {
    configurado: true,
    inserir: async () => {
      throw new Error("cabo na tomada");
    },
  };
  const telemetria = new Telemetria({ cliente, contexto: CONTEXTO });

  telemetria.registrar("conexao");
  const resultado = await telemetria.descarregar();

  assert.equal(resultado.enviados, 0);
  telemetria.parar();
});

test("contexto quebrado não impede registrar", () => {
  // `registrar()` é chamado no meio de iniciar sessão e de tratar queda da
  // live. Um erro escapando daqui derrubaria a operação de verdade.
  const { cliente } = koraQueAceita();
  const telemetria = new Telemetria({
    cliente,
    contexto: () => {
      throw new Error("contexto quebrado");
    },
  });

  assert.doesNotThrow(() => telemetria.registrar("conexao"));
  telemetria.parar();
});

test("sem chave de licença nada sai da máquina", async () => {
  const { cliente, recebidos } = koraQueAceita();
  const telemetria = new Telemetria({ cliente, contexto: () => ({ streamerId: "local", chave: null }) });

  telemetria.registrar("instalacao");
  const resultado = await telemetria.descarregar();

  assert.equal(resultado.enviados, 0);
  assert.equal(recebidos.length, 0, "instalação que a Kora não conhece não escreve na base da Kora");
  telemetria.parar();
});

test("sem SUPABASE_URL a fila nunca sai, e o produto roda igual", async () => {
  const telemetria = new Telemetria({ cliente: { configurado: false }, contexto: CONTEXTO });

  telemetria.registrar("conexao");
  telemetria.registrar("desconexao");
  const resultado = await telemetria.descarregar();

  assert.equal(resultado.enviados, 0);
  assert.equal(telemetria.pendentes, 2);
  telemetria.parar();
});

test("o que sai é snake_case e é exatamente o contrato — nada além", async () => {
  const { cliente, recebidos } = koraQueAceita();
  const telemetria = new Telemetria({ cliente, contexto: CONTEXTO });

  telemetria.registrar("conexao", { modalidade: "escalada" });
  await telemetria.descarregar();

  assert.equal(recebidos.length, 1);
  assert.deepEqual(Object.keys(recebidos[0]).sort(), [
    "em", "idioma", "modalidade", "motivo", "streamer_id", "tipo", "versao_instalada",
  ]);
  assert.equal(recebidos[0].tipo, "conexao");
  assert.equal(recebidos[0].streamer_id, "local");
  telemetria.parar();
});

/* ---------------------------------------------------------------- */
/* Privacidade — a razão de o schema ter additionalProperties: false */
/* ---------------------------------------------------------------- */

test("nickname e id de espectador não saem da máquina nem se alguém insistir", async () => {
  //[[ Duas defesas em série, e este teste passa pelas duas.
  //
  // `higienizar()` do log tira os campos que identificam alguém; o schema
  // recusa qualquer campo fora da lista curta. O que chega aqui como "dados
  // extras" é o bug que um dia alguém vai escrever — um `registrar("queda",
  // { nickname })` inocente — e o resultado tem que ser: não sai. ]]
  const { cliente, recebidos } = koraQueAceita();
  const telemetria = new Telemetria({ cliente, contexto: CONTEXTO });

  telemetria.registrar("queda", {
    modalidade: "escalada",
    nickname: "@fulano",
    userId: "7123456789",
    nomeDoador: "Fulano da Silva",
  });

  await telemetria.descarregar();

  assert.equal(recebidos.length, 1);
  const enviado = JSON.stringify(recebidos[0]);
  assert.ok(!enviado.includes("fulano"), "nenhum nickname atravessa");
  assert.ok(!enviado.includes("7123456789"), "nenhum id de espectador atravessa");
  assert.ok(!("nickname" in recebidos[0]));
  telemetria.parar();
});

test("evento fora do contrato é DESCARTADO, não corrigido", async () => {
  // Um `tipo` que não existe é bug de quem chamou. Descartar deixa a linha
  // vermelha no log; consertar na marra esconderia o bug para sempre.
  const { cliente, recebidos } = koraQueAceita();
  const telemetria = new Telemetria({ cliente, contexto: CONTEXTO });

  telemetria.registrar("tipo_que_nao_existe");
  const resultado = await telemetria.descarregar();

  assert.equal(resultado.enviados, 0);
  assert.equal(recebidos.length, 0);
  telemetria.parar();
});

test("o envelope não tem onde caber um espectador", async () => {
  // O schema é a fronteira, e é ele que este teste lê — não a implementação.
  const { validar } = await criarValidador();

  const valido = { streamerId: "local", tipo: "conexao", em: "2026-09-10T12:00:00.000Z" };
  assert.deepEqual(validar("telemetria", valido), []);

  for (const proibido of ["nickname", "userId", "espectadorId", "detalhe", "presentes"]) {
    assert.notDeepEqual(
      validar("telemetria", { ...valido, [proibido]: "x" }),
      [],
      `o schema aceitou "${proibido}", e não podia`,
    );
  }
});

/* ---------------------------------------------------------------- */
/* A fila                                                            */
/* ---------------------------------------------------------------- */

test("fila cheia descarta o mais VELHO: a pergunta do console é sobre agora", async () => {
  const { cliente, recebidos } = koraQueAceita();
  const telemetria = new Telemetria({ cliente, contexto: CONTEXTO, teto: 3 });

  for (const tipo of ["instalacao", "conexao", "queda", "desconexao"]) telemetria.registrar(tipo);

  assert.equal(telemetria.pendentes, 3);
  await telemetria.descarregar();
  assert.deepEqual(recebidos.map((linha) => linha.tipo), ["conexao", "queda", "desconexao"]);
  telemetria.parar();
});

test("descarregar duas vezes ao mesmo tempo não manda o evento em dobro", async () => {
  // Uma queda contada duas vezes é um alarme falso na saúde de conexão.
  const { cliente, recebidos } = koraQueAceita();
  const telemetria = new Telemetria({ cliente, contexto: CONTEXTO });

  telemetria.registrar("queda");
  await Promise.all([telemetria.descarregar(), telemetria.descarregar()]);

  assert.equal(recebidos.length, 1);
  telemetria.parar();
});
