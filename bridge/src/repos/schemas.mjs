/**
 * Carrega os JSON Schemas de data/schemas e devolve um validador com todos
 * registrados — os $ref entre arquivos só resolvem se estiverem juntos.
 *
 * Mora em repos/ porque lê disco (ADR-003), mas é lido uma vez na subida: o
 * caminho crítico do evento nunca chega aqui.
 */

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { caminhoDeDados, lerTodosOsJson } from "./arquivo.mjs";

const BASE_ID = "https://kora.local/kora-stream-games";

let cache = null;

export async function criarValidador({ recarregar = false } = {}) {
  if (cache && !recarregar) return cache;

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);

  const schemas = await lerTodosOsJson(caminhoDeDados("schemas"));
  for (const schema of Object.values(schemas)) ajv.addSchema(schema);

  cache = {
    ajv,
    schemas: Object.keys(schemas),
    /** Devolve lista de erros legíveis. Lista vazia significa válido. */
    validar(nome, dado) {
      const validador = ajv.getSchema(`${BASE_ID}/${nome}.schema.json`);
      if (!validador) throw new Error(`schema não registrado: ${nome}`);
      return validador(dado) ? [] : validador.errors.map((e) => `${e.instancePath || "/"} ${e.message}`);
    },
  };
  return cache;
}
