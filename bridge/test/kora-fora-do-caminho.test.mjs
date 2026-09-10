/**
 * A regra que o ADR-P02 chamou de intocável, virada teste:
 *
 *   > Nenhuma chamada ao Supabase entra no caminho crítico do evento de presente.
 *   > Isto é testável e deve virar teste.
 *
 * É este arquivo. O cliente da Kora aqui é uma armadilha: qualquer método dele
 * REPROVA o teste ao ser chamado. Um presente atravessa a ponte inteira — casa
 * com o slot, disputa o combate, sai pelo long-poll — e a armadilha não dispara.
 *
 * Nada aqui encosta em `data/licenca.json`, de propósito: o `node --test` roda
 * os ARQUIVOS em paralelo, e dois deles disputando o mesmo arquivo do dono
 * seriam instáveis de nascença. O espelho é assunto do `licenca.test.mjs`, que
 * o salva e o devolve.
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { Nucleo } from "../src/nucleo.mjs";
import { apagar, caminhoDeDados } from "../src/repos/arquivo.mjs";
import { salvarPreset } from "../src/repos/presets.mjs";
import { carregarExemplo } from "../src/repos/fixtures.mjs";

const TOKEN = "k".repeat(32);
const PRESET_ID = "teste-camada-da-kora";

const config = {
  token: TOKEN, portaJogo: 0, portaPainel: 0, host: "127.0.0.1",
  usuarioTiktok: "", chaveGemini: "",
  longpollTimeoutMs: 600, combateMaxMs: 50,
  supabaseUrl: "", supabaseChave: "",
};

/**
 * A armadilha. `configurado: true` de propósito — uma Kora "desconfigurada"
 * provaria só que ela estava desligada, não que ninguém tentou chamá-la.
 */
function armadilha() {
  const chamadas = [];
  return {
    chamadas,
    cliente: {
      configurado: true,
      selecionar: async (...args) => {
        chamadas.push(["selecionar", ...args]);
        return { ok: true, linhas: [] };
      },
      inserir: async (...args) => {
        chamadas.push(["inserir", ...args]);
        return { ok: true, linhas: [] };
      },
    },
  };
}

let nucleo;
let kora;

before(async () => {
  await salvarPreset({ ...(await carregarExemplo("preset-escalada-padrao")), presetId: PRESET_ID });

  kora = armadilha();
  nucleo = new Nucleo({ config, kora: kora.cliente });
  await nucleo.carregarAnimacoesNaMemoria();
});

after(async () => {
  if (nucleo.sessaoAtiva) await nucleo.encerrarSessao().catch(() => {});
  nucleo.telemetria.parar();
  nucleo.longpoll.fecharTodos();
  await apagar(caminhoDeDados("presets", `${PRESET_ID}.json`));
});

/* ================================================================== */
/* A regra intocável                                                   */
/* ================================================================== */

test("o presente atravessa a ponte inteira sem a Kora ser chamada", async () => {
  const resumo = await nucleo.iniciarSessao({ presetId: PRESET_ID, cenario: null });
  assert.ok(resumo.sessaoId);

  const slots = (await carregarExemplo("preset-escalada-padrao")).slots;
  const antes = kora.chamadas.length;

  // Vinte presentes seguidos, incluindo dois no mesmo instante para acordar o
  // combate (ADR-012) — o pedaço do caminho quente que mais tem fiação.
  for (let i = 0; i < 10; i += 1) {
    nucleo.injetarPresentesDeTeste([
      { presenteId: slots[0].presenteId, repeticoes: 1 },
      { presenteId: slots[1 % slots.length].presenteId, repeticoes: 2 },
    ]);
  }

  // Deixa o combate fechar e as tarefas adiadas (`queueMicrotask`) rodarem: se
  // alguma delas fosse à Kora, é agora que a armadilha dispararia.
  await new Promise((seguir) => setTimeout(seguir, 200));

  assert.equal(
    kora.chamadas.length,
    antes,
    `a Kora foi chamada no caminho do presente: ${JSON.stringify(kora.chamadas.slice(antes))}`,
  );

  const sessao = await nucleo.encerrarSessao();
  await apagar(caminhoDeDados("sessoes", `${sessao.sessaoId}.json`));
});

test("a telemetria da sessão enfileira sem tocar a rede, e só sai quando mandam", async () => {
  // `conexao` e `desconexao` são registrados por iniciar/encerrar sessão. Os
  // dois são síncronos e só põem na fila — a rede é o `descarregar`, que é
  // chamado por relógio e pelo desligamento, nunca por um evento de live.
  const antes = kora.chamadas.length;

  const resumo = await nucleo.iniciarSessao({ presetId: PRESET_ID, cenario: null });
  const sessao = await nucleo.encerrarSessao();
  await apagar(caminhoDeDados("sessoes", `${sessao.sessaoId}.json`));
  assert.ok(resumo.sessaoId);

  assert.equal(kora.chamadas.length, antes, "iniciar e encerrar sessão não falam com a Kora");
  assert.ok(nucleo.telemetria.pendentes >= 2, "mas os eventos ficaram na fila");
});

test("nenhum módulo do caminho quente conhece o Supabase", async () => {
  //[[ A versão estática da mesma regra, e ela existe porque a dinâmica só
  // prova o caminho que ela percorreu. Este é o "fs não aparece fora de
  // repos/" do ADR-003, aplicado à irmã da regra: cliente do Supabase também
  // mora num diretório só. ]]
  const { listarArquivosRecursivo, lerBinario } = await import("../src/repos/arquivo.mjs");
  const { RAIZ } = await import("../src/empacotamento.mjs");
  const path = await import("node:path");

  const quentes = ["fila", "longpoll", "tiktok", "dominio"];
  const suspeitos = [];

  for (const pasta of quentes) {
    const dir = path.join(RAIZ, "bridge", "src", pasta);
    for (const arquivo of await listarArquivosRecursivo(dir)) {
      // `dominio/licenca.mjs` é a regra pura da licença: nenhuma rede, nenhum
      // disco. Ela não é caminho quente, só mora ao lado.
      if (arquivo === "licenca.mjs") continue;
      const texto = (await lerBinario(path.join(dir, arquivo))).toString("utf8");
      if (/supabase|repos\/licenca|repos\/telemetria/i.test(texto)) suspeitos.push(`${pasta}/${arquivo}`);
    }
  }

  assert.deepEqual(suspeitos, [], "a Kora vazou para o caminho quente");
});
