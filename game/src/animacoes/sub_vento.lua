--!strict
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

-- Três pontos de emissão em volta do corpo, cada um soprando pra cima: a soma
-- das três correntes lê como redemoinho sem precisar girar nada a cada frame
-- (nenhuma instância nova por RenderStepped, só os três anexos criados uma vez).
local DURACAO_BASE = 1.2
local RAIO = 1.6

return {
	id = "sub_vento",
	nome = "Vento Ascendente",
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

			local esticado = math.min(math.abs(contexto.delta or 1) / 10, 1.5)
			local corAr = Color3.fromRGB(220, 255, 240)

			for i = 0, 2 do
				local angulo = math.rad(i * 120)
				local deslocamento = Vector3.new(math.cos(angulo) * RAIO, 0, math.sin(angulo) * RAIO)
				local ponto = Efeitos.anexo(raiz, "VentoPonto" .. i, deslocamento)
				Efeitos.particula(ponto, {
					Color = Efeitos.sequenciaDeCor(corAr),
					Transparency = Efeitos.sequenciaDeNumero(0.3, 1),
					Lifetime = NumberRange.new(0.5, 0.9),
					Speed = NumberRange.new(6, 9 + esticado * 3),
					SpreadAngle = Vector2.new(20, 60),
					EmissionDirection = Enum.NormalId.Top,
					Rate = 22,
				}, contexto.intensidade, DURACAO_BASE)
			end

			local folhas = Efeitos.anexo(raiz, "VentoFolhas", Vector3.new(0, -1, 0))
			Efeitos.particula(folhas, {
				Color = Efeitos.sequenciaDeCor(Color3.fromRGB(150, 180, 70), Color3.fromRGB(110, 80, 40)),
				Lifetime = NumberRange.new(0.7, 1.1),
				Speed = NumberRange.new(5, 8),
				SpreadAngle = Vector2.new(40, 40),
				EmissionDirection = Enum.NormalId.Top,
				RotSpeed = NumberRange.new(-180, 180),
				Size = Efeitos.sequenciaDeNumero(0.5, 0.3),
				Rate = 14,
			}, contexto.intensidade, DURACAO_BASE)
		end)
	end,
}
