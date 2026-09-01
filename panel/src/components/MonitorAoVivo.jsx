import { useEffect, useMemo, useState } from "react";

import { NOME_DA_FAIXA, combateDoEvento, corDaFaixa, faixaDeMoedas, formatarDelta, formatarLatencia, medianaDeLatencia, saudeDaLatencia } from "../lib/regras.js";
import "./MonitorAoVivo.css";

/**
 * O monitor ao vivo: últimos eventos, latência medida e contador de não
 * mapeado (06_COMPONENTES, F2.4 de 05_FLUXOS).
 *
 * O contexto decide o desenho inteiro: o streamer está jogando parkour e
 * falando com a plateia, e olha esta tela por 2 segundos por vez
 * (02_DESIGN_SYSTEM, seção A). Daí as três decisões que atravessam o arquivo:
 *
 * 1. **Número grande primeiro, lista depois.** Nada aqui exige ler uma lista
 *    de cima a baixo para saber como a live está indo. As três métricas do
 *    topo respondem sozinhas; a lista é para quando ele tem folga.
 * 2. **Resultado antes do motivo.** Mesma ordem que o HUD do jogo escolheu
 *    para a disputa (`game/src/client/hud.client.lua`): primeiro o número que
 *    ele já reconhece, depois, se quiser, por que aquele número saiu.
 * 3. **Nada de animação.** O que mudou desde o último olhar salta por posição
 *    e tamanho — o evento mais recente é um bloco grande, separado da lista —
 *    e por tempo relativo ("há 3s"), nunca por movimento na tela.
 *
 * Só React, e tudo chega por prop: quem cuida do SSE é `lib/useFluxo.js`, e
 * quem o chama é o App. Nenhum `EventSource` e nenhuma rede aqui (CLAUDE.md).
 */

/** Amostras que formam a leitura de tendência. Uma dezena cobre ~1 min de live movimentada. */
const JANELA_DE_LATENCIA = 10;

/** A lista é referência, não relatório: mais que isto vira leitura sequencial. */
const EVENTOS_VISIVEIS = 8;

/** Teto da barrinha de tendência. Acima do orçamento de 1000ms, para o estouro aparecer como estouro. */
const TETO_DA_BARRA_MS = 1200;

/** Alvo do Princípio nº1. Aqui só posiciona a linha de referência; quem classifica é `saudeDaLatencia`. */
const ALVO_MS = 600;

/** Passado este silêncio, o "último evento" já não descreve o agora. */
const SILENCIO_MS = 15000;

const numero = (valor) => (Number.isFinite(valor) ? valor : 0);

const contarParticipantes = (valor) => {
  if (Array.isArray(valor)) return valor.length;
  return Number.isFinite(valor) ? valor : null;
};

const emPtBr = (valor) => Math.round(valor).toLocaleString("pt-BR");

/** Tempo como o streamer lê de canto de olho: curto, sem relógio, sem data. */
function formatarDesde(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 2000) return "agora";
  if (ms < 60000) return `há ${Math.floor(ms / 1000)}s`;
  const minutos = Math.floor(ms / 60000);
  if (minutos < 60) return `há ${minutos}min`;
  return `há ${Math.floor(minutos / 60)}h`;
}

/**
 * Só o que já foi medido entra na tendência. Evento sem `latenciaMs` não vale
 * zero: zero seria a melhor latência possível, e o painel passaria a mentir
 * para baixo justamente quando parou de medir.
 */
function amostrasDeLatencia(eventos, janela) {
  const medidas = [];
  for (const evento of eventos) {
    if (Number.isFinite(evento?.latenciaMs)) medidas.push(evento.latenciaMs);
    if (medidas.length >= janela) break;
  }
  return medidas;
}

/**
 * Mediana, não média. Um pico isolado de 3s arrasta a média de dez amostras em
 * 300ms e pinta o painel de vermelho enquanto nove presentes chegaram no
 * prazo. A mediana descreve o que a plateia está sentindo; o pico aparece
 * separado, no "pior", que é onde ele significa alguma coisa.
 */
const classeDaDirecao = (delta) => (delta > 0 ? "monitor--subida" : delta < 0 ? "monitor--descida" : "monitor--neutro");

const classes = (...nomes) => nomes.filter(Boolean).join(" ");

/**
 * A balança do combate: uma barra só, partida na proporção das duas somas.
 * É o que dispensa ler os dois números para saber quem venceu e por quanto.
 * No empate os dois lados saem iguais por construção, e a simetria perfeita
 * é o próprio recado.
 */
