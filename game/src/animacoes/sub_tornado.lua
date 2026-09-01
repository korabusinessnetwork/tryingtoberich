--!strict
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

-- Mesma ideia do vento (pontos soprando pra cima ao redor do corpo), só que em
-- duas alturas e mais denso: lê como coluna, não como brisa. O anel no chão é
-- o "arrasto" — o que a coluna puxa antes de levar pra cima.
local DURACAO_BASE = 2.0
local RAIO = 2.2

return {
	id = "sub_tornado",
	nome = "Tornado",
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

			local esticado = math.min(math.abs(contexto.delta or 1) / 8, 2)
			local poeira = Color3.fromRGB(180, 170, 150)

			local alturas = { -2.5, 1.5 }
			for _, altura in ipairs(alturas) do
				for i = 0, 3 do
					local angulo = math.rad(i * 90 + altura * 10)
					local deslocamento = Vector3.new(math.cos(angulo) * RAIO, altura, math.sin(angulo) * RAIO)
					local ponto = Efeitos.anexo(raiz, "TornadoPonto", deslocamento)
					Efeitos.particula(ponto, {
						Color = Efeitos.sequenciaDeCor(poeira, Color3.fromRGB(140, 130, 110)),
						Transparency = Efeitos.sequenciaDeNumero(0.2, 1),
						Lifetime = NumberRange.new(0.6, 1.1),
						Speed = NumberRange.new(7, 10 + esticado * 3),
						SpreadAngle = Vector2.new(25, 45),
						EmissionDirection = Enum.NormalId.Top,
						Rate = 14,
					}, contexto.intensidade, DURACAO_BASE)
				end
			end

			local pes = raiz.Position - Vector3.new(0, 3, 0) -- ~pé do rig R6
			Efeitos.anel(pes, poeira, math.min(contexto.intensidade + esticado, 5), 0.7)
		end)
	end,
}
