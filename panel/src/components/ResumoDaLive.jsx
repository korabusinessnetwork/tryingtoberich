import { useTraducao } from "../i18n/useTraducao.js";
import { dataHora } from "../i18n/formatar.js";
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
  return dataHora(data);
}

export function ResumoDaLive({ sessao, titulo, aoFechar }) {
  const { t } = useTraducao();

  if (!sessao) return null;

  const resumo = sessao.resumo ?? null;
  const interrompida = !sessao.encerradaEm;

  // Sessão que nunca foi encerrada não tem resumo: a ponte caiu antes do Stop,
  // e o que sobrou em disco é o instantâneo do meio da live. Dizer isso é mais
  // útil que desenhar um card de zeros.
  if (!resumo) {
    return (
      <section className="resumo" aria-label={titulo ?? t("panel.liveSummary.title")}>
        <header className="resumo-cabecalho">
          <h2 className="resumo-titulo">{titulo ?? t("panel.liveSummary.title")}</h2>
          {aoFechar && (
            <button
              type="button"
              className="resumo-fechar"
              onClick={aoFechar}
              aria-label={t("panel.liveSummary.closeLabel")}
            >
              ×
            </button>
          )}
        </header>
        <p className="resumo-recado">
          {t("panel.liveSummary.noSummary", { quando: formatarInstante(sessao.iniciadaEm) })}
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
    <section className="resumo" aria-label={titulo ?? t("panel.liveSummary.title")}>
      <header className="resumo-cabecalho">
        <div>
          <h2 className="resumo-titulo">{titulo ?? t("panel.liveSummary.title")}</h2>
          <p className="secundario resumo-quando">
            {formatarInstante(sessao.iniciadaEm)} · {t("panel.liveSummary.presetLabel")}{" "}
            <strong>{sessao.presetId}</strong>
            {sessao.mapaId ? (
              <> · {t("panel.liveSummary.mapLabel")} <strong>{sessao.mapaId}</strong></>
            ) : null}
          </p>
        </div>
        {aoFechar && (
          <button
            type="button"
            className="resumo-fechar"
            onClick={aoFechar}
            aria-label={t("panel.liveSummary.closeLabel")}
          >
            ×
          </button>
        )}
      </header>

      {interrompida && (
        <p className="pastilha pastilha-atencao">{t("panel.liveSummary.interrupted")}</p>
      )}

      <div className="resumo-numeros">
        {/* O do PORTÃO primeiro, porque é o que decide a Fase 0. Ele não
            existe em sessão gravada antes de 2026-09-10, e aí some em vez de
            mostrar zero — zero seria mentira sobre uma live que teve presente. */}
        {Number.isFinite(resumo.presentesRecebidos) && (
          <article className="resumo-numero">
            <h3 className="resumo-rotulo">{t("panel.liveSummary.giftsReceived")}</h3>
            <p className="resumo-valor">{resumo.presentesRecebidos}</p>
            <p className="resumo-nota">{t("panel.liveSummary.giftsReceivedHint")}</p>
          </article>
        )}

        <article className="resumo-numero">
          <h3 className="resumo-rotulo">{t("panel.liveSummary.gifts")}</h3>
          <p className="resumo-valor">{resumo.totalPresentes ?? 0}</p>
          <p className="resumo-nota">{t("panel.liveSummary.animationsHint")}</p>
        </article>

        <article className="resumo-numero">
          <h3 className="resumo-rotulo">{t("panel.liveSummary.maxPlatform")}</h3>
          <p className="resumo-valor">{resumo.plataformaMaxima ?? 0}</p>
        </article>

        <article className="resumo-numero">
          <h3 className="resumo-rotulo">{t("panel.liveSummary.duration")}</h3>
          <p className="resumo-valor resumo-valor-texto">{formatarDuracao(resumo.duracaoSegundos)}</p>
        </article>

        <article className="resumo-numero">
          <h3 className="resumo-rotulo">{t("panel.liveSummary.averageLatency")}</h3>
          {/* Média, e não mediana como no monitor ao vivo: é o que a ponte
              gravou no arquivo. Ao vivo a mediana protege contra o pico
              isolado; aqui a live acabou e a média é a conta honesta do
              conjunto. A cor segue o mesmo orçamento do Princípio nº1. */}
          <p className={`resumo-valor resumo-latencia-${saude}`}>
            {formatarLatencia(resumo.latenciaMediaMs)}
          </p>
        </article>

        <article className="resumo-numero">
          <h3 className="resumo-rotulo">{t("panel.liveSummary.falls")}</h3>
          <p className="resumo-valor">{resumo.quedasNaturais ?? 0}</p>
        </article>
      </div>

      <div className="resumo-listas">
        <div className="resumo-lista">
          <h3 className="resumo-rotulo">{t("panel.liveSummary.giftsBySlot")}</h3>
          {porSlot.length === 0 ? (
            <p className="resumo-recado">{t("panel.liveSummary.noSlotMatched")}</p>
          ) : (
            <ul className="resumo-barras">
              {porSlot.map(({ slot, total }) => {
                const maior = Math.max(...porSlot.map((s) => s.total));
                return (
                  <li key={slot} className="resumo-barra">
                    <span className="resumo-barra-slot">{t("panel.liveSummary.slotShort", { n: slot })}</span>
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
            {t("panel.liveSummary.unmapped")}{" "}
            {totalNaoMapeado > 0 && <span className="resumo-contador">{totalNaoMapeado}</span>}
          </h3>
          {naoMapeados.length === 0 ? (
            <p className="resumo-recado">{t("panel.liveSummary.allMatched")}</p>
          ) : (
            <ul className="resumo-perdidos">
              {naoMapeados
                .slice()
                .sort((a, b) => b.contagem - a.contagem)
                .map((item) => (
                  <li key={item.presenteNome} className="resumo-perdido">
                    <span className="resumo-perdido-nome">{item.presenteNome}</span>
                    <span className="resumo-perdido-contagem">
                      {t("panel.liveSummary.timesCount", { n: item.contagem })}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
