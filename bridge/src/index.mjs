/**
 * Entrada da ponte.
 *
 *   npm run ponte                                          conecta na live
 *   npm run ponte -- --cenario=02-combo --preset=escalada-padrao   sem live
 *
 * Sobem DOIS servidores em portas diferentes, de propósito:
 * o do jogo é o único que o túnel pode publicar, e o do painel nunca sai da
 * máquina. Ver bridge/src/http/servidor.mjs e docs/11_SEGURANCA.
 *
 * O .env é carregado pelo Node com --env-file, não por dependência.
 */

import { pathToFileURL } from "node:url";

import { carregarConfig, configValida } from "./config.mjs";
import { EMPACOTADO } from "./empacotamento.mjs";
import { log } from "./log.mjs";
import { Nucleo } from "./nucleo.mjs";
import { criarAppDoJogo, criarAppDoPainel } from "./http/servidor.mjs";

const argumento = (nome) =>
  process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=").slice(1).join("=") ?? null;

const escutar = (app, porta, host) =>
  new Promise((resolve) => {
    const servidor = app.listen(porta, host, () => resolve(servidor));
  });

/**
 * Sobe as duas portas e devolve o que subiu, ou `null` quando não deu.
 *
 * Exportada porque o executável portátil (`empacotado.mjs`) precisa dela sem o
 * `await` de módulo lá embaixo: ele tem coisa a fazer ANTES (extrair a semente,
 * criar o `.env`) e DEPOIS (abrir o navegador na porta que subiu).
 */
export async function principal({ painel = null } = {}) {
  const config = carregarConfig();

  if (!configValida(config)) {
    console.error("A ponte não sobe com esta configuração:");
    for (const problema of config.problemas) console.error(`  - ${problema}`);
    console.error("\nCopie .env.example para .env e preencha. Ver docs/11_SEGURANCA.");
    process.exitCode = 1;
    return;
  }

  const nucleo = new Nucleo({ config });

  try {
    await nucleo.carregarAnimacoesNaMemoria();
  } catch (erro) {
    console.error(erro.message);
    process.exitCode = 1;
    return null;
  }

  // ANTES de abrir as portas: o Roblox pede o mapa na entrada, e uma ponte que
  // aceita conexão sem preset ativo serve 404 para quem chegar primeiro.
  await nucleo.restaurar();

  const servidorDoJogo = await escutar(criarAppDoJogo(nucleo, { token: config.token }), config.portaJogo, config.host);
  const servidorDoPainel = await escutar(criarAppDoPainel(nucleo, { painel }), config.portaPainel, config.host);

  log.info("ponte_no_ar", { host: config.host, portaJogo: config.portaJogo, portaPainel: config.portaPainel });
  console.log(`Jogo   http://${config.host}:${config.portaJogo}/jogo/*   exige X-Bridge-Token`);
  console.log(`       ↑ é ESTA porta que o túnel publica, e só ela`);
  console.log(`Painel http://${config.host}:${config.portaPainel}/api/*    nunca sai da máquina`);
  if (!config.chaveGemini) console.log("(sem GEMINI_API_KEY: a geração de mapa fica indisponível)");

  const cenario = argumento("cenario");
  const presetId = argumento("preset");
  if (cenario && presetId) {
    await nucleo.iniciarSessao({ presetId, cenario });
    console.log(`\nTocando a fixture "${cenario}" em loop, sem live.`);
  }

  /**
   * `sair` é falso quando quem manda no processo não é a ponte.
   *
   * No terminal, Ctrl+C tem que derrubar tudo, e `process.exit` é o caminho.
   * Dentro do aplicativo quem decide a hora de morrer é o Electron: um
   * `process.exit` aqui mataria a janela no meio do fechamento e pularia o
   * resto do desligamento dele.
   */
  const encerrar = async (sinal, { sair = true } = {}) => {
    log.info("ponte_encerrando", { sinal });
    // Encerra a sessão de verdade: é o que descarta o dado de espectador (F5).
    if (nucleo.sessaoAtiva) await nucleo.encerrarSessao().catch(() => {});
    servidorDoJogo.close();

    if (!sair) return new Promise((pronto) => servidorDoPainel.close(() => pronto()));

    servidorDoPainel.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
    return undefined;
  };

  process.on("SIGINT", () => encerrar("SIGINT"));
  process.on("SIGTERM", () => encerrar("SIGTERM"));

  return { config, nucleo, servidorDoJogo, servidorDoPainel, encerrar };
}

//[[ Só roda sozinha quando FOI ela a chamada.
//
// Dentro do aplicativo quem manda é o `aplicativo.mjs` — ele tem que extrair a
// semente e criar o `.env` ANTES da ponte subir.
//
// Sem `await` de topo: este arquivo é fundido em CommonJS para virar o
// executável, e CommonJS não tem await de topo. O `.catch` faz o mesmo serviço
// que o await fazia, que é não deixar a falha sumir em silêncio. ]]
// `!EMPACOTADO` primeiro porque dentro do pacote a comparação já deu TRUE por
// acidente uma vez, com os dois lados virando o caminho do próprio executável.
// Sem esta guarda a ponte subia duas vezes, e a primeira — antes de o `.env`
// existir — cuspia "BRIDGE_TOKEN precisa de no mínimo 32 caracteres" logo acima
// do arranque bom.
const chamadaDireta = !EMPACOTADO && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (chamadaDireta) {
  principal().catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  });
}
