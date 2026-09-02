/**
 * Cliente do Gemini. Chamado SÓ pelo processo Node: o painel nunca vê a chave e
 * nunca fala com a API direto. Ver CLAUDE.md, Segurança, e 07_APIS seção D.
 *
 * A geração de mapa nunca acontece no caminho crítico do evento de presente:
 * ela roda quando o streamer clica em gerar, antes da live.
 *
 * O pós-processamento é o que vale: o modelo produz número plausível, não
 * número jogável (ADR-009). Spec fora da faixa é rejeitado e pedido de novo,
 * uma vez. Nunca preencher campo faltante com chute.
 */

import { ErroDeDominio } from "../erros.mjs";
import { log } from "../log.mjs";
import {
  mapaPodeIrAoAr,
  problemasDeJogabilidade,
  referenciasInexistentes,
} from "../dominio/regras.mjs";
import { acervoOferecivel } from "../repos/acervo.mjs";
import { criarValidador } from "../repos/schemas.mjs";
import { limparCercaDeCodigo, montarPrompt, montarPromptDeCorrecao, SYSTEM } from "./prompt.mjs";

export const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
/**
 * Modelo FIXO, escolhido por medição contra o prompt REAL — não pelo nome.
 *
 * Medido com as regras do P1 e validação completa, 4 descrições cada:
 *   gemini-3.5-flash-lite   4/4 válidos,  2,6s a 10,5s
 *   gemini-3.6-flash        1/3 válidos,  dois 503 de "high demand"
 *   gemini-3.5-flash        503
 *   gemini-2.5-flash        404 "no longer available to new users"
 *
 * Duas lições ficaram no código por isso. A primeira: escolher pelo nome mais
 * conhecido teria levado ao 2.5, que responde 404. A segunda: NÃO usar o alias
 * `gemini-flash-latest`, porque ele aponta para o mais novo, que é o mais
 * congestionado — ele e o 3.7 devolveram 503 enquanto os outros respondiam.
 *
 * Fixar tem o preço de envelhecer, e o `gemini-2.0-flash` que estava aqui já
 * tinha morrido sem ninguém notar. É um preço barato: `npm run gemini` lista o
 * que a chave alcança e avisa na hora, em vez de a descoberta ser no clique.
 */
export const MODELO_PADRAO = "gemini-3.5-flash-lite";

/**
 * Status que significam "a casa está cheia", não "seu pedido está errado".
 *
 * Medido contra a API de verdade: o mesmo prompt devolveu 503 e, na tentativa
 * seguinte, 200. Sem retentativa, esse 503 virava geração falhada na cara do
 * streamer — e ele não tem como saber que bastava clicar de novo.
 */
const HTTP_TRANSITORIO = new Set([429, 500, 502, 503, 504]);
const ESPERAS_MS = [1_500, 4_000];

/**
 * Teto por tentativa.
 *
 * Generoso de propósito: a geração que funcionou na medição levou 95s com o
 * modelo congestionado, e cortar em 30s reprovaria trabalho que ia dar certo.
 * Mas existe teto, porque `fetch` sem sinal espera para sempre, e o painel
 * ficaria em "gerando…" sem fim. Nada disto está no caminho crítico do
 * presente: mapa se gera antes da live (CLAUDE.md, Princípio nº1).
 */
const TIMEOUT_MS = 120_000;

/**
 * Chamada crua à API. `buscar` é injetável para o teste não depender de rede.
 */
