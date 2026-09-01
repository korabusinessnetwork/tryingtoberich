import { useState } from "react";

import {
  avisoDeCurva,
  avisoDeDirecao,
  corDaFaixa,
  faixaDeMoedas,
  formatarDelta,
  NOME_DA_FAIXA,
} from "../lib/regras.js";
import "./CartaoDeSlot.css";

/**
 * O cartão de um slot. É **o componente mais importante do produto**
 * (`docs/06_COMPONENTES`): presente, animação, delta e intensidade têm de sair
 * numa olhada só, sem abrir nada.
 *
 * O contexto manda no desenho: o streamer está jogando parkour e falando com a
 * plateia, e olha o painel por 2 segundos por vez (02_DESIGN_SYSTEM, seção A).
 * Daí três escolhas que atravessam o arquivo inteiro:
 *
 * 1. **Uma hierarquia, não quatro campos.** O delta é o maior elemento do
 *    cartão, com seta e sinal; presente e animação são linhas de apoio; a
 *    intensidade é uma barra de 5 blocos que se conta sem ler. Nada aqui tem
 *    rótulo do tipo "Delta:" competindo com o valor.
 * 2. **O que mostra é o que edita.** A linha do presente é o botão que abre o
 *    catálogo, a da animação abre a biblioteca, o número do delta é o próprio
 *    campo. Nenhum ícone de lápis, nenhum modo de edição: o streamer não tem
 *    2 segundos para procurar onde clicar.
 * 3. **Cor só onde ela significa alguma coisa.** Faixa do presente e estado
 *    (indisponível, aviso) usam token de cor, sempre com texto junto. Direção
 *    de delta usa forma — seta e sinal — e não cor, porque o cartão já gasta
 *    âmbar em aviso e vermelho em indisponível, e porque forma sobrevive a
 *    daltonismo.
 *
 * Avisa, não bloqueia (R3): `avisoDeCurva` e `avisoDeDirecao` viram texto, e o
 * vínculo continua sendo escolha explícita do streamer (ADR-007).
 */

/** R2 — delta é inteiro de -200 a 200, e nunca 0. */
const DELTA_MINIMO = -200;
const DELTA_MAXIMO = 200;
const INTENSIDADES = [1, 2, 3, 4, 5];

/**
 * Lê o que foi digitado no campo de delta. Devolve `null` para tudo que a R2
 * não aceita — inclusive o `0` e o rascunho intermediário (`"-"`, `""`), que
 * não são erro do streamer, só ainda não são um valor.
 */
function lerDelta(texto) {
  const limpo = String(texto ?? "").trim();
  if (!/^[+-]?\d{1,3}$/.test(limpo)) return null;
  const valor = Number(limpo);
  if (!Number.isInteger(valor) || valor === 0) return null;
  if (valor < DELTA_MINIMO || valor > DELTA_MAXIMO) return null;
  return valor;
}

/** Passo do stepper. Pula o 0 em vez de parar nele: delta 0 não existe (R2). */
function passoDeDelta(delta, passo) {
  const bruto = (Number.isInteger(delta) ? delta : 0) + passo;
  const semZero = bruto === 0 ? bruto + passo : bruto;
  return Math.min(DELTA_MAXIMO, Math.max(DELTA_MINIMO, semZero));
}

const plural = (n, singular, plural) => (Math.abs(n) === 1 ? singular : plural);

/** Milhar com ponto: "1.000 moedas" lê mais rápido de canto de olho que "1000". */
function textoDeMoedas(moedas) {
  if (!Number.isFinite(moedas)) return "valor desconhecido";
  return `${moedas.toLocaleString("pt-BR")} ${plural(moedas, "moeda", "moedas")}`;
}

/** Duração com vírgula, do jeito que se lê em português. */
const textoDeDuracao = (segundos) =>
  Number.isFinite(segundos) ? `${segundos.toFixed(1).replace(".", ",")}s` : "—";

