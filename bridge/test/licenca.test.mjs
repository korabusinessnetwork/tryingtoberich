/**
 * A licença: o veredito puro (ADR-P08) e o repositório que o espelha (ADR-P02).
 *
 * O que estes testes protegem é o caso que ninguém consegue reproduzir à mão: a
 * Kora fora do ar no dia da live de quem pagou. Esperar duas semanas para ver a
 * carência esgotar não é teste, então `agora` e `carenciaDias` entram por
 * parâmetro e o relógio nunca é consultado aqui.
 *
 * Nenhum teste deste arquivo toca a rede. O cliente da Kora é um objeto falso —
 * é literalmente a única forma de testar "o Supabase não respondeu".
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { criarAppDoPainel } from "../src/http/servidor.mjs";
import { Nucleo } from "../src/nucleo.mjs";
import {
  CARENCIA_DIAS,
  MOTIVOS,
  chaveTemForma,
  decidirLicenca,
  diasDeCarencia,
  liberado,
  normalizarChave,
  somarDias,
} from "../src/dominio/licenca.mjs";
import { ativarLicenca, esquecerLicenca, lerEspelho, verificarLicenca } from "../src/repos/licenca.mjs";
import { RAIZ, apagar, caminhoDeDados, escreverJsonAtomico, lerJsonOuPadrao } from "../src/repos/arquivo.mjs";
import { criarValidador } from "../src/repos/schemas.mjs";
import { VERSAO } from "../src/versao.mjs";

const CHAVE = "KORA-TESTE-0001";
const ARRANQUE = "2026-09-10T12:00:00.000Z";

/** Um cliente da Kora que responde o que o teste mandar. Nunca fala com ninguém. */
const koraQueResponde = (linhas) => ({
  configurado: true,
  selecionar: async () => ({ ok: true, linhas }),
});

/** Uma Kora fora do ar: responde a falha do transporte, não um veredito. */
const koraForaDoAr = () => ({
  configurado: true,
  selecionar: async () => ({ ok: false, motivo: "rede" }),
});

/* ================================================================== */
/* O veredito puro                                                     */
/* ================================================================== */

test("sem chave nenhuma é sem_licenca, e isso não é erro", () => {
  const veredito = decidirLicenca({ agora: ARRANQUE });

  assert.equal(veredito.estado, "sem_licenca");
  assert.equal(veredito.motivo, MOTIVOS.SEM_CHAVE);
  assert.equal(veredito.chave, null);
  // Quem acabou de baixar o produto tem que conseguir usá-lo.
  assert.equal(liberado(veredito), true);
});

test("a Kora confirmando ativa já grava a carência, contada de agora", () => {
  const veredito = decidirLicenca({
    chave: CHAVE,
    resposta: { conhecida: true, estado: "ativa", plano: "Mensal", validaAte: "2026-10-10T00:00:00.000Z" },
    agora: ARRANQUE,
  });

  assert.equal(veredito.estado, "ativa");
  assert.equal(veredito.motivo, null);
  assert.equal(veredito.plano, "Mensal");
  assert.equal(veredito.verificadaEm, ARRANQUE);
  assert.equal(veredito.carenciaAte, somarDias(ARRANQUE, CARENCIA_DIAS));
  assert.equal(liberado(veredito), true);
});

test("a Kora dizendo não NÃO ganha carência", () => {
  for (const [estado, motivo] of [["expirada", MOTIVOS.LICENCA_EXPIRADA], ["cancelada", MOTIVOS.LICENCA_CANCELADA]]) {
    const veredito = decidirLicenca({ chave: CHAVE, resposta: { conhecida: true, estado }, agora: ARRANQUE });

    assert.equal(veredito.estado, estado);
    assert.equal(veredito.motivo, motivo);
    assert.equal(veredito.carenciaAte, null, "carência é para quem não pôde ser reconfirmado");
    assert.equal(liberado(veredito), false);
  }
});

