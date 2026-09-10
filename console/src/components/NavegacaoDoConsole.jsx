import "./NavegacaoDoConsole.css";

/**
 * As páginas do console v1, e só elas.
 *
 * A lista abaixo é o ADR-P05 copiado: seis itens, nem um a mais. O ADR chama
 * isto de fronteira congelada e explica por quê, e o lugar onde a fronteira
 * primeiro cede é justamente aqui, numa aba nova que "já que estou aqui".
 * Item novo só entra com **qual operação fica impossível sem ele** escrito.
 *
 * Os itens 3 e 2 não têm aba própria de propósito: a ficha abre pela lista, e
 * a troca de plano acontece dentro da ficha. Aba para cada um faria a navegação
 * ter seis entradas onde há quatro telas.
 *
 * Desde a onda 3 as quatro estão construídas, e por isso não há mais marca de
 * "ainda não". A lista continua sendo a fronteira: quatro entradas, seis itens,
 * e uma quinta aba só entra com "qual operação fica impossível sem ela" escrito.
 */

export const PAGINAS = [
  { id: "assinantes", rotulo: "Assinantes", item: 1 },
  { id: "faturamento", rotulo: "Faturamento", item: 4 },
  { id: "logs", rotulo: "Logs", item: 5 },
  { id: "saude", rotulo: "Saúde de conexão", item: 6 },
];

export function NavegacaoDoConsole({ pagina, aoTrocar }) {
  return (
    <nav className="navegacao" aria-label="Páginas do console">
      {PAGINAS.map((entrada) => {
        const ativa = entrada.id === pagina;
        return (
          <button
            key={entrada.id}
            type="button"
            className={`navegacao-aba${ativa ? " navegacao-aba-ativa" : ""}`}
            aria-current={ativa ? "page" : undefined}
            onClick={() => aoTrocar?.(entrada.id)}
          >
            <span className="navegacao-rotulo">{entrada.rotulo}</span>
            {/* O número do item do ADR fica na aba porque é ele que amarra a
                tela à fronteira escrita: aba sem item correspondente no ADR-P05
                é aba que não deveria existir. */}
            <span className="navegacao-marca">item {entrada.item}</span>
          </button>
        );
      })}
    </nav>
  );
}