export function CartaoDeSlot({
  slot,
  presente,
  animacao,
  aoEditarPresente,
  aoEditarAnimacao,
  aoMudar,
  aoLimpar,
}) {
  // Rascunho é o texto enquanto o campo está em foco. Fora do foco o campo
  // mostra `formatarDelta`, com o `+` que diferencia subida de descida de
  // relance; em foco mostra o número cru, que é o que dá para digitar.
  const [rascunho, definirRascunho] = useState(null);
  const [iconeQuebrado, definirIconeQuebrado] = useState(false);

  const posicao = slot?.posicao ?? "—";
  const vazio = !slot || slot.vazio === true || slot.presenteId == null;

  // R1.3 — slot vazio é estado válido, não é buraco nem erro. O cartão explica
  // o que custa deixá-lo assim (ADR-007: presente fora dos 6 é descartado) e
  // oferece o caminho de saída num alvo grande.
  if (vazio) {
    return (
      <section className="cartao cartao-slot cartao-slot-vazio" aria-label={`Slot ${posicao}, vazio`}>
        <header className="cartao-slot-topo">
          <span className="cartao-slot-posicao">{posicao}</span>
          <span className="cartao-slot-rotulo">Vazio</span>
        </header>
        <p className="cartao-slot-explicacao secundario">
          Slot vazio é válido. Só lembre que presente fora dos 6 slots é descartado e
          aparece apenas no contador de não mapeados.
        </p>
        <button type="button" className="cartao-slot-preencher" onClick={aoEditarPresente}>
          Escolher presente
        </button>
      </section>
    );
  }

  const delta = Number.isFinite(slot.delta) ? slot.delta : 0;
  const intensidade = Number.isFinite(slot.intensidade) ? slot.intensidade : 1;
  const cooldownMs = Number.isFinite(slot.cooldownMs) ? slot.cooldownMs : 0;
  const subindo = delta > 0;
  const semDirecao = delta === 0;

  // A faixa é campo de exibição e pode vir velha do arquivo: se faltar, deriva.
  const faixa = presente ? (presente.faixa ?? faixaDeMoedas(presente.moedas)) : null;
  const estiloDaFaixa = faixa ? { "--faixa-do-slot": corDaFaixa(faixa) } : undefined;

  const indisponivel = !presente || presente.ativo === false;
  const temIcone = Boolean(presente?.iconeUrl ?? presente?.iconeLocal) && !iconeQuebrado;

  const avisos = [
    presente ? avisoDeCurva({ moedas: presente.moedas, delta }) : null,
    avisoDeDirecao({ animacao, delta }),
  ].filter(Boolean);

  const rascunhoInvalido = rascunho !== null && lerDelta(rascunho) === null;
  const guardadoInvalido = lerDelta(delta) === null;
  const textoDoCampo = rascunho ?? formatarDelta(delta);

  function aoDigitarDelta(evento) {
    const texto = evento.target.value;
    definirRascunho(texto);
    const valor = lerDelta(texto);
    if (valor !== null && valor !== delta) aoMudar?.({ delta: valor });
  }

  function aplicarPasso(passo) {
    definirRascunho(null);
    aoMudar?.({ delta: passoDeDelta(delta, passo) });
  }

  return (
    <section
      className={`cartao cartao-slot${indisponivel ? " cartao-slot-indisponivel" : ""}`}
      style={estiloDaFaixa}
      aria-label={`Slot ${posicao}`}
    >
      <header className="cartao-slot-topo">
        <span className="cartao-slot-posicao">{posicao}</span>
        {/* Marca periférica: o streamer vê que existe aviso sem ler o aviso. */}
        {avisos.length > 0 && (
          <span className="cartao-slot-alerta" aria-hidden="true">!</span>
        )}
        <button type="button" className="cartao-slot-limpar" onClick={aoLimpar}>
          Limpar
        </button>
      </header>

      <button
        type="button"
        className="cartao-slot-presente"
        onClick={aoEditarPresente}
        title={presente ? `${presente.nome} — ${textoDeMoedas(presente.moedas)}` : "Trocar presente"}
      >
        <span className="cartao-slot-icone" aria-hidden="true">
          {temIcone ? (
            <img
              className="cartao-slot-icone-img"
              src={presente.iconeUrl ?? presente.iconeLocal}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => definirIconeQuebrado(true)}
            />
          ) : (
            <span className="cartao-slot-icone-letra">{(presente?.nome ?? "?").slice(0, 1)}</span>
          )}
        </span>
        <span className="cartao-slot-presente-texto">
          <span className="cartao-slot-nome">{presente?.nome ?? "Presente fora do catálogo"}</span>
          <span className="cartao-slot-moedas secundario">
            {presente ? textoDeMoedas(presente.moedas) : String(slot.presenteId)}
          </span>
        </span>
        {faixa ? (
          <span className="cartao-slot-faixa" title={`Faixa ${NOME_DA_FAIXA[faixa]}`}>
            {NOME_DA_FAIXA[faixa]}
          </span>
        ) : null}
      </button>

      {/* Presente que sumiu da live continua referenciado pelo preset: o cartão
          diz isso com texto, nunca só com cor. */}
      {indisponivel && (
        <p className="pastilha pastilha-erro cartao-slot-indicador">
          {presente ? "Fora da live" : "Não está no catálogo"}
        </p>
      )}

      {/* O delta ocupa a largura inteira do cartão e os steppers vão para a
          linha de baixo. Com seis cartões lado a lado sobra pouca largura e
          muita altura, então é a largura que o número disputa — e o stepper
          fica com alvo bem maior que os 40px do mínimo. */}
      <div className="cartao-slot-delta">
        <span className="cartao-slot-campo">
          {!semDirecao && (
            <span className="cartao-slot-seta" aria-hidden="true">{subindo ? "▲" : "▼"}</span>
          )}
          <input
            className="cartao-slot-valor"
            value={textoDoCampo}
            onChange={aoDigitarDelta}
            onFocus={(evento) => {
              definirRascunho(String(delta));
              evento.target.select();
            }}
            onBlur={() => definirRascunho(null)}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            aria-label={`Delta do slot ${posicao}`}
          />
        </span>
        <div className="cartao-slot-passos">
          <button
            type="button"
            className="cartao-slot-passo"
            onClick={() => aplicarPasso(-1)}
            disabled={delta <= DELTA_MINIMO}
            aria-label="Diminuir delta"
          >
            −
          </button>
          <button
            type="button"
            className="cartao-slot-passo"
            onClick={() => aplicarPasso(1)}
            disabled={delta >= DELTA_MAXIMO}
            aria-label="Aumentar delta"
          >
            +
          </button>
        </div>
      </div>

      <p className="cartao-slot-legenda secundario">
        {semDirecao
          ? "sem direção"
          : `${subindo ? "sobe" : "desce"} ${Math.abs(delta)} ${plural(delta, "plataforma", "plataformas")}`}
      </p>

      {(rascunhoInvalido || guardadoInvalido) && (
        <p className="cartao-slot-aviso cartao-slot-aviso-regra">
          Delta é inteiro de {DELTA_MINIMO} a {DELTA_MAXIMO}, e nunca 0.
        </p>
      )}

      <button type="button" className="cartao-slot-animacao" onClick={aoEditarAnimacao}>
        <span className="cartao-slot-animacao-nome">{animacao?.nome ?? "Animação fora da biblioteca"}</span>
        <span className="cartao-slot-animacao-meta secundario">
          {animacao
            ? [
                animacao.direcao,
                `peso ${animacao.pesoVisual}`,
                textoDeDuracao(animacao.duracaoBase),
                animacao.aceitaDeltaVariavel === false ? "delta fixo" : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : String(slot.animacaoId ?? "—")}
        </span>
      </button>

      <div className="cartao-slot-secao">
        <span className="cartao-slot-legenda secundario">
          Intensidade {intensidade}
          {cooldownMs > 0 ? ` · espera ${cooldownMs}ms` : ""}
        </span>
        <div className="cartao-slot-niveis" role="group" aria-label="Intensidade">
          {INTENSIDADES.map((nivel) => (
            <button
              key={nivel}
              type="button"
              className={`cartao-slot-nivel${nivel <= intensidade ? " cartao-slot-nivel-aceso" : ""}`}
              aria-label={`Intensidade ${nivel}`}
              aria-pressed={nivel === intensidade}
              onClick={() => aoMudar?.({ intensidade: nivel })}
            />
          ))}
        </div>
      </div>

      {avisos.length > 0 && (
        <div className="cartao-slot-avisos" role="status">
          {avisos.map((texto) => (
            <p key={texto} className="cartao-slot-aviso">
              <span className="cartao-slot-aviso-rotulo">Aviso</span> {texto}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
