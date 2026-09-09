/**
 * Número, data e hora no locale do idioma ativo (ADR-P03, critério 13).
 *
 * Traduzir a frase e deixar o número em `pt-BR` é o erro clássico: o painel
 * fica em inglês e mostra "1.372" para um streamer americano, que lê isso como
 * um decimal — mil e trezentos vira um vírgula três. O separador é parte da
 * tradução, não decoração.
 *
 * O locale é derivado do idioma, e não configurável em separado, porque um
 * segundo eixo de configuração (idioma × região) não resolve nenhum problema
 * que este produto tenha hoje. Preço é a exceção e continua sempre em USD —
 * ver `moedaUsd`.
 */

import { idiomaAtivo } from "./traduzir.js";

const LOCALE = { pt: "pt-BR", es: "es-ES", en: "en-US" };

export function localeAtivo() {
  return LOCALE[idiomaAtivo()] ?? LOCALE.pt;
}

/** Número com o separador de milhar do idioma ativo. */
export function numero(valor, opcoes) {
  if (!Number.isFinite(Number(valor))) return String(valor ?? "");
  return Number(valor).toLocaleString(localeAtivo(), opcoes);
}

/** Data e hora curtas, para linha de tabela e de log. */
export function dataHora(valor, opcoes = { dateStyle: "short", timeStyle: "short" }) {
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? "" : data.toLocaleString(localeAtivo(), opcoes);
}

/** Só a data. */
export function data(valor, opcoes) {
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(localeAtivo(), opcoes);
}

/** Só a hora. `hour12` fica com o padrão do locale, que é o certo em cada um. */
export function hora(valor, opcoes) {
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(localeAtivo(), opcoes);
}

/**
 * Preço. **Sempre em USD**, em qualquer idioma (ADR-P03): quem vende cobra em
 * dólar, e mostrar o valor na moeda local criaria a expectativa de pagar nela.
 * O que muda com o idioma é a POSIÇÃO do símbolo e o separador, não a moeda.
 */
export function moedaUsd(valor) {
  if (!Number.isFinite(Number(valor))) return String(valor ?? "");
  return Number(valor).toLocaleString(localeAtivo(), { style: "currency", currency: "USD" });
}
