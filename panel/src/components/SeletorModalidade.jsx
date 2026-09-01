import "./SeletorModalidade.css";

/**
 * Escolhe a modalidade. A Fase 1 entrega só Escalada, mas o seletor existe
 * desde já (00_VISAO).
 *
 * Com uma modalidade só (ou nenhuma), um controle de seleção fingiria
 * escolha que não existe. Por isso 0 ou 1 item vira um rótulo claro, não um
 * dropdown nem um grupo de botões — um seletor com uma opção que parece ter
 * mais é pior que um rótulo honesto. Ver CLAUDE.md.
 *
 * Só React, sem chamada de rede: `modalidades` chega pronta por prop.
 */
export function SeletorModalidade({ modalidades, modalidade, aoTrocar, travado }) {
  const lista = modalidades ?? [];

  if (lista.length <= 1) {
    const unica = lista[0];
    return (
      <div className="seletor-modalidade seletor-modalidade-unica">
        <span className="secundario">Modalidade</span>
        <span className="seletor-modalidade-valor">{unica?.nome ?? "—"}</span>
        <span className="secundario seletor-modalidade-nota">
          {unica ? "única disponível por enquanto" : "nenhuma modalidade disponível"}
        </span>
      </div>
    );
  }

  return (
    <div className="seletor-modalidade" role="group" aria-label="Modalidade">
      <span className="secundario seletor-modalidade-rotulo">Modalidade</span>
      <div className="seletor-modalidade-opcoes">
        {lista.map((item) => {
          const ativa = item.id === modalidade;
          const indisponivel = item.disponivel === false;
          return (
            <button
              key={item.id}
              type="button"
              className={ativa ? "seletor-modalidade-opcao seletor-modalidade-opcao--ativa" : "seletor-modalidade-opcao"}
              aria-pressed={ativa}
              disabled={travado || indisponivel}
              title={
                travado
                  ? "Pare a sessão para trocar de modalidade."
                  : indisponivel
                    ? "Ainda não disponível."
                    : undefined
              }
              onClick={() => aoTrocar(item.id)}
            >
              {item.nome}
              {indisponivel && <span className="seletor-modalidade-em-breve">em breve</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
