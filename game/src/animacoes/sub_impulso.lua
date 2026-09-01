--!strict
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

-- Impulso é o pulo com força: mesmo trail, mais grosso, e um anel de choque
-- que cresce com o delta — presente que empurra 20 plataformas abre um anel
-- bem maior que um que empurra 2, sem mexer no tempo do efeito.
local DURACAO_BASE = 0.6

return {
	id = "sub_impulso",
	nome = "Impulso",
	direcao = "subida",
	pesoVisual = 1,
	duracaoBase = DURACAO_BASE,
	aceitaDeltaVariavel = true,
	executar = function(personagem, contexto)
		Efeitos.executarSeguro(function()
			local raiz = Efeitos.raiz(personagem)
			if not raiz then
				return
			end

			local cor = Color3.fromRGB(80, 220, 255)
			local fator = Efeitos.escala(contexto.intensidade)

			local topo = Efeitos.anexo(raiz, "ImpulsoTopo", Vector3.new(0, 1.1, 0))
			local base = Efeitos.anexo(raiz, "ImpulsoBase", Vector3.new(0, -1.6, 0))
			Efeitos.trilha(topo, base, {
				Color = Efeitos.sequenciaDeCor(cor),
				Transparency = Efeitos.sequenciaDeNumero(0.1, 1),
				Lifetime = 0.25,
				Width0 = 1.8 * fator,
				Width1 = 0.3,
			}, DURACAO_BASE)

			local pes = raiz.Position - Vector3.new(0, 3, 0) -- ~pé do rig R6
			local intensidadeAnel = math.min(contexto.intensidade + (math.abs(contexto.delta or 1) / 10), 5)
			Efeitos.anel(pes, cor, intensidadeAnel, 0.5)
		end)
	end,
}
