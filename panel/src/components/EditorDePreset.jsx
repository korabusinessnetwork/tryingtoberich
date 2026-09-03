import { useMemo } from "react";

import { listaDePresentes, presentesRepetidos, slotsDoPreset } from "../lib/regras.js";
import { CartaoDeSlot } from "./CartaoDeSlot.jsx";
import "./EditorDePreset.css";

/**
 * Container dos 6 slots (`docs/06_COMPONENTES`). É a tela principal do produto:
 * **os 6 ficam lado a lado, sempre visíveis, sem scroll** — está literal na
 * seção A do design system, e por isso a grade é fixa em 6 colunas e os
 * cartões encolhem em vez de a linha quebrar ou rolar.
 *
 * Este componente não busca nada e não conhece rota: preset, catálogo e
 * animações chegam por prop, e toda edição sai por callback.
 *
 * Contrato com quem monta a tela:
 *   aoMudarSlot(posicao, camposParciais)  ex.: (3, { delta: 12 })
 *   aoLimparSlot(posicao)
 *   aoEditarPresente(posicao) / aoEditarAnimacao(posicao)  abrem os modais
 *   aoSalvar()                            com `salvando` controlando o botão
 */

function listaDeAnimacoes(animacoes) {
  if (Array.isArray(animacoes)) return animacoes;
  return animacoes?.animacoes ?? [];
}

/** "1 e 4", "1, 3 e 5" — o streamer precisa saber ONDE está o repetido. */
function listarPosicoes(posicoes) {
  if (posicoes.length <= 1) return String(posicoes[0] ?? "—");
  return `${posicoes.slice(0, -1).join(", ")} e ${posicoes[posicoes.length - 1]}`;
}

/**
 * R1.4 — o mesmo presente não pode ocupar dois slots. A ponte recusa, e
 * descobrir isso só no salvar é ruim: o aviso aparece assim que o segundo slot
 * é escolhido. `presentesRepetidos` devolve ids; aqui viram nome e posição.
 */
function resumoDeRepetidos(preset, porPresenteId) {
  const slots = preset?.slots ?? [];
  return presentesRepetidos(preset)
    .filter((presenteId) => presenteId != null)
    .map((presenteId) => ({
      presenteId,
      nome: porPresenteId.get(String(presenteId))?.nome ?? String(presenteId),
      posicoes: slots
        .filter((slot) => slot.presenteId === presenteId)
        .map((slot) => slot.posicao)
        .sort((a, b) => a - b),
    }));
}

export function EditorDePreset({
  preset,
  catalogo,
  animacoes,
  salvando,
  aoMudarSlot,
  aoLimparSlot,
  aoSalvar,
  aoEditarPresente,
  aoEditarAnimacao,
}) {
  const porPresenteId = useMemo(
    () => new Map(listaDePresentes(catalogo).map((presente) => [String(presente.presenteId), presente])),
    [catalogo],
  );

  const porAnimacaoId = useMemo(
    () => new Map(listaDeAnimacoes(animacoes).map((animacao) => [String(animacao.id), animacao])),
    [animacoes],
  );

  // Sempre 6, com as posições vazias incluídas (R1.1 e R1.3).
  const slots = useMemo(() => slotsDoPreset(preset), [preset]);
  const repetidos = useMemo(() => resumoDeRepetidos(preset, porPresenteId), [preset, porPresenteId]);
  const preenchidos = slots.filter((slot) => slot.vazio !== true && slot.presenteId != null).length;

  if (!preset) {
    return (
      <section className="editor-preset editor-preset-sem-dado" aria-label="Preset">
        <p className="secundario">Nenhum preset carregado. Escolha ou crie um para montar os 6 slots.</p>
      </section>
    );
  }

  return (
    <section className="editor-preset" aria-label="Preset">
      <header className="editor-preset-topo">
        <div className="editor-preset-identidade">
          <h2 className="editor-preset-nome">{preset.nome ?? preset.presetId}</h2>
          <p className="editor-preset-resumo secundario">
            {preenchidos} de {slots.length} slots preenchidos
            {preset.modalidade ? ` · ${preset.modalidade}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="editor-preset-salvar"
          onClick={aoSalvar}
          disabled={Boolean(salvando)}
        >
          {salvando ? "Salvando…" : "Salvar preset"}
        </button>
      </header>

      {/* Avisa, não bloqueia: o botão continua clicável, mas o problema aparece
          antes do salvar, com nome e posição, e não como erro devolvido pela
          ponte depois. */}
      {repetidos.length > 0 && (
        <p className="pastilha pastilha-erro editor-preset-alerta" role="alert">
          <span>
            Presente repetido:{" "}
            {repetidos
              .map((item) => `${item.nome} nos slots ${listarPosicoes(item.posicoes)}`)
              .join("; ")}
            . A ponte recusa preset com o mesmo presente em dois slots.
          </span>
        </p>
      )}

      <div className="editor-preset-slots">
        {slots.map((slot) => (
          <CartaoDeSlot
            key={slot.posicao}
            slot={slot}
            presente={slot.presenteId != null ? porPresenteId.get(String(slot.presenteId)) ?? null : null}
            animacao={slot.animacaoId != null ? porAnimacaoId.get(String(slot.animacaoId)) ?? null : null}
            aoEditarPresente={() => aoEditarPresente?.(slot.posicao)}
            aoEditarAnimacao={() => aoEditarAnimacao?.(slot.posicao)}
            aoMudar={(camposParciais) => aoMudarSlot?.(slot.posicao, camposParciais)}
            aoLimpar={() => aoLimparSlot?.(slot.posicao)}
          />
        ))}
      </div>
    </section>
  );
}