test("chave que a Kora não conhece é sem_licenca com motivo chave_invalida", () => {
  const veredito = decidirLicenca({ chave: CHAVE, resposta: { conhecida: false }, agora: ARRANQUE });

  assert.equal(veredito.estado, "sem_licenca");
  assert.equal(veredito.motivo, MOTIVOS.CHAVE_INVALIDA);
});

/* ---------------------------------------------------------------- */
/* Carência — o motivo de o ADR-P08 existir                          */
/* ---------------------------------------------------------------- */

const espelhoAtivo = {
  streamerId: "local",
  estado: "ativa",
  chave: CHAVE,
  plano: "Mensal",
  validaAte: "2026-10-10T00:00:00.000Z",
  verificadaEm: ARRANQUE,
  carenciaAte: somarDias(ARRANQUE, CARENCIA_DIAS),
  motivo: null,
  versaoInstalada: VERSAO,
  atualizadoEm: ARRANQUE,
};

test("DENTRO da carência: a Kora sumiu e a live acontece", () => {
  // Treze dias depois. O streamer pagou e está sem internet — é o caso inteiro.
  const veredito = decidirLicenca({ espelho: espelhoAtivo, agora: somarDias(ARRANQUE, 13) });

  assert.equal(veredito.estado, "indeterminada");
  assert.equal(veredito.motivo, MOTIVOS.KORA_INDISPONIVEL);
  assert.equal(liberado(veredito), true, "quem pagou não pode ficar sem produto");
  // A data que a Kora deu não é reafirmada sem a Kora: o schema proíbe.
  assert.equal(veredito.validaAte, null);
  assert.ok(diasDeCarencia(veredito, somarDias(ARRANQUE, 13)) > 0);
});

test("FORA da carência: passados os 14 dias, trava", () => {
  const veredito = decidirLicenca({ espelho: espelhoAtivo, agora: somarDias(ARRANQUE, 15) });

  assert.equal(veredito.estado, "indeterminada");
  assert.equal(veredito.motivo, MOTIVOS.CARENCIA_ESGOTADA);
  assert.equal(liberado(veredito), false);
});

test("a carência NÃO renova a cada arranque", () => {
  //[[ O bug óbvio deste desenho, e o motivo deste teste existir.
  //
  // Se `verificadaEm` fosse reescrito com "agora" no caminho offline, cada
  // subida da ponte empurraria o prazo mais quatorze dias e ele nunca
  // esgotaria — uma licença cancelada rodaria para sempre, bastando ficar
  // offline. Aqui a ponte sobe cinco vezes ao longo de vinte dias. ]]
  let espelho = espelhoAtivo;
  for (const dia of [3, 6, 9, 12, 20]) {
    espelho = decidirLicenca({ espelho, agora: somarDias(ARRANQUE, dia) });
    assert.equal(espelho.verificadaEm, ARRANQUE, "a carência conta da última confirmação BOA");
  }

  assert.equal(espelho.motivo, MOTIVOS.CARENCIA_ESGOTADA);
  assert.equal(liberado(espelho), false);
});

test("o não de ontem continua valendo quando a Kora não responde hoje", () => {
  const espelho = { ...espelhoAtivo, estado: "cancelada", motivo: MOTIVOS.LICENCA_CANCELADA, carenciaAte: null };
  const veredito = decidirLicenca({ espelho, agora: somarDias(ARRANQUE, 1) });

  assert.equal(veredito.estado, "cancelada");
  assert.equal(liberado(veredito), false, "não poder repetir o não não transforma o não em sim");
});

test("chave que nunca foi confirmada nesta máquina não tem carência a estender", () => {
  const espelho = { ...espelhoAtivo, estado: "sem_licenca", carenciaAte: null, motivo: MOTIVOS.CHAVE_INVALIDA };
  const veredito = decidirLicenca({ espelho, agora: somarDias(ARRANQUE, 1) });

  assert.equal(veredito.estado, "indeterminada");
  assert.equal(veredito.motivo, MOTIVOS.KORA_INDISPONIVEL);
  assert.equal(veredito.carenciaAte, null);
});

