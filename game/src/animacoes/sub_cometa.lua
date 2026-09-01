--!strict
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local DURACAO_BASE = 1.6

return {
	id = "sub_cometa",
	nome = "Cometa",
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
			-- É o próprio exemplo do doc: cauda mais longa pra delta maior.
			local esticado = math.min(math.abs(contexto.delta or 1) / 8, 2.2)
			local azul = Color3.fromRGB(90, 160, 255)

			local frente = Efeitos.anexo(raiz, "CometaFrente", Vector3.new(0, 0.5, -1))
			local cauda = Efeitos.anexo(raiz, "CometaCauda", Vector3.new(0, 0.5, 3 + esticado))
			Efeitos.trilha(frente, cauda, {
				Color = Efeitos.sequenciaDeCor(Color3.fromRGB(230, 245, 255), azul),
				Transparency = Efeitos.sequenciaDeNumero(0.1, 1),
				Lifetime = 0.5 + esticado * 0.15,
				Width0 = 2.2 * fator,
				Width1 = 0.1,
			}, DURACAO_BASE)

			Efeitos.particula(frente, {
				Color = Efeitos.sequenciaDeCor(Color3.fromRGB(255, 255, 255), azul),
				Lifetime = NumberRange.new(0.2, 0.4),
				Speed = NumberRange.new(8, 14),
				SpreadAngle = Vector2.new(30, 30),
				Rate = 30,
			}, contexto.intensidade, DURACAO_BASE)

			Efeitos.luz(raiz, { Color = azul, Brightness = 5 * fator, Range = 16 * fator }, DURACAO_BASE)
		end)
	end,
}
