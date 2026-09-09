import { useEffect, useRef, useState } from "react";

import { traduzir } from "../i18n/traduzir.js";
import { useTraducao } from "../i18n/useTraducao.js";
import "./BarraDeSessao.css";

/**
 * O topo do painel, sempre visível. Mostra o estado da live, do jogo e da
 * sessão numa olhada só (02_DESIGN_SYSTEM, seção A) e é onde o streamer
 * decide quando a live passa a valer de verdade (F1, F5, F6, F7).
 *
 * Só React. Nenhuma chamada de rede: tudo chega por prop, tudo sai por
 * callback (`aoIniciar`, `aoParar`, `aoTrocarPreset`). Ver CLAUDE.md.
 */

const TEMPO_DE_CONFIRMACAO_MS = 5000;

/** Cronômetro como o streamer lê de canto de olho: inteiro, sem casas. */
function formatarDecorrido(ms) {
  if (!Number.isFinite(ms) || ms < 0) return traduzir("common.value.none");
  const totalSegundos = Math.floor(ms / 1000);
  const horas = Math.floor(totalSegundos / 3600);
  const minutos = Math.floor((totalSegundos % 3600) / 60);
  const segundos = totalSegundos % 60;
  const dois = (n) => String(n).padStart(2, "0");
  return horas > 0 ? `${horas}:${dois(minutos)}:${dois(segundos)}` : `${dois(minutos)}:${dois(segundos)}`;
}

/**
 * `estado.live` (ver ADR-002 / conector da live) para pastilha + destaque.
 * F6 é explícito: "reconectando" é o estado que mais importa aparecer.
 */
function descreverLive(live) {
  if (live === "conectada")
    return { texto: traduzir("panel.sessionBar.liveConnected"), classe: "pastilha-ok", destaque: false };
  if (live === "conectando")
    return { texto: traduzir("panel.sessionBar.liveConnecting"), classe: "pastilha-atencao", destaque: false };
  if (live === "reconectando")
    return { texto: traduzir("panel.sessionBar.liveReconnecting"), classe: "pastilha-erro", destaque: true };
  return { texto: traduzir("panel.sessionBar.liveOff"), classe: "", destaque: false };
}

/**
 * `estado.jogo` só vira alarme (vermelho, em destaque) enquanto uma sessão
 * está rodando: é aí que F7 diz que presente chegando é descartado sem
 * acumular. Antes do Start, "offline" é só o estado de repouso — mostrar em
 * vermelho seria alarme falso o painel inteiro exibe assim que abre.
 */
function descreverJogo(jogo, sessaoRodando) {
  if (jogo === "online")
    return { texto: traduzir("panel.sessionBar.gameOnline"), classe: "pastilha-ok", destaque: false };
  if (jogo === "offline") {
    return sessaoRodando
      ? { texto: traduzir("panel.sessionBar.gameOffline"), classe: "pastilha-erro", destaque: true }
      : { texto: traduzir("panel.sessionBar.gameOffline"), classe: "", destaque: false };
  }
  return { texto: traduzir("panel.sessionBar.gameUnknown"), classe: "", destaque: false };
}

function classesPastilha({ classe, destaque }) {
  return ["pastilha", classe, destaque ? "pastilha-destaque" : ""].filter(Boolean).join(" ");
}

