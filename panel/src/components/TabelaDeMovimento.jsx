import { useMemo, useState } from "react";

import {
  comExcecao,
  corDaFaixa,
  formatarDelta,
  linhasDeMovimento,
  movimentoDoPreset,
  NOME_DA_FAIXA,
  resumoDaTabela,
  semExcecao,
} from "../lib/regras.js";
import "./TabelaDeMovimento.css";

/**
 * A página de presentes: quanto a torre sobe ou desce com CADA presente.
 *
 * Os 6 slots (ADR-007) continuam sendo os presentes escolhidos, com animação e
 * delta próprios, e vivem na página "Ao vivo". Aqui mora o RESTO do catálogo,
 * que antes chegava e não fazia nada: cada presente ganha um delta calculado
 * por uma regra — moedas × multiplicador — e ajustável um a um. Ver ADR-016.
 *
 * Três decisões de tela, todas pela mesma razão (são 670 presentes):
 *
 * 1. **A regra fica no topo e vale para todos.** Mudar o multiplicador
 *    recalcula a lista inteira na hora. Ninguém digita 670 números.
 * 2. **Só o que foge da regra é guardado.** A linha que o streamer não tocou
 *    não vira dado no preset, e presente novo da TikTok já nasce com delta.
 * 3. **A lista abre parcial.** Busca e filtro primeiro, 100 linhas por vez
 *    depois: montar 670 linhas com campo editável trava a tela de quem só
 *    queria achar a rosa.
 *
 * O componente não chama rede: recebe catálogo e preset prontos e devolve o
 * bloco `movimento` inteiro para quem sabe salvar.
 */

const FILTROS = [
  ["todos", "Todos"],
  ["movem", "Que mexem na torre"],
  ["excecoes", "Editados à mão"],
  ["slots", "Nos 6 slots"],
  ["parados", "Que não fazem nada"],
];

const PASSO_DA_LISTA = 100;

/** Sem acento e sem caixa: o nome do presente é quase sempre em inglês. */
function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Ícone oficial da TikTok, com a inicial do nome como reserva. Igual ao seletor. */
function IconeDoPresente({ linha }) {
  const [indice, definirIndice] = useState(0);
  const fontes = [linha.iconeUrl, linha.iconeLocal].filter(Boolean);
  const src = fontes[indice];

  if (!src) {
    return (
      <span className="movimento-icone movimento-icone-vazio" aria-hidden="true">
        {linha.nome?.trim()?.slice(0, 1)?.toUpperCase() || "?"}
      </span>
    );
  }

  return (
    <img
      className="movimento-icone"
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => definirIndice((i) => i + 1)}
    />
  );
}

