#!/usr/bin/env node
/**
 * Espelha data/i18n/{pt,es,en}.json no painel e no Luau.
 *
 * Mesmo motivo do gerar-tokens.mjs: o ADR-P03 manda o mesmo texto existir em
 * três superfícies escritas em duas linguagens, "definido uma vez". Duas cópias
 * escritas à mão divergem na primeira pressa; um gerador torna "espelhados"
 * literal.
 *
 * A saída é determinística: as chaves saem ordenadas, então rodar duas vezes
 * não produz diff.
 */

import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { RAIZ, caminhoDeDados, lerJson } from "../bridge/src/repos/arquivo.mjs";

export const IDIOMAS = ["pt", "es", "en"];
export const IDIOMA_PADRAO = "pt";

/** Lê os três catálogos. Exportado porque o teste de paridade lê a mesma fonte. */
export async function lerCatalogos() {
  const catalogos = {};
  for (const idioma of IDIOMAS) {
    catalogos[idioma] = await lerJson(caminhoDeDados("i18n", `${idioma}.json`));
  }
  return catalogos;
}

/** Escapa para literal de string do Luau. */
const luaTexto = (s) =>
  `"${s
    .replace(/\\/g, String.fromCharCode(92, 92))
    .replace(/"/g, String.fromCharCode(92) + '"')
    .replace(/\n/g, String.fromCharCode(92) + "n")}"`;

/** Escapa para literal de string do JavaScript. */
const jsTexto = (s) => JSON.stringify(s);

const CABECALHO_JS = `/* GERADO por scripts/gerar-i18n.mjs a partir de data/i18n/*.json.
   Não editar à mão: a fonte é o JSON, e o HUD do jogo espelha o mesmo arquivo.
   Ver docs/08_DECISOES/adr-p03-i18n-por-chave.md. */`;

// Sem `--!strict` e sem anotação de tipo: o gate `npm run luau` valida com um
// parser Lua 5.1, e toda sintaxe exclusiva de Luau falha nele por definição.
// Ver o cabeçalho de scripts/verificar-luau.mjs.
const CABECALHO_LUA = `-- GERADO por scripts/gerar-i18n.mjs a partir de data/i18n/*.json.
-- Não editar à mão: a fonte é o JSON, e o painel espelha o mesmo arquivo.
-- Ver docs/08_DECISOES/adr-p03-i18n-por-chave.md.`;

export function montarJs(catalogos) {
  const blocos = IDIOMAS.map((idioma) => {
    const chaves = Object.keys(catalogos[idioma].chaves).sort();
    const linhas = chaves.map((k) => `    ${jsTexto(k)}: ${jsTexto(catalogos[idioma].chaves[k])},`);
    return `  ${idioma}: {\n${linhas.join("\n")}\n  },`;
  });

  return `${CABECALHO_JS}

export const IDIOMAS = ${JSON.stringify(IDIOMAS)};
export const IDIOMA_PADRAO = ${jsTexto(IDIOMA_PADRAO)};

export const CATALOGO = {
${blocos.join("\n")}
};
`;
}

export function montarLua(catalogos) {
  const blocos = IDIOMAS.map((idioma) => {
    const chaves = Object.keys(catalogos[idioma].chaves).sort();
    const linhas = chaves.map((k) => `\t\t[${luaTexto(k)}] = ${luaTexto(catalogos[idioma].chaves[k])},`);
    return `\t${idioma} = {\n${linhas.join("\n")}\n\t},`;
  });

  return `${CABECALHO_LUA}

local Textos = {}

Textos.IDIOMA_PADRAO = ${luaTexto(IDIOMA_PADRAO)}

Textos.catalogo = {
${blocos.join("\n")}
}

local idiomaAtual = Textos.IDIOMA_PADRAO

--[[
	Troca o idioma do HUD. Chamado uma vez, quando o preset chega — nunca por
	evento de presente: o princípio nº 1 do CLAUDE.md proíbe trabalho novo no
	caminho crítico.

	Idioma desconhecido cai no padrão em silêncio. Durante a live, HUD em
	português é infinitamente melhor que HUD quebrado.
]]
function Textos.definirIdioma(codigo)
	local alvo = string.lower(string.sub(tostring(codigo or ""), 1, 2))
	if Textos.catalogo[alvo] ~= nil then
		idiomaAtual = alvo
	else
		idiomaAtual = Textos.IDIOMA_PADRAO
	end
	return idiomaAtual
end

function Textos.idioma()
	return idiomaAtual
end

--[[
	Resolve a chave. Chave ausente devolve a própria chave, nunca nil: texto
	feio na tela é melhor que HUD sem rótulo no meio da live.

	O parametro "params" substitui {nome} pelo valor.
]]
function Textos.t(chave, params)
	local tabela = Textos.catalogo[idiomaAtual] or Textos.catalogo[Textos.IDIOMA_PADRAO]
	local texto = tabela[chave]

	if texto == nil and idiomaAtual ~= Textos.IDIOMA_PADRAO then
		texto = Textos.catalogo[Textos.IDIOMA_PADRAO][chave]
	end
	if texto == nil then
		return chave
	end
	if params == nil then
		return texto
	end

	return (string.gsub(texto, "{(%w+)}", function(nome)
		local valor = params[nome]
		if valor == nil then
			return "{" .. nome .. "}"
		end
		return tostring(valor)
	end))
end

return Textos
`;
}

const catalogos = await lerCatalogos();

await mkdir(path.join(RAIZ, "panel", "src", "i18n"), { recursive: true });
await mkdir(path.join(RAIZ, "game", "src", "shared"), { recursive: true });

await writeFile(path.join(RAIZ, "panel", "src", "i18n", "catalogo.js"), montarJs(catalogos), "utf8");
await writeFile(path.join(RAIZ, "game", "src", "shared", "textos.lua"), montarLua(catalogos), "utf8");

if (!process.argv.includes("--silencioso")) {
  const total = Object.keys(catalogos.pt.chaves).length;
  console.log(
    `panel/src/i18n/catalogo.js e game/src/shared/textos.lua gerados de data/i18n/ (${total} chaves x ${IDIOMAS.length} idiomas).`,
  );
}