export function BarraDeSessao({
  estado,
  sessao,
  presets,
  presetId,
  cenarios,
  iniciando,
  trocandoPreset,
  aoIniciar,
  aoParar,
  aoTrocarPreset,
}) {
  const { t } = useTraducao();
  const listaDePresets = presets ?? [];
  const listaDeCenarios = cenarios ?? [];

  // Fonte de verdade é o SSE (`estado.sessao`). Antes da primeira mensagem
  // chegar (`estado` ainda `null`, ver useFluxo), cai para o instantâneo REST
  // (`sessao`) para não piscar "parada" por engano na abertura do painel.
  const sessaoRodando = estado ? estado.sessao === "rodando" : Boolean(sessao && !sessao.encerradaEm);
  const bloqueadoParaEditar = sessaoRodando || Boolean(iniciando);
  // R7 é explícito: "trocar de preset no meio da sessão é permitido e vale a
  // partir do próximo evento". O seletor de preset era o único controle desta
  // barra travado sem regra que mandasse travar — o que ele NÃO pode é aceitar
  // troca durante o start, que é quando a ponte ainda está conectando na live.
  const bloqueadoParaTrocarPreset = Boolean(iniciando) || Boolean(trocandoPreset);

  const [cenarioEscolhido, definirCenarioEscolhido] = useState("");
  const [confirmandoParar, definirConfirmandoParar] = useState(false);
  const [agora, definirAgora] = useState(() => Date.now());
  const temporizador = useRef(null);

  const limparTemporizador = () => {
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
  };

  // Cronômetro: só corre com a sessão rodando, e recalcula "agora" no
  // instante em que ela começa a rodar — sem isso o primeiro segundo exibido
  // seria um valor obsoleto, de antes do Start.
  useEffect(() => {
    if (!sessaoRodando) return undefined;
    definirAgora(Date.now());
    const id = setInterval(() => definirAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sessaoRodando]);

  // Sessão parou por qualquer motivo (Stop confirmado, queda etc.): nenhuma
  // confirmação de Stop deveria continuar armada esperando um segundo clique.
  useEffect(() => {
    if (!sessaoRodando) {
      limparTemporizador();
      definirConfirmandoParar(false);
    }
  }, [sessaoRodando]);

  useEffect(() => limparTemporizador, []);

  const decorridoMs = sessao?.iniciadaEm ? agora - new Date(sessao.iniciadaEm).getTime() : NaN;

  const live = descreverLive(estado?.live);
  const jogo = descreverJogo(estado?.jogo, sessaoRodando);

  const aoClicarIniciar = () => {
    if (bloqueadoParaEditar || !presetId) return;
    aoIniciar(presetId, cenarioEscolhido || null);
  };

  const aoClicarParar = () => {
    if (!confirmandoParar) {
      definirConfirmandoParar(true);
      temporizador.current = setTimeout(() => definirConfirmandoParar(false), TEMPO_DE_CONFIRMACAO_MS);
      return;
    }
    limparTemporizador();
    definirConfirmandoParar(false);
    aoParar();
  };

  const aoCancelarParar = () => {
    limparTemporizador();
    definirConfirmandoParar(false);
  };

  return (
    <div className="barra-sessao">
      <div className="barra-sessao-estados" role="status" aria-live="polite">
        <span className={classesPastilha(live)}>{live.texto}</span>
        <span className={classesPastilha(jogo)}>{jogo.texto}</span>
        <span className={`pastilha ${sessaoRodando ? "pastilha-ok" : ""}`}>
          {sessaoRodando
            ? t("panel.sessionBar.sessionRunning", { time: formatarDecorrido(decorridoMs) })
            : t("panel.sessionBar.sessionStopped")}
        </span>
      </div>

      {(estado?.live === "reconectando" || (sessaoRodando && estado?.jogo === "offline")) && (
        <div className="barra-sessao-avisos">
          {estado?.live === "reconectando" && (
            <p className="barra-sessao-aviso">{t("panel.sessionBar.liveReconnectingWarning")}</p>
          )}
          {sessaoRodando && estado?.jogo === "offline" && (
            <p className="barra-sessao-aviso">{t("panel.sessionBar.gameOfflineWarning")}</p>
          )}
        </div>
      )}

      <div className="barra-sessao-controles">
        <label className="barra-sessao-campo">
          <span className="secundario">
            {t("panel.sessionBar.presetLabel")}
            {sessaoRodando && (
              <span className="barra-sessao-nota-inline">
                {trocandoPreset
                  ? t("panel.sessionBar.presetSwitching")
                  : t("panel.sessionBar.presetFromNextGift")}
              </span>
            )}
          </span>
          <select
            value={presetId ?? ""}
            onChange={(evento) => aoTrocarPreset(evento.target.value)}
            disabled={bloqueadoParaTrocarPreset || listaDePresets.length === 0}
          >
            {listaDePresets.length === 0 && <option value="">{t("panel.sessionBar.noPresetSaved")}</option>}
            {listaDePresets.length > 0 && !presetId && (
              <option value="">{t("panel.sessionBar.choosePreset")}</option>
            )}
            {listaDePresets.map((preset) => (
              <option key={preset.presetId} value={preset.presetId}>
                {preset.nome}
              </option>
            ))}
          </select>
        </label>

        {listaDeCenarios.length > 0 && (
          <label className="barra-sessao-campo barra-sessao-teste">
            <span className="barra-sessao-teste-rotulo">{t("panel.sessionBar.testModeLabel")}</span>
            <select
              value={cenarioEscolhido}
              onChange={(evento) => definirCenarioEscolhido(evento.target.value)}
              disabled={bloqueadoParaEditar}
            >
              <option value="">{t("panel.sessionBar.noScenario")}</option>
              {listaDeCenarios.map((nome) => (
                <option key={nome} value={nome}>
                  {nome}
                </option>
              ))}
            </select>
          </label>
        )}

        {!sessaoRodando ? (
          <div className="barra-sessao-acao">
            <button
              type="button"
              className={`barra-sessao-botao ${cenarioEscolhido ? "barra-sessao-botao--teste" : "barra-sessao-botao--iniciar"}`}
              onClick={aoClicarIniciar}
              disabled={bloqueadoParaEditar || !presetId}
            >
              {iniciando
                ? t("panel.sessionBar.starting")
                : cenarioEscolhido
                  ? t("panel.sessionBar.startTest")
                  : t("panel.sessionBar.startLive")}
            </button>
            <span className="secundario barra-sessao-nota">
              {cenarioEscolhido ? t("panel.sessionBar.testNote") : t("panel.sessionBar.startNote")}
            </span>
          </div>
        ) : (
          <div className="barra-sessao-acao">
            <button
              type="button"
              className={`barra-sessao-botao ${confirmandoParar ? "barra-sessao-botao--confirmar" : "barra-sessao-botao--parar"}`}
              onClick={aoClicarParar}
            >
              {confirmandoParar ? t("panel.sessionBar.confirmStop") : t("panel.sessionBar.stop")}
            </button>
            {confirmandoParar && (
              <button type="button" className="barra-sessao-botao barra-sessao-botao--cancelar" onClick={aoCancelarParar}>
                {t("common.action.cancel")}
              </button>
            )}
            <span className="secundario barra-sessao-nota">{t("panel.sessionBar.stopNote")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
