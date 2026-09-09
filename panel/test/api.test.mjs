/**
 * A camada de serviços — a única porta de rede do painel.
 *
 * `panel/src/lib/api.js` existe porque nenhum componente pode chamar `fetch`
 * direto (CLAUDE.md, docs/06_COMPONENTES). Estes testes substituem
 * `globalThis.fetch` por uma função de mentira e restauram a original depois
 * de cada teste — a mesma técnica que o comentário do próprio arquivo descreve.
 *
 * O que importa aqui não é o formato da chamada, é o que o painel MOSTRA ao
 * streamer quando a rede falha: essa mensagem é a única explicação que ele tem.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { api, ErroDaPonte } from "../src/lib/api.js";

/** Guardada antes de qualquer teste rodar, para restaurar mesmo se um teste falhar no meio. */
const FETCH_ORIGINAL = globalThis.fetch;

/** Resposta de mentira no formato que a Fetch API devolve. */
function respostaFalsa(status, corpo) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      // undefined simula corpo vazio/não-JSON: .json() rejeitaria de verdade.
      if (corpo === undefined) throw new SyntaxError("Unexpected end of JSON input");
      return corpo;
    },
  };
}

/**
 * Instala um fetch de mentira que grava toda chamada, roda `corpo`, e SEMPRE
 * restaura o fetch original — mesmo se `corpo` lançar. Sem isso um teste que
 * falha no meio vazaria o mock para os testes seguintes deste arquivo.
 */
async function comFetch(implementacao, corpo) {
  const chamadas = [];
  globalThis.fetch = async (url, opcoes) => {
    chamadas.push({ url, opcoes: opcoes ?? {} });
    return implementacao(url, opcoes, chamadas.length);
  };
  try {
    return await corpo(chamadas);
  } finally {
    globalThis.fetch = FETCH_ORIGINAL;
  }
}

/* ------------------------------------------------------------------ */
/* O contrato de erro de docs/07_APIS                                  */
/* ------------------------------------------------------------------ */

test("o contrato de erro { erro, mensagem } vira ErroDaPonte com código, mensagem e status preservados", async () => {
  await comFetch(
    () => respostaFalsa(400, { erro: "preset_invalido", mensagem: "Presente repetido no slot 4." }),
    async () => {
      await assert.rejects(
        () => api.modalidades(),
        (erro) => {
          assert.ok(erro instanceof ErroDaPonte);
          assert.equal(erro.codigo, "preset_invalido");
          // ErroDaPonte não guarda `.mensagem` — a mensagem vive em `.message`,
          // herdado de Error, porque o construtor chama `super(mensagem)`.
          // Perder isso de vista é perder a única explicação que o streamer vê.
          assert.equal(erro.message, "Presente repetido no slot 4.");
          assert.equal(erro.status, 400);
          return true;
        },
      );
    },
  );
});

test("resposta de erro sem corpo JSON ainda vira ErroDaPonte legível, com código e mensagem padrão", async () => {
  // O contrato promete { erro, mensagem } em toda superfície, mas o painel não
  // pode confiar cegamente: um proxy ou erro 500 cru pode devolver HTML ou nada.
  await comFetch(
    () => respostaFalsa(500, undefined),
    async () => {
      await assert.rejects(
        () => api.catalogo(),
        (erro) => {
          assert.ok(erro instanceof ErroDaPonte);
          assert.equal(erro.codigo, "erro_desconhecido");
          assert.match(erro.message, /500/);
          assert.equal(erro.status, 500);
          return true;
        },
      );
    },
  );
});

/* ------------------------------------------------------------------ */
/* Ponte fora do ar — o caso comum de desenvolvimento                  */
/* ------------------------------------------------------------------ */

