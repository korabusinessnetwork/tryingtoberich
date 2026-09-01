import "./NavegacaoDePaginas.css";

/**
 * Navegação entre as páginas do painel.
 *
 * O 02_DESIGN_SYSTEM manda os 6 slots ficarem sempre visíveis e sem scroll,
 * porque são a tela principal. Navegação não briga com isso desde que os slots
 * fiquem na página de ABERTURA: quem entra já cai neles, e o que saiu para as
 * outras páginas é justamente o que o próprio layout já tratava como
 * "configura antes da live e não muda no meio".
 *
 * Cada página é um botão, não um menu: o streamer clica com pressa e olha por
 * 2 segundos: alvo de 40px, e o rótulo sempre à vista, sem abrir nada antes.
 */
export function NavegacaoDePaginas({ paginas, atual, aoTrocar }) {
  return (
    <nav className="navegacao" role="tablist" aria-label="Páginas do painel">
      {paginas.map((pagina) => {
        const ativa = pagina.id === atual;

        return (
          <button
            key={pagina.id}
            type="button"
            role="tab"
            aria-selected={ativa}
            className={ativa ? "navegacao-botao navegacao-botao-ativo" : "navegacao-botao"}
            onClick={() => aoTrocar(pagina.id)}
          >
            {pagina.rotulo}
            {/* Número junto, nunca cor sozinha (02_DESIGN_SYSTEM): 1 falha e 40
                falhas pedem reações diferentes. */}
            {pagina.contador > 0 ? <span className="navegacao-contador">{pagina.contador}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