function BalancaDoCombate({ somaSubida, somaDescida, liquido, empate }) {
  const subida = Math.abs(somaSubida);
  const descida = Math.abs(somaDescida);
  const total = subida + descida;
  const rotulo = empate
    ? `Subida ${formatarDelta(somaSubida)}, descida ${formatarDelta(somaDescida)}, ninguém andou.`
    : `Subida ${formatarDelta(somaSubida)}, descida ${formatarDelta(somaDescida)}, líquido ${formatarDelta(liquido)}.`;

  return (
    <div className="monitor-balanca" role="img" aria-label={rotulo}>
      <span className="monitor-balanca-lado monitor-balanca-subida" style={{ flexGrow: total === 0 ? 1 : subida }} />
      <span className="monitor-balanca-lado monitor-balanca-descida" style={{ flexGrow: total === 0 ? 1 : descida }} />
    </div>
  );
}

/**
 * As três somas do combate em texto, na ordem em que se lê: quem subiu, quem
 * desceu, no que deu. O `×` é de "versus", não de multiplicação — daí o `→` no
 * lugar de `=`: o líquido é resultado da briga, não conta de aritmética.
 */
function SomasDoCombate({ combate }) {
  return (
    <p className="monitor-somas">
      <span className="monitor-soma-subida">{formatarDelta(combate.somaSubida)}</span>
      <span className="monitor-somas-sinal secundario">×</span>
      <span className="monitor-soma-descida">{formatarDelta(combate.somaDescida)}</span>
      <span className="monitor-somas-sinal secundario">→</span>
      {combate.empate ? (
        <span className="monitor-soma-empate">0, ninguém andou</span>
      ) : (
        <span className={`monitor-soma-liquido ${classeDaDirecao(combate.liquido)}`}>
          {formatarDelta(combate.liquido)} líquido
        </span>
      )}
      {combate.participantes !== null && (
        <span className="secundario monitor-somas-nota">
          {combate.participantes} {combate.participantes === 1 ? "participante" : "participantes"}
        </span>
      )}
    </p>
  );
}

/**
 * O evento mais recente, em corpo grande. É o "o que acabou de acontecer" que
 * o streamer pega sem procurar, e é onde o empate exato ganha a frase que
 * impede a leitura errada de travamento.
 */
function UltimoEvento({ evento, agora }) {
  const combate = combateDoEvento(evento);
  const desde = agora - evento.em;
  const parado = desde >= SILENCIO_MS;

  if (evento.anulado) {
    return (
      <section className="monitor-destaque monitor-destaque--empate">
        <header className="monitor-destaque-topo">
          <span className="monitor-etiqueta monitor-etiqueta--combate">Empate exato</span>
          <span className="secundario">{formatarDesde(desde)}</span>
        </header>
        <p className="monitor-numerao monitor--neutro">0</p>
        <p className="monitor-destaque-frase">
          Os dois lados se anularam e ninguém andou. O jogo não travou — vale narrar.
        </p>
        <BalancaDoCombate {...combate} />
        <SomasDoCombate combate={combate} />
      </section>
    );
  }

  return (
    <section className={classes("monitor-destaque", combate && "monitor-destaque--disputa")}>
      <header className="monitor-destaque-topo">
        {Number.isFinite(evento.slot) && <span className="monitor-slot">S{evento.slot}</span>}
        <span className="monitor-destaque-presente">{evento.presenteNome ?? "presente"}</span>
        {combate && <span className="monitor-etiqueta monitor-etiqueta--combate">Disputa</span>}
        {evento.efeitoCurto && (
          <span className="monitor-etiqueta monitor-etiqueta--curto" title="Combate fechou por tempo esgotado: líquido com efeito curto, sem animação completa (ADR-012.6).">
            Efeito curto
          </span>
        )}
        <span className={classes("secundario", "monitor-destaque-tempo", parado && "monitor--alerta")}>
          {formatarDesde(desde)}
        </span>
      </header>

      <p className={`monitor-numerao ${classeDaDirecao(evento.delta)}`}>{formatarDelta(numero(evento.delta))}</p>

      {combate && (
        <>
          <BalancaDoCombate {...combate} />
          <SomasDoCombate combate={combate} />
          <p className="monitor-destaque-frase">
            Tocou a animação do lado vencedor: quem mandou o outro lado não viu a própria animação.
          </p>
        </>
      )}

      <p className="secundario monitor-destaque-rodape">
        {evento.nomeDoador ? `${evento.nomeDoador} · ` : ""}
        {evento.animacaoId ?? "sem animação"}
        {Number.isFinite(evento.intensidade) ? ` · força ${evento.intensidade}` : ""}
        {Number.isFinite(evento.latenciaMs) ? ` · ${formatarLatencia(evento.latenciaMs)}` : ""}
      </p>
    </section>
  );
}

