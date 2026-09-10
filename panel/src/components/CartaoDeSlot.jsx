import { useState } from "react";

import { traduzir } from "../i18n/traduzir.js";
import { useTraducao } from "../i18n/useTraducao.js";
import { numero } from "../i18n/formatar.js";
import {
  avisoDeCurva,
  avisoDeDirecao,
  corDaFaixa,
  faixaDeMoedas,
  formatarDelta,
  NOME_DA_FAIXA,
} from "../lib/regras.js";
import { AvisoDeCurva } from "./AvisoDeCurva.jsx";
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

/**
 * R2 — delta é inteiro e nunca 0. **Não tem teto.**
 *
 * A faixa fixa de -200 a 200 saiu por decisão do dono: com a torre em 5000
 * andares, 200 é 4% dela, e o campo recusava em vermelho justamente o vínculo
 * grande que faz o presente caro valer a pena. Quem grampeia o resultado é o
 * jogo, nas pontas da torre (`Tipos.limitarPlataforma`) — nunca o campo.
 *
 * `Number.isSafeInteger` continua de pé, e não é faixa: é o limite em que o
 * JavaScript para de contar de um em um. Passar dali seria gravar no preset um
 * número que nem soma direito.
 */
const INTENSIDADES = [1, 2, 3, 4, 5];

/**
 * Lê o que foi digitado no campo de delta. Devolve `null` para tudo que a R2
 * não aceita — inclusive o `0` e o rascunho intermediário (`"-"`, `""`), que
 * não são erro do streamer, só ainda não são um valor.
 */
function lerDelta(texto) {
  const limpo = String(texto ?? "").trim();
  if (!/^[+-]?\d+$/.test(limpo)) return null;
  const valor = Number(limpo);
  if (!Number.isSafeInteger(valor) || valor === 0) return null;
  return valor;
}

/** Passo do stepper. Pula o 0 em vez de parar nele: delta 0 não existe (R2). */
function passoDeDelta(delta, passo) {
  const bruto = (Number.isInteger(delta) ? delta : 0) + passo;
  return bruto === 0 ? bruto + passo : bruto;
}

const plural = (n, singular, plural) => (Math.abs(n) === 1 ? singular : plural);

/** Milhar com ponto: "1.000 moedas" lê mais rápido de canto de olho que "1000". */
function textoDeMoedas(moedas) {
  if (!Number.isFinite(moedas)) return traduzir("panel.slotCard.unknownValue");
  return traduzir(plural(moedas, "panel.slotCard.coinsOne", "panel.slotCard.coinsMany"), {
    n: numero(moedas),
  });
}

/** Duração com vírgula, do jeito que se lê em português. */
const textoDeDuracao = (segundos) =>
  Number.isFinite(segundos)
    ? traduzir("panel.slotCard.durationSeconds", { n: segundos.toFixed(1).replace(".", ",") })
    : traduzir("common.value.none");

