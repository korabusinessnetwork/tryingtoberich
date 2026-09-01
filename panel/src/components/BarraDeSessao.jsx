import { useEffect, useRef, useState } from "react";

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
  if (!Number.isFinite(ms) || ms < 0) return "—";
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
  if (live === "conectada") return { texto: "Live conectada", classe: "pastilha-ok", destaque: false };
  if (live === "conectando") return { texto: "Live conectando…", classe: "pastilha-atencao", destaque: false };
  if (live === "reconectando") return { texto: "Live reconectando…", classe: "pastilha-erro", destaque: true };
  return { texto: "Live desligada", classe: "", destaque: false };
}

/**
 * `estado.jogo` só vira alarme (vermelho, em destaque) enquanto uma sessão
 * está rodando: é aí que F7 diz que presente chegando é descartado sem
 * acumular. Antes do Start, "offline" é só o estado de repouso — mostrar em
 * vermelho seria alarme falso o painel inteiro exibe assim que abre.
 */
function descreverJogo(jogo, sessaoRodando) {
  if (jogo === "online") return { texto: "Jogo online", classe: "pastilha-ok", destaque: false };
  if (jogo === "offline") {
    return sessaoRodando
      ? { texto: "Jogo offline", classe: "pastilha-erro", destaque: true }
      : { texto: "Jogo offline", classe: "", destaque: false };
  }
  return { texto: "Jogo —", classe: "", destaque: false };
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
  aoIniciar,
  aoParar,
  aoTrocarPreset,
}) {
  const listaDePresets = presets ?? [];
  const listaDeCenarios = cenarios ?? [];

  // Fonte de verdade é o SSE (`estado.sessao`). Antes da primeira mensagem
  // chegar (`estado` ainda `null`, ver useFluxo), cai para o instantâneo REST
  // (`sessao`) para não piscar "parada" por engano na abertura do painel.
  const sessaoRodando = estado ? estado.sessao === "rodando" : Boolean(sessao && !sessao.encerradaEm);
  const bloqueadoParaEditar = sessaoRodando || Boolean(iniciando);

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
          {sessaoRodando ? `Sessão rodando · ${formatarDecorrido(decorridoMs)}` : "Sessão parada"}
        </span>
      </div>

      {(estado?.live === "reconectando" || (sessaoRodando && estado?.jogo === "offline")) && (
        <div className="barra-sessao-avisos">
          {estado?.live === "reconectando" && (
            <p className="barra-sessao-aviso">
              A ponte perdeu a conexão com a live e está tentando de novo. Nada é inventado enquanto isso —
              presente enviado agora só conta quando reconectar.
            </p>
          )}
          {sessaoRodando && estado?.jogo === "offline" && (
            <p className="barra-sessao-aviso">
              O Roblox parou de responder. Presente chegando agora está sendo descartado, não acumulado —
              reabra a experiência para voltar a valer.
            </p>
          )}
        </div>
      )}

      <div className="barra-sessao-controles">
        <label className="barra-sessao-campo">
          <span className="secundario">Preset</span>
          <select
            value={presetId ?? ""}
            onChange={(evento) => aoTrocarPreset(evento.target.value)}
            disabled={bloqueadoParaEditar || listaDePresets.length === 0}
          >
            {listaDePresets.length === 0 && <option value="">Nenhum preset salvo</option>}
            {listaDePresets.length > 0 && !presetId && <option value="">Escolha um preset</option>}
            {listaDePresets.map((preset) => (
              <option key={preset.presetId} value={preset.presetId}>
                {preset.nome}
              </option>
            ))}
          </select>
        </label>

        {listaDeCenarios.length > 0 && (
          <label className="barra-sessao-campo barra-sessao-teste">
            <span className="barra-sessao-teste-rotulo">Modo de teste — sem live</span>
            <select
              value={cenarioEscolhido}
              onChange={(evento) => definirCenarioEscolhido(evento.target.value)}
              disabled={bloqueadoParaEditar}
            >
              <option value="">— nenhum (live real) —</option>
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
              {iniciando ? "Iniciando…" : cenarioEscolhido ? "Iniciar teste (sem live)" : "Iniciar live"}
            </button>
            <span className="secundario barra-sessao-nota">
              {cenarioEscolhido
                ? "Roda com evento de fixture, sem tocar na live de verdade."
                : "Start é a confirmação de que a live começa a valer de verdade."}
            </span>
          </div>
        ) : (
          <div className="barra-sessao-acao">
            <button
              type="button"
              className={`barra-sessao-botao ${confirmandoParar ? "barra-sessao-botao--confirmar" : "barra-sessao-botao--parar"}`}
              onClick={aoClicarParar}
            >
              {confirmandoParar ? "Confirmar: encerrar e descartar" : "Parar"}
            </button>
            {confirmandoParar && (
              <button type="button" className="barra-sessao-botao barra-sessao-botao--cancelar" onClick={aoCancelarParar}>
                Cancelar
              </button>
            )}
            <span className="secundario barra-sessao-nota">
              Para a sessão e descarta todo dado de espectador do log.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
