import { formatarLatencia, saudeDaLatencia } from "../lib/regras.js";

import "./ResumoDaLive.css";

/**
 * O resumo de uma live (F5.5).
 *
 * A ponte já reduzia a sessão ao resumo agregado no Stop e gravava em disco;
 * o painel jogava a resposta fora. Este componente é o passo 5 do F5 —
 * "Painel mostra o resumo da live" — e serve às duas pontas: aparece logo
 * depois do Stop, e é o mesmo bloco que o histórico usa para mostrar uma
 * sessão passada.
 *
 * Ele lê SÓ o agregado. Não existe dado de espectador aqui, e não porque este
 * componente filtra: no momento em que a sessão encerra, o detalhe por evento
 * é descartado do arquivo (11_SEGURANCA, camada 4). O que não existe não
 * vaza.
 *
 * Ao contrário do resto do painel, esta tela é para LER: ela só aparece com a
 * live parada, quando o streamer já saiu do ar. Por isso ela pode ter texto,
 * como o `PainelDeLogs`.
 */

/** "1h 04min", "12min 30s", "45s" — leitura, não cronômetro. */
function formatarDuracao(segundos) {
  if (!Number.isFinite(segundos) || segundos < 0) return "—";
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  const resto = segundos % 60;
  if (horas > 0) return `${horas}h ${String(minutos).padStart(2, "0")}min`;
  if (minutos > 0) return `${minutos}min ${String(resto).padStart(2, "0")}s`;
  return `${resto}s`;
}

function formatarInstante(iso) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function ResumoDaLive({ sessao, titulo, aoFechar }) {
  if (!sessao) return null;

  const resumo = sessao.resumo ?? null;
  const interrompida = !sessao.encerradaEm;

  // Sessão que nunca foi encerrada não tem resumo: a ponte caiu antes do Stop,
  // e o que sobrou em disco é o instantâneo do meio da live. Dizer isso é mais
  // útil que desenhar um card de zeros.
  if (!resumo) {
    return (
      <section className="resumo" aria-label={titulo ?? "Resumo da live"}>
        <header className="resumo-cabecalho">
          <h2 className="resumo-titulo">{titulo ?? "Resumo da live"}</h2>
          {aoFechar && (
            <button type="button" className="resumo-fechar" onClick={aoFechar} aria-label="Fechar resumo">
              ×
            </button>
          )}
        </header>
        <p className="resumo-recado">
          Esta sessão começou em {formatarInstante(sessao.iniciadaEm)} e nunca foi encerrada —
          a ponte parou antes do Stop. Sem o Stop não há resumo: é ele que fecha a conta.
        </p>
      </section>
    );
  }

  const porSlot = Object.entries(resumo.presentesPorSlot ?? {})
    .map(([slot, total]) => ({ slot: Number(slot), total }))
    .sort((a, b) => a.slot - b.slot);

  const naoMapeados = sessao.naoMapeados ?? [];
  const totalNaoMapeado = naoMapeados.reduce((soma, item) => soma + (item.contagem ?? 0), 0);

  const saude = saudeDaLatencia(resumo.latenciaMediaMs);

  return (
    <section className="resumo" aria-label={titulo ?? "Resumo da live"}>
      <header className="resumo-cabecalho">
        <div>
          <h2 className="resumo-titulo">{titulo ?? "Resumo da live"}</h2>
          <p className="secundario resumo-quando">
            {formatarInstante(sessao.iniciadaEm)} · preset <strong>{sessao.presetId}</strong>
            {sessao.mapaId ? <> · mapa <strong>{sessao.mapaId}</strong></> : null}
          </p>
        </div>
        {aoFechar && (
          <button type="button" className="resumo-fechar" onClick={aoFechar} aria-label="Fechar resumo">
            ×
          </button>
        )}
      </header>

      {interrompida && (
        <p className="pastilha pastilha-atencao">Interrompida — a ponte caiu antes do Stop</p>
      )}

      <div className="resumo-numeros">
        <article className="resumo-numero">
          <h3 className="resumo-rotulo">Presentes</h3>
          <p className="resumo-valor">{resumo.totalPresentes ?? 0}</p>
        </article>

        <article className="resumo-numero">
          <h3 className="resumo-rotulo">Plataforma máxima</h3>
          <p className="resumo-valor">{resumo.plataformaMaxima ?? 0}</p>
        </article>

        <article className="resumo-numero">
          <h3 className="resumo-rotulo">Duração</h3>
          <p className="resumo-valor resumo-valor-texto">{formatarDuracao(resumo.duracaoSegundos)}</p>
        </article>

        <article className="resumo-numero">
          <h3 className="resumo-rotulo">Latência média</h3>
          {/* Média, e não mediana como no monitor ao vivo: é o que a ponte
              gravou no arquivo. Ao vivo a mediana protege contra o pico
              isolado; aqui a live acabou e a média é a conta honesta do
              conjunto. A cor segue o mesmo orçamento do Princípio nº1. */}
          <p className={`resumo-valor resumo-latencia-${saude}`}>
            {formatarLatencia(resumo.latenciaMediaMs)}
          </p>
        </article>

        <article className="resumo-numero">
          <h3 className="resumo-rotulo">Quedas</h3>
          <p className="resumo-valor">{resumo.quedasNaturais ?? 0}</p>
        </article>
      </div>

      <div className="resumo-listas">
        <div className="resumo-lista">
          <h3 className="resumo-rotulo">Presentes por slot</h3>
          {porSlot.length === 0 ? (
            <p className="resumo-recado">Nenhum presente casou com um slot nesta live.</p>
          ) : (
            <ul className="resumo-barras">
              {porSlot.map(({ slot, total }) => {
                const maior = Math.max(...porSlot.map((s) => s.total));
                return (
                  <li key={slot} className="resumo-barra">
                    <span className="resumo-barra-slot">S{slot}</span>
                    <span className="resumo-barra-trilho">
                      <span
                        className="resumo-barra-preenchida"
                        style={{ width: `${maior > 0 ? (total / maior) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="resumo-barra-total">{total}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="resumo-lista">
          {/* F2.4 — o que o streamer deixou na mesa. É a lista que vira ação:
              todo presente aqui é um slot que faltou no preset da próxima. */}
          <h3 className="resumo-rotulo">
            Não mapeados {totalNaoMapeado > 0 && <span className="resumo-contador">{totalNaoMapeado}</span>}
          </h3>
          {naoMapeados.length === 0 ? (
            <p className="resumo-recado">Todo presente que chegou casou com um slot.</p>
          ) : (
            <ul className="resumo-perdidos">
              {naoMapeados
                .slice()
                .sort((a, b) => b.contagem - a.contagem)
                .map((item) => (
                  <li key={item.presenteNome} className="resumo-perdido">
                    <span className="resumo-perdido-nome">{item.presenteNome}</span>
                    <span className="resumo-perdido-contagem">×{item.contagem}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
