import { useEffect, useMemo, useRef, useState } from "react";

import { corDaFaixa, NOME_DA_FAIXA } from "../lib/regras.js";
import "./SeletorDePresente.css";

/**
 * Modal de escolha de presente para um slot (`docs/06_COMPONENTES`).
 *
 * Regras que moldam este arquivo:
 * - 04_MODELAGEM/catalogo-presentes.md — busca por nome, ordenação por valor,
 *   ícone oficial (`iconeUrl`) com `iconeLocal` como alternativa, e presente
 *   `ativo: false` só aparece se já estiver em uso, marcado como indisponível.
 * - R1.4 (03_REGRAS_DE_NEGOCIO) — o mesmo presente não pode ocupar dois slots
 *   do mesmo preset: os já usados em OUTROS slots (`presenteIdsUsados`)
 *   aparecem desabilitados com o motivo, nunca somem da lista.
 * - Nenhuma chamada de rede: o catálogo chega pronto pela prop `catalogo`.
 */

/**
 * Sem acento e sem caixa: o nome do presente é quase sempre inglês, mas a
 * busca não pode depender de o streamer digitar exatamente igual.
 * Helper que faltava em `lib/regras.js` — implementado aqui, localmente,
 * porque este arquivo não pode tocar em `lib/` (regra anti-colisão).
 */
function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Ícone oficial: `iconeUrl` primeiro, `iconeLocal` como alternativa. Se as
 * duas fontes falharem ao carregar — ou as duas forem `null`, como o
 * catálogo inteiro da semente hoje — o espaço fica reservado com a inicial
 * do nome, nunca com layout quebrado.
 */
function IconeDoPresente({ presente }) {
  const fontes = useMemo(
    () => [presente.iconeUrl, presente.iconeLocal].filter(Boolean),
    [presente.iconeUrl, presente.iconeLocal],
  );
  const [indice, definirIndice] = useState(0);
  const src = fontes[indice];

  if (!src) {
    return (
      <span className="seletor-presente-icone seletor-presente-icone-vazio" aria-hidden="true">
        {presente.nome?.trim()?.slice(0, 1)?.toUpperCase() || "?"}
      </span>
    );
  }

  return (
    <img
      className="seletor-presente-icone"
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => definirIndice((i) => i + 1)}
    />
  );
}