export function CartaoDeSlot({
  slot,
  presente,
  animacao,
  ehExtra,
  catalogoNaoColetado,
  aoEditarPresente,
  aoEditarAnimacao,
  aoMudar,
  aoLimpar,
}) {
  const { t } = useTraducao();

  // Rascunho é o texto enquanto o campo está em foco. Fora do foco o campo
  // mostra `formatarDelta`, com o `+` que diferencia subida de descida de
  // relance; em foco mostra o número cru, que é o que dá para digitar.
  const [rascunho, definirRascunho] = useState(null);
  const [iconeQuebrado, definirIconeQuebrado] = useState(false);

  const posicao = slot?.posicao ?? t("common.value.none");
  const vazio = !slot || slot.vazio === true || slot.presenteId == null;

  //[[ Para um EXTRA, "Limpar" e "Remover de vez" são a mesma operação.
  //
  // O preset guarda os slots num array e não tem como gravar "posição 7,
  // vazia": o schema exige presente, animação, delta e intensidade. Limpar já
  // tirava o slot do array — o que mudou é a consequência, porque a grade
  // agora vai até a maior posição usada: tirar o extra do topo faz o cartão
  // sumir na hora. Dois botões que chamam a mesma coisa na tela principal
  // custariam um clique errado por live; o que muda é o RÓTULO, que passa a
  // dizer o que de fato acontece. ]]
  const rotuloDeLimpar = ehExtra ? t("common.action.remove") : t("panel.slotCard.clear");

  // R1.3 — slot vazio é estado válido, não é buraco nem erro. O cartão diz o
  // que acontece com o presente que fica de fora e oferece a saída num alvo
  // grande.
  if (vazio) {
    return (
      <section
        className="cartao cartao-slot cartao-slot-vazio"
        aria-label={t("panel.slotCard.emptySlotAria", { n: posicao })}
      >
        <header className="cartao-slot-topo">
          <span className={`cartao-slot-posicao${ehExtra ? " cartao-slot-posicao-extra" : ""}`}>
            {posicao}
          </span>
          <span className="cartao-slot-rotulo">
            {ehExtra ? t("panel.slotCard.emptyExtra") : t("panel.slotCard.empty")}
          </span>
        </header>
        {/* O texto antigo dizia que presente fora dos 6 era descartado. Isso
            deixou de ser verdade no ADR-016: a tabela de movimento move a
            torre com o catálogo inteiro, e o slot passou a ser o lugar de dar
            animação e delta PRÓPRIOS a um presente. Manter a frase velha faria
            o streamer preencher slot por medo de perder presente. */}
        <p className="cartao-slot-explicacao secundario">{t("panel.slotCard.emptyExplanation")}</p>
        {/* Buraco no meio dos extras: a posição continua existindo porque ela
            viaja para os eventos da sessão, e renumerar reescreveria a que slot
            um evento já gravado se refere. Sem esta linha o cartão parece preso. */}
        {ehExtra && (
          <p className="cartao-slot-explicacao secundario">{t("panel.slotCard.leftoverExtra")}</p>
        )}
        <button type="button" className="cartao-slot-preencher" onClick={aoEditarPresente}>
          {t("panel.slotCard.pickGift")}
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

  //[[ Com a SEMENTE em mãos, o cartão não julga o presente.
  //
  // Instalação nova: o catálogo real ainda não existe, a ponte responde a
  // semente, e o preset padrão aponta para ids reais da TikTok. Nenhum dos seis
  // é achado — e a tela dizia "Presente fora do catálogo" com a pastilha
  // vermelha nos seis, na PRIMEIRA coisa que o cliente vê, com o preset certo.
  //
  // Não é um aviso ruim, é um aviso que o painel não tem como fazer: sem a
  // coleta ele não sabe se o presente existe na live. O cartão passa a dizer o
  // que sabe — o id — e quem explica o estado é a linha única acima da grade,
  // no EditorDePreset. Com catálogo real nada muda: ali a pastilha é verdade, e
  // é ela que impede o streamer de entrar ao vivo com um slot morto.
  const naoDaParaJulgar = Boolean(catalogoNaoColetado) && !presente;
  const indisponivel = (!presente || presente.ativo === false) && !naoDaParaJulgar;
  const temIcone = Boolean(presente?.iconeUrl ?? presente?.iconeLocal) && !iconeQuebrado;

  const avisos = [
    presente ? avisoDeCurva({ moedas: presente.moedas, delta }) : null,
    avisoDeDirecao({ animacao, delta }),
  ].filter(Boolean);

  // AUSENTE = true. Todo preset gravado antes deste campo existir continua
  // aparecendo na legenda do overlay — e abrir um preset velho e salvar sem
  // tocar em nada não pode apagar a legenda em silêncio. Só `false` explícito
  // tira, e é isso que o painel grava ao criar um extra.
  const mostraNoOverlay = slot.mostrarNoOverlay !== false;

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
      aria-label={t("panel.slotCard.slotAria", { n: posicao })}
    >
      <header className="cartao-slot-topo">
        <span className={`cartao-slot-posicao${ehExtra ? " cartao-slot-posicao-extra" : ""}`}>
          {posicao}
        </span>
        {/* Texto, não só a borda tracejada: cor e forma sozinhas nunca decidem
            nada neste painel, e "este não é um dos 6 do painel de desejos" é
            justamente o que explica o rótulo Remover e o overlay desmarcado. */}
        {ehExtra && <span className="cartao-slot-extra-marca">{t("panel.slotCard.extraBadge")}</span>}
        {/* Marca periférica: o streamer vê que existe aviso sem ler o aviso. */}
        {avisos.length > 0 && (
          <span className="cartao-slot-alerta" aria-hidden="true">!</span>
        )}
        <button
          type="button"
          className="cartao-slot-limpar"
          onClick={aoLimpar}
          aria-label={
            ehExtra
              ? t("panel.slotCard.removeSlotAria", { n: posicao })
              : t("panel.slotCard.clearSlotAria", { n: posicao })
          }
        >
          {rotuloDeLimpar}
        </button>
      </header>

      <button
        type="button"
        className="cartao-slot-presente"
        onClick={aoEditarPresente}
        title={
          presente
            ? t("panel.slotCard.giftTitle", {
                nome: presente.nome,
                moedas: textoDeMoedas(presente.moedas),
              })
            : t("panel.slotCard.changeGift")
        }
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
          {/* Sem coleta, o id É o que se sabe do presente: ele identifica o
              cartão sem afirmar nada sobre existir ou não na live. */}
          <span className="cartao-slot-nome">
            {presente?.nome ??
              (naoDaParaJulgar
                ? t("panel.slotCard.giftById", { id: slot.presenteId })
                : t("panel.slotCard.giftMissing"))}
          </span>
          <span className="cartao-slot-moedas secundario">
            {presente
              ? textoDeMoedas(presente.moedas)
              : naoDaParaJulgar
                ? t("panel.slotCard.giftFromLive")
                : String(slot.presenteId)}
          </span>
        </span>
        {faixa ? (
          <span
            className="cartao-slot-faixa"
            title={t("panel.slotCard.tierTitle", { nome: NOME_DA_FAIXA[faixa] })}
          >
            {NOME_DA_FAIXA[faixa]}
          </span>
        ) : null}
      </button>

      {/* Presente que sumiu da live continua referenciado pelo preset: o cartão
          diz isso com texto, nunca só com cor. */}
      {indisponivel && (
        <p className="pastilha pastilha-erro cartao-slot-indicador">
          {presente ? t("panel.slotCard.giftInactive") : t("panel.slotCard.giftUnknown")}
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
            aria-label={t("panel.slotCard.deltaAria", { n: posicao })}
          />
        </span>
        <div className="cartao-slot-passos">
          <button
            type="button"
            className="cartao-slot-passo"
            onClick={() => aplicarPasso(-1)}
            aria-label={t("panel.slotCard.decreaseDelta")}
          >
            −
          </button>
          <button
            type="button"
            className="cartao-slot-passo"
            onClick={() => aplicarPasso(1)}
            aria-label={t("panel.slotCard.increaseDelta")}
          >
            +
          </button>
        </div>
      </div>

      <p className="cartao-slot-legenda secundario">
        {semDirecao
          ? t("panel.slotCard.noDirection")
          : t(
              subindo
                ? plural(delta, "panel.slotCard.risesOne", "panel.slotCard.risesMany")
                : plural(delta, "panel.slotCard.fallsOne", "panel.slotCard.fallsMany"),
              { n: Math.abs(delta) },
            )}
      </p>

      {(rascunhoInvalido || guardadoInvalido) && (
        <p className="cartao-slot-aviso cartao-slot-aviso-regra">
          {t("panel.slotCard.deltaRule")}
        </p>
      )}

      <button type="button" className="cartao-slot-animacao" onClick={aoEditarAnimacao}>
        <span className="cartao-slot-animacao-nome">
          {animacao?.nome ?? t("panel.slotCard.animationMissing")}
        </span>
        <span className="cartao-slot-animacao-meta secundario">
          {animacao
            ? [
                animacao.direcao,
                t("panel.slotCard.weight", { n: animacao.pesoVisual }),
                textoDeDuracao(animacao.duracaoBase),
                animacao.aceitaDeltaVariavel === false ? t("panel.slotCard.fixedDelta") : null,
                // Preset salvo antes da aposentadoria continua valendo e continua
                // tocando no jogo. O cartão diz que está assim de propósito — sem
                // isso, o streamer só descobriria ao abrir o seletor e não achar.
                animacao.ativa === false ? t("panel.slotCard.retired") : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : String(slot.animacaoId ?? t("common.value.none"))}
        </span>
      </button>

      <div className="cartao-slot-secao">
        <span className="cartao-slot-legenda secundario">
          {cooldownMs > 0
            ? t("panel.slotCard.intensityWait", { n: intensidade, ms: cooldownMs })
            : t("panel.slotCard.intensityValue", { n: intensidade })}
        </span>
        <div
          className="cartao-slot-niveis"
          role="group"
          aria-label={t("panel.slotCard.intensity")}
        >
          {INTENSIDADES.map((nivel) => (
            <button
              key={nivel}
              type="button"
              className={`cartao-slot-nivel${nivel <= intensidade ? " cartao-slot-nivel-aceso" : ""}`}
              aria-label={t("panel.slotCard.intensityValue", { n: nivel })}
              aria-pressed={nivel === intensidade}
              onClick={() => aoMudar?.({ intensidade: nivel })}
            />
          ))}
        </div>
      </div>

      {/* Fica no rodapé, junto da intensidade, e nunca acima do delta: o delta
          é quem tem de ganhar a disputa de atenção nos 2 segundos de olhada.
          Isto aqui é decisão de montagem, feita antes da live. */}
      <label className="cartao-slot-overlay">
        <input
          type="checkbox"
          checked={mostraNoOverlay}
          onChange={(evento) => aoMudar?.({ mostrarNoOverlay: evento.target.checked })}
          aria-label={t("panel.slotCard.overlayAria", { n: posicao })}
        />
        <span className="cartao-slot-legenda secundario">
          {mostraNoOverlay ? t("panel.slotCard.inOverlay") : t("panel.slotCard.outOfOverlay")}
        </span>
      </label>

      {avisos.length > 0 && (
        <div className="cartao-slot-avisos">
          {avisos.map((texto) => (
            <AvisoDeCurva key={texto} aviso={texto} />
          ))}
        </div>
      )}
    </section>
  );
}
