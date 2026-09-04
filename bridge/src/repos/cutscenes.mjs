/**
 * As cutscenes em disco: quais existem, e onde o streamer as põe.
 *
 * A PASTA é a lista (ADR-014). Não há cadastro: pôr um `.mp4` ou `.webm` em
 * `data/cutscenes/` basta para ele aparecer no painel e poder ser escolhido no
 * preset. O id da cutscene é o nome do arquivo sem extensão, e precisa passar
 * no `identificador` de `comuns.schema.json` — minúsculas, números e hífen —
 * porque vira pedaço de URL (`/overlay/video/:id`) e campo de preset. Arquivo fora
 * do padrão não é erro: volta como ignorado, para o painel dizer POR QUE ele
 * não está na lista.
 *
 * Existe como repositório e não dentro de `http/overlay.mjs` porque o ADR-003 é
 * sobre o DIRETÓRIO, não sobre quem pergunta: quem toca `data/` é `repos/`, e
 * duas superfícies precisam da mesma resposta — o overlay, para servir o vídeo,
 * e o painel, para oferecer a lista e dizer se o escolhido ainda está lá.
 *
 * Dizer se está lá é o ponto. A cutscene falha CALADA: o OBS mostra um
 * retângulo transparente, o `<video>` não reclama, e da live não se distingue
 * "o arquivo não existe" de "a rodada não acabou ainda". O painel existe para
 * essa diferença ser visível antes da live, não durante.
 */

import { abrirParaStream, caminhoDeDados, garantirDiretorio, listarArquivos } from "./arquivo.mjs";

/** Onde o arquivo mora, para o painel poder dizer o caminho por extenso. */
export const PASTA_DAS_CUTSCENES = "data/cutscenes";

/** O que o `<video>` do Chromium embutido no OBS toca sem plugin. */
const EXTENSOES = new Map([
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
]);

/** Espelha `identificador` de comuns.schema.json. É o que impede `..` de virar caminho. */
export const ID_DE_CUTSCENE = /^[a-z0-9][a-z0-9-]*$/;

/** "vitoria.mp4" → { id: "vitoria", extensao: ".mp4" }. Sem ponto, extensão vazia. */
function separar(nome) {
  const ponto = nome.lastIndexOf(".");
  if (ponto <= 0) return { id: nome, extensao: "" };
  return { id: nome.slice(0, ponto), extensao: nome.slice(ponto) };
}

/**
 * O arquivo aberto para leitura em trechos, com o `tipo` para o content-type,
 * ou `null` se não existir. Id fora do padrão é `null` também — nunca chega ao
 * disco, então `../` não tem como sair da pasta.
 *
 * Com `.mp4` e `.webm` do mesmo nome, o `.mp4` ganha: é a ordem de EXTENSOES,
 * e é a mesma que `listarCutscenes` usa para ficar com um só dos dois.
 */
export async function abrirCutscene(id) {
  if (typeof id !== "string" || !ID_DE_CUTSCENE.test(id)) return null;
  for (const [extensao, tipo] of EXTENSOES) {
    const fonte = await abrirParaStream(caminhoDeDados("cutscenes", `${id}${extensao}`));
    if (fonte) return { ...fonte, tipo, arquivo: `${id}${extensao}` };
  }
  return null;
}

/**
 * O que há na pasta, para o painel: `{ pasta, cutscenes, ignorados }`.
 *
 * Garante a pasta antes de listar. O `.gitignore` não versiona os vídeos, então
 * numa máquina nova ela não existe — e "ponha o vídeo em data/cutscenes/" só
 * ajuda se houver um data/cutscenes/ para abrir.
 */
export async function listarCutscenes() {
  const dir = caminhoDeDados("cutscenes");
  await garantirDiretorio(dir);

  const cutscenes = [];
  const ignorados = [];
  const vistos = new Set();
  for (const nome of await listarArquivos(dir)) {
    const { id, extensao } = separar(nome);
    const tipo = EXTENSOES.get(extensao);
    // Repetido é o segundo arquivo com o mesmo id em outra extensão: a lista
    // vem ordenada, então `.mp4` chega antes de `.webm` — igual a abrirCutscene.
    if (!tipo || !ID_DE_CUTSCENE.test(id) || vistos.has(id)) {
      ignorados.push(nome);
      continue;
    }
    vistos.add(id);
    const fonte = await abrirParaStream(caminhoDeDados("cutscenes", nome));
    cutscenes.push({
      id,
      arquivo: nome,
      caminho: `${PASTA_DAS_CUTSCENES}/${nome}`,
      bytes: fonte ? fonte.tamanho : 0,
      tipo,
    });
  }
  return { pasta: PASTA_DAS_CUTSCENES, cutscenes, ignorados };
}