test("resposta que não entendemos cai no caminho do espelho, não derruba nada", () => {
  // Um estado novo inventado do lado da Kora não pode cancelar a live de quem
  // já pagou. O pior que pode acontecer é rodar com o veredito de ontem.
  const veredito = decidirLicenca({
    espelho: espelhoAtivo,
    resposta: { conhecida: true, estado: "estado_que_ainda_nao_existe" },
    agora: somarDias(ARRANQUE, 1),
  });

  assert.equal(veredito.estado, "indeterminada");
  assert.equal(liberado(veredito), true);
});

test("o espelho manda também quando não há SUPABASE_URL nenhum", () => {
  // Instalação em modo local: nunca há resposta, e nada quebra (ADR-P02).
  const veredito = decidirLicenca({ chave: CHAVE, agora: ARRANQUE });

  assert.equal(veredito.estado, "indeterminada");
  assert.equal(veredito.motivo, MOTIVOS.KORA_INDISPONIVEL);
  assert.equal(liberado(veredito), true);
});

test("a forma da chave é checada antes de ela sair da máquina", () => {
  assert.equal(normalizarChave("  KORA-1234-5678  "), "KORA-1234-5678");
  assert.equal(normalizarChave(null), "");
  assert.equal(chaveTemForma("curta"), false);
  assert.equal(chaveTemForma("K".repeat(129)), false);
  assert.equal(chaveTemForma(CHAVE), true);
});

/* ---------------------------------------------------------------- */
/* O contrato — todo veredito cabe no schema                         */
/* ---------------------------------------------------------------- */

test("todo veredito possível passa em licenca.schema.json", async () => {
  //[[ Em produção o repositório LOGA e não grava um espelho fora do contrato,
  // porque a alternativa seria a ponte não subir. Aqui a mesma validação é
  // vermelha: é este teste que garante que aquele caminho nunca é usado. ]]
  const { validar } = await criarValidador();

  const vereditos = [
    decidirLicenca({ agora: ARRANQUE }),
    decidirLicenca({ chave: CHAVE, agora: ARRANQUE }),
    decidirLicenca({ chave: CHAVE, resposta: { conhecida: false }, agora: ARRANQUE }),
    decidirLicenca({ chave: CHAVE, resposta: { conhecida: true, estado: "ativa", plano: "Mensal", validaAte: ARRANQUE }, agora: ARRANQUE }),
    decidirLicenca({ chave: CHAVE, resposta: { conhecida: true, estado: "expirada" }, agora: ARRANQUE }),
    decidirLicenca({ chave: CHAVE, resposta: { conhecida: true, estado: "cancelada" }, agora: ARRANQUE }),
    decidirLicenca({ espelho: espelhoAtivo, agora: somarDias(ARRANQUE, 3) }),
    decidirLicenca({ espelho: espelhoAtivo, agora: somarDias(ARRANQUE, 30) }),
    decidirLicenca({ espelho: { ...espelhoAtivo, estado: "expirada", motivo: MOTIVOS.LICENCA_EXPIRADA }, agora: ARRANQUE }),
  ];

  for (const veredito of vereditos) {
    assert.deepEqual(validar("licenca", veredito), [], `veredito fora do contrato: ${JSON.stringify(veredito)}`);
  }
});

test("a versão reportada é a mesma do bridge/package.json", async () => {
  // A constante existe porque `package.json` não existe em disco dentro do
  // executável (ver src/versao.mjs). Este teste é o preço de fixá-la: subir a
  // versão num lugar só fica vermelho antes do commit.
  const pacote = await lerJsonOuPadrao(`${RAIZ}/bridge/package.json`, null);
  if (!pacote) return; // rodando de dentro do pacote: não há o que comparar.
  assert.equal(VERSAO, pacote.version);
});

/* ================================================================== */
/* O repositório — espelho em disco                                    */
/* ================================================================== */
//
// Estes tocam `data/licenca.json` de verdade, porque a RAIZ é lida no topo do
// módulo e não dá para trocá-la depois. O arquivo do dono é salvo e devolvido,
// como o `http.test.mjs` já faz com a cena do Estúdio de Overlay.

