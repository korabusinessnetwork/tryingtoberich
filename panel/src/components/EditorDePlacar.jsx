import { useMemo } from "react";

import { listaDePresentes } from "../lib/regras.js";
import "./EditorDePlacar.css";

/**
 * Presentes que mexem no PLACAR em vez de animar o boneco.
 *
 * Lista separada dos 6 slots de propósito (ADR-007): presente de vitória não
 * pode custar um slot de subida, senão as duas coisas competem pelo mesmo
 * espaço e o streamer escolhe entre animar e pontuar.
 *
 * O mesmo presente não pode estar aqui E num slot — seria ambíguo, e a ponte
 * recusa o preset antes de salvar (R1.4). Por isso os que já estão em slot não
 * aparecem para escolher.
 */
/** Espelha `Tipos.VIDA_PADRAO_DO_PORTAL` no jogo e `VIDA_PADRAO_DO_PORTAL` na ponte. */
const VIDA_PADRAO_DO_PORTAL = 2000;

const ANIMACOES_DE_RODADA = [
  { campo: "animacaoDeVitoria", rotulo: "Vitória", dica: "Toca ao chegar no topo." },
  { campo: "animacaoDeDerrota", rotulo: "Derrota", dica: "Toca quando o portal quebra." },
];

export function EditorDePlacar({
  preset, catalogo, presenteIdsEmSlot, animacoes,
  aoMudar, aoRemover, aoAdicionar, aoMudarPortal, aoEscolherAnimacao, aoLimparAnimacao,
}) {
  const presentes = useMemo(() => listaDePresentes(catalogo), [catalogo]);
  const porId = useMemo(
    () => new Map(presentes.map((p) => [String(p.presenteId), p])),
    [presentes],
  );

  const vinculos = preset?.placar ?? [];
  const usados = new Set(vinculos.map((v) => String(v.presenteId)));

  // Só o que ainda não está em lugar nenhum: nem aqui, nem nos 6 slots.
  const disponiveis = presentes.filter(
    (p) => !usados.has(String(p.presenteId)) && !presenteIdsEmSlot.has(String(p.presenteId)),
  );

  return (
    <section className="placar" aria-label="Presentes de placar">
      <header className="placar-cabecalho">
        <h2 className="placar-titulo">Presentes de placar</h2>
        <span className="placar-etiqueta">fora dos 6 slots</span>
      </header>

      <p className="placar-explicacao">
        Estes presentes não animam o boneco: encerram a rodada e contam ponto.
        Um presente de <strong>derrota</strong> quebra o portal na hora, sem
        gastar a vida dele. Mandado em rajada, vale uma rodada por repetição —
        e elas são cobradas uma a uma, cada queda com sua contagem.
      </p>

      {/*[[ A animação do fim de rodada, junto do resto do placar.

          Vitória e derrota não têm delta — ninguém sobe nem desce por ter
          chegado ao topo — e por isso viviam sem animação nenhuma: os dois
          instantes mais altos da live aconteciam com o boneco parado. Ficam
          nesta tela porque é aqui que vitória e derrota se decidem. ]]*/}
      {aoEscolherAnimacao && (
        <div className="placar-animacoes">
          {ANIMACOES_DE_RODADA.map(({ campo, rotulo, dica }) => {
            const escolhida = (animacoes ?? []).find((a) => a.id === preset?.[campo]);
            return (
              <div className="placar-animacao" key={campo}>
                <span className="placar-animacao-rotulo">{rotulo}</span>
                <button
                  type="button"
                  className="placar-animacao-botao"
                  onClick={() => aoEscolherAnimacao(campo)}
                >
                  {escolhida ? escolhida.nome : "Escolher animação"}
                </button>
                {escolhida && aoLimparAnimacao && (
                  <button
                    type="button"
                    className="placar-animacao-limpar"
                    aria-label={`Tirar a animação de ${rotulo.toLowerCase()}`}
                    onClick={() => aoLimparAnimacao(campo)}
                  >
                    ×
                  </button>
                )}
                <span className="placar-animacao-dica">{dica}</span>
              </div>
            );
          })}
        </div>
      )}

      {/*[[ A vida do portal fica AQUI, junto do que a gasta.

          Ela é a mesma disputa: o portal é o que segura a derrota, e o presente
          de derrota é o atalho que a compra. Separar os dois em telas
          diferentes esconderia que um é o preço do outro. ]]*/}
      {aoMudarPortal && (
        <div className="placar-portal">
          <label className="placar-portal-rotulo" htmlFor="placar-portal-vida">
            Vida do portal
          </label>
          <input
            id="placar-portal-vida"
            className="placar-portal-campo"
            type="number"
            min="1"
            max="100000"
            step="100"
            value={preset?.portal?.vida ?? VIDA_PADRAO_DO_PORTAL}
            onChange={(evento) => {
              const valor = Number(evento.target.value);
              if (Number.isFinite(valor) && valor >= 1) aoMudarPortal(Math.round(valor));
            }}
          />
          <span className="placar-portal-dica">
            Em <strong>andares de empurrão</strong>, a mesma unidade do delta: um
            presente que derruba 20 andares tira 20. Só presente negativo machuca.
          </span>
        </div>
      )}

      {vinculos.length === 0 ? (
        <p className="placar-vazio">Nenhum presente ligado ao placar ainda.</p>
      ) : (
        <ul className="placar-lista">
          {vinculos.map((vinculo) => {
            const presente = porId.get(String(vinculo.presenteId));
            return (
              <li className="placar-linha" key={vinculo.presenteId}>
                <span className="placar-nome">{presente?.nome ?? vinculo.presenteId}</span>

                {/* Dois botões e não um seletor: são só duas opções, e o estado
                    fica visível sem abrir nada — o painel é lido de relance. */}
                <div className="placar-efeitos" role="group" aria-label="Efeito no placar">
                  {[
                    { valor: "vitoria", rotulo: "Vitória" },
                    { valor: "derrota", rotulo: "Derrota" },
                  ].map(({ valor, rotulo }) => (
                    <button
                      key={valor}
                      type="button"
                      className={
                        vinculo.efeito === valor
                          ? `placar-efeito placar-efeito-${valor} placar-efeito-ativo`
                          : "placar-efeito"
                      }
                      aria-pressed={vinculo.efeito === valor}
                      onClick={() => aoMudar(vinculo.presenteId, valor)}
                    >
                      {rotulo}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="placar-remover"
                  aria-label={`Remover ${presente?.nome ?? vinculo.presenteId}`}
                  onClick={() => aoRemover(vinculo.presenteId)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* O select fica no fim e some quando não há o que acrescentar: oferecer
          uma lista vazia é pior que não oferecer nada. */}
      {disponiveis.length > 0 ? (
        <select
          className="placar-adicionar"
          value=""
          onChange={(evento) => {
            if (evento.target.value) aoAdicionar(evento.target.value);
          }}
          aria-label="Acrescentar presente ao placar"
        >
          <option value="">Acrescentar presente…</option>
          {disponiveis.map((presente) => (
            <option key={presente.presenteId} value={presente.presenteId}>
              {presente.nome}
            </option>
          ))}
        </select>
      ) : null}
    </section>
  );
}
