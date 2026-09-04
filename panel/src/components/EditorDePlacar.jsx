import { useMemo } from "react";

import { listaDePresentes, opcoesDeCutscene } from "../lib/regras.js";
import "./EditorDePlacar.css";

/**
 * O fim de rodada, visto do preset: para cada resultado, a CUTSCENE que o
 * overlay do OBS toca e os PRESENTES que o provocam.
 *
 * Agrupado por resultado de propósito. A versão anterior punha as duas
 * decisões em listas separadas — "animação de vitória" em cima, uma lista
 * plana de presentes com um botão Vitória/Derrota embaixo — e a tela lia como
 * "o presente da vitória é a Fênix". São a mesma pergunta, "o que acontece
 * quando o streamer vence?", vista de dois lados, e ficam juntas.
 *
 * A cutscene é um VÍDEO em `data/cutscenes/`, não uma animação da biblioteca
 * (ADR-014): o Roblox não aceita vídeo, e o espetáculo de fim de rodada é do
 * overlay, por cima da captura. A pasta é a lista — pôr o arquivo lá basta.
 *
 * Os presentes vivem na lista `placar` do preset, separada dos 6 slots
 * (ADR-007): presente de vitória não pode custar um slot de subida. O mesmo
 * presente não pode estar aqui E num slot — a ponte recusa antes de salvar
 * (R1.4) — e por isso os que já estão em slot não aparecem para escolher.
 */

/** Espelha `Tipos.VIDA_PADRAO_DO_PORTAL` no jogo e `VIDA_PADRAO_DO_PORTAL` na ponte. */
const VIDA_PADRAO_DO_PORTAL = 2000;

const RESULTADOS = [
  {
    efeito: "vitoria",
    campo: "cutsceneDeVitoria",
    rotulo: "Vitória",
    quando: "Chegar ao topo, ou receber um destes presentes.",
  },
  {
    efeito: "derrota",
    campo: "cutsceneDeDerrota",
    rotulo: "Derrota",
    quando: "O portal quebrar, ou receber um destes presentes.",
  },
];

export function EditorDePlacar({
  preset, catalogo, presenteIdsEmSlot, cutscenes,
  aoAdicionar, aoRemover, aoEscolherCutscene, aoRecarregarCutscenes, aoMudarPortal,
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

  // `cutscenes` chega pronto via prop (nenhuma chamada de rede aqui). Nulo =
  // ainda não chegou; sem lista = falha; lista vazia = pasta vazia, que é o
  // caso normal de quem ainda não pôs vídeo nenhum — e precisa dizer isso.
  const carregando = cutscenes == null;
  const naPasta = Array.isArray(cutscenes?.cutscenes) ? cutscenes.cutscenes : [];
  const ignorados = Array.isArray(cutscenes?.ignorados) ? cutscenes.ignorados : [];
  const pasta = cutscenes?.pasta ?? "data/cutscenes";

  const nomeDe = (presenteId) => porId.get(String(presenteId))?.nome ?? String(presenteId);

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
        e elas são cobradas uma a uma, cada queda com sua contagem. A{" "}
        <strong>cutscene</strong> é o vídeo que o overlay toca no OBS quando a
        rodada acaba, por cima do jogo.
      </p>

      {RESULTADOS.map(({ efeito, campo, rotulo, quando }) => {
        const escolhida = preset?.[campo] ?? null;
        const opcoes = opcoesDeCutscene(naPasta, escolhida);
        const sumiu = opcoes.some((opcao) => opcao.id === escolhida && opcao.ausente);
        const meus = vinculos.filter((vinculo) => vinculo.efeito === efeito);
        const idDoSelect = `placar-cutscene-${efeito}`;

        return (
          <div className={`placar-resultado placar-resultado-${efeito}`} key={efeito}>
            <header className="placar-resultado-cabecalho">
              <h3 className="placar-resultado-titulo">{rotulo}</h3>
              <span className="placar-resultado-quando">{quando}</span>
            </header>

            <div className="placar-campo">
              <label className="placar-rotulo" htmlFor={idDoSelect}>Cutscene</label>
              <select
                id={idDoSelect}
                className="placar-cutscene"
                value={escolhida ?? ""}
                disabled={carregando}
                onChange={(evento) => aoEscolherCutscene(campo, evento.target.value || null)}
              >
                <option value="">Nenhuma — só o placar muda</option>
                {opcoes.map((opcao) => (
                  <option key={opcao.id} value={opcao.id}>
                    {opcao.ausente ? `${opcao.arquivo} (não está na pasta)` : opcao.arquivo}
                  </option>
                ))}
              </select>
              {sumiu ? (
                <span className="placar-aviso">
                  Esse vídeo não está mais em {pasta}. Sem ele, nada toca e nada avisa.
                </span>
              ) : null}
            </div>

            <div className="placar-campo">
              <span className="placar-rotulo">Presentes</span>
              {meus.length === 0 ? (
                <span className="placar-presentes-vazio">
                  Nenhum presente dá {rotulo.toLowerCase()} ainda.
                </span>
              ) : (
                <ul className="placar-presentes" aria-label={`Presentes que dão ${rotulo.toLowerCase()}`}>
                  {meus.map((vinculo) => (
                    <li className="placar-presente" key={vinculo.presenteId}>
                      <span className="placar-presente-nome">{nomeDe(vinculo.presenteId)}</span>
                      <button
                        type="button"
                        className="placar-remover"
                        aria-label={`Tirar ${nomeDe(vinculo.presenteId)} da ${rotulo.toLowerCase()}`}
                        onClick={() => aoRemover(vinculo.presenteId)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* O select some quando não há o que acrescentar: oferecer uma
                  lista vazia é pior que não oferecer nada. */}
              {disponiveis.length > 0 ? (
                <select
                  className="placar-adicionar"
                  value=""
                  aria-label={`Acrescentar presente que dá ${rotulo.toLowerCase()}`}
                  onChange={(evento) => {
                    if (evento.target.value) aoAdicionar(evento.target.value, efeito);
                  }}
                >
                  <option value="">Acrescentar presente…</option>
                  {disponiveis.map((presente) => (
                    <option key={presente.presenteId} value={presente.presenteId}>
                      {presente.nome}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>
        );
      })}

      {/* De onde vêm os vídeos. Fica DEPOIS dos dois seletores porque é o
          rodapé deles: quem não achou o vídeo na lista lê aqui o motivo. */}
      <div className="placar-pasta">
        <span className="placar-pasta-texto">
          {carregando ? (
            "Procurando vídeos…"
          ) : naPasta.length === 0 ? (
            <>
              Nenhum vídeo em <code>{pasta}</code>. Ponha um <code>.mp4</code> ou{" "}
              <code>.webm</code> lá — nome só com minúsculas, números e hífen — e procure de novo.
            </>
          ) : (
            <>
              Os vídeos vêm de <code>{pasta}</code>: <code>.mp4</code> ou <code>.webm</code>,
              nome só com minúsculas, números e hífen.
            </>
          )}
        </span>
        {aoRecarregarCutscenes ? (
          <button
            type="button"
            className="placar-pasta-recarregar"
            onClick={aoRecarregarCutscenes}
            disabled={carregando}
          >
            Procurar de novo
          </button>
        ) : null}
        {ignorados.length > 0 ? (
          <span className="placar-pasta-ignorados">
            Fora do padrão de nome, e por isso fora da lista: {ignorados.join(", ")}.
          </span>
        ) : null}
      </div>

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
    </section>
  );
}
