import { traduzir } from "../i18n/traduzir.js";
import { useTraducao } from "../i18n/useTraducao.js";
import { dataHora } from "../i18n/formatar.js";
import "./HistoricoDeSessoes.css";

/**
 * As lives passadas.
 *
 * A ponte gravava um arquivo por sessão desde o Bloco 1 e ninguém nunca leu:
 * o resumo do F5 era calculado, validado contra o schema, escrito em disco e
 * esquecido. Esta é a lista que o torna útil — "a live de ontem rendeu mais
 * que a de hoje?" é a única pergunta que o monitor ao vivo não pode responder,
 * porque ele só conhece o presente.
 *
 * Cada linha é o resumo agregado. Nenhum dado de espectador chega aqui: no
 * Stop o detalhe por evento é descartado do arquivo (F5, 11_SEGURANCA). O
 * detalhe de uma sessão escolhida quem desenha é o `ResumoDaLive`, montado
 * pela página — este componente é a lista, não o leitor.
 */

function formatarInstante(iso) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return traduzir("common.value.none");
  return dataHora(data);
}

function formatarDuracao(segundos) {
  if (!Number.isFinite(segundos) || segundos <= 0) return traduzir("common.value.none");
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return traduzir("panel.sessionHistory.durationMinutes", { n: minutos });
  return traduzir("panel.sessionHistory.durationHours", {
    h: Math.floor(minutos / 60),
    m: String(minutos % 60).padStart(2, "0"),
  });
}

/**
 * Costura o número em destaque de volta na frase traduzida.
 *
 * O catálogo guarda a frase INTEIRA com `{n}` onde entra o número — quem traduz
 * lê a frase toda, e o `<strong>` que o CSS pinta continua envolvendo só o
 * número, como antes. Mesmo padrão do `EditorDePlacar`.
 */
function comNumeroEmDestaque(texto, valor) {
  return texto
    .split(/(\{n\})/g)
    .map((pedaco, indice) => (pedaco === "{n}" ? <strong key={indice}>{valor}</strong> : pedaco));
}

export function HistoricoDeSessoes({ sessoes, carregando, sessaoEscolhida, aoEscolher, aoAtualizar }) {
  const { t } = useTraducao();
  const lista = Array.isArray(sessoes) ? sessoes : [];

  return (
    <section className="historico" aria-label={t("panel.sessionHistory.regionLabel")}>
      <header className="historico-cabecalho">
        <h2 className="historico-titulo">{t("panel.sessionHistory.title")}</h2>
        <button type="button" className="historico-atualizar" onClick={aoAtualizar} disabled={carregando}>
          {carregando ? t("panel.sessionHistory.refreshing") : t("panel.sessionHistory.refresh")}
        </button>
      </header>

      {carregando && lista.length === 0 && (
        <p className="historico-recado">{t("panel.sessionHistory.loadingNotice")}</p>
      )}

      {!carregando && lista.length === 0 && (
        <p className="historico-recado">{t("panel.sessionHistory.emptyState")}</p>
      )}

      {lista.length > 0 && (
        <ul className="historico-lista">
          {lista.map((sessao) => {
            const resumo = sessao.resumo ?? null;
            const escolhida = sessaoEscolhida === sessao.sessaoId;

            return (
              <li key={sessao.sessaoId}>
                <button
                  type="button"
                  className={escolhida ? "historico-linha historico-linha-escolhida" : "historico-linha"}
                  aria-pressed={escolhida}
                  onClick={() => aoEscolher(escolhida ? null : sessao.sessaoId)}
                >
                  <span className="historico-quando">{formatarInstante(sessao.iniciadaEm)}</span>

                  {sessao.interrompida ? (
                    // Existe em disco e nunca foi encerrada: a ponte caiu antes
                    // do Stop. Sem esta marca, ela leria como uma live de zero
                    // presentes, que é uma história bem diferente.
                    <span className="pastilha pastilha-atencao historico-marca">
                      {t("panel.sessionHistory.interruptedBadge")}
                    </span>
                  ) : (
                    <>
                      <span className="historico-numero">
                        {comNumeroEmDestaque(
                          t("panel.sessionHistory.giftCount"),
                          resumo?.totalPresentes ?? 0,
                        )}
                      </span>
                      <span className="historico-numero">
                        {comNumeroEmDestaque(
                          t("panel.sessionHistory.platformPeak"),
                          resumo?.plataformaMaxima ?? 0,
                        )}
                      </span>
                      <span className="historico-numero historico-duracao">
                        {formatarDuracao(resumo?.duracaoSegundos)}
                      </span>
                    </>
                  )}

                  <span className="secundario historico-preset">{sessao.presetId}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
