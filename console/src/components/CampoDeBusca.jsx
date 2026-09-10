import "./CampoDeBusca.css";

/**
 * A busca do item 1.
 *
 * **Um campo só, e nenhum seletor de "buscar por".** O ADR-P05 pede busca por
 * usuário da TikTok, e-mail ou licença, e o operador que está atendendo um
 * cliente tem na mão o que o cliente mandou: às vezes o @, às vezes o e-mail da
 * compra, às vezes um pedaço da chave colado de um e-mail de suporte. Obrigá-lo
 * a dizer qual dos três é obrigá-lo a classificar antes de procurar, e é uma
 * escolha errada por vez que faz a busca "não achar" alguém que está lá.
 *
 * Quem casa os três é a camada de dados, do mesmo jeito nas duas
 * implementações. Aqui é só o campo.
 */

export function CampoDeBusca({ valor, aoMudar, resultados, carregando }) {
  return (
    <div className="busca">
      <input
        className="busca-campo"
        type="search"
        value={valor}
        onChange={(evento) => aoMudar?.(evento.target.value)}
        placeholder="Usuário da TikTok, e-mail ou chave de licença"
        aria-label="Buscar assinante por usuário da TikTok, e-mail ou chave de licença"
        autoComplete="off"
        spellCheck={false}
      />
      {/* A contagem fica embaixo do campo e não some enquanto recarrega: some
          seria a tela piscando a cada tecla digitada. */}
      <p className="busca-contagem secundario numero">
        {carregando
          ? "Procurando…"
          : `${resultados} ${resultados === 1 ? "assinante" : "assinantes"}`}
      </p>
    </div>
  );
}
