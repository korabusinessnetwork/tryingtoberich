import { Fragment, useMemo } from "react";

import { useTraducao } from "../i18n/useTraducao.js";
import { listaDePresentes, opcoesDeCutscene } from "../lib/regras.js";
import "./EditorDePlacar.css";

/**
 * O fim de rodada, visto do preset: para cada resultado, a CUTSCENE que o
 * overlay do OBS toca e os PRESENTES que o provocam.
 *
 * Agrupado por resultado de propósito. A versão anterior punha as duas
 * decisões em listas separadas — "animação de vitória" em cima, uma lista
 * plana de presentes com um botão Vitória/Derrota embaixo — e a tela lia como
 * "o presente da vitória é a Fênix". São a mesma pergunta, "o que acontece
 * quando o streamer vence?", vista de dois lados, e ficam juntas.
 *
 * A cutscene é um VÍDEO em `data/cutscenes/`, não uma animação da biblioteca
 * (ADR-014): o Roblox não aceita vídeo, e o espetáculo de fim de rodada é do
 * overlay, por cima da captura. A pasta é a lista — pôr o arquivo lá basta.
 *
 * Os presentes vivem na lista `placar` do preset, separada dos 6 slots
 * (ADR-007): presente de vitória não pode custar um slot de subida. O mesmo
 * presente não pode estar aqui E num slot — a ponte recusa antes de salvar
 * (R1.4) — e por isso os que já estão em slot não aparecem para escolher.
 */

/** Espelha `Tipos.VIDA_PADRAO_DO_PORTAL` no jogo e `VIDA_PADRAO_DO_PORTAL` na ponte. */
const VIDA_PADRAO_DO_PORTAL = 2000;

/** `rotulo` e `quando` guardam CHAVE de texto, resolvida no render pelo `t()`. */
const RESULTADOS = [
  {
    efeito: "vitoria",
    campo: "cutsceneDeVitoria",
    rotulo: "panel.scoreEditor.winLabel",
    quando: "panel.scoreEditor.winWhen",
  },
  {
    efeito: "derrota",
    campo: "cutsceneDeDerrota",
    rotulo: "panel.scoreEditor.lossLabel",
    quando: "panel.scoreEditor.lossWhen",
  },
];

/**
 * Costura de volta o texto traduzido que tem destaque no meio.
 *
 * O catálogo guarda a frase INTEIRA com `{marca}` onde entra o `<strong>` ou o
 * `<code>` — quem traduz lê a frase toda, e a tela não é montada com pedaço de
 * frase concatenado. Marca sem nó correspondente fica como veio, em vez de
 * sumir sem aviso.
 */
function comMarcadores(texto, nos) {
  return texto.split(/(\{\w+\})/g).map((pedaco, indice) => {
    const marca = /^\{(\w+)\}$/.exec(pedaco);
    if (!marca || nos[marca[1]] === undefined) return pedaco;
    return <Fragment key={indice}>{nos[marca[1]]}</Fragment>;
  });
}