export function SeletorDePresente({
  aberto,
  catalogo,
  presenteIdAtual,
  presenteIdsUsados,
  atualizando,
  aoAtualizar,
  aoEscolher,
  aoFechar,
}) {
  const [busca, definirBusca] = useState("");
  const campoDeBuscaRef = useRef(null);

  // `aoFechar` pode trocar de identidade a cada render do pai (função inline
  // muito comum em quem abre modal). Guardar a versão mais recente num ref e
  // manter os efeitos abaixo dependentes só de `aberto` evita duas armadilhas:
  // reabrir o listener de Escape à toa e, pior, zerar a busca no meio da
  // digitação por causa de um re-render do pai que não tem nada a ver com o
  // modal.
  const aoFecharRef = useRef(aoFechar);
  aoFecharRef.current = aoFechar;

  // Foco no campo de busca ao abrir, e busca sempre começa limpa: reabrir o
  // modal para outro slot com o filtro do slot anterior preso confundiria.
  useEffect(() => {
    if (!aberto) return;
    definirBusca("");
    campoDeBuscaRef.current?.focus();
  }, [aberto]);

  // Escape fecha.
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (evento) => {
      if (evento.key === "Escape") aoFecharRef.current?.();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  const idsUsadosEmOutrosSlots = useMemo(
    () => new Set(presenteIdsUsados ?? []),
    [presenteIdsUsados],
  );

  // `catalogo` normalizado é a única fonte dos estados de carregando/erro/
  // vazio abaixo — não existe prop separada pra isso porque o dado chega
  // pronto: enquanto não chegou é `null`/`undefined` (carregando), se chegou
  // deformado não tem `presentes` como array (erro), e se chegou certinho mas
  // sem nenhum presente é o vazio de verdade.
  const presentesDoCatalogo = Array.isArray(catalogo?.presentes) ? catalogo.presentes : null;

  const visiveis = useMemo(() => {
    if (!presentesDoCatalogo) return [];
    const alvo = normalizar(busca);
    return presentesDoCatalogo
      // ativo:false só aparece se já estiver em uso (neste slot ou em outro);
      // do contrário some da lista, como manda o doc do catálogo.
      .filter(
        (presente) =>
          presente.ativo ||
          presente.presenteId === presenteIdAtual ||
          idsUsadosEmOutrosSlots.has(presente.presenteId),
      )
      .filter((presente) => !alvo || normalizar(presente.nome).includes(alvo))
      .sort((a, b) => a.moedas - b.moedas);
  }, [presentesDoCatalogo, presenteIdAtual, idsUsadosEmOutrosSlots, busca]);

  if (!aberto) return null;

  const carregando = catalogo == null;
  const comErro = !carregando && presentesDoCatalogo === null;
  const catalogoVazio = !carregando && !comErro && presentesDoCatalogo.length === 0;
  const semResultado = !carregando && !comErro && !catalogoVazio && visiveis.length === 0;

  const fecharSeForFundo = (evento) => {
    if (evento.target === evento.currentTarget) aoFechar?.();
  };

  return (
    <div className="seletor-presente-fundo" onClick={fecharSeForFundo}>
      <div
        className="seletor-presente"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seletor-presente-titulo"
      >
        <header className="seletor-presente-cabecalho">
          <h2 id="seletor-presente-titulo">Escolher presente</h2>
          <button
            type="button"
            className="seletor-presente-fechar"
            onClick={aoFechar}
            aria-label="Fechar"
          >
            ×
          </button>
        </header>

        {catalogo?.confirmado === false && (
          <div className="seletor-presente-semente">
            <p className="seletor-presente-semente-texto">
              Catálogo da <strong>semente de desenvolvimento</strong> — os valores em moedas
              ainda não são confirmados. A primeira coleta da live sobrescreve esses números.
            </p>
            {/* O aviso apontava um problema e não oferecia a saída. A coleta
                fala com a TikTok pela ponte e traz os ids e valores de verdade
                — que é o que faz o presente do preset casar com o presente que
                o espectador vê no painel de desejos. */}
            {aoAtualizar && (
              <button
                type="button"
                className="seletor-presente-atualizar"
                onClick={aoAtualizar}
                disabled={atualizando}
              >
                {atualizando ? "Coletando…" : "Coletar da live agora"}
              </button>
            )}
          </div>
        )}

        <input
          ref={campoDeBuscaRef}
          type="search"
          className="seletor-presente-busca"
          placeholder="Buscar presente pelo nome…"
          aria-label="Buscar presente pelo nome"
          value={busca}
          onChange={(evento) => definirBusca(evento.target.value)}
          disabled={carregando || comErro}
          autoComplete="off"
          spellCheck={false}
        />

        <div className="seletor-presente-lista">
          {carregando && <p className="seletor-presente-estado">Carregando catálogo…</p>}

          {comErro && (
            <p className="seletor-presente-estado erro">
              Não foi possível carregar o catálogo de presentes.
            </p>
          )}

          {catalogoVazio && (
            <p className="seletor-presente-estado">
              O catálogo está vazio. Conecte a live ou carregue a semente de desenvolvimento.
            </p>
          )}

          {semResultado && <p className="seletor-presente-estado">Nada encontrado para “{busca}”.</p>}

          {!carregando &&
            !comErro &&
            visiveis.map((presente) => {
              const ehAtual = presente.presenteId === presenteIdAtual;
              const usadoEmOutroSlot = !ehAtual && idsUsadosEmOutrosSlots.has(presente.presenteId);
              const motivo = usadoEmOutroSlot
                ? "Já está em outro slot deste preset."
                : !presente.ativo
                  ? "Não está mais disponível na live, mas continua neste slot."
                  : null;
              const moedasTexto = Number.isFinite(presente.moedas)
                ? `${presente.moedas.toLocaleString("pt-BR")} moedas`
                : "valor desconhecido";

              return (
                <button
                  key={presente.presenteId}
                  type="button"
                  className={`seletor-presente-item${ehAtual ? " atual" : ""}`}
                  disabled={usadoEmOutroSlot}
                  title={motivo ?? undefined}
                  onClick={() => {
                    aoEscolher?.(presente.presenteId);
                    aoFechar?.();
                  }}
                >
                  <IconeDoPresente presente={presente} />
                  <span className="seletor-presente-info">
                    <span className="seletor-presente-nome">{presente.nome}</span>
                    <span className="seletor-presente-detalhe">
                      <span>{moedasTexto}</span>
                      <span
                        className="seletor-presente-faixa"
                        style={{ background: corDaFaixa(presente.faixa) }}
                        aria-hidden="true"
                      />
                      <span>Faixa {NOME_DA_FAIXA[presente.faixa] ?? "?"}</span>
                    </span>
                  </span>
                  {ehAtual && <span className="seletor-presente-selo-atual">atual</span>}
                  {motivo && <span className="seletor-presente-motivo">{motivo}</span>}
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
