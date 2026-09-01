--!strict
-- Âncora: uma corrente puxa o boneco para baixo. As duas pontas do feixe
-- ficam no próprio personagem (pés e bem acima da cabeça), então a corrente
-- acompanha o Tween do movimento.lua sem o módulo seguir a posição dele.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local COR_CORRENTE = Color3.fromRGB(55, 55, 60)

return {
	id = "des_ancora",
	nome = "Âncora",
	direcao = "descida",
	pesoVisual = 2,
	duracaoBase = 1.3,
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
			-- Delta maior = corrente mais longa, subindo mais alto a partir do boneco.
			local altura = 6 + math.clamp(math.abs(contexto.delta or 0) * 0.2, 0, 8)

			local pes = Efeitos.anexo(raiz, "AncoraPes", Vector3.new(0, -2.6, 0))
			local topo = Efeitos.anexo(raiz, "AncoraTopo", Vector3.new(0, altura, 0))
			Efeitos.feixe(pes, topo, {
				Color = Efeitos.sequenciaDeCor(COR_CORRENTE),
				Width0 = 0.5 * fator,
				Width1 = 0.5 * fator,
				Segments = 10,
				CurveSize0 = 0,
				CurveSize1 = 0,
				LightEmission = 0.1,
			}, 1.3)

			-- Som de metal: SoundId vazio de propósito. Áudio é asset com
			-- moderação do Roblox (ADR-004) — preencher aqui quando existir.
			local som = Instance.new("Sound")
			som.Name = "AncoraSomMetal"
			som.SoundId = ""
			som.Volume = 0.6 * fator
			som.Parent = raiz
			pcall(function()
				som:Play()
			end)
			Efeitos.limparEm(som, 1.6)
		end)
	end,
}