/** Uma linha da lista. Densa por decisão: aqui o streamer confere, não estuda. */
function LinhaDeEvento({ evento, agora }) {
  const combate = combateDoEvento(evento);
  const tempo = formatarDesde(agora - evento.em);

  if (evento.anulado) {
    return (
      <li className="monitor-linha monitor-linha--empate">
        <span className="secundario monitor-linha-tempo">{tempo}</span>
        <span className="monitor-etiqueta monitor-etiqueta--combate">Empate</span>
        <span className="monitor-linha-corpo">
          <span className="monitor-soma-subida">{formatarDelta(combate.somaSubida)}</span>
          {" × "}
          <span className="monitor-soma-descida">{formatarDelta(combate.somaDescida)}</span>
          {" · "}
          <span className="monitor-soma-empate">ninguém andou</span>
        </span>
      </li>
    );
  }

  return (
    <li className={classes("monitor-linha", combate && "monitor-linha--disputa")}>
      <span className="secundario monitor-linha-tempo">{tempo}</span>
      <span className={`monitor-linha-delta ${classeDaDirecao(evento.delta)}`}>
        {formatarDelta(numero(evento.delta))}
      </span>
      <span className="monitor-linha-corpo">
        {Number.isFinite(evento.slot) && <span className="monitor-slot">S{evento.slot}</span>}
        <span className="monitor-linha-presente">{evento.presenteNome ?? "presente"}</span>
        {combate && (
          <span className="monitor-linha-disputa">
            <span className="monitor-soma-subida">{formatarDelta(combate.somaSubida)}</span>
            {" × "}
            <span className="monitor-soma-descida">{formatarDelta(combate.somaDescida)}</span>
          </span>
        )}
      </span>
      <span className="secundario monitor-linha-latencia">
        {Number.isFinite(evento.latenciaMs) ? formatarLatencia(evento.latenciaMs) : "—"}
      </span>
    </li>
  );
}

/**
 * A tendência da latência sem número nenhum: dez barrinhas, a mais recente à
 * direita, com a linha do alvo de 600ms atravessando. Degradação vira
 * inclinação, que se lê antes de qualquer dígito.
 */
