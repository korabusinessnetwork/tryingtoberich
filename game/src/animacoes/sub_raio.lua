--!strict
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local DURACAO_BASE = 1.0

return {
	id = "sub_raio",
	nome = "Raio Ascendente",
	direcao = "subida",
	pesoVisual = 3,
	duracaoBase = DURACAO_BASE,
	aceitaDeltaVariavel = true,
	executar = function(personagem, contexto)
		Efeitos.executarSeguro(function()
			local raiz = Efeitos.raiz(personagem)
			if not raiz then
				return
			end

			local fator = Efeitos.escala(contexto.intensidade)
			local esticado = math.min(math.abs(contexto.delta or 1) / 12, 1)
			local cor = Color3.fromRGB(170, 220, 255)

			local ceu = Efeitos.anexo(raiz, "RaioCeu", Vector3.new(0, 14, 0))
			local chao = Efeitos.anexo(raiz, "RaioChao", Vector3.new(0, -3, 0))
			Efeitos.feixe(ceu, chao, {
				Color = Efeitos.sequenciaDeCor(cor, Color3.fromRGB(255, 255, 255)),
				Width0 = 0.4 * fator * (1 + esticado * 0.5),
				Width1 = 1.1 * fator,
				CurveSize0 = 2.5,
				CurveSize1 = -2.5, -- curva em S: aproxima de "raio" sem textura própria
			}, DURACAO_BASE * 0.5)

			Efeitos.brilho(personagem, {
				FillColor = Color3.fromRGB(255, 255, 255),
				OutlineColor = cor,
				FillTransparency = 0.5,
			}, 0.15)

			Efeitos.luz(raiz, { Color = cor, Brightness = 8 * fator, Range = 20 * fator }, 0.3)

			-- Elemento explícito da tabela: tremor de câmera é do cliente, o
			-- servidor só avisa (ver Efeitos.tremor).
			Efeitos.tremor(contexto.intensidade, DURACAO_BASE * 0.6)
		end)
	end,
}
