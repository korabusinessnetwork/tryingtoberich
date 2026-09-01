import "./BotaoAbrirJogo.css";

/**
 * Abre o jogo no Roblox Studio, nesta máquina.
 *
 * Quem executa é a PONTE, não o navegador: página web não abre programa local,
 * e nem deveria. O painel só pede; o processo nasce no Node, que já roda aqui.
 *
 * O botão faz as duas partes mecânicas do `game/README.md` — sobe o `rojo
 * serve` e abre o Studio. O Connect no plugin e o Play continuam na mão, porque
 * são cliques dentro do Studio, fora do alcance da ponte. O componente diz
 * isso na tela em vez de fingir que terminou.
 */
export function BotaoAbrirJogo({ abrindo, resultado, erro, aoAbrir }) {
  const recado = () => {
    if (erro) return { texto: erro, classe: "pastilha pastilha-erro" };
    if (!resultado) return null;

    if (resultado.rojo === "ausente") {
      return {
        texto: "Studio aberto, mas o Rojo não está instalado — o jogo não vai sincronizar.",
        classe: "pastilha pastilha-atencao",
      };
    }
    return {
      texto:
        resultado.rojo === "ja_rodando"
          ? `Studio aberto. O Rojo já servia na ${resultado.portaRojo}.`
          : `Studio aberto e Rojo servindo na ${resultado.portaRojo}.`,
      classe: "pastilha pastilha-ok",
    };
  };

  const aviso = recado();

  return (
    <section className="abrir-jogo" aria-label="Abrir o jogo">
      <button type="button" className="abrir-jogo-botao" disabled={abrindo} onClick={aoAbrir}>
        {abrindo ? "Abrindo…" : "Abrir no Studio"}
      </button>

      {aviso ? <p className={aviso.classe}>{aviso.texto}</p> : null}

      {/* Sempre à vista, e não só depois do clique: são os dois passos que a
          ponte não tem como dar, e descobrir isso olhando um Studio parado
          custa mais que ler uma linha. */}
      <p className="abrir-jogo-passos">
        No Studio: plugin <strong>Rojo → Connect</strong>, depois <strong>Play</strong>.
      </p>

      {resultado?.rojo === "ausente" ? (
        <p className="abrir-jogo-passos">
          {/* winget e não `cargo install rojo`: o cargo obrigaria a instalar o
              Rust inteiro antes, e o winget já vem no Windows 11. */}
          Instalar o Rojo: <code>winget install Rojo.Rojo</code>{" "}
          (ou <a href="https://rojo.space" target="_blank" rel="noreferrer">rojo.space</a>).
        </p>
      ) : null}
    </section>
  );
}
