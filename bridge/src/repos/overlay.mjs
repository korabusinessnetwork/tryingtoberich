/**
 * O layout do overlay: a cena que o streamer montou no Estúdio de Overlay.
 *
 * Único ponto de `fs` do assunto (ADR-003). Mora em disco e não no `.env`
 * porque é gosto de PRODUTO — onde ele quer o placar na tela dele — e porque
 * precisa sobreviver ao reinício da ponte: o OBS fica aberto, e recarregar a
 * fonte no meio da live é o tipo de coisa que ninguém faz.
 *
 * O arquivo guarda EXCEÇÃO, nunca o layout inteiro. Ausência é o caso normal:
 * quem nunca abriu o estúdio não tem arquivo, e `carregarLayout` devolve o
 * layout vazio em vez de erro — a página do OBS não pode ficar em branco
 * porque um recurso opcional nunca foi usado.
 */

import { ErroDeDominio } from "../erros.mjs";
import { log } from "../log.mjs";
import { LAYOUT_VAZIO, idsDoOverlay } from "../dominio/overlay-layout.mjs";
import { caminhoDeDados, escreverJsonAtomico, lerJsonOuPadrao } from "./arquivo.mjs";
import { criarValidador } from "./schemas.mjs";

const ARQUIVO = () => caminhoDeDados("overlay-layout.json");

/** Objeto de elemento sem campo nenhum — o "voltar ao padrão" do estúdio. */
const semExcecao = (campos) =>
  campos !== null && typeof campos === "object" && !Array.isArray(campos) && Object.keys(campos).length === 0;

/**
 * O que está gravado, ou o layout vazio. Nunca lança por arquivo ausente.
 *
 * Chave que não está mais no catálogo é DESCARTADA na leitura — a mesma
 * tolerância que a página do OBS já tem, que só percorre os `data-el` que
 * existem. Sem isto o painel é quem paga: ele carrega o objeto inteiro para o
 * estado e o devolve no próximo PUT, então um id velho (ou uma edição a mão,
 * que o ADR-003 prevê) faria TODO "Salvar" responder 400 sem nada na tela
 * dizer qual chave é a culpada — e a única saída seria "voltar ao padrão",
 * que joga a cena boa fora junto.
 */
export async function carregarLayout() {
  const doDisco = await lerJsonOuPadrao(ARQUIVO());
  if (!doDisco || typeof doDisco !== "object") return LAYOUT_VAZIO();

  const conhecidos = new Set(idsDoOverlay());
  const elementos = {};
  for (const [id, campos] of Object.entries(doDisco.elementos ?? {})) {
    if (conhecidos.has(id)) elementos[id] = campos;
    else log.aviso("elemento_do_overlay_desconhecido", { id });
  }
  return { ...LAYOUT_VAZIO(doDisco.streamerId), ...doDisco, elementos };
}

/**
 * Grava o layout INTEIRO: o estúdio é dono do palco todo e manda tudo de uma vez.
 *
 * Diferente do `salvarConfiguracao`, que é parcial de propósito — lá dois
 * caminhos independentes escrevem no mesmo arquivo. Aqui há um só, e um salvar
 * parcial tornaria impossível apagar uma exceção: mandar o elemento de volta ao
 * padrão é justamente mandá-lo ausente.
 *
 * Elemento com objeto vazio é DESCARTADO antes de validar. É o que faz o botão
 * "voltar ao padrão" virar ausência no arquivo em vez de uma linha que repete o
 * CSS — e é o que permite mudar o padrão da página depois sem cada instalação
 * ficar congelada no padrão do dia em que abriu o estúdio.
 */
export async function salvarLayout(mudancas = {}, { streamerId } = {}) {
  const entrada = mudancas?.elementos ?? {};
  const elementos = {};
  for (const [id, campos] of Object.entries(entrada)) {
    // O que não é objeto vazio passa adiante mesmo se for lixo: quem recusa é o
    // schema, com o nome do campo errado, e não um `if` mudo aqui.
    if (!semExcecao(campos)) elementos[id] = campos;
  }

  const proximo = {
    // Sem cair no `mudancas.streamerId`: quem preenche o tenant é a rota, e um
    // segundo caminho para o mesmo valor entrar é o que fazia o corpo do painel
    // conseguir gravar o tenant que quisesse.
    streamerId: streamerId ?? LAYOUT_VAZIO().streamerId,
    atualizadoEm: new Date().toISOString(),
    elementos,
  };

  const { validar } = await criarValidador();
  const problemas = validar("overlay-layout", proximo);
  if (problemas.length) {
    throw new ErroDeDominio(
      "layout_invalido",
      `Layout fora do contrato: ${problemas.join("; ")}`,
      { status: 400 },
    );
  }

  await escreverJsonAtomico(ARQUIVO(), proximo);
  return proximo;
}