test("ponte fora do ar vira erro em português dizendo que ela não respondeu, nunca um TypeError cru", async () => {
  await comFetch(
    () => {
      // Isto é literalmente o que o navegador lança quando a conexão é recusada.
      throw new TypeError("Failed to fetch");
    },
    async () => {
      await assert.rejects(
        () => api.sessao(),
        (erro) => {
          assert.ok(erro instanceof ErroDaPonte, "não pode escapar um TypeError cru para o componente");
          assert.equal(erro.name, "ErroDaPonte");
          assert.equal(erro.codigo, "ponte_offline");
          assert.equal(erro.status, 0);
          assert.match(erro.message, /não respondeu/);
          assert.match(erro.message, /npm run ponte/, "a mensagem tem que dizer o que fazer, não só o que falhou");
          assert.doesNotMatch(erro.message, /Failed to fetch/, "mensagem crua não ajuda o streamer");
          return true;
        },
      );
    },
  );
});

/* ------------------------------------------------------------------ */
/* 204                                                                  */
/* ------------------------------------------------------------------ */

test("204 vira null sem chamar .json() — que rejeitaria de verdade num corpo vazio", async () => {
  let jsonChamado = false;
  await comFetch(
    () => ({
      status: 204,
      ok: true,
      json: async () => {
        jsonChamado = true;
        throw new SyntaxError("Unexpected end of JSON input");
      },
    }),
    async () => {
      const resultado = await api.encerrarSessao();
      assert.equal(resultado, null);
      assert.equal(jsonChamado, false, "o código precisa desviar de .json() no 204, não só sobreviver a ele");
    },
  );
});

/* ------------------------------------------------------------------ */
/* Verbos de domínio: caminho certo, resposta desempacotada             */
/* ------------------------------------------------------------------ */

test("os verbos de listagem montam o caminho certo e devolvem o array, nunca o envelope", async () => {
  const casos = [
    { verbo: "modalidades", campo: "modalidades", caminho: "/api/modalidades" },
    { verbo: "listarPresets", campo: "presets", caminho: "/api/presets" },
    { verbo: "animacoes", campo: "animacoes", caminho: "/api/animacoes" },
    { verbo: "looks", campo: "looks", caminho: "/api/looks" },
    { verbo: "mapas", campo: "mapas", caminho: "/api/mapas" },
    { verbo: "cenarios", campo: "cenarios", caminho: "/api/cenarios" },
  ];

  for (const { verbo, campo, caminho } of casos) {
    const valor = [{ id: `${verbo}-1` }, { id: `${verbo}-2` }];
    await comFetch(
      (url) => {
        assert.ok(url.endsWith(caminho), `${verbo}: esperava terminar em ${caminho}, chamou ${url}`);
        return respostaFalsa(200, { [campo]: valor });
      },
      async () => {
        const resultado = await api[verbo]();
        assert.deepEqual(resultado, valor, `${verbo}() devolveu o envelope em vez do array de "${campo}"`);
      },
    );
  }
});

test("carregarPreset devolve o objeto cru (sem desempacotar) e escapa o id na URL", async () => {
  const presetFalso = { presetId: "sala 1", slots: [] };
  await comFetch(
    (url) => {
      // A asserção de sufixo exato já reprova tanto "sala 1" cru quanto
      // qualquer encoding diferente de encodeURIComponent.
      assert.ok(url.endsWith("/api/presets/sala%201"), `id com espaço deveria ir encodado, chamou ${url}`);
      return respostaFalsa(200, presetFalso);
    },
    async () => {
      const resultado = await api.carregarPreset("sala 1");
      assert.deepEqual(resultado, presetFalso, "GET de um preset é passthrough — não tem envelope para desempacotar");
    },
  );
});

test("salvarPreset é um PUT no id do preset, com o preset inteiro no corpo JSON", async () => {
  const preset = { presetId: "padrão/2", slots: [{ posicao: 1, presenteId: "sem-rose", animacaoId: "sub_cometa" }] };
  await comFetch(
    (url, opcoes) => {
      assert.ok(url.endsWith(`/api/presets/${encodeURIComponent(preset.presetId)}`));
      assert.equal(opcoes.method, "PUT");
      assert.deepEqual(JSON.parse(opcoes.body), preset);
      assert.equal(opcoes.headers["content-type"], "application/json");
      return respostaFalsa(200, { ok: true });
    },
    async () => {
      await api.salvarPreset(preset);
    },
  );
});

