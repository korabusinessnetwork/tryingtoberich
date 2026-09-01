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

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const MODELO_PADRAO = "gemini-2.0-flash";

/** Chamada crua à API. Injetável para o teste não depender de rede nem de chave. */
async function chamarGemini({ chave, modelo, system, usuario }) {
  const resposta = await fetch(`${ENDPOINT}/${modelo}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": chave },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: usuario }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.9 },
    }),
  });

  if (!resposta.ok) {
    throw new ErroDeDominio(
      "gemini_indisponivel",
      `A API do Gemini respondeu ${resposta.status}. Tente de novo em alguns segundos.`,
      { status: 502, detalhe: await resposta.text().catch(() => null) },
    );
  }

  const corpo = await resposta.json();
  return corpo?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
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