function TendenciaDeLatencia({ amostras }) {
  if (amostras.length === 0) return null;
  const emOrdem = [...amostras].reverse();
  const lidas = emOrdem.map((ms) => formatarLatencia(ms)).join(", ");
  const rotulo =
    emOrdem.length === 1
      ? `Uma latência medida: ${lidas}.`
      : `Últimas ${emOrdem.length} latências medidas, da mais antiga para a mais recente: ${lidas}.`;

  return (
    <div className="monitor-tendencia" role="img" aria-label={rotulo}>
      <span className="monitor-tendencia-alvo" style={{ bottom: `${(ALVO_MS / TETO_DA_BARRA_MS) * 100}%` }} />
      {emOrdem.map((ms, indice) => (
        <span
          key={`${indice}-${ms}`}
          className={`monitor-barra monitor-barra--${saudeDaLatencia(ms)}`}
          style={{ height: `${Math.max(6, (Math.min(ms, TETO_DA_BARRA_MS) / TETO_DA_BARRA_MS) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export function MonitorAoVivo({ eventos, naoMapeados, estado, conectado }) {
  const lista = eventos ?? [];
  const perdidos = naoMapeados ?? [];
  const chaveMaisRecente = lista[0]?.chave ?? null;

  const [agora, definirAgora] = useState(() => Date.now());
  const [cegoDesde, definirCegoDesde] = useState(() => (conectado ? null : Date.now()));

  // Um tique por segundo, e só quando há algo envelhecendo na tela: tempo
  // relativo que não anda mente, e o painel parado não precisa redesenhar.
  useEffect(() => {
    definirAgora(Date.now());
    if (lista.length === 0 && conectado) return undefined;
    const id = setInterval(() => definirAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [chaveMaisRecente, conectado, lista.length]);

  // Quanto tempo o painel está cego importa mais que o fato de estar: 2s é
  // reconexão do SSE, 40s é a ponte no chão.
  useEffect(() => {
    definirCegoDesde(conectado ? null : Date.now());
  }, [conectado]);

  const latencia = useMemo(() => {
    const amostras = amostrasDeLatencia(lista, JANELA_DE_LATENCIA);
    return {
      amostras,
      tipica: medianaDeLatencia(amostras),
      ultima: amostras.length > 0 ? amostras[0] : NaN,
      pior: amostras.length > 0 ? Math.max(...amostras) : NaN,
      estouros: amostras.filter((ms) => saudeDaLatencia(ms) === "erro").length,
    };
  }, [lista]);

  const combates = useMemo(() => {
    let disputas = 0;
    let empates = 0;
    for (const evento of lista) {
      if (evento?.anulado) empates += 1;
      else if (evento?.disputa?.contestado) disputas += 1;
    }
    return { disputas, empates };
  }, [lista]);

  // F2.4: presente que não caiu em nenhum dos 6 slots foi descartado. O
  // contador de vezes é o pedido do backlog; as moedas ao lado são o que
  // transforma "17 presentes" em "isso é dinheiro passando batido".
  const naoMapeado = useMemo(() => {
    let total = 0;
    let moedas = 0;
    for (const item of perdidos) {
      const contagem = Number.isFinite(item?.contagem) ? item.contagem : 0;
      total += contagem;
      if (Number.isFinite(item?.moedas)) moedas += item.moedas * contagem;
    }
    return { total, moedas, topo: perdidos.slice(0, 3) };
  }, [perdidos]);

  const saude = saudeDaLatencia(latencia.tipica);
  const sessaoRodando = estado?.sessao === "rodando";
  const visiveis = lista.slice(0, EVENTOS_VISIVEIS);
  const restantes = Math.max(0, lista.length - visiveis.length);

  return (
    <section className={classes("monitor", !conectado && "monitor--cego")} aria-label="Monitor ao vivo">
      {!conectado && (
        <p className="monitor-alarme" role="alert">
          {cegoDesde && agora - cegoDesde >= 2000 ? `Painel cego ${formatarDesde(agora - cegoDesde)}` : "Painel cego"}
          {" — sem fluxo da ponte. Tudo abaixo é passado: presente chegando agora não aparece aqui."}
        </p>
      )}

      <div className="monitor-metricas">
        <article className={`monitor-metrica monitor-metrica--${saude}`}>
          <h3 className="monitor-rotulo">Latência típica</h3>
          <p className="monitor-numerao">{formatarLatencia(latencia.tipica)}</p>
          <TendenciaDeLatencia amostras={latencia.amostras} />
          <p className="secundario monitor-metrica-nota">
            {latencia.amostras.length === 0
              ? "nada medido ainda · alvo 600ms, teto 1000ms"
              : `últ. ${formatarLatencia(latencia.ultima)} · pior ${formatarLatencia(latencia.pior)} · alvo 600ms`}
          </p>
          {latencia.estouros > 0 && (
            <p className="monitor-metrica-alarme">
              {latencia.estouros} de {latencia.amostras.length} acima do teto de 1000ms
            </p>
          )}
        </article>

        <article className={`monitor-metrica ${naoMapeado.total > 0 ? "monitor-metrica--atencao" : "monitor-metrica--ok"}`}>
          <h3 className="monitor-rotulo">Não mapeado</h3>
          <p className="monitor-numerao">{emPtBr(naoMapeado.total)}</p>
          <p className="secundario monitor-metrica-nota">
            {naoMapeado.total === 0
              ? "todo presente caiu num dos 6 slots"
              : `descartados · ≈ ${emPtBr(naoMapeado.moedas)} moedas perdidas`}
          </p>
          {naoMapeado.topo.length > 0 && (
            <ul className="monitor-perdidos">
              {naoMapeado.topo.map((item) => {
                const faixa = faixaDeMoedas(Number.isFinite(item.moedas) ? item.moedas : 0);
                return (
                  <li key={item.presenteNome} className="monitor-perdido" style={{ "--faixa-do-item": corDaFaixa(faixa) }}>
                    <span className="monitor-perdido-faixa">{NOME_DA_FAIXA[faixa]}</span>
                    <span className="monitor-perdido-nome">{item.presenteNome}</span>
                    <span className="monitor-perdido-contagem">×{emPtBr(numero(item.contagem))}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </article>

        <article className="monitor-metrica">
          <h3 className="monitor-rotulo">Plataforma</h3>
          <p className="monitor-numerao">
            {Number.isFinite(estado?.plataformaAtual) ? emPtBr(estado.plataformaAtual) : "—"}
          </p>
          <p className="secundario monitor-metrica-nota">
            {combates.disputas === 0 && combates.empates === 0
              ? "nenhum combate nos últimos eventos"
              : `${combates.disputas} ${combates.disputas === 1 ? "disputa" : "disputas"} · ${combates.empates} ${
                  combates.empates === 1 ? "empate" : "empates"
                }`}
          </p>
        </article>
      </div>

      {lista.length === 0 ? (
        <p className="monitor-vazio secundario">
          {sessaoRodando
            ? "Sessão rodando, nenhum presente ainda. O primeiro que chegar aparece aqui."
            : "Sessão parada. Nada chega até o Start."}
        </p>
      ) : (
        <>
          <UltimoEvento evento={lista[0]} agora={agora} />

          {visiveis.length > 1 && (
            <div className="monitor-anteriores">
              <h3 className="monitor-rotulo">
                Antes disso
                {restantes > 0 && <span className="secundario monitor-rotulo-nota"> · mais {restantes} na sessão</span>}
              </h3>
              <ul className="monitor-lista">
                {visiveis.slice(1).map((evento) => (
                  <LinhaDeEvento key={evento.chave} evento={evento} agora={agora} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