test("iniciarSessao manda presetId e cenario no corpo, e cenario é null quando omitido", async () => {
  await comFetch(
    (url, opcoes) => {
      assert.ok(url.endsWith("/api/sessao/start"));
      assert.equal(opcoes.method, "POST");
      assert.deepEqual(JSON.parse(opcoes.body), { presetId: "padrao", cenario: null });
      return respostaFalsa(200, { sessaoId: "s1" });
    },
    async () => {
      await api.iniciarSessao("padrao");
    },
  );

  await comFetch(
    (url, opcoes) => {
      assert.deepEqual(JSON.parse(opcoes.body), { presetId: "padrao", cenario: "cenario-vazio" });
      return respostaFalsa(200, { sessaoId: "s1" });
    },
    async () => {
      await api.iniciarSessao("padrao", "cenario-vazio");
    },
  );
});

test("gerarMapa manda só a descrição — a chave do Gemini nunca passa pelo navegador (F4, 11_SEGURANCA)", async () => {
  await comFetch(
    (url, opcoes) => {
      assert.ok(url.endsWith("/api/mapas/gerar"));
      assert.equal(opcoes.method, "POST");
      // deepEqual (não só .match) garante que o corpo tem SÓ o que devia —
      // nenhuma chave de API nem outro campo viajando até a ponte. `formato`
      // entrou depois, é do contrato do mapa (ADR-009) e não é segredo; a
      // igualdade estrita continua sendo o que prova que nada mais vaza.
      assert.deepEqual(JSON.parse(opcoes.body), {
        descricao: "torre vulcânica ao entardecer",
        formato: "disco",
      });
      return respostaFalsa(200, { mapa: {} });
    },
    async () => {
      await api.gerarMapa("torre vulcânica ao entardecer");
    },
  );
});

test("gerarMapa leva o formato escolhido, e o padrão é o disco de sempre", async () => {
  // Formato errado não dá erro visível: dá mapa reprovado nas duas tentativas,
  // porque as regras dos dois são opostas. Vale amarrar que ele viaja.
  await comFetch(
    (url, opcoes) => {
      assert.deepEqual(JSON.parse(opcoes.body), { descricao: "escadaria de praça", formato: "laje" });
      return respostaFalsa(200, { mapa: {} });
    },
    async () => {
      await api.gerarMapa("escadaria de praça", "laje");
    },
  );
});

test("encerrarSessao e atualizarCatalogo são POST sem corpo", async () => {
  await comFetch(
    (url, opcoes) => {
      assert.ok(url.endsWith("/api/sessao/stop"));
      assert.equal(opcoes.method, "POST");
      assert.equal(opcoes.body, undefined);
      return respostaFalsa(204, undefined);
    },
    () => api.encerrarSessao(),
  );

  await comFetch(
    (url, opcoes) => {
      assert.ok(url.endsWith("/api/catalogo/atualizar"));
      assert.equal(opcoes.method, "POST");
      assert.equal(opcoes.body, undefined);
      return respostaFalsa(200, { catalogo: [] });
    },
    () => api.atualizarCatalogo(),
  );
});

test("urlDoFluxo devolve URL absoluta, na mesma base dos outros verbos — é o que o EventSource do useFluxo recebe", async () => {
  // Descobre a base a partir de uma chamada real, em vez de repetir o literal
  // "http://127.0.0.1:8788" — assim o teste não finge saber um detalhe de
  // configuração que só o próprio módulo deveria decidir.
  let baseCapturada;
  await comFetch(
    (url) => {
      baseCapturada = url.replace(/\/api\/sessao$/, "");
      return respostaFalsa(200, {});
    },
    () => api.sessao(),
  );

  assert.equal(api.urlDoFluxo(), `${baseCapturada}/api/sessao/stream`);
});

