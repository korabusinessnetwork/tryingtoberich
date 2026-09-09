import { useMemo, useState } from "react";

import { traduzir } from "../i18n/traduzir.js";
import { useTraducao } from "../i18n/useTraducao.js";
import { hora as horaNoLocale } from "../i18n/formatar.js";
import "./PainelDeLogs.css";

/**
 * O log da ponte e do painel, para quando algo falha.
 *
 * Ele existe porque hoje uma falha durante a live some: o aviso aparece por um
 * instante e o resto vai para o terminal do Node, atrás da janela do Studio e
 * do OBS. Quando o streamer percebe que os presentes pararam de chegar, não
 * sobrou nada para olhar.
 *
 * As linhas da ponte chegam pelo SSE. As do painel são geradas aqui mesmo,
 * porque a falha mais provável é a ponte cair — e aí o SSE cai junto, e o log
 * dela para de chegar exatamente quando seria mais útil.
 *
 * Nada aqui carrega nickname ou id de espectador: `log.mjs` higieniza antes de
 * qualquer destino, inclusive do buffer que alimenta esta tela.
 * Ver 11_SEGURANCA, camada 4.
 */

const NIVEIS = [
  { id: "todos", chave: "panel.logs.filterAll" },
  { id: "problemas", chave: "panel.logs.filterProblems" },
];

const CLASSE_DO_NIVEL = {
  erro: "log-linha-erro",
  aviso: "log-linha-aviso",
  info: "log-linha-info",
};

/** Só a hora: a data não ajuda em nada dentro de uma live que dura uma tarde. */
function hora(iso) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "--:--:--";
  return horaNoLocale(data, { hour12: false });
}

/**
 * O evento é um identificador curto (`live_caiu`, `mapa_rejeitado`). Vira frase
 * legível sem inventar tradução: troca separador por espaço e sobe a primeira.
 */
function legivel(evento) {
  const texto = String(evento ?? "").replace(/[_-]+/g, " ").trim();
  return texto ? texto[0].toUpperCase() + texto.slice(1) : traduzir("panel.logs.noEvent");
}

/** O que sobra da linha depois de tirar os campos que já viraram coluna. */
function detalhe(linha) {
  const { id, em, nivel, evento, origem, ...resto } = linha;
  const chaves = Object.keys(resto);
  if (chaves.length === 0) return null;
  return chaves.map((chave) => `${chave}: ${formatarValor(resto[chave])}`).join(" · ");
}

const formatarValor = (valor) =>
  typeof valor === "object" && valor !== null ? JSON.stringify(valor) : String(valor);

export function PainelDeLogs({ logs = [], aoLimpar }) {
  const { t } = useTraducao();
  const [filtro, definirFiltro] = useState("todos");

  const visiveis = useMemo(
    () => (filtro === "problemas" ? logs.filter((l) => l.nivel === "erro" || l.nivel === "aviso") : logs),
    [logs, filtro],
  );

  const problemas = useMemo(
    () => logs.filter((l) => l.nivel === "erro" || l.nivel === "aviso").length,
    [logs],
  );

  return (
    <section className="log" aria-label={t("panel.logs.regionLabel")}>
      <header className="log-cabecalho">
        <div className="log-filtros" role="group" aria-label={t("panel.logs.filterLabel")}>
          {NIVEIS.map((nivel) => (
            <button
              key={nivel.id}
              type="button"
              className={filtro === nivel.id ? "log-filtro log-filtro-ativo" : "log-filtro"}
              onClick={() => definirFiltro(nivel.id)}
              aria-pressed={filtro === nivel.id}
            >
              {nivel.id === "problemas" && problemas > 0
                ? t("panel.logs.filterProblemsCount", { n: problemas })
                : t(nivel.chave)}
            </button>
          ))}
        </div>

        <button type="button" className="log-limpar" onClick={aoLimpar} disabled={logs.length === 0}>
          {t("panel.logs.clear")}
        </button>
      </header>

      {visiveis.length === 0 ? (
        <p className="log-vazio secundario">
          {logs.length === 0 ? t("panel.logs.emptyState") : t("panel.logs.noProblems")}
        </p>
      ) : (
        <ol className="log-lista">
          {visiveis.map((linha) => (
            <li key={linha.id} className={`log-linha ${CLASSE_DO_NIVEL[linha.nivel] ?? ""}`}>
              <time className="log-hora" dateTime={linha.em}>{hora(linha.em)}</time>
              <span
                className="log-origem"
                title={linha.origem === "painel" ? t("panel.logs.sourcePanelTitle") : t("panel.logs.sourceBridgeTitle")}
              >
                {linha.origem === "painel" ? t("panel.logs.sourcePanel") : t("panel.logs.sourceBridge")}
              </span>
              <span className="log-evento">{legivel(linha.evento)}</span>
              {detalhe(linha) ? <span className="log-detalhe secundario">{detalhe(linha)}</span> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
