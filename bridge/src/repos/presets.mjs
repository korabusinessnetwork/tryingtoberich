/** Presets. Valida R1 e R2 antes de gravar (11_SEGURANCA, camada 3). */

import { ErroDeDominio } from "../erros.mjs";
import { posicoesRepetidas, presentesRepetidos } from "../dominio/regras.mjs";
import { apagar, caminhoDeDados, escreverJsonAtomico, existe, lerJsonOuPadrao, listarJson } from "./arquivo.mjs";
import { criarValidador } from "./schemas.mjs";

const arquivo = (presetId) => caminhoDeDados("presets", `${presetId}.json`);

export async function listarPresets() {
  const nomes = await listarJson(caminhoDeDados("presets"));
  const presets = await Promise.all(nomes.map((nome) => lerJsonOuPadrao(caminhoDeDados("presets", nome))));
  return presets.filter(Boolean);
}

export async function carregarPreset(presetId) {
  return lerJsonOuPadrao(arquivo(presetId));
}

export async function salvarPreset(preset) {
  const { validar } = await criarValidador();

  const problemas = validar("preset", preset);
  if (problemas.length) {
    throw new ErroDeDominio("preset_invalido", `Preset fora do contrato: ${problemas.join("; ")}`);
  }

  const repetidos = presentesRepetidos(preset);
  if (repetidos.length) {
    throw new ErroDeDominio(
      "presente_repetido",
      `O mesmo presente está em mais de um slot: ${repetidos.join(", ")}. Ver regra R1.4.`,
    );
  }

  // Depois do schema, nunca antes: o schema responde pela FORMA (posicao é
  // inteiro de 1 a 24) e esta checagem pela relação entre os slots. Invertendo a
  // ordem, um `posicao: "dois"` cairia aqui como posição válida e o streamer
  // leria a mensagem errada.
  const posicoes = posicoesRepetidas(preset);
  if (posicoes.length) {
    throw new ErroDeDominio(
      "posicao_repetida",
      `Duas caixas de presente na mesma posição: ${posicoes.join(", ")}. ` +
        `Cada slot ocupa uma posição só, e é por ela que a sessão grava o que disparou. Ver regra R1.`,
    );
  }

  const comCarimbo = { ...preset, atualizadoEm: new Date().toISOString() };
  await escreverJsonAtomico(arquivo(preset.presetId), comCarimbo);
  return comCarimbo;
}

/**
 * Apaga um preset.
 *
 * Recusa apagar o que não existe em vez de responder sucesso silencioso: o
 * painel usa a resposta para tirar o item da lista, e "apaguei" sobre um id
 * errado esconderia um preset que continua lá.
 */
export async function apagarPreset(presetId) {
  const caminho = arquivo(presetId);
  if (!(await existe(caminho))) {
    throw new ErroDeDominio("preset_nao_encontrado", `Não achei o preset "${presetId}".`, { status: 404 });
  }
  await apagar(caminho);
  return { presetId };
}
