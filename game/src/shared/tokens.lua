--!strict
-- GERADO por scripts/gerar-tokens.mjs a partir de data/tokens.json.
-- Não editar à mão: a fonte é o JSON, e o painel espelha o mesmo arquivo.
-- Ver docs/02_DESIGN_SYSTEM.

local Tokens = {}

Tokens.faixa = {
	[1] = { nome = "I", cor = Color3.fromRGB(138, 138, 138) },
	[2] = { nome = "II", cor = Color3.fromRGB(59, 130, 246) },
	[3] = { nome = "III", cor = Color3.fromRGB(139, 92, 246) },
	[4] = { nome = "IV", cor = Color3.fromRGB(249, 115, 22) },
	[5] = { nome = "V", cor = Color3.fromRGB(234, 179, 8) },
}

Tokens.estado = {
	ok = Color3.fromRGB(34, 197, 94),
	atencao = Color3.fromRGB(245, 158, 11),
	erro = Color3.fromRGB(239, 68, 68),
}

Tokens.hud = {
	texto = Color3.fromRGB(255, 255, 255),
	contorno = Color3.fromRGB(0, 0, 0),
	subida = Color3.fromRGB(34, 197, 94),
	descida = Color3.fromRGB(239, 68, 68),
	combate = Color3.fromRGB(234, 179, 8),
}

-- O bloco do painel também vem para o Luau porque o vestiário é uma GUI dentro
-- do jogo (ADR-011) e usa a mesma linguagem visual escura e densa do painel.
-- Sem isto, ela repetiria os hex à mão e sairia do white-label.
Tokens.painel = {
	fundo = Color3.fromRGB(17, 17, 17),
	superficie = Color3.fromRGB(27, 27, 27),
	borda = Color3.fromRGB(42, 42, 42),
	textoPrimario = Color3.fromRGB(245, 245, 245),
	textoSecundario = Color3.fromRGB(163, 163, 163),
}

return Tokens
