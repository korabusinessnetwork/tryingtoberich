import { useEffect, useRef, useState } from "react";

import { animacoesOferecidas, avisoDeDirecao } from "../lib/regras.js";
import "./SeletorDeAnimacao.css";

/**
 * Modal de escolha entre as animações ATIVAS da biblioteca (ver
 * 03_REGRAS_DE_NEGOCIO/biblioteca-animacoes.md).
 *
 * `ativa:false` é animação aposentada, e some da lista — mesma regra que o
 * `SeletorDePresente` aplica a `presente.ativo`, e pelo mesmo motivo: a rota
 * `/api/animacoes` serve a biblioteca INTEIRA porque preset salvo pode apontar
 * para uma aposentada e o cartão do slot precisa do nome dela para mostrar.
 * Filtrar é trabalho de quem oferece escolha, não de quem serve o dado.
 *
 * A exceção é a que já está escolhida neste slot: ela continua na lista, marcada
 * como aposentada. Escondê-la deixaria o slot sem nada selecionado na tela e o
 * streamer trocaria sem saber que estava trocando.
 *
 * R1.5 / ADR-007: qualquer animação vale em qualquer slot, sem restrição. A
 * `direcao` de cada animação é só informativa — quem decide para onde o
 * boneco vai é o sinal do `delta` do slot (R2). Por isso o componente nunca
 * desabilita uma opção: quando `deltaDoSlot` discorda da direção, ele mostra
 * uma observação e deixa escolher do mesmo jeito. `avisoDeDirecao` já existe
 * em lib/regras.js pronta para esse cálculo — reaproveitada aqui, não
 * duplicada.
 *
 * `pesoVisual` (quanto de tela o efeito ocupa) e `duracaoBase` (quanto tempo o
 * streamer fica sem controlar o boneco, R11) são só exibidos e filtráveis:
 * este componente não recebe o valor em moedas do presente do slot, então não
 * tenta "sugerir" — quem tem esse dado para cruzar é quem monta o slot.
 */
