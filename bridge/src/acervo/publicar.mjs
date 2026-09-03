/**
 * Encher o acervo sozinho: desenha o que falta, sobe e anota o assetId.
 *
 * O ADR-004 diz que o acervo é a alavanca de variedade e que montá-lo é
 * trabalho de véspera. Na prática ninguém montava: eram doze itens, cada um
 * pedindo criar a arte, subir no site, esperar a moderação, achar o número e
 * colar no painel. Onze dos doze ficaram em `pendente-upload` e todo mapa
 * gerado saía com o mesmo céu e a mesma rocha — o modelo escolhia entre um.
 *
 * Nada aqui contraria o ADR. A geração continua escolhendo de um inventário
 * fechado, e a moderação continua sendo do Roblox: o item entra em
 * `em-moderacao` e só vira `aprovado` quando eles disserem que sim.
 */

import { log } from "../log.mjs";
import { carregarAcervo, imagemDaPeca, salvarAcervo, FACES_DO_CEU } from "../repos/acervo.mjs";
import { desenharCeu, desenharTextura } from "./desenho.mjs";
import { STATUS_POR_MODERACAO } from "../roblox/publicador.mjs";

/** As duas coleções que passam por moderação, e como se desenha cada uma. */
const DESENHO_POR_COLECAO = {
  texturas: desenharTextura,
  skybox: desenharCeu,
};

/** As seis faces de um `Sky`. Vem do repositório: um lugar só as lista. */
const FACES = FACES_DO_CEU;

/** Item que ainda não tem número é item que o gerador não pode usar. */
const faltaSubir = (item) => !Number.isInteger(item.assetId);

/**
 * Roda a fila inteira. Devolve o relatório item a item — o painel mostra isso,
 * e é o relatório que diz por que um item continua fora do prompt.
 *
 * Não lança quando um item falha: a fila tem doze, e a décima segunda não pode
 * ser perdida porque a terceira deu erro de rede.
 */
export async function publicarAcervoPendente({
  publicador,
  agora = () => new Date().toISOString(),
  //[[ O acervo entra e sai por aqui, e não por importação direta.
  //
  // É o que permite testar sem tocar em `data/acervo.json`. A primeira versão
  // deste teste escrevia no arquivo de verdade e restaurava no fim — e o
  // `node --test` roda os arquivos em PARALELO: outro teste tirou o retrato do
  // acervo no instante em que ele estava zerado e "restaurou" o vazio. O
  // streamer só descobriu quando o mapa gerado veio sem céu e sem textura. ]]
  carregar = carregarAcervo,
  salvar = salvarAcervo,
} = {}) {
  const acervo = await carregar();
  const relatorio = [];
  let mudou = false;

  for (const [colecao, desenhar] of Object.entries(DESENHO_POR_COLECAO)) {
    for (const item of acervo[colecao] ?? []) {
      // Já tem número e já foi aprovado: nada a fazer. Só reconsulta o que
      // está esperando a moderação.
      if (Number.isInteger(item.assetId) && item.status === "aprovado") continue;

      if (!faltaSubir(item)) {
        const moderacao = await publicador.moderacaoDe(item.assetId);
        const status = STATUS_POR_MODERACAO[moderacao] ?? item.status;
        if (status !== item.status) {
          item.status = status;
          mudou = true;
        }
        relatorio.push({ colecao, id: item.id, acao: "reconsultado", status: item.status, assetId: item.assetId });
        continue;
      }

      try {
        const descricao = `Kora Stream Games — ${colecao} do acervo (${item.id}).`;
        const doStreamer = await imagemDaPeca(colecao, item.id);

        //[[ Céu de SEIS faces: seis uploads, um por face.
        //
        // Céu de verdade tem horizonte, e horizonte só existe com faces
        // distintas — uma imagem só nas seis põe a mesma linha no teto e no
        // chão da caixa. Se qualquer face falhar, a peça inteira fica de fora:
        // meio céu no ar seria pior que nenhum. ]]
        if (doStreamer?.faces) {
          const faces = {};
          //[[ O status do céu é o PIOR das seis faces.
          //
          // Marcar "aprovado" por conta própria seria inventar a decisão do
          // Roblox — e um céu com cinco faces liberadas e uma em análise entra
          // no mundo com um buraco. Basta uma face pendente para a peça inteira
          // esperar. ]]
          let pior = "aprovado";
          for (const face of FACES) {
            const { assetId, moderacao } = await publicador.publicar({
              nome: `${item.nome} (${face})`,
              descricao: `${descricao} Face ${face}.`,
              png: doStreamer.faces[face],
            });
            faces[face] = assetId;

            const status = STATUS_POR_MODERACAO[moderacao] ?? "em-moderacao";
            if (status === "rejeitado") pior = "rejeitado";
            else if (status !== "aprovado" && pior !== "rejeitado") pior = status;
          }

          item.faces = faces;
          item.assetId = faces.ft;
          item.status = pior;
          mudou = true;
          relatorio.push({ colecao, id: item.id, acao: "publicado", status: item.status, assetId: faces.ft, faces: FACES.length });
          continue;
        }

        const png = doStreamer?.png ?? desenhar(item);
        const { assetId, moderacao } = await publicador.publicar({ nome: item.nome, descricao, png });

        item.assetId = assetId;
        item.status = STATUS_POR_MODERACAO[moderacao] ?? "em-moderacao";
        mudou = true;
        relatorio.push({ colecao, id: item.id, acao: "publicado", status: item.status, assetId, bytes: png.length });
      } catch (erro) {
        log.aviso("acervo_item_nao_publicou", { colecao, id: item.id, motivo: erro.message });
        relatorio.push({ colecao, id: item.id, acao: "falhou", motivo: erro.message });
      }
    }
  }

  if (mudou) {
    acervo.atualizadoEm = agora();
    await salvar(acervo);
  }

  const aprovados = (lista) => (lista ?? []).filter((i) => i.status === "aprovado" && i.assetId).length;
  return {
    relatorio,
    resumo: {
      skyboxAprovados: aprovados(acervo.skybox),
      skyboxTotal: (acervo.skybox ?? []).length,
      texturasAprovadas: aprovados(acervo.texturas),
      texturasTotal: (acervo.texturas ?? []).length,
    },
  };
}
