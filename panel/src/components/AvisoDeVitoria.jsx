import "./AvisoDeVitoria.css";

/**
 * O boneco chegou ao topo (R6).
 *
 * A regra é explícita: chegar no topo **não reinicia sozinho**, o streamer
 * decide no painel. Isso faz deste o único aviso do painel que não some — ele
 * fica até alguém apertar o botão, porque é ele que explica por que o jogo
 * parou de responder a presente de subida.
 *
 * Fica no topo da página "Ao vivo", acima dos slots. É a única coisa que pode
 * empurrar os 6 slots para baixo, e só enquanto durar a decisão: o
 * 02_DESIGN_SYSTEM exige os seis sempre visíveis, e um aviso permanente no
 * meio da tela seria o oposto disso.
 *
 * Quem manda o comando é a ponte, e ela responde `jogoOnline`. Com o Roblox
 * fora, o long-poll descarta o comando como descarta presente (F7) — e o
 * streamer precisa saber disso antes de clicar de novo achando que travou.
 */
export function AvisoDeVitoria({ estado, reiniciando, aoReiniciar }) {
  if (!estado?.vitoria) return null;

  const plataforma = Number.isFinite(estado.plataformaAtual) ? estado.plataformaAtual : null;
  const total = Number.isFinite(estado.totalPlataformas) && estado.totalPlataformas > 0
    ? estado.totalPlataformas
    : null;

  const jogoOnline = estado.jogo === "online";

  return (
    <section className="vitoria" role="status" aria-live="polite">
      <div className="vitoria-texto">
        <h2 className="vitoria-titulo">Topo da torre</h2>
        <p className="vitoria-detalhe">
          {plataforma !== null && total !== null
            ? `O boneco chegou na plataforma ${plataforma} de ${total}.`
            : "O boneco chegou ao topo do mapa."}{" "}
          A corrida não recomeça sozinha — presente de subida não tem mais para onde levar.
        </p>
      </div>

      <div className="vitoria-acao">
        <button
          type="button"
          className="vitoria-botao"
          onClick={aoReiniciar}
          disabled={reiniciando}
        >
          {reiniciando ? "Reiniciando…" : "Reiniciar corrida"}
        </button>
        {!jogoOnline && (
          <span className="secundario vitoria-nota">
            O Roblox está offline: o comando seria descartado. Reabra a experiência primeiro.
          </span>
        )}
      </div>
    </section>
  );
}
