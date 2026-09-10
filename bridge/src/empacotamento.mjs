/**
 * Onde o produto está morando neste instante.
 *
 * O mesmo código roda de dois jeitos e precisa achar as mesmas coisas nos dois:
 *
 *   - **no repositório**, `node bridge/src/index.mjs`, e tudo — dado do
 *     streamer e arquivo de programa — está na pasta do projeto;
 *   - **dentro do `Kora Stream Games.exe`**, onde as duas coisas se separam: o
 *     dado do streamer fica ao lado do executável, e o programa fica dentro do
 *     pacote do aplicativo, onde ele não pode ser editado nem apagado.
 *
 * Esta é a única diferença de comportamento entre as duas formas, e ela mora
 * num arquivo só de propósito: quem lê `RAIZ` (o `repos/arquivo.mjs`, o
 * `roblox/estudio.mjs`, os scripts) não precisa saber que empacotamento existe.
 *
 * Não importa `node:fs`. Ver ADR-003 — quem toca disco é o `repos/arquivo.mjs`.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * As duas variáveis são escritas pelo `app/principal.cjs` ANTES de carregar a
 * ponte, e por mais ninguém.
 *
 * Variável de ambiente e não parâmetro porque `RAIZ` é lida no topo de módulos
 * que são carregados por `import` — quando a primeira linha da ponte roda, já é
 * tarde para passar argumento. O processo do aplicativo é nosso do começo ao
 * fim, então não há com quem disputar o nome.
 */
const doAmbiente = (nome) => (process.env[nome] ? path.resolve(process.env[nome]) : null);

const NO_REPOSITORIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Verdadeiro só dentro do aplicativo empacotado. */
export const EMPACOTADO = Boolean(doAmbiente("KORA_RAIZ"));

/**
 * A raiz do que é do STREAMER: `data/`, `.env`, `game/`.
 *
 * Empacotado, é a pasta ao lado do executável — de propósito fora do pacote do
 * aplicativo, porque isto muda a cada live e precisa sobreviver à troca do
 * programa por uma versão nova.
 */
export const RAIZ = doAmbiente("KORA_RAIZ") ?? NO_REPOSITORIO;

/**
 * A raiz do que é PROGRAMA: o painel construído e a semente de `data/`/`game/`.
 *
 * Empacotado, fica dentro do aplicativo. No repositório, coincide com a `RAIZ`
 * — não existe separação a fazer quando tudo é fonte.
 */
export const RECURSOS = doAmbiente("KORA_RECURSOS") ?? NO_REPOSITORIO;