const ARQUIVO = caminhoDeDados("licenca.json");
let espelhoDoDono = null;

/**
 * As rotas do painel entram NESTE arquivo, e não num terceiro, por uma razão
 * mecânica: o `node --test` roda os arquivos em paralelo, e dois deles
 * disputando `data/licenca.json` seriam instáveis de nascença. Tudo que encosta
 * no espelho do dono mora aqui, onde a ordem é serial e o `after` devolve o
 * arquivo como estava.
 */
let servidorDoPainel;
let basePainel;
/** Uma Kora que registra o que foi chamado: é assim que "não consultou" vira assert. */
const espiao = { chamadas: [], configurado: true };
espiao.selecionar = async (...args) => {
  espiao.chamadas.push(args);
  return { ok: true, linhas: [] };
};
espiao.inserir = async () => ({ ok: true, linhas: [] });

before(async () => {
  espelhoDoDono = await lerJsonOuPadrao(ARQUIVO, null);
  await apagar(ARQUIVO);

  const nucleo = new Nucleo({
    config: {
      token: "l".repeat(32), portaJogo: 0, portaPainel: 0, host: "127.0.0.1",
      usuarioTiktok: "", chaveGemini: "", longpollTimeoutMs: 600, combateMaxMs: 50,
      supabaseUrl: "", supabaseChave: "",
    },
    kora: espiao,
  });

  servidorDoPainel = criarAppDoPainel(nucleo).listen(0, "127.0.0.1");
  await new Promise((resolve) => servidorDoPainel.once("listening", resolve));
  basePainel = `http://127.0.0.1:${servidorDoPainel.address().port}`;
});

after(async () => {
  servidorDoPainel?.close();
  if (espelhoDoDono) await escreverJsonAtomico(ARQUIVO, espelhoDoDono);
  else await apagar(ARQUIVO);
});

test("Kora fora do ar no arranque não derruba nada, e o espelho vira o veredito", async () => {
  await escreverJsonAtomico(ARQUIVO, espelhoAtivo);

  const veredito = await verificarLicenca({ cliente: koraForaDoAr(), agora: somarDias(ARRANQUE, 2) });

  assert.equal(veredito.estado, "indeterminada");
  assert.equal(veredito.motivo, MOTIVOS.KORA_INDISPONIVEL);
  assert.equal(liberado(veredito), true);
  assert.equal(veredito.chave, CHAVE, "a chave do espelho é reusada sem incomodar o streamer");

  // E ficou gravado: o arranque seguinte parte daqui.
  assert.equal((await lerEspelho()).motivo, MOTIVOS.KORA_INDISPONIVEL);
});

test("arranque sem SUPABASE_URL nem sequer tenta consultar", async () => {
  await apagar(ARQUIVO);
  let consultou = false;
  const cliente = {
    configurado: false,
    selecionar: async () => {
      consultou = true;
      return { ok: false };
    },
  };

  const veredito = await verificarLicenca({ cliente, agora: ARRANQUE });

  assert.equal(consultou, false);
  assert.equal(veredito.estado, "sem_licenca");
  assert.equal(veredito.motivo, MOTIVOS.SEM_CHAVE);
});

test("ativar com a Kora respondendo ativa grava o espelho", async () => {
  await apagar(ARQUIVO);
  const kora = koraQueResponde([
    { chave: CHAVE, streamer_id: "local", estado: "ativa", plano: "Mensal", valida_ate: "2026-10-10T00:00:00.000Z" },
  ]);

  const veredito = await ativarLicenca({ cliente: kora, chave: `  ${CHAVE}  `, agora: ARRANQUE });

  assert.equal(veredito.estado, "ativa");
  assert.equal(veredito.chave, CHAVE, "espaço das pontas não vira chave diferente");
  assert.equal((await lerEspelho()).estado, "ativa");
});

