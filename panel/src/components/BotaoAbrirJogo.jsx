import "./BotaoAbrirJogo.css";

/**
 * Abre o jogo no Roblox Studio, pronto para dar Play.
 *
 * Quem executa é a PONTE, não o navegador: página web não abre programa local,
 * e nem deveria. O painel só pede; o processo nasce no Node, que já roda aqui.
 *
 * O botão não abre o Studio vazio — ele monta um `.rbxlx` com o jogo inteiro E
 * com os dois passos manuais do `game/README` já feitos: o `KoraConfig` no
 * ServerStorage (URL e token da ponte) e o HttpService ligado. Sem isso o
 * streamer criava uma Folder e dois StringValue na mão, e errar um nome dava
 * "falta configurar a ponte" sem dizer onde.
 *
 * Sobra o Play. Só isso.
 */
export function BotaoAbrirJogo({ abrindo, resultado, erro, aoAbrir }) {
  const recado = () => {
    if (erro) return { texto: erro, classe: "pastilha pastilha-erro" };
    if (!resultado) return null;

    return {
      texto: "Studio abrindo com o jogo montado e a ponte já configurada. É só dar Play.",
      classe: "pastilha pastilha-ok",
    };
  };

  const aviso = recado();

  return (
    <section className="abrir-jogo" aria-label="Abrir o jogo">
      <button type="button" className="abrir-jogo-botao" disabled={abrindo} onClick={aoAbrir}>
        {abrindo ? "Montando o jogo…" : "Abrir o jogo no Studio"}
      </button>

      {aviso ? <p className={aviso.classe}>{aviso.texto}</p> : null}

      {/* O único passo que sobrou para a pessoa. Fica à vista antes do clique
          porque um Studio abrindo é lento, e saber o que fazer quando ele abrir
          evita o "e agora?". */}
      <p className="abrir-jogo-passos">
        Quando o Studio abrir: aperte <strong>Play</strong>. O resto já vai montado.
      </p>
    </section>
  );
}