/* ------------------------------------------------------------------ */
/* O estúdio de overlay                                                */
/* ------------------------------------------------------------------ */

test("layoutDoOverlay lê o catálogo e o layout da ponte, e devolve a resposta inteira", async () => {
  // Inteira de propósito: o catálogo de elementos e a altura da cam vêm junto
  // do layout, e o painel não guarda nenhum número de geometria do overlay.
  // Um `.then((r) => r.elementos)` aqui apagaria o catálogo e o estúdio ficaria
  // sem o que desenhar — sem erro, só uma tela vazia.
  //
  // O corpo é COPIADO da rota real (`bridge/src/http/rotas-painel.mjs`), não
  // inventado: um corpo de mentira com as chaves que dariam certo faz o teste
  // passar igual com a rota certa ou errada, que foi exatamente como um
  // desencontro de formato chegou até a tela. Quem sabe ler as duas formas é
  // `lerRespostaDoLayout`, em lib/regras.js, e ele tem teste próprio.
  const resposta = {
    layout: {
      streamerId: "local",
      atualizadoEm: "2026-09-04T12:00:00.000Z",
      elementos: {},
    },
    elementos: [{ id: "placar", rotulo: "Placar", x: 2.5, y: 2, largura: 30, altura: 6, ancora: "esquerda-topo" }],
    cam: 33,
  };

  await comFetch(
    (url, opcoes) => {
      assert.ok(url.endsWith("/api/overlay/layout"), `caminho errado: ${url}`);
      assert.equal(opcoes.method, undefined, "ler layout é GET");
      return respostaFalsa(200, resposta);
    },
    async () => {
      assert.deepEqual(await api.layoutDoOverlay(), resposta);
    },
  );
});

test("salvarLayoutDoOverlay é PUT no mesmo caminho, com o corpo { elementos }", async () => {
  const elementos = { placar: { x: 10, y: 20, escala: 1.25, visivel: true } };

  await comFetch(
    (url, opcoes) => {
      assert.ok(url.endsWith("/api/overlay/layout"), `caminho errado: ${url}`);
      assert.equal(opcoes.method, "PUT");
      // O corpo é `{ elementos }`, não o mapa cru: a ponte valida contra o
      // schema, e um corpo achatado viraria 400 no clique de salvar.
      assert.deepEqual(JSON.parse(opcoes.body), { elementos });
      return respostaFalsa(200, { elementos });
    },
    () => api.salvarLayoutDoOverlay(elementos),
  );
});

test("salvar layout com a ponte fora do ar vira ErroDaPonte em português, não TypeError", async () => {
  await comFetch(
    () => {
      throw new TypeError("Failed to fetch");
    },
    async () => {
      await assert.rejects(
        () => api.salvarLayoutDoOverlay({}),
        (erro) => {
          assert.ok(erro instanceof ErroDaPonte);
          assert.equal(erro.codigo, "ponte_offline");
          assert.match(erro.message, /não respondeu/);
          return true;
        },
      );
    },
  );
});

test("layout recusado pela ponte chega ao estúdio com o código e a mensagem do contrato", async () => {
  // O estúdio mostra `.message` numa pastilha. Se o código do contrato se
  // perdesse aqui, o streamer veria "A ponte respondeu 400." e nada mais.
  await comFetch(
    () => respostaFalsa(400, { erro: "layout_invalido", mensagem: "escala fora de 0,5 a 2." }),
    async () => {
      await assert.rejects(
        () => api.salvarLayoutDoOverlay({ placar: { x: 0, y: 0, escala: 3, visivel: true } }),
        (erro) => {
          assert.equal(erro.codigo, "layout_invalido");
          assert.equal(erro.message, "escala fora de 0,5 a 2.");
          assert.equal(erro.status, 400);
          return true;
        },
      );
    },
  );
});
