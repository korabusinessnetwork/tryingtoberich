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

import { carregarConfig, configValida } from "./config.mjs";
import { log } from "./log.mjs";
import { Nucleo } from "./nucleo.mjs";
import { criarAppDoJogo, criarAppDoPainel } from "./http/servidor.mjs";

const argumento = (nome) =>
  process.argv.find((a) => a.startsWith(`--${nome}=`))?.split("=").slice(1).join("=") ?? null;

const escutar = (app, porta, host) =>
  new Promise((resolve) => {
    const servidor = app.listen(porta, host, () => resolve(servidor));
  });

async function principal() {
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
    return;
  }

  const servidorDoJogo = await escutar(criarAppDoJogo(nucleo, { token: config.token }), config.portaJogo, config.host);
  const servidorDoPainel = await escutar(criarAppDoPainel(nucleo), config.portaPainel, config.host);

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

  const encerrar = async (sinal) => {
    log.info("ponte_encerrando", { sinal });
    // Encerra a sessão de verdade: é o que descarta o dado de espectador (F5).
    if (nucleo.sessaoAtiva) await nucleo.encerrarSessao().catch(() => {});
    servidorDoJogo.close();
    servidorDoPainel.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.on("SIGINT", () => encerrar("SIGINT"));
  process.on("SIGTERM", () => encerrar("SIGTERM"));
}

await principal();
