import { useMemo, useState } from "react";

import { useTraducao } from "../i18n/useTraducao.js";
import { numero } from "../i18n/formatar.js";
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
  ["todos", "panel.movementTable.filterAll"],
  ["movem", "panel.movementTable.filterMoving"],
  ["excecoes", "panel.movementTable.filterEdited"],
  ["slots", "panel.movementTable.filterSlots"],
  ["parados", "panel.movementTable.filterIdle"],
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
  const { t } = useTraducao();
  const [busca, definirBusca] = useState("");
  const [filtro, definirFiltro] = useState("todos");
  const [limite, definirLimite] = useState(PASSO_DA_LISTA);
  // O que está sendo digitado, antes de virar número. Sem isto, apagar o campo
  // para escrever "-50" comitaria um delta 0 no meio da digitação.
  const [rascunhos, definirRascunhos] = useState({});

  const movimento = useMemo(() => movimentoDoPreset(preset), [preset]);
  //[[ Preset sem o bloco salvo mostra a conta, mas NÃO diz que está valendo.
  //
  // `movimentoDoPreset` preenche os buracos com o padrão para a lista abrir com
  // número em vez de vazio — é o "pré-definido" que o dono pediu. Se a chave
  // lesse esse padrão, ela apareceria ligada num preset que a ponte trata como
  // desligado, e o streamer sairia daqui achando que configurou. Ligar é o que
  // grava o bloco; até lá, a tela diz que é prévia. ]]
  const temTabela = preset?.movimento != null;
  const valendo = temTabela && movimento.ativo;
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
        <p className="movimento-vazio">{t("panel.movementTable.noPreset")}</p>
      </section>
    );
  }

  return (
    <section className="movimento">
      <header className="movimento-cabecalho">
        <h2 className="movimento-titulo">{t("panel.movementTable.title")}</h2>
        <span className="movimento-etiqueta">
          {t("panel.movementTable.catalogCount", { n: linhas.length })}
        </span>
      </header>

      <p className="movimento-explicacao">{t("panel.movementTable.explanation")}</p>

      <div className="movimento-regra">
        <label className="movimento-chave">
          <input
            type="checkbox"
            checked={valendo}
            onChange={(evento) => mudarRegra("ativo", evento.target.checked)}
          />
          <span>
            <strong>
              {valendo ? t("panel.movementTable.tableOn") : t("panel.movementTable.tableOff")}
            </strong>
            <span className="movimento-chave-nota">{t("panel.movementTable.toggleNote")}</span>
          </span>
        </label>

        {valendo ? null : (
          <p className="movimento-previa">
            {temTabela
              ? t("panel.movementTable.previewSaved")
              : t("panel.movementTable.previewUnsaved")}
          </p>
        )}

        <div className="movimento-campos">
          <label className="movimento-campo">
            <span className="movimento-campo-rotulo">{t("panel.movementTable.floorsPerCoin")}</span>
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
              {t("panel.movementTable.floorsPerCoinNote")}
            </span>
          </label>

          <label className="movimento-campo">
            <span className="movimento-campo-rotulo">{t("panel.movementTable.riseAnimation")}</span>
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
            <span className="movimento-campo-rotulo">{t("panel.movementTable.fallAnimation")}</span>
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
            <span className="movimento-campo-rotulo">{t("panel.movementTable.intensity")}</span>
            <select
              value={movimento.intensidade}
              onChange={(evento) => mudarRegra("intensidade", Number(evento.target.value))}
            >
              {[1, 2, 3, 4, 5].map((nivel) => (
                <option key={nivel} value={nivel}>{nivel}</option>
              ))}
            </select>
            <span className="movimento-campo-nota">{t("panel.movementTable.intensityNote")}</span>
          </label>
        </div>
      </div>

      <ul className="movimento-resumo">
        <li><strong>{resumo.movem}</strong> {t("panel.movementTable.summaryMoving")}</li>
        <li><strong>{resumo.excecoes}</strong> {t("panel.movementTable.summaryEdited")}</li>
        <li><strong>{resumo.parados}</strong> {t("panel.movementTable.summaryIdle")}</li>
        {resumo.maior ? (
          <li>
            {t("panel.movementTable.summaryBiggest")}{" "}
            <strong>{formatarDelta(resumo.maior.delta)}</strong> ({resumo.maior.nome})
          </li>
        ) : null}
      </ul>

      {/* A consequência que só aparece na conta: com 10 andares por moeda, um
          presente caro vale muitas torres. O jogo grampeia nas pontas, então
          nada quebra — mas a corrida acaba num presente só, e isso se descobre
          antes da live ou ao vivo. */}
      {valendo && resumo.varremATorre ? (
        <p className="pastilha pastilha-atencao movimento-aviso">
          {resumo.varremATorre > 1
            ? t("panel.movementTable.sweepWarnMany", {
                n: resumo.varremATorre,
                total: totalPlataformas,
              })
            : t("panel.movementTable.sweepWarnOne", {
                n: resumo.varremATorre,
                total: totalPlataformas,
              })}
        </p>
      ) : null}

      <div className="movimento-controles">
        <input
          type="search"
          className="movimento-busca"
          placeholder={t("panel.movementTable.searchPlaceholder")}
          aria-label={t("panel.movementTable.searchLabel")}
          value={busca}
          onChange={(evento) => {
            definirBusca(evento.target.value);
            definirLimite(PASSO_DA_LISTA);
          }}
          autoComplete="off"
          spellCheck={false}
        />
        <div className="movimento-filtros" role="group" aria-label={t("panel.movementTable.filterGroupLabel")}>
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
              {t(rotulo)}
            </button>
          ))}
        </div>
      </div>

      {visiveis.length === 0 ? (
        <p className="movimento-vazio">
          {linhas.length === 0
            ? t("panel.movementTable.emptyCatalog")
            : t("panel.movementTable.emptyFilter")}
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
                    <span>
                      {t("panel.movementTable.coins", {
                        n: numero(linha.moedas),
                      })}
                    </span>
                    <span
                      className="movimento-faixa"
                      style={{ background: corDaFaixa(linha.faixa) }}
                      aria-hidden="true"
                    />
                    <span>
                      {t("panel.movementTable.tier", {
                        name: NOME_DA_FAIXA[linha.faixa] ?? "?",
                      })}
                    </span>
                    {linha.ativo ? null : (
                      <span className="movimento-inativo">{t("panel.movementTable.offLive")}</span>
                    )}
                  </span>
                </span>

                {/* Texto junto do estado, nunca cor sozinha (02_DESIGN_SYSTEM). */}
                <span className={`movimento-origem movimento-origem-${linha.origem}`}>
                  {linha.origem === "slot"
                    ? t("panel.movementTable.originSlot", { n: linha.slot })
                    : null}
                  {linha.origem === "excecao" ? t("panel.movementTable.originManual") : null}
                  {linha.origem === "regra" ? t("panel.movementTable.originRule") : null}
                </span>

                <span className={`movimento-delta ${linha.delta > 0 ? "sobe" : linha.delta < 0 ? "desce" : "parado"}`}>
                  {daTabela ? (
                    <input
                      type="number"
                      step="1"
                      className="movimento-delta-campo"
                      aria-label={t("panel.movementTable.floorsFor", { name: linha.nome })}
                      value={valor}
                      onChange={(evento) => escreverDelta(linha, evento.target.value)}
                      onBlur={() => comitarDelta(linha)}
                      onKeyDown={(evento) => {
                        if (evento.key === "Enter") evento.currentTarget.blur();
                      }}
                    />
                  ) : (
                    <span
                      className="movimento-delta-fixo"
                      title={t("panel.movementTable.deltaFromSlotTitle")}
                    >
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
                      title={t("panel.movementTable.invertTitle")}
                    >
                      {t("panel.movementTable.invert")}
                    </button>
                  ) : null}
                  {linha.origem === "excecao" ? (
                    <button
                      type="button"
                      className="movimento-acao"
                      onClick={() => voltarParaRegra(linha)}
                      title={t("panel.movementTable.backToRuleTitle", {
                        delta: formatarDelta(linha.daRegra),
                      })}
                    >
                      {t("panel.movementTable.backToRule")}
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
          {t("panel.movementTable.showMore", {
            n: Math.min(PASSO_DA_LISTA, visiveis.length - limite),
            total: visiveis.length - limite,
          })}
        </button>
      ) : null}

      <div className="movimento-rodape">
        <button type="button" className="movimento-salvar" onClick={aoSalvar} disabled={salvando}>
          {salvando ? t("common.state.saving") : t("panel.movementTable.saveTable")}
        </button>
        <span className="movimento-rodape-nota">{t("panel.movementTable.footerNote")}</span>
      </div>
    </section>
  );
}