export function EditorDePlacar({
  preset, catalogo, presenteIdsEmSlot, cutscenes,
  aoAdicionar, aoRemover, aoEscolherCutscene, aoRecarregarCutscenes, aoMudarPortal,
}) {
  const { t } = useTraducao();
  const presentes = useMemo(() => listaDePresentes(catalogo), [catalogo]);
  const porId = useMemo(
    () => new Map(presentes.map((p) => [String(p.presenteId), p])),
    [presentes],
  );

  const vinculos = preset?.placar ?? [];
  const usados = new Set(vinculos.map((v) => String(v.presenteId)));

  // Só o que ainda não está em lugar nenhum: nem aqui, nem nos 6 slots.
  const disponiveis = presentes.filter(
    (p) => !usados.has(String(p.presenteId)) && !presenteIdsEmSlot.has(String(p.presenteId)),
  );

  // `cutscenes` chega pronto via prop (nenhuma chamada de rede aqui). Nulo =
  // ainda não chegou; sem lista = falha; lista vazia = pasta vazia, que é o
  // caso normal de quem ainda não pôs vídeo nenhum — e precisa dizer isso.
  const carregando = cutscenes == null;
  const naPasta = Array.isArray(cutscenes?.cutscenes) ? cutscenes.cutscenes : [];
  const ignorados = Array.isArray(cutscenes?.ignorados) ? cutscenes.ignorados : [];
  const pasta = cutscenes?.pasta ?? "data/cutscenes";

  const nomeDe = (presenteId) => porId.get(String(presenteId))?.nome ?? String(presenteId);

  // Os pedaços marcados das frases com destaque. `.mp4` e `.webm` são extensão
  // de arquivo, não texto de tela: não traduzem.
  const nosDaPasta = {
    folder: <code>{pasta}</code>,
    mp4: <code>.mp4</code>,
    webm: <code>.webm</code>,
  };

  return (
    <section className="placar" aria-label={t("panel.scoreEditor.title")}>
      <header className="placar-cabecalho">
        <h2 className="placar-titulo">{t("panel.scoreEditor.title")}</h2>
        {/* Sem número: o preset vai até 24 slots (R1 emendada), e o 6 deixou de
            ser o que separa esta lista da grade de slots. */}
        <span className="placar-etiqueta">{t("panel.scoreEditor.badge")}</span>
      </header>

      <p className="placar-explicacao">
        {comMarcadores(t("panel.scoreEditor.explainer"), {
          loss: <strong>{t("panel.scoreEditor.explainerLossWord")}</strong>,
          cutscene: <strong>{t("panel.scoreEditor.explainerCutsceneWord")}</strong>,
        })}
      </p>

      {RESULTADOS.map(({ efeito, campo, rotulo, quando }) => {
        const escolhida = preset?.[campo] ?? null;
        const opcoes = opcoesDeCutscene(naPasta, escolhida);
        const sumiu = opcoes.some((opcao) => opcao.id === escolhida && opcao.ausente);
        const meus = vinculos.filter((vinculo) => vinculo.efeito === efeito);
        const idDoSelect = `placar-cutscene-${efeito}`;
        const rotuloTexto = t(rotulo);
        const rotuloMinusculo = rotuloTexto.toLowerCase();

        return (
          <div className={`placar-resultado placar-resultado-${efeito}`} key={efeito}>
            <header className="placar-resultado-cabecalho">
              <h3 className="placar-resultado-titulo">{rotuloTexto}</h3>
              <span className="placar-resultado-quando">{t(quando)}</span>
            </header>

            <div className="placar-campo">
              <label className="placar-rotulo" htmlFor={idDoSelect}>
                {t("panel.scoreEditor.cutsceneLabel")}
              </label>
              <select
                id={idDoSelect}
                className="placar-cutscene"
                value={escolhida ?? ""}
                disabled={carregando}
                onChange={(evento) => aoEscolherCutscene(campo, evento.target.value || null)}
              >
                <option value="">{t("panel.scoreEditor.cutsceneNone")}</option>
                {opcoes.map((opcao) => (
                  <option key={opcao.id} value={opcao.id}>
                    {opcao.ausente
                      ? t("panel.scoreEditor.cutsceneMissingOption", { file: opcao.arquivo })
                      : opcao.arquivo}
                  </option>
                ))}
              </select>
              {sumiu ? (
                <span className="placar-aviso">
                  {t("panel.scoreEditor.cutsceneGoneWarning", { folder: pasta })}
                </span>
              ) : null}
            </div>

            <div className="placar-campo">
              <span className="placar-rotulo">{t("panel.scoreEditor.giftsLabel")}</span>
              {meus.length === 0 ? (
                <span className="placar-presentes-vazio">
                  {t("panel.scoreEditor.noGiftsYet", { result: rotuloMinusculo })}
                </span>
              ) : (
                <ul
                  className="placar-presentes"
                  aria-label={t("panel.scoreEditor.giftsListLabel", { result: rotuloMinusculo })}
                >
                  {meus.map((vinculo) => (
                    <li className="placar-presente" key={vinculo.presenteId}>
                      <span className="placar-presente-nome">{nomeDe(vinculo.presenteId)}</span>
                      <button
                        type="button"
                        className="placar-remover"
                        aria-label={t("panel.scoreEditor.removeGiftLabel", {
                          gift: nomeDe(vinculo.presenteId),
                          result: rotuloMinusculo,
                        })}
                        onClick={() => aoRemover(vinculo.presenteId)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* O select some quando não há o que acrescentar: oferecer uma
                  lista vazia é pior que não oferecer nada. */}
              {disponiveis.length > 0 ? (
                <select
                  className="placar-adicionar"
                  value=""
                  aria-label={t("panel.scoreEditor.addGiftLabel", { result: rotuloMinusculo })}
                  onChange={(evento) => {
                    if (evento.target.value) aoAdicionar(evento.target.value, efeito);
                  }}
                >
                  <option value="">{t("panel.scoreEditor.addGiftPlaceholder")}</option>
                  {disponiveis.map((presente) => (
                    <option key={presente.presenteId} value={presente.presenteId}>
                      {presente.nome}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>
        );
      })}

      {/* De onde vêm os vídeos. Fica DEPOIS dos dois seletores porque é o
          rodapé deles: quem não achou o vídeo na lista lê aqui o motivo. */}
      <div className="placar-pasta">
        <span className="placar-pasta-texto">
          {carregando ? (
            t("panel.scoreEditor.searchingVideos")
          ) : naPasta.length === 0 ? (
            comMarcadores(t("panel.scoreEditor.noVideosInFolder"), nosDaPasta)
          ) : (
            comMarcadores(t("panel.scoreEditor.videosFromFolder"), nosDaPasta)
          )}
        </span>
        {aoRecarregarCutscenes ? (
          <button
            type="button"
            className="placar-pasta-recarregar"
            onClick={aoRecarregarCutscenes}
            disabled={carregando}
          >
            {t("panel.scoreEditor.searchAgain")}
          </button>
        ) : null}
        {ignorados.length > 0 ? (
          <span className="placar-pasta-ignorados">
            {t("panel.scoreEditor.ignoredFiles", { files: ignorados.join(", ") })}
          </span>
        ) : null}
      </div>

      {/*[[ A vida do portal fica AQUI, junto do que a gasta.

          Ela é a mesma disputa: o portal é o que segura a derrota, e o presente
          de derrota é o atalho que a compra. Separar os dois em telas
          diferentes esconderia que um é o preço do outro. ]]*/}
      {aoMudarPortal && (
        <div className="placar-portal">
          <label className="placar-portal-rotulo" htmlFor="placar-portal-vida">
            {t("panel.scoreEditor.portalHealthLabel")}
          </label>
          <input
            id="placar-portal-vida"
            className="placar-portal-campo"
            type="number"
            min="1"
            max="100000"
            step="100"
            value={preset?.portal?.vida ?? VIDA_PADRAO_DO_PORTAL}
            onChange={(evento) => {
              const valor = Number(evento.target.value);
              if (Number.isFinite(valor) && valor >= 1) aoMudarPortal(Math.round(valor));
            }}
          />
          <span className="placar-portal-dica">
            {comMarcadores(t("panel.scoreEditor.portalHint"), {
              unit: <strong>{t("panel.scoreEditor.portalHintUnit")}</strong>,
            })}
          </span>
        </div>
      )}
    </section>
  );
}