export function SeletorDeAnimacao({ aberto, animacoes, animacaoIdAtual, deltaDoSlot, aoEscolher, aoFechar }) {
  const [filtroDirecao, definirFiltroDirecao] = useState("todas");
  const [pesosAtivos, definirPesosAtivos] = useState(() => new Set());
  const modalRef = useRef(null);

  // Fecha com Escape enquanto estiver aberto.
  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(evento) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto, aoFechar]);

  // Reabrir para outro slot não deve herdar o filtro do slot anterior.
  useEffect(() => {
    if (!aberto) return;
    definirFiltroDirecao("todas");
    definirPesosAtivos(new Set());
    modalRef.current?.focus();
  }, [aberto]);

  if (!aberto) return null;

  // `animacoes` chega pronto via prop (nenhuma chamada de rede aqui). Mesmo
  // assim o componente que busca dado tem que cobrir carregando/erro/vazio
  // (06_COMPONENTES): null/undefined ainda não chegou, algo que não é lista é
  // falha, lista vazia é falha de cadastro (a biblioteca nunca deveria ser vazia).
  const carregando = animacoes == null;
  const comErro = !carregando && !Array.isArray(animacoes);
  const semCadastro = !carregando && !comErro && animacoes.length === 0;
  // Aposentada só aparece se já for a escolhida deste slot. A regra é uma função
  // pura em lib/regras.js porque o testador aplica a MESMA, e duas cópias dela
  // divergiriam no dia em que uma das duas telas mudasse.
  const listaCompleta =
    !carregando && !comErro && !semCadastro ? animacoesOferecidas(animacoes, animacaoIdAtual) : [];

  const listaFiltrada = listaCompleta.filter((animacao) => {
    const passaDirecao = filtroDirecao === "todas" || animacao.direcao === filtroDirecao;
    const passaPeso = pesosAtivos.size === 0 || pesosAtivos.has(animacao.pesoVisual);
    return passaDirecao && passaPeso;
  });
  const filtroAtivo = filtroDirecao !== "todas" || pesosAtivos.size > 0;
  const semResultadoDeFiltro = listaCompleta.length > 0 && listaFiltrada.length === 0;

  function alternarPeso(peso) {
    definirPesosAtivos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(peso)) proximo.delete(peso);
      else proximo.add(peso);
      return proximo;
    });
  }

  function limparFiltros() {
    definirFiltroDirecao("todas");
    definirPesosAtivos(new Set());
  }

  function escolher(animacao) {
    aoEscolher(animacao.id);
    aoFechar();
  }

  return (
    <div className="seletor-anim-camada" onClick={aoFechar}>
      <div
        ref={modalRef}
        className="seletor-anim-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seletor-anim-titulo"
        tabIndex={-1}
        onClick={(evento) => evento.stopPropagation()}
      >
        <header className="seletor-anim-cabecalho">
          <h2 id="seletor-anim-titulo">Escolher animação</h2>
          <button type="button" className="seletor-anim-fechar" onClick={aoFechar} aria-label="Fechar">
            ×
          </button>
        </header>

        {!carregando && !comErro && !semCadastro && (
          <div className="seletor-anim-filtros" role="group" aria-label="Filtrar animações">
            <div className="seletor-anim-filtro-grupo" role="group" aria-label="Filtrar por direção">
              {[
                ["todas", "Todas"],
                ["subida", "↑ Subida"],
                ["descida", "↓ Descida"],
              ].map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  className="seletor-anim-chip"
                  aria-pressed={filtroDirecao === valor}
                  onClick={() => definirFiltroDirecao(valor)}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            <div className="seletor-anim-filtro-grupo" role="group" aria-label="Filtrar por peso visual">
              {[1, 2, 3, 4, 5].map((peso) => (
                <button
                  key={peso}
                  type="button"
                  className="seletor-anim-chip seletor-anim-chip-peso"
                  aria-pressed={pesosAtivos.has(peso)}
                  title={`Peso visual ${peso}`}
                  onClick={() => alternarPeso(peso)}
                >
                  {peso}
                </button>
              ))}
            </div>

            {filtroAtivo && (
              <button type="button" className="seletor-anim-limpar" onClick={limparFiltros}>
                Limpar filtro
              </button>
            )}

            <span className="seletor-anim-contagem secundario">
              {listaFiltrada.length} de {listaCompleta.length}
            </span>
          </div>
        )}

        <div className="seletor-anim-corpo">
          {carregando && <p className="secundario">Carregando animações…</p>}

          {comErro && <p className="pastilha pastilha-erro">Não foi possível carregar a biblioteca de animações.</p>}

          {semCadastro && (
            <p className="secundario">Nenhuma animação cadastrada. Confira o índice de animações do jogo.</p>
          )}

          {semResultadoDeFiltro && (
            <div className="seletor-anim-vazio">
              <p className="secundario">Nenhuma animação encontrada com esse filtro.</p>
              <button type="button" onClick={limparFiltros}>Limpar filtro</button>
            </div>
          )}

          {!carregando && !comErro && !semCadastro && !semResultadoDeFiltro && (
            <ul className="seletor-anim-lista">
              {listaFiltrada.map((animacao) => {
                const selecionada = animacao.id === animacaoIdAtual;
                const aviso = avisoDeDirecao({ animacao, delta: deltaDoSlot });
                return (
                  <li key={animacao.id}>
                    <button
                      type="button"
                      className={
                        selecionada
                          ? "seletor-anim-cartao seletor-anim-cartao-selecionada"
                          : "seletor-anim-cartao"
                      }
                      aria-pressed={selecionada}
                      onClick={() => escolher(animacao)}
                    >
                      <div className="seletor-anim-cartao-topo">
                        <span className="seletor-anim-nome">{animacao.nome}</span>
                        {selecionada && (
                          <span className="seletor-anim-marca" aria-hidden="true">✓</span>
                        )}
                      </div>

                      <div className="seletor-anim-meta">
                        <span className="secundario">
                          {animacao.direcao === "subida" ? "↑ Subida" : "↓ Descida"}
                        </span>
                        <span className="secundario">{formatarDuracao(animacao.duracaoBase)}</span>
                      </div>

                      <div
                        className="seletor-anim-peso"
                        title={`Peso visual ${animacao.pesoVisual} de 5 — quanto de tela o efeito ocupa`}
                      >
                        {pesoParaPontos(animacao.pesoVisual).map((preenchido, indice) => (
                          <span
                            key={indice}
                            className={preenchido ? "seletor-anim-ponto seletor-anim-ponto-cheio" : "seletor-anim-ponto"}
                            aria-hidden="true"
                          />
                        ))}
                        <span className="secundario">peso {animacao.pesoVisual}</span>
                      </div>

                      {!animacao.aceitaDeltaVariavel && (
                        <span className="seletor-anim-fixo secundario">Efeito fixo — não estica com o delta</span>
                      )}

                      {animacao.ativa === false && (
                        <p className="seletor-anim-aviso">
                          Aposentada da biblioteca, mas continua neste slot.
                        </p>
                      )}

                      {aviso && <p className="seletor-anim-aviso">{aviso}</p>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Helper local — `lib/regras.js` não tem formatação de duração de animação
 * (só `formatarLatencia`, que é ms de rede, outra grandeza). Fica aqui por
 * ser exclusivo deste seletor. Vírgula decimal pt-BR, igual à tabela de
 * biblioteca-animacoes.md ("1,6s").
 */
function formatarDuracao(segundos) {
  if (!Number.isFinite(segundos)) return "—";
  return `${segundos.toFixed(1).replace(".", ",")}s`;
}

/** Peso visual 1 a 5 como pontos preenchidos, para leitura de canto de olho. */
function pesoParaPontos(peso) {
  return Array.from({ length: 5 }, (_, indice) => indice < peso);
}