export async function chamarGemini({ chave, modelo, system, usuario, buscar = fetch }) {
  const corpoDaRequisicao = JSON.stringify({
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: usuario }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.9 },
  });

  let ultimoProblema = null;

  for (let tentativa = 0; tentativa <= ESPERAS_MS.length; tentativa += 1) {
    let resposta;
    try {
      resposta = await buscar(`${ENDPOINT}/${modelo}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": chave },
        body: corpoDaRequisicao,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (erro) {
      // Timeout e queda de rede entram aqui, e as duas são transitórias.
      ultimoProblema = { motivo: erro.name === "TimeoutError" ? `passou de ${TIMEOUT_MS}ms` : erro.message };
      if (tentativa === ESPERAS_MS.length) break;
      log.aviso("gemini_retentativa", { tentativa: tentativa + 1, ...ultimoProblema });
      await new Promise((seguir) => setTimeout(seguir, ESPERAS_MS[tentativa]));
      continue;
    }

    if (resposta.ok) {
      const corpo = await resposta.json();
      return corpo?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
    }

    const detalhe = await resposta.text().catch(() => null);

    // 400 e 404 são erro NOSSO — chave inválida, modelo aposentado. Insistir
    // neles só gasta tempo e devolve a mesma coisa.
    if (!HTTP_TRANSITORIO.has(resposta.status) || tentativa === ESPERAS_MS.length) {
      throw new ErroDeDominio(
        "gemini_indisponivel",
        `A API do Gemini respondeu ${resposta.status}. Tente de novo em alguns segundos.`,
        { status: 502, detalhe },
      );
    }

    log.aviso("gemini_retentativa", { tentativa: tentativa + 1, http: resposta.status });
    await new Promise((seguir) => setTimeout(seguir, ESPERAS_MS[tentativa]));
  }

  throw new ErroDeDominio(
    "gemini_indisponivel",
    `A API do Gemini não respondeu depois de ${ESPERAS_MS.length + 1} tentativas (${ultimoProblema?.motivo ?? "sem detalhe"}).`,
    { status: 502 },
  );
}

/**
 * Valida o que o modelo devolveu contra tudo que a documentação exige, na
 * ordem do P1. Devolve a lista de problemas em português — ela vai tanto para
 * a retentativa quanto para a mensagem de erro do painel.
 */
export async function validarSpec(texto, acervo, { validar }) {
  const limpo = limparCercaDeCodigo(texto);

  let spec;
  try {
    spec = JSON.parse(limpo);
  } catch (erro) {
    return { problemas: [`a resposta não é JSON válido (${erro.message})`] };
  }

  const problemas = validar("mapa", spec);
  if (problemas.length > 0) return { problemas, spec };

  return {
    spec,
    problemas: [...referenciasInexistentes(spec, acervo), ...problemasDeJogabilidade(spec)],
  };
}

export class ClienteGemini {
  constructor({ chave, modelo = MODELO_PADRAO, chamar = chamarGemini } = {}) {
    this.chave = chave;
    this.modelo = modelo;
    this.chamar = chamar;
  }

  get configurado() {
    return Boolean(this.chave);
  }

  /**
   * Gera um mapa a partir da descrição livre do streamer.
   * Uma retentativa acrescentando o que veio errado; falhou de novo, erro claro.
   */
  async gerarMapa(descricao, acervoCompleto) {
    if (!this.configurado) {
      throw new ErroDeDominio(
        "gemini_sem_chave",
        "GEMINI_API_KEY não está no .env. O painel não fala com o Gemini: quem chama é a ponte.",
        { status: 503 },
      );
    }

    // Item pendente de moderação nunca entra no prompt: o mapa nasceria
    // referenciando um asset que o jogo não consegue aplicar (ADR-004).
    const oferecivel = acervoOferecivel(acervoCompleto);
    if (oferecivel.skybox.length === 0 || oferecivel.texturas.length === 0) {
      throw new ErroDeDominio(
        "acervo_vazio",
        "Nenhum skybox ou textura aprovado no acervo. Suba e aprove as imagens no Roblox e preencha assetId em data/acervo.json.",
        { status: 503 },
      );
    }

    const { validar } = await criarValidador();
    let usuario = montarPrompt(descricao, oferecivel);

    for (const tentativa of [1, 2]) {
      const texto = await this.chamar({ chave: this.chave, modelo: this.modelo, system: SYSTEM, usuario });
      const { spec, problemas } = await validarSpec(texto, oferecivel, { validar });

      if (problemas.length === 0) {
        log.info("mapa_gerado", { mapaId: spec.mapaId, tentativa });
        return spec;
      }

      log.aviso("mapa_rejeitado", { tentativa, problemas });
      if (tentativa === 2) {
        throw new ErroDeDominio(
          "mapa_invalido",
          `O Gemini devolveu um mapa fora das regras duas vezes: ${problemas.join("; ")}`,
          { status: 422 },
        );
      }
      usuario = montarPromptDeCorrecao(descricao, oferecivel, problemas);
    }
  }

  /** Conveniência para o painel: além de válido, o mapa já pode ir ao ar? */
  static prontidao(spec, acervoCompleto) {
    return mapaPodeIrAoAr(spec, acervoCompleto);
  }
}
