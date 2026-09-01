--!strict
-- Rajada Descendente: vento empurrando o boneco para baixo. A partícula nasce
-- acima do personagem e ganha aceleração forte para baixo — mais confiável
-- que depender da orientação exata do emissor para "vertical".
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local COR_RAJADA = Color3.fromRGB(150, 160, 175)

return {
	id = "des_rajada",
	nome = "Rajada Descendente",
	direcao = "descida",
	pesoVisual = 2,
	duracaoBase = 1.0,
	aceitaDeltaVariavel = true,
	executar = function(personagem, contexto)
		Efeitos.executarSeguro(function()
			contexto = contexto or {}
			local raiz = Efeitos.raiz(personagem)
			if not raiz then
				return
			end
			local intensidade = contexto.intensidade
			-- Delta maior = coluna de vento mais alta acima do boneco.
			local altura = 5 + math.clamp(math.abs(contexto.delta or 0) * 0.15, 0, 6)

			local topo = Efeitos.anexo(raiz, "RajadaTopo", Vector3.new(0, altura, 0))
			Efeitos.particula(topo, {
				Color = Efeitos.sequenciaDeCor(COR_RAJADA),
				Lifetime = NumberRange.new(0.4, 0.7),
				Speed = NumberRange.new(1, 3),
				SpreadAngle = Vector2.new(35, 35),
				Rate = 70,
				Acceleration = Vector3.new(0, -70, 0),
				Transparency = Efeitos.sequenciaDeNumero(0.2, 1),
			}, intensidade, 1.0)

			-- A tabela pede tremor em des_rajada e des_meteoro.
			Efeitos.tremor(intensidade, 0.35)
		end)
	end,
}
