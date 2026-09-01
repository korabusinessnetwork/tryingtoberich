--!strict
-- Escorregão: o boneco risca o chão descendo. As duas pontas da trilha ficam
-- no próprio root part, então ela acompanha o Tween do movimento.lua sozinha
-- — o módulo não precisa seguir a posição do personagem quadro a quadro.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local COR_TRILHA = Color3.fromRGB(200, 200, 205)
local COR_FAISCA = Color3.fromRGB(255, 214, 120)

return {
	id = "des_escorregao",
	nome = "Escorregão",
	direcao = "descida",
	pesoVisual = 1,
	duracaoBase = 0.6,
	aceitaDeltaVariavel = true,
	executar = function(personagem, contexto)
		Efeitos.executarSeguro(function()
			contexto = contexto or {}
			local raiz = Efeitos.raiz(personagem)
			if not raiz then
				return
			end
			local intensidade = contexto.intensidade
			local fator = Efeitos.escala(intensidade)
			-- Delta maior = escorregada mais longa = trilha mais comprida atrás dela.
			local esticar = math.clamp(1 + math.abs(contexto.delta or 0) * 0.05, 1, 2.2)

			local pesA = Efeitos.anexo(raiz, "EscorregaoA", Vector3.new(0.4, -2.8, -0.3))
			local pesB = Efeitos.anexo(raiz, "EscorregaoB", Vector3.new(-0.4, -2.8, 0.3))
			Efeitos.trilha(pesA, pesB, {
				Color = Efeitos.sequenciaDeCor(COR_TRILHA),
				Transparency = Efeitos.sequenciaDeNumero(0.3, 1),
				Lifetime = 0.35 * esticar,
				WidthScale = Efeitos.sequenciaDeNumero(1 * fator, 0.2 * fator),
			}, 0.6)

			local faiscas = Efeitos.anexo(raiz, "EscorregaoFaisca", Vector3.new(0, -2.85, 0))
			Efeitos.particula(faiscas, {
				Color = Efeitos.sequenciaDeCor(COR_FAISCA),
				Lifetime = NumberRange.new(0.15, 0.3),
				Speed = NumberRange.new(3, 8),
				SpreadAngle = Vector2.new(70, 10),
				Rate = 50,
				LightEmission = 1,
			}, intensidade, 0.6)
		end)
	end,
}