test("chave com erro de digitação NÃO apaga a licença que funciona", async () => {
  // O caminho realista é o streamer perder um caractere ao copiar. Gravar a
  // recusa custaria a ele a licença boa, e ele só descobriria na próxima live.
  await escreverJsonAtomico(ARQUIVO, espelhoAtivo);

  const veredito = await ativarLicenca({ cliente: koraQueResponde([]), chave: "KORA-ERRADA-999", agora: ARRANQUE });

  assert.equal(veredito.motivo, MOTIVOS.CHAVE_INVALIDA, "o painel recebe a resposta da pergunta que fez");
  const emDisco = await lerEspelho();
  assert.equal(emDisco.estado, "ativa", "e o disco continua com a licença que funciona");
  assert.equal(emDisco.chave, CHAVE);
});

test("e o que a ponte DEVOLVE também continua sendo a licença que funciona", async () => {
  //[[ Este é o teste que faltava, e a falta custou um defeito de verdade.
  //
  // A versão anterior guardava o disco e devolvia o veredito da recusa. O disco
  // ficava intacto, o teste acima passava, e mesmo assim o núcleo adotava a
  // recusa como estado da sessão: a tela dizia "sem licença" até alguém
  // reiniciar o programa. A proteção existia no arquivo e não existia para o
  // streamer, que é para quem ela foi escrita.
  //
  // Achado abrindo a tela contra o banco de verdade, não em teste. Por isso ele
  // existe agora. ]]
  await escreverJsonAtomico(ARQUIVO, espelhoAtivo);

  const veredito = await ativarLicenca({ cliente: koraQueResponde([]), chave: "KORA-ERRADA-999", agora: ARRANQUE });

  assert.equal(veredito.estado, "ativa", "o estado devolvido é o que continua valendo");
  assert.equal(veredito.chave, CHAVE, "e é a chave boa, não a que foi digitada errado");
  assert.equal(veredito.plano, espelhoAtivo.plano);
  assert.equal(veredito.motivo, MOTIVOS.CHAVE_INVALIDA, "o motivo explica o que houve com a chave digitada");
});

test("corpo inválido no ativar não chega a sair da máquina", async () => {
  let consultou = false;
  const kora = {
    configurado: true,
    selecionar: async () => {
      consultou = true;
      return { ok: true, linhas: [] };
    },
  };

  await assert.rejects(() => ativarLicenca({ cliente: kora, chave: "" }), /Cole a chave/);
  await assert.rejects(() => ativarLicenca({ cliente: kora, chave: "curta" }), /forma de uma chave/);
  await assert.rejects(() => ativarLicenca({ cliente: kora, chave: "K".repeat(200) }), /forma de uma chave/);
  assert.equal(consultou, false, "chave malformada não gasta uma viagem até a Kora");
});

test("esquecer apaga o arquivo e volta ao estado de instalação nova", async () => {
  await escreverJsonAtomico(ARQUIVO, espelhoAtivo);

  const veredito = await esquecerLicenca({ agora: ARRANQUE });

  assert.equal(veredito.estado, "sem_licenca");
  assert.equal(veredito.motivo, MOTIVOS.SEM_CHAVE);
  assert.equal(veredito.chave, null);
  assert.equal(await lerEspelho(), null, "com espelho nenhum, é como se nunca tivesse sido ativada");
});

test("espelho corrompido não impede a ponte de subir", async () => {
  // Queda de energia no meio da escrita, ou edição à mão. O certo é reperguntar.
  await escreverJsonAtomico(ARQUIVO, espelhoAtivo);
  const { escreverBinarioAtomico } = await import("../src/repos/arquivo.mjs");
  await escreverBinarioAtomico(ARQUIVO, Buffer.from("{ isto não é json"));

  const veredito = await verificarLicenca({ cliente: koraForaDoAr(), agora: ARRANQUE });

  assert.equal(veredito.estado, "sem_licenca", "sem espelho legível, é instalação nova");
  assert.equal(liberado(veredito), true);
});

