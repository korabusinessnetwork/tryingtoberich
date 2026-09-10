/**
 * A ponte vista de dentro do aplicativo.
 *
 * O que o `npm start` fazia por fora — e que ninguém pode pedir ao cliente para
 * fazer na mão — acontece aqui, antes de a ponte subir:
 *
 *   1. escreve `data/` e `game/` ao lado do executável, se ainda não estiverem;
 *   2. cria o `.env` com um `BRIDGE_TOKEN` sorteado na hora — o cliente não tem
 *      `openssl` nem tem por que saber o que é um token;
 *   3. carrega o painel construído para a memória;
 *   4. sobe a ponte, servindo o painel na mesma porta da `/api`.
 *
 * Quem chama é o `app/principal.cjs`, o processo principal do Electron. Este
 * arquivo não sabe que Electron existe, e é assim que ele continua testável
 * sem abrir janela nenhuma.
 *
 * O que ele NÃO faz, de propósito: instalar o Roblox Studio e o Rojo. Os dois
 * são programas de terceiros, com instalador próprio. Ficam documentados no
 * `LEIA-ME.txt`, e o painel avisa quando falta algum — o botão "Abrir o jogo no
 * Studio" já responde com o comando do `winget` quando não acha o Rojo.
 */

import path from "node:path";
import { randomBytes } from "node:crypto";

import { RAIZ, RECURSOS } from "./empacotamento.mjs";
import { principal } from "./index.mjs";
import {
  escreverBinarioAtomico,
  existe,
  lerBinario,
  lerJsonOuPadrao,
  listarArquivosRecursivo,
} from "./repos/arquivo.mjs";

const DIR_PAINEL = path.join(RECURSOS, "painel");
const DIR_SEMENTE = path.join(RECURSOS, "semente");

/**
 * O que é reescrito a cada arranque, e o que só nasce uma vez.
 *
 * A regra é "de quem é o arquivo". Schema, catálogo de tradução, tabela de
 * animações e a fonte do jogo são PROGRAMA: têm que casar com a versão do
 * aplicativo, senão instalar uma versão nova deixa em disco um schema velho que
 * recusa o dado novo. Preset, acervo e configuração são do STREAMER: nascem com
 * um exemplo e nunca mais são tocados — sobrescrever apagaria o trabalho dele.
 */
const DO_PROGRAMA = [/^game\//, /^data\/schemas\//, /^data\/i18n\//, /^data\/(animacoes|tokens)\.json$/];

export const eDoPrograma = (relativo) => DO_PROGRAMA.some((padrao) => padrao.test(relativo));

/**
 * Escreve a semente ao lado do executável. Devolve o que mudou, para o log.
 *
 * Compara antes de escrever porque a alternativa — reescrever tudo sempre — faz
 * o OneDrive sincronizar quase um mega a cada abertura e o antivírus varrer
 * junto.
 */
export async function semear({ indice, raiz = RAIZ, ler } = {}) {
  const lista = indice ?? (await listarArquivosRecursivo(DIR_SEMENTE));
  const lerArquivo = ler ?? ((relativo) => lerBinario(path.join(DIR_SEMENTE, relativo)));
  const escritos = [];

  for (const relativo of lista) {
    const conteudo = await lerArquivo(relativo);
    if (!conteudo) continue;

    const destino = path.join(raiz, relativo);
    const jaEsta = await existe(destino);

    if (jaEsta && !eDoPrograma(relativo)) continue;
    if (jaEsta && Buffer.compare(await lerBinario(destino), conteudo) === 0) continue;

    await escreverBinarioAtomico(destino, conteudo);
    escritos.push(relativo);
  }

  return escritos;
}

/**
 * O `.env` do cliente, criado uma vez.
 *
 * O `BRIDGE_TOKEN` é sorteado aqui e não vem no molde: token embutido no
 * programa seria o MESMO em toda instalação, e a única coisa que separa a porta
 * pública do jogo de quem passar por ela é justamente ele. Ver
 * `docs/11_SEGURANCA`.
 */
export function montarEnv(molde, token = randomBytes(32).toString("hex")) {
  return molde.replace(/^BRIDGE_TOKEN=.*$/m, `BRIDGE_TOKEN=${token}`);
}

async function garantirEnv() {
  const destino = path.join(RAIZ, ".env");
  if (await existe(destino)) return false;

  const molde = await lerBinario(path.join(DIR_SEMENTE, ".env.example")).catch(() => null);
  if (!molde) throw new Error("O molde do .env não veio junto com o aplicativo.");

  await escreverBinarioAtomico(destino, Buffer.from(montarEnv(molde.toString("utf8")), "utf8"));
  return true;
}

/**
 * O painel construído, do disco para a memória.
 *
 * São 500 KB lidos uma vez no arranque. Servir de memória tira o disco do
 * caminho de toda navegação do painel, e o `Princípio nº 1` do CLAUDE.md diz
 * que disco não entra em caminho quente.
 */
export async function carregarPainel(dir = DIR_PAINEL) {
  const nomes = await listarArquivosRecursivo(dir);
  const arquivos = new Map();
  for (const nome of nomes) arquivos.set(nome, await lerBinario(path.join(dir, nome)));
  return arquivos;
}

/** O idioma que o streamer escolheu, para a janela nascer no idioma certo. */
export async function idiomaGravado() {
  const config = await lerJsonOuPadrao(path.join(RAIZ, "data", "configuracao.json"), null);
  return config?.idioma ?? null;
}

/**
 * Prepara a pasta, sobe a ponte e devolve a URL do painel.
 *
 * Lança quando não dá para subir — quem chama transforma isso numa caixa de
 * erro, que é a única coisa que o cliente pode ler quando não existe terminal.
 */
export async function iniciar() {
  const escritos = await semear();
  const envNovo = await garantirEnv();

  process.loadEnvFile(path.join(RAIZ, ".env"));

  const painel = await carregarPainel();
  const subiu = await principal({ painel });

  if (!subiu) {
    // O `principal` já explicou o motivo na saída padrão; aqui só sobra dizer
    // que não subiu, porque no aplicativo ninguém está lendo saída padrão.
    throw new Error(
      "A configuração em .env não permite subir a ponte. Apague o arquivo .env " +
        "e abra de novo: ele nasce preenchido.",
    );
  }

  return {
    url: `http://${subiu.config.host}:${subiu.config.portaPainel}/`,
    escritos,
    envNovo,
    encerrar: () => subiu.encerrar("aplicativo", { sair: false }),
  };
}
