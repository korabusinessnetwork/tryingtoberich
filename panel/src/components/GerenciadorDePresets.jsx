import { Fragment, useState } from "react";

import { useTraducao } from "../i18n/useTraducao.js";
import { idDePreset } from "../lib/regras.js";

import "./GerenciadorDePresets.css";

/**
 * Costura de volta o texto traduzido que tem destaque no meio.
 *
 * O catálogo guarda a frase INTEIRA com `{marca}` onde entra o `<code>` — quem
 * traduz lê a frase toda, e a tela não é montada com pedaço de frase
 * concatenado. Marca sem nó correspondente fica como veio, em vez de sumir sem
 * aviso.
 */
function comMarcadores(texto, nos) {
  return texto.split(/(\{\w+\})/g).map((pedaco, indice) => {
    const marca = /^\{(\w+)\}$/.exec(pedaco);
    if (!marca || nos[marca[1]] === undefined) return pedaco;
    return <Fragment key={indice}>{nos[marca[1]]}</Fragment>;
  });
}

/**
 * Criar, duplicar e apagar preset.
 *
 * Existe porque o painel sabia editar preset e não sabia criar um: numa
 * máquina limpa `data/presets/` está vazio, a barra de sessão mostra "Nenhum
 * preset salvo" e não havia saída pela tela — era rodar `npm run semear` ou
 * escrever o JSON à mão. A primeira coisa que o streamer faz não podia ser a
 * única que exigia terminal.
 *
 * **Duplicar** é o caminho mais usado depois do primeiro: montar os 6 slots dá
 * trabalho, e a live de sexta é a de quinta com dois presentes trocados.
 *
 * Apagar é em dois tempos, como o Stop da barra de sessão — e pelo mesmo
 * motivo de não usar `window.confirm`: diálogo nativo trava o navegador
 * inteiro num painel que fica aberto durante a live.
 */
export function GerenciadorDePresets({ presets, presetAtual, travado, salvando, aoCriar, aoDuplicar, aoApagar }) {
  const { t } = useTraducao();
  const lista = Array.isArray(presets) ? presets : [];

  const [nome, definirNome] = useState("");
  const [confirmandoApagar, definirConfirmandoApagar] = useState(false);

  const id = idDePreset(nome);
  const jaExiste = lista.some((preset) => preset.presetId === id);
  const podeCriar = id.length > 0 && !jaExiste && !salvando && !travado;

  const criar = () => {
    if (!podeCriar) return;
    aoCriar(nome.trim(), id);
    definirNome("");
  };

  const apagar = () => {
    if (!confirmandoApagar) {
      definirConfirmandoApagar(true);
      return;
    }
    definirConfirmandoApagar(false);
    aoApagar(presetAtual.presetId);
  };

  return (
    <section className="presets" aria-label={t("panel.presetManager.title")}>
      <header className="presets-cabecalho">
        <h2 className="presets-titulo">{t("panel.presetManager.title")}</h2>
        <span className="secundario presets-contagem">
          {lista.length === 1
            ? t("panel.presetManager.countOne")
            : t("panel.presetManager.countOther", { n: lista.length })}
        </span>
      </header>

      {travado && (
        <p className="presets-recado">{t("panel.presetManager.lockedNotice")}</p>
      )}

      <div className="presets-criar">
        <label className="presets-campo">
          <span className="secundario">{t("panel.presetManager.newLabel")}</span>
          <input
            type="text"
            value={nome}
            placeholder={t("panel.presetManager.newPlaceholder")}
            disabled={travado || salvando}
            onChange={(evento) => definirNome(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === "Enter") criar();
            }}
          />
        </label>

        <button type="button" className="presets-botao" onClick={criar} disabled={!podeCriar}>
          {t("panel.presetManager.createEmpty")}
        </button>

        <button
          type="button"
          className="presets-botao"
          onClick={() => aoDuplicar(presetAtual)}
          disabled={!presetAtual || travado || salvando}
          title={
            presetAtual
              ? t("panel.presetManager.duplicateHint", { name: presetAtual.nome })
              : t("panel.presetManager.duplicatePickFirst")
          }
        >
          {t("panel.presetManager.duplicateCurrent")}
        </button>
      </div>

      {/* O id aparece antes de criar, e não depois: ele vira nome de arquivo em
          disco (ADR-003) e é por ele que a ponte acha o preset. Mostrar só o
          nome bonito esconderia por que "Escalada #2" e "escalada-2" são a
          mesma coisa. */}
      {nome.trim().length > 0 && (
        <p className="presets-recado">
          {id.length === 0 ? (
            t("panel.presetManager.idEmpty")
          ) : jaExiste ? (
            comMarcadores(t("panel.presetManager.idTaken"), { id: <code>{id}</code> })
          ) : (
            comMarcadores(t("panel.presetManager.idPreview"), {
              id: <code>{id}</code>,
              folder: <code>data/presets/</code>,
            })
          )}
        </p>
      )}

      <div className="presets-perigo">
        <button
          type="button"
          className={confirmandoApagar ? "presets-apagar presets-apagar-confirmar" : "presets-apagar"}
          onClick={apagar}
          disabled={!presetAtual || travado || salvando}
        >
          {confirmandoApagar
            ? t("panel.presetManager.deleteConfirm", { name: presetAtual?.nome })
            : t("panel.presetManager.deleteCurrent")}
        </button>
        {confirmandoApagar && (
          <button
            type="button"
            className="presets-botao"
            onClick={() => definirConfirmandoApagar(false)}
          >
            {t("common.action.cancel")}
          </button>
        )}
      </div>
    </section>
  );
}