/* ================================================================== */
/* O contrato das rotas, contra o servidor de verdade                  */
/* ================================================================== */
//
// É contra estas três rotas que a tela do painel foi construída, então elas são
// contrato e não detalhe de implementação. Porta efêmera, servidor do painel de
// verdade — o mesmo arranjo do `http.test.mjs`.

const pedir = (caminho, opcoes = {}) => fetch(`${basePainel}${caminho}`, opcoes);

/** Os campos exigidos por licenca.schema.json, que é o contrato do painel. */
const conferirForma = (corpo) => {
  for (const campo of ["streamerId", "estado", "verificadaEm"]) {
    assert.ok(campo in corpo, `faltou "${campo}" na resposta`);
  }
  assert.ok(
    ["ativa", "expirada", "cancelada", "sem_licenca", "indeterminada"].includes(corpo.estado),
    `estado fora do enum: ${corpo.estado}`,
  );
};

test("GET /api/licenca devolve a forma do schema e NÃO consulta a Kora a cada clique", async () => {
  const antes = espiao.chamadas.length;

  const resposta = await pedir("/api/licenca");
  assert.equal(resposta.status, 200);
  const corpo = await resposta.json();

  conferirForma(corpo);
  // Instalação sem chave: nem se pergunta. É o estado de quem acabou de baixar.
  assert.equal(corpo.estado, "sem_licenca");
  assert.equal(corpo.motivo, MOTIVOS.SEM_CHAVE);

  // E de novo, e de novo: o veredito é ÚNICO por sessão (ADR-P02). Abrir o
  // painel dez vezes não pode virar dez consultas ao banco.
  await pedir("/api/licenca");
  await pedir("/api/licenca");
  assert.equal(espiao.chamadas.length, antes);
});

test("POST /api/licenca recusa corpo inválido antes de qualquer viagem", async () => {
  const antes = espiao.chamadas.length;

  const casos = [
    [JSON.stringify({}), "chave_obrigatoria"],
    [JSON.stringify({ chave: null }), "chave_obrigatoria"],
    [JSON.stringify({ chave: 42 }), "chave_obrigatoria"],
    [JSON.stringify({ chave: "" }), "chave_obrigatoria"],
    [JSON.stringify({ chave: "curta" }), "chave_malformada"],
    [JSON.stringify([{ chave: CHAVE }]), "corpo_invalido"],
  ];

  for (const [corpo, esperado] of casos) {
    const resposta = await pedir("/api/licenca", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: corpo,
    });

    assert.equal(resposta.status, 400, `corpo ${corpo} devia dar 400`);
    const erro = await resposta.json();
    assert.equal(erro.erro, esperado);
    assert.ok(erro.mensagem.length > 0, "o contrato de erro traz mensagem");
    assert.ok(!("stack" in erro), "nada de stack trace na resposta (07_APIS)");
  }

  assert.equal(espiao.chamadas.length, antes, "corpo inválido não gasta viagem até a Kora");
});

test("POST com chave que a Kora não conhece é 200 com motivo, não é erro HTTP", async () => {
  // É a resposta à pergunta que o painel fez. Um 4xx aqui faria a tela tratar
  // "sua chave não vale" como "a ponte quebrou".
  const resposta = await pedir("/api/licenca", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chave: CHAVE }),
  });

  assert.equal(resposta.status, 200);
  const corpo = await resposta.json();
  conferirForma(corpo);
  assert.equal(corpo.estado, "sem_licenca");
  assert.equal(corpo.motivo, MOTIVOS.CHAVE_INVALIDA);
});

test("DELETE /api/licenca devolve a mesma forma e volta ao estado de instalação nova", async () => {
  const resposta = await pedir("/api/licenca", { method: "DELETE" });

  assert.equal(resposta.status, 200);
  const corpo = await resposta.json();
  conferirForma(corpo);
  assert.equal(corpo.estado, "sem_licenca");
  assert.equal(corpo.motivo, MOTIVOS.SEM_CHAVE);
  assert.equal(corpo.chave, null);
  assert.equal(await lerJsonOuPadrao(ARQUIVO, null), null, "o espelho foi apagado, não zerado");
});
