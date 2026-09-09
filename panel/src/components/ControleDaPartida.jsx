import { useTraducao } from "../i18n/useTraducao.js";
import "./ControleDaPartida.css";

/**
 * As ordens que o painel manda ao jogo com a sessão de pé.
 *
 * As três são separadas de propósito, e a separação é a feature:
 *
 *   reiniciar        a corrida recomeça, o placar continua
 *   zerar placar     o placar recomeça, a corrida continua
 *   recarregar mapa  a torre é reerguida do spec novo, o resto continua
 *
 * Juntar qualquer par num botão só tiraria do streamer a chance de fazer um sem
 * o outro — e o caso comum é justamente reiniciar sem perder o histórico da
 * live.
 *
 * Todas passam pelo canal de comando do ADR-013 e podem se perder com o jogo
 * offline, por isso cada resposta traz `jogoOnline`: sem isso o streamer fica
 * clicando um botão que não chega a lugar nenhum.
 */
export function ControleDaPartida({ jogoOnline, ocupado, ultimoRecado, aoReiniciar, aoZerarPlacar, aoRecarregarMapa }) {
  const { t } = useTraducao();

  const acoes = [
    { chave: "reiniciar", rotulo: t("panel.matchControl.restartLabel"), dica: t("panel.matchControl.restartHint"), aoClicar: aoReiniciar },
    { chave: "placar", rotulo: t("panel.matchControl.resetScoreLabel"), dica: t("panel.matchControl.resetScoreHint"), aoClicar: aoZerarPlacar },
    { chave: "mapa", rotulo: t("panel.matchControl.reloadMapLabel"), dica: t("panel.matchControl.reloadMapHint"), aoClicar: aoRecarregarMapa },
  ];

  return (
    <section className="partida" aria-label={t("panel.matchControl.title")}>
      <header className="partida-cabecalho">
        <h2 className="partida-titulo">{t("panel.matchControl.title")}</h2>
        <span className={jogoOnline ? "pastilha pastilha-ok" : "pastilha pastilha-erro"}>
          {jogoOnline ? t("panel.matchControl.gameOnline") : t("panel.matchControl.gameOffline")}
        </span>
      </header>

      {!jogoOnline ? (
        <p className="partida-recado">{t("panel.matchControl.offlineWarning")}</p>
      ) : null}

      <div className="partida-acoes">
        {acoes.map(({ chave, rotulo, dica, aoClicar }) => (
          <button
            key={chave}
            type="button"
            className="partida-botao"
            disabled={ocupado}
            onClick={aoClicar}
            title={dica}
          >
            <span className="partida-botao-rotulo">{rotulo}</span>
            <span className="partida-botao-dica">{dica}</span>
          </button>
        ))}
      </div>

      {ultimoRecado ? <p className="partida-recado">{ultimoRecado}</p> : null}
    </section>
  );
}
