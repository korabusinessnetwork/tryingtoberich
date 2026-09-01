--!strict
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

-- Cone de fogo aponta pra baixo (EmissionDirection Bottom): é o motor do
-- foguete empurrando o boneco pra cima, não uma fogueira embaixo dele.
local DURACAO_BASE = 1.2

return {
	id = "sub_foguete",
	nome = "Foguete",
	direcao = "subida",
	pesoVisual = 2,
	duracaoBase = DURACAO_BASE,
	aceitaDeltaVariavel = true,
	executar = function(personagem, contexto)
		Efeitos.executarSeguro(function()
			local raiz = Efeitos.raiz(personagem)
			if not raiz then
				return
			end

			local fator = Efeitos.escala(contexto.intensidade)
			local esticado = math.min(math.abs(contexto.delta or 1) / 10, 2)
			local motor = Efeitos.anexo(raiz, "FogueteMotor", Vector3.new(0, -2.8, 0))

			Efeitos.particula(motor, {
				Color = Efeitos.sequenciaDeCor(Color3.fromRGB(255, 210, 80), Color3.fromRGB(255, 100, 30)),
				Lifetime = NumberRange.new(0.25, 0.4),
				Speed = NumberRange.new(14, 20 + esticado * 4),
				SpreadAngle = Vector2.new(12, 12),
				EmissionDirection = Enum.NormalId.Bottom,
				Rate = 60,
			}, contexto.intensidade, DURACAO_BASE)

			Efeitos.particula(motor, {
				Color = Efeitos.sequenciaDeCor(Color3.fromRGB(210, 210, 215), Color3.fromRGB(140, 140, 145)),
				Transparency = Efeitos.sequenciaDeNumero(0.4, 1),
				Lifetime = NumberRange.new(0.6, 1),
				Speed = NumberRange.new(3, 6),
				SpreadAngle = Vector2.new(35, 35),
				EmissionDirection = Enum.NormalId.Bottom,
				Rate = 18,
			}, contexto.intensidade, DURACAO_BASE)

			Efeitos.luz(motor, {
				Color = Color3.fromRGB(255, 150, 60),
				Brightness = 5 * fator,
				Range = 14 * fator,
			}, DURACAO_BASE)
		end)
	end,
}