export function TabelaDeMovimento({
  preset,
  catalogo,
  animacoes,
  totalPlataformas,
  salvando,
  aoMudarMovimento,
  aoSalvar,
}) {
  const [busca, definirBusca] = useState("");
  const [filtro, definirFiltro] = useState("todos");
  const [limite, definirLimite] = useState(PASSO_DA_LISTA);
  // O que está sendo digitado, antes de virar número. Sem isto, apagar o campo
  // para escrever "-50" comitaria um delta 0 no meio da digitação.
  const [rascunhos, definirRascunhos] = useState({});

  const movimento = useMemo(() => movimentoDoPreset(preset), [preset]);
  const linhas = useMemo(() => linhasDeMovimento(catalogo, preset), [catalogo, preset]);
  const resumo = useMemo(() => resumoDaTabela(linhas, totalPlataformas), [linhas, totalPlataformas]);

  const visiveis = useMemo(() => {
    const alvo = normalizar(busca);
    return linhas.filter((linha) => {
      if (alvo && !normalizar(linha.nome).includes(alvo) && !linha.presenteId.includes(alvo)) return false;
      if (filtro === "movem") return linha.delta !== 0;
      if (filtro === "excecoes") return linha.origem === "excecao";
      if (filtro === "slots") return linha.origem === "slot";
      if (filtro === "parados") return linha.delta === 0;
      return true;
    });
  }, [linhas, busca, filtro]);

  const mudarRegra = (campo, valor) => aoMudarMovimento({ ...movimento, [campo]: valor });

  const escreverDelta = (linha, texto) => {
    definirRascunhos((atual) => ({ ...atual, [linha.presenteId]: texto }));
  };

  const comitarDelta = (linha) => {
    const texto = rascunhos[linha.presenteId];
    definirRascunhos((atual) => {
      const { [linha.presenteId]: _fora, ...resto } = atual;
      return resto;
    });
    if (texto === undefined) return;

    const numero = Number.parseInt(texto, 10);
    // Campo vazio ou lixo digitado não vira 0: volta ao que era. Zerar é uma
    // escolha, e ela se faz escrevendo 0.
    if (!Number.isInteger(numero) || numero === linha.delta) return;
    aoMudarMovimento(comExcecao(preset, linha.presenteId, numero, linha.daRegra));
  };

  const inverter = (linha) => {
    if (linha.delta === 0) return;
    aoMudarMovimento(comExcecao(preset, linha.presenteId, -linha.delta, linha.daRegra));
  };

  const voltarParaRegra = (linha) => aoMudarMovimento(semExcecao(preset, linha.presenteId));

  const animacoesPorDirecao = (direcao) =>
    (animacoes ?? []).filter((animacao) => animacao.direcao === direcao && animacao.ativa !== false);

  if (!preset) {
    return (
      <section className="movimento">
        <p className="movimento-vazio">Escolha ou crie um preset para montar a tabela de presentes.</p>
      </section>
    );
  }

  return (
    <section className="movimento">
      <header className="movimento-cabecalho">
        <h2 className="movimento-titulo">Presentes: subida e descida</h2>
        <span className="movimento-etiqueta">{linhas.length} no catálogo</span>
      </header>

      <p className="movimento-explicacao">
        Quanto a torre anda com cada presente da live. O número sai de uma conta — moedas do
        presente × multiplicador — e você muda o que quiser, um por um. Os 6 presentes dos slots
        não entram nesta conta: eles têm animação e delta próprios, na página Ao vivo.
      </p>

      <div className="movimento-regra">
        <label className="movimento-chave">
          <input
            type="checkbox"
            checked={movimento.ativo}
            onChange={(evento) => mudarRegra("ativo", evento.target.checked)}
          />
          <span>
            <strong>Tabela ligada</strong>
            <span className="movimento-chave-nota">
              Desligada, só os 6 slots mexem na torre e o resto volta a ser contado como não
              mapeado. O que você editou aqui fica guardado.
            </span>
          </span>
        </label>

        <div className="movimento-campos">
          <label className="movimento-campo">
            <span className="movimento-campo-rotulo">Andares por moeda</span>
            <input
              type="number"
              min="0"
              max="1000"
              step="1"
              value={movimento.multiplicador}
              onChange={(evento) => {
                const numero = Number.parseInt(evento.target.value, 10);
                if (Number.isInteger(numero) && numero >= 0) mudarRegra("multiplicador", numero);
              }}
            />
            <span className="movimento-campo-nota">
              10 quer dizer: presente de 1 moeda sobe 10 andares.
            </span>
          </label>

          <label className="movimento-campo">
            <span className="movimento-campo-rotulo">Animação de quem sobe</span>
            <select
              value={movimento.animacaoDeSubida}
              onChange={(evento) => mudarRegra("animacaoDeSubida", evento.target.value)}
            >
              {animacoesPorDirecao("subida").map((animacao) => (
                <option key={animacao.id} value={animacao.id}>
                  {animacao.nome} · {animacao.duracaoBase}s
                </option>
              ))}
            </select>
          </label>

          <label className="movimento-campo">
            <span className="movimento-campo-rotulo">Animação de quem desce</span>
            <select
              value={movimento.animacaoDeDescida}
              onChange={(evento) => mudarRegra("animacaoDeDescida", evento.target.value)}
            >
              {animacoesPorDirecao("descida").map((animacao) => (
                <option key={animacao.id} value={animacao.id}>
                  {animacao.nome} · {animacao.duracaoBase}s
                </option>
              ))}
            </select>
          </label>

          <label className="movimento-campo">
            <span className="movimento-campo-rotulo">Intensidade</span>
            <select
              value={movimento.intensidade}
              onChange={(evento) => mudarRegra("intensidade", Number(evento.target.value))}
            >
              {[1, 2, 3, 4, 5].map((nivel) => (
                <option key={nivel} value={nivel}>{nivel}</option>
              ))}
            </select>
            <span className="movimento-campo-nota">Vale para todo presente da tabela.</span>
          </label>
        </div>
      </div>

      <ul className="movimento-resumo">
        <li><strong>{resumo.movem}</strong> mexem na torre</li>
        <li><strong>{resumo.excecoes}</strong> editados à mão</li>
        <li><strong>{resumo.parados}</strong> não fazem nada</li>
        {resumo.maior ? (
          <li>
            maior: <strong>{formatarDelta(resumo.maior.delta)}</strong> ({resumo.maior.nome})
          </li>
        ) : null}
      </ul>

      {/* A consequência que só aparece na conta: com 10 andares por moeda, um
          presente caro vale muitas torres. O jogo grampeia nas pontas, então
          nada quebra — mas a corrida acaba num presente só, e isso se descobre
          antes da live ou ao vivo. */}
      {resumo.varremATorre ? (
        <p className="pastilha pastilha-atencao movimento-aviso">
          {resumo.varremATorre} presente{resumo.varremATorre > 1 ? "s" : ""} sozinho
          {resumo.varremATorre > 1 ? "s" : ""} já {resumo.varremATorre > 1 ? "andam" : "anda"} a torre
          inteira ({totalPlataformas} andares). Não quebra nada — o jogo para nas pontas —, mas a
          corrida acaba num presente. Baixe o multiplicador ou edite esses presentes.
        </p>
      ) : null}

      <div className="movimento-controles">
        <input
          type="search"
          className="movimento-busca"
          placeholder="Buscar presente pelo nome…"
          aria-label="Buscar presente pelo nome"
          value={busca}
          onChange={(evento) => {
            definirBusca(evento.target.value);
            definirLimite(PASSO_DA_LISTA);
          }}
          autoComplete="off"
          spellCheck={false}
        />
        <div className="movimento-filtros" role="group" aria-label="Filtrar presentes">
          {FILTROS.map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              className={filtro === id ? "movimento-filtro movimento-filtro-ativo" : "movimento-filtro"}
              aria-pressed={filtro === id}
              onClick={() => {
                definirFiltro(id);
                definirLimite(PASSO_DA_LISTA);
              }}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {visiveis.length === 0 ? (
        <p className="movimento-vazio">
          {linhas.length === 0
            ? "O catálogo está vazio. Atualize a lista da TikTok na página Ao vivo, ao escolher um presente."
            : "Nenhum presente com esse filtro."}
        </p>
      ) : (
        <ul className="movimento-lista">
          {visiveis.slice(0, limite).map((linha) => {
            const daTabela = linha.origem !== "slot";
            const valor = rascunhos[linha.presenteId] ?? String(linha.delta);

            return (
              <li key={linha.presenteId} className={`movimento-linha movimento-linha-${linha.origem}`}>
                <IconeDoPresente linha={linha} />

                <span className="movimento-presente">
                  <span className="movimento-nome">{linha.nome}</span>
                  <span className="movimento-detalhe">
                    <span>{linha.moedas.toLocaleString("pt-BR")} moedas</span>
                    <span
                      className="movimento-faixa"
                      style={{ background: corDaFaixa(linha.faixa) }}
                      aria-hidden="true"
                    />
                    <span>Faixa {NOME_DA_FAIXA[linha.faixa] ?? "?"}</span>
                    {linha.ativo ? null : <span className="movimento-inativo">fora da live</span>}
                  </span>
                </span>

                {/* Texto junto do estado, nunca cor sozinha (02_DESIGN_SYSTEM). */}
                <span className={`movimento-origem movimento-origem-${linha.origem}`}>
                  {linha.origem === "slot" ? `slot ${linha.slot}` : null}
                  {linha.origem === "excecao" ? "à mão" : null}
                  {linha.origem === "regra" ? "da conta" : null}
                </span>

                <span className={`movimento-delta ${linha.delta > 0 ? "sobe" : linha.delta < 0 ? "desce" : "parado"}`}>
                  {daTabela ? (
                    <input
                      type="number"
                      step="1"
                      className="movimento-delta-campo"
                      aria-label={`Andares de ${linha.nome}`}
                      value={valor}
                      onChange={(evento) => escreverDelta(linha, evento.target.value)}
                      onBlur={() => comitarDelta(linha)}
                      onKeyDown={(evento) => {
                        if (evento.key === "Enter") evento.currentTarget.blur();
                      }}
                    />
                  ) : (
                    <span className="movimento-delta-fixo" title="Vem do slot, na página Ao vivo">
                      {formatarDelta(linha.delta)}
                    </span>
                  )}
                </span>

                <span className="movimento-acoes">
                  {daTabela ? (
                    <button
                      type="button"
                      className="movimento-acao"
                      onClick={() => inverter(linha)}
                      disabled={linha.delta === 0}
                      title="Troca o sinal: quem sobe passa a descer"
                    >
                      Inverter
                    </button>
                  ) : null}
                  {linha.origem === "excecao" ? (
                    <button
                      type="button"
                      className="movimento-acao"
                      onClick={() => voltarParaRegra(linha)}
                      title={`Volta para a conta: ${formatarDelta(linha.daRegra)}`}
                    >
                      Voltar à conta
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {visiveis.length > limite ? (
        <button
          type="button"
          className="movimento-mais"
          onClick={() => definirLimite((atual) => atual + PASSO_DA_LISTA)}
        >
          Mostrar mais {Math.min(PASSO_DA_LISTA, visiveis.length - limite)} de {visiveis.length - limite}
        </button>
      ) : null}

      <div className="movimento-rodape">
        <button type="button" className="movimento-salvar" onClick={aoSalvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar tabela"}
        </button>
        <span className="movimento-rodape-nota">
          Vale a partir do próximo presente. Trocar de preset no meio da live troca a tabela junto.
        </span>
      </div>
    </section>
  );
}
