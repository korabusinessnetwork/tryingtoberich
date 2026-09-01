import { useMemo, useState } from "react";

import { NOME_DA_FAIXA, corDaFaixa, formatarDelta, slotsDoPreset } from "../lib/regras.js";
import "./TestadorDePresente.css";

/**
 * Dispara presente à mão, para o streamer conferir um slot sem depender de
 * espectador.
 *
 * O problema que ele resolve: hoje só se descobre que o slot 5 está com o delta
 * invertido quando alguém manda o presente ao vivo, e aí já é tarde. O modo de
 * cenário toca um roteiro gravado; isto aqui é o oposto — um presente, agora,
 * escolhido na hora.
 *
 * O disparo entra pelo MESMO caminho de um presente de verdade: casa com o slot
 * (R1), passa pelo combo (R4), disputa o combate (ADR-012), sai pelo long-poll
 * e volta no monitor. Um testador com atalho provaria que o atalho funciona.
 *
 * Nunca fica confundível com a live: o bloco inteiro é âmbar e diz o que é.
 */
export function TestadorDePresente({ preset, catalogo, aoDisparar, sessaoRodando, disparando }) {
  const [selecionados, definirSelecionados] = useState([]);
  const [repeticoes, definirRepeticoes] = useState(1);

  const presentes = useMemo(() => {
    const lista = Array.isArray(catalogo) ? catalogo : (catalogo?.presentes ?? []);
    return new Map(lista.map((p) => [p.presenteId, p]));
  }, [catalogo]);

  const slots = useMemo(() => slotsDoPreset(preset), [preset]);

  const alternar = (presenteId) => {
    definirSelecionados((atuais) =>
      atuais.includes(presenteId) ? atuais.filter((id) => id !== presenteId) : [...atuais, presenteId],
    );
  };

  const disparar = () => {
    if (selecionados.length === 0 || !sessaoRodando) return;
    aoDisparar(selecionados.map((presenteId) => ({ presenteId, repeticoes })));
  };

  // Dois ou mais no mesmo disparo chegam no mesmo instante: é assim que se
  // testa o combate sem depender de dois espectadores clicarem juntos.
  const ehCombate = selecionados.length > 1;

  const liquido = useMemo(() => {
    if (!ehCombate) return null;
    return selecionados.reduce((soma, presenteId) => {
      const slot = slots.find((s) => s.presenteId === presenteId);
      return soma + (slot?.delta ?? 0) * repeticoes;
    }, 0);
  }, [ehCombate, selecionados, slots, repeticoes]);

  return (
    <section className="testador" aria-label="Testar presente">
      <header className="testador-cabecalho">
        <h2 className="testador-titulo">Testar presente</h2>
        <span className="testador-etiqueta">não é a live</span>
      </header>

      <p className="testador-explicacao secundario">
        O disparo passa pelo mesmo caminho de um presente de verdade e aparece no monitor.
        Escolha dois ou mais para ver o combate.
      </p>

      {!sessaoRodando && (
        <p className="testador-bloqueio" role="status">
          Comece uma sessão para testar: é ela que carrega o preset e abre a ligação com o jogo.
        </p>
      )}

      <ul className="testador-slots">
        {slots.map((slot) => {
          const presente = slot.presenteId ? presentes.get(slot.presenteId) : null;
          const escolhido = selecionados.includes(slot.presenteId);

          if (slot.vazio || !slot.presenteId) {
            return (
              <li key={slot.posicao} className="testador-slot testador-slot-vazio">
                <span className="testador-posicao">{slot.posicao}</span>
                <span className="secundario">vazio</span>
              </li>
            );
          }

          return (
            <li key={slot.posicao} className="testador-slot">
              <button
                type="button"
                className={escolhido ? "testador-botao testador-botao-escolhido" : "testador-botao"}
                onClick={() => alternar(slot.presenteId)}
                disabled={!sessaoRodando}
                aria-pressed={escolhido}
              >
                <span className="testador-posicao">{slot.posicao}</span>
                <span className="testador-nome">{presente?.nome ?? slot.presenteId}</span>
                {presente ? (
                  <span className="testador-faixa" style={{ color: corDaFaixa(presente.faixa) }}>
                    {NOME_DA_FAIXA[presente.faixa]}
                  </span>
                ) : null}
                <span className={slot.delta > 0 ? "testador-delta testador-sobe" : "testador-delta testador-desce"}>
                  {formatarDelta(slot.delta)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="testador-controles">
        <label className="testador-repeticoes">
          Repetições
          <input
            type="number"
            min="1"
            max="99"
            value={repeticoes}
            disabled={!sessaoRodando}
            onChange={(evento) => definirRepeticoes(Math.max(1, Math.min(99, Number(evento.target.value) || 1)))}
          />
        </label>

        <button
          type="button"
          className="testador-disparar"
          onClick={disparar}
          disabled={!sessaoRodando || selecionados.length === 0 || disparando}
        >
          {disparando ? "Disparando…" : ehCombate ? `Disparar ${selecionados.length} juntos` : "Disparar"}
        </button>
      </div>

      {repeticoes > 1 && (
        <p className="testador-nota secundario">
          Com repetições, o delta multiplica e a intensidade sobe um nível, com teto em 5 (R4).
        </p>
      )}

      {ehCombate && (
        <p className="testador-nota testador-combate" role="status">
          Combate: os {selecionados.length} chegam juntos, as subidas somam, as descidas somam e
          o boneco anda o líquido —{" "}
          <strong>{liquido === 0 ? "empate, ninguém anda" : `${formatarDelta(liquido)} plataformas`}</strong>.
        </p>
      )}
    </section>
  );
}
