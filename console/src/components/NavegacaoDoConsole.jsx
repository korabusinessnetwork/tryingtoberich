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
 * ter seis entradas onde há duas telas.
 *
 * As três abas ainda não construídas ficam visíveis e clicáveis, levando a um
 * aviso do que virá. Escondê-las até estarem prontas faria a fronteira do v1
 * parecer menor do que é, e é a fronteira inteira que precisa estar à vista.
 */

export const PAGINAS = [
  { id: "assinantes", rotulo: "Assinantes", item: 1, pronto: true },
  { id: "faturamento", rotulo: "Faturamento", item: 4, pronto: false, tarefa: "C08" },
  { id: "logs", rotulo: "Logs", item: 5, pronto: false, tarefa: "C05" },
  { id: "saude", rotulo: "Saúde de conexão", item: 6, pronto: false, tarefa: "C06" },
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
            {/* Texto, e não só o cinza: "ainda não existe" precisa ser lido,
                não deduzido de um tom mais apagado. */}
            {!entrada.pronto && <span className="navegacao-marca">onda 3</span>}
          </button>
        );
      })}
    </nav>
  );
}
