import { Fragment, useCallback, useEffect, useState } from "react";

import { useTraducao } from "../i18n/useTraducao.js";
import { api } from "../lib/api.js";
import "./PainelDeOverlay.css";

/**
 * A aba de overlay: o que o streamer cola no OBS ou no TikTok LIVE Studio.
 *
 * São DUAS fontes de navegador, na mesma porta do painel:
 *
 *   - as cutscenes de vitória e derrota (ADR-014), que tocam o vídeo quando a
 *     rodada acaba;
 *   - o HUD da live (ADR-015): placar, legenda dos presentes, a barra "VS" da
 *     disputa, portal, contagem regressiva e o aviso de seguidor. O ranking de
 *     doadores e o pote de moedas saíram por risco de restrição na live, e a
 *     barra da torre voltou para dentro do jogo, onde ela anda a cada degrau.
 *
 * Elas já funcionavam do lado da ponte — o que faltava era um lugar que
 * dissesse a URL. "Abre uma fonte de navegador apontando para ..." não é
 * coisa que se guarde de cabeça entre uma live e outra.
 *
 * A aba faz três coisas, e a terceira importa mais:
 *
 *   1. mostra e copia as URLs;
 *   2. lista os vídeos que estão na pasta — a pasta É a lista (ADR-014);
 *   3. diz se o vídeo que o preset ativo escolheu ESTÁ lá.
 *
 * A cutscene falha calada. Sem o arquivo, o OBS mostra um retângulo
 * transparente, o `<video>` não reclama com ninguém e, do lado de fora, "não
 * apareceu nada" é indistinguível de "a rodada não acabou ainda". Descobrir
 * isso no meio da live é tarde; esta tela é onde se descobre antes.
 *
 * Qual vídeo toca em cada resultado não se escolhe aqui: é do preset, em
 * "Presentes de placar", junto dos presentes que provocam cada um.
 *
 * As URLs vêm com `.html` no fim porque a fonte "Link" do LIVE Studio recusa
 * URL sem um `algo.letras` no texto, e `127.0.0.1` não tem. Quem monta a URL
 * é a ponte; aqui só se mostra e copia.
 */

/**
 * Costura de volta o texto traduzido que tem destaque no meio.
 *
 * O catálogo guarda a frase INTEIRA com `{marca}` onde entra o `<strong>`, o
 * `<code>` ou o nome do arquivo — quem traduz lê a frase toda, e a tela não é
 * montada com pedaço de frase concatenado. Marca sem nó correspondente fica
 * como veio, em vez de sumir sem aviso. Mesmo padrão do `EditorDePlacar`.
 */
function comMarcadores(texto, nos) {
  return texto.split(/(\{\w+\})/g).map((pedaco, indice) => {
    const marca = /^\{(\w+)\}$/.exec(pedaco);
    if (!marca || nos[marca[1]] === undefined) return pedaco;
    return <Fragment key={indice}>{nos[marca[1]]}</Fragment>;
  });
}

