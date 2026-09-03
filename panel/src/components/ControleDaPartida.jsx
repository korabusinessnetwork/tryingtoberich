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
  const acoes = [
    { chave: "reiniciar", rotulo: "Reiniciar corrida", dica: "Volta o boneco ao pé da torre. O placar continua.", aoClicar: aoReiniciar },
    { chave: "placar", rotulo: "Zerar vitórias e derrotas", dica: "Zera o placar. A corrida continua de onde está.", aoClicar: aoZerarPlacar },
    { chave: "mapa", rotulo: "Recarregar mapa", dica: "Reergue a torre com o mapa escolhido, sem parar a sessão.", aoClicar: aoRecarregarMapa },
  ];

  return (
    <section className="partida" aria-label="Controle da partida">
      <header className="partida-cabecalho">
        <h2 className="partida-titulo">Controle da partida</h2>
        <span className={jogoOnline ? "pastilha pastilha-ok" : "pastilha pastilha-erro"}>
          {jogoOnline ? "jogo conectado" : "jogo offline"}
        </span>
      </header>

      {!jogoOnline ? (
        <p className="partida-recado">
          Com o Roblox fora, estas ordens são descartadas pelo long-poll e não
          chegam a lugar nenhum.
        </p>
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
