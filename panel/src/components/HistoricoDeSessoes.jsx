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
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatarDuracao(segundos) {
  if (!Number.isFinite(segundos) || segundos <= 0) return "—";
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `${minutos}min`;
  return `${Math.floor(minutos / 60)}h ${String(minutos % 60).padStart(2, "0")}min`;
}

export function HistoricoDeSessoes({ sessoes, carregando, sessaoEscolhida, aoEscolher, aoAtualizar }) {
  const lista = Array.isArray(sessoes) ? sessoes : [];

  return (
    <section className="historico" aria-label="Histórico de lives">
      <header className="historico-cabecalho">
        <h2 className="historico-titulo">Lives anteriores</h2>
        <button type="button" className="historico-atualizar" onClick={aoAtualizar} disabled={carregando}>
          {carregando ? "Lendo…" : "Atualizar"}
        </button>
      </header>

      {carregando && lista.length === 0 && <p className="historico-recado">Lendo as sessões do disco…</p>}

      {!carregando && lista.length === 0 && (
        <p className="historico-recado">
          Nenhuma live registrada ainda. Toda sessão encerrada com o Stop vira uma linha aqui,
          já reduzida ao resumo — o detalhe por evento é descartado no encerramento (F5).
        </p>
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
                    <span className="pastilha pastilha-atencao historico-marca">Interrompida</span>
                  ) : (
                    <>
                      <span className="historico-numero">
                        <strong>{resumo?.totalPresentes ?? 0}</strong> presentes
                      </span>
                      <span className="historico-numero">
                        plataforma <strong>{resumo?.plataformaMaxima ?? 0}</strong>
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