export function PainelDeOverlay() {
  const { t } = useTraducao();
  const [dados, definirDados] = useState(null);
  const [erro, definirErro] = useState(null);
  const [copiada, definirCopiada] = useState(null);

  const carregar = useCallback(async () => {
    try {
      definirErro(null);
      definirDados(await api.overlay());
    } catch (falha) {
      definirErro(falha.message);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const copiar = useCallback(async (chave) => {
    const url = dados?.[chave];
    if (!url) return;
    try {
      // `navigator.clipboard` não existe fora de contexto seguro, e o painel
      // roda em http://127.0.0.1 — que os navegadores tratam COMO seguro. Ainda
      // assim o try/catch fica: recusa de permissão é decisão do usuário, e não
      // pode virar erro vermelho numa tela que está funcionando.
      await navigator.clipboard.writeText(url);
      definirCopiada(chave);
      setTimeout(() => definirCopiada(null), 2000);
    } catch {
      definirCopiada(null);
    }
  }, [dados]);

  const resultados = [
    ["vitoria", t("panel.overlayPanel.winLabel")],
    ["derrota", t("panel.overlayPanel.lossLabel")],
  ];

  const fontes = [
    {
      chave: "url",
      titulo: t("panel.overlayPanel.cutscenesTitle"),
      descricao: t("panel.overlayPanel.cutscenesDescription"),
    },
    {
      chave: "urlHud",
      titulo: t("panel.overlayPanel.hudTitle"),
      descricao: t("panel.overlayPanel.hudDescription"),
    },
  ];

  /** Os ajustes do HUD viajam na própria URL: cada cena tem uma proporção de cam. */
  const parametrosDoHud = [
    ["?cam=33", t("panel.overlayPanel.camParam")],
    ["?esticar=nao", t("panel.overlayPanel.stretchParam")],
  ];

  if (erro) {
    return (
      <section className="overlay">
        <p className="pastilha pastilha-erro">{erro}</p>
        <button type="button" onClick={carregar}>{t("common.action.retry")}</button>
      </section>
    );
  }

  if (!dados) {
    return (
      <section className="overlay">
        <p className="overlay-vazio">{t("common.state.loading")}</p>
      </section>
    );
  }

  const naPasta = dados.cutscenes ?? [];
  const ignorados = dados.ignorados ?? [];
  const emUso = dados.emUso ?? {};
  const pasta = dados.pasta ?? "data/cutscenes";
  const sumidas = resultados.filter(([qual]) => emUso[qual]?.id && !emUso[qual].existe);

  return (
    <section className="overlay">
      <header className="overlay-cabecalho">
        <h2 className="overlay-titulo">{t("panel.overlayPanel.title")}</h2>
        <span className="overlay-etiqueta">
          {t("panel.overlayPanel.sourceCount", { n: fontes.length })}
        </span>
      </header>

      <p className="overlay-explicacao">{t("panel.overlayPanel.intro")}</p>

      <ul className="overlay-fontes">
        {fontes.map(({ chave, titulo, descricao }) => (
          <li key={chave} className="overlay-fonte">
            <span className="overlay-fonte-titulo">{titulo}</span>
            <p className="overlay-fonte-descricao">{descricao}</p>
            <div className="overlay-url">
              <code className="overlay-endereco">{dados[chave] ?? t("common.value.none")}</code>
              <button type="button" className="overlay-copiar" onClick={() => copiar(chave)}>
                {copiada === chave ? t("panel.overlayPanel.copied") : t("panel.overlayPanel.copy")}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <ol className="overlay-passos">
        <li>
          {comMarcadores(t("panel.overlayPanel.stepObs"), {
            action: <strong>{t("panel.overlayPanel.stepObsAction")}</strong>,
          })}
        </li>
        <li>
          {comMarcadores(t("panel.overlayPanel.stepLiveStudio"), {
            action: <strong>{t("panel.overlayPanel.stepLiveStudioAction")}</strong>,
            ext: <code>.html</code>,
          })}
        </li>
        <li>{t("panel.overlayPanel.stepSize")}</li>
        <li>
          {comMarcadores(t("panel.overlayPanel.stepOrder"), {
            above: <strong>{t("panel.overlayPanel.stepOrderWord")}</strong>,
          })}
        </li>
        <li>{t("panel.overlayPanel.stepAlwaysOn")}</li>
      </ol>

      <p className="overlay-explicacao">
        {comMarcadores(t("panel.overlayPanel.studioHint"), {
          studio: <strong>{t("panel.overlayPanel.studioPageName")}</strong>,
        })}
      </p>

      <h3 className="overlay-subtitulo">{t("panel.overlayPanel.hudParamsTitle")}</h3>
      <ul className="overlay-parametros">
        {parametrosDoHud.map(([parametro, efeito]) => (
          <li key={parametro} className="overlay-parametro">
            <code className="overlay-parametro-chave">{parametro}</code>
            <span className="overlay-parametro-efeito">{efeito}</span>
          </li>
        ))}
      </ul>

      <h3 className="overlay-subtitulo">{t("panel.overlayPanel.inUseTitle")}</h3>
      <ul className="overlay-arquivos">
        {resultados.map(([qual, rotulo]) => {
          const escolha = emUso[qual] ?? { id: null, existe: false };
          const situacao = !escolha.id ? "nenhuma" : escolha.existe ? "ok" : "falta";
          return (
            <li key={qual} className="overlay-arquivo">
              <span className={`overlay-marca overlay-marca-${situacao}`} aria-hidden="true" />
              <span className="overlay-arquivo-nome">{rotulo}</span>
              <code className="overlay-arquivo-caminho">{escolha.id ?? t("common.value.none")}</code>
              {/* Texto junto da cor, nunca cor sozinha (02_DESIGN_SYSTEM). */}
              <span className="overlay-arquivo-estado">
                {situacao === "nenhuma" && t("panel.overlayPanel.stateNone")}
                {situacao === "ok" && t("panel.overlayPanel.stateOk")}
                {situacao === "falta" && t("panel.overlayPanel.stateMissing")}
              </span>
            </li>
          );
        })}
      </ul>

      <h3 className="overlay-subtitulo">{t("panel.overlayPanel.folderTitle", { pasta })}</h3>
      {naPasta.length === 0 ? (
        <p className="overlay-vazio">
          {comMarcadores(t("panel.overlayPanel.emptyFolder"), {
            mp4: <code>.mp4</code>,
            webm: <code>.webm</code>,
            pasta: <code>{pasta}</code>,
          })}
        </p>
      ) : (
        <ul className="overlay-arquivos">
          {naPasta.map((cutscene) => (
            <li key={cutscene.id} className="overlay-arquivo">
              <span className="overlay-marca overlay-marca-ok" aria-hidden="true" />
              <span className="overlay-arquivo-nome">{cutscene.id}</span>
              <code className="overlay-arquivo-caminho">{cutscene.caminho}</code>
              <span className="overlay-arquivo-estado">
                {t("panel.overlayPanel.fileSize", { n: Math.round(cutscene.bytes / 1024 / 1024) })}
              </span>
            </li>
          ))}
        </ul>
      )}

      {ignorados.length > 0 ? (
        <p className="overlay-explicacao">
          {comMarcadores(t("panel.overlayPanel.ignoredFiles"), {
            lista: ignorados.join(", "),
            mp4: <code>.mp4</code>,
            webm: <code>.webm</code>,
          })}
        </p>
      ) : null}

      {sumidas.length > 0 ? (
        <p className="pastilha pastilha-atencao overlay-aviso">
          {t("panel.overlayPanel.missingWarning")}
        </p>
      ) : null}

      <button type="button" className="overlay-recarregar" onClick={carregar}>
        {t("panel.overlayPanel.recheck")}
      </button>
    </section>
  );
}
