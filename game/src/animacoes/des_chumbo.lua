--!strict
-- Peso de Chumbo: pancada seca contra o chão. "Boneco achata" não pode ser
-- literal (proibido mexer em Humanoid/escala do personagem — isso é do
-- movimento.lua); o peso é vendido por uma sombra que se achata no chão mais
-- a onda de impacto.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local TweenService = game:GetService("TweenService")

local COR_SOMBRA = Color3.fromRGB(15, 15, 18)
local COR_ONDA = Color3.fromRGB(90, 90, 95)

--[[
	Primitiva que falta em efeitos.lua: disco escuro que achata rápido no
	chão, para vender "peso" sem tocar no personagem. `escala` empacota
	intensidade e delta — duração do tween fica fixa.
]]
local function sombraAchatada(posicao, escala)
	local duracao = 0.35
	local disco = Instance.new("Part")
	disco.Anchored = true
	disco.CanCollide = false
	disco.CanQuery = false
	disco.CanTouch = false
	disco.Material = Enum.Material.SmoothPlastic
	disco.Shape = Enum.PartType.Cylinder
	disco.Color = COR_SOMBRA
	disco.Transparency = 0.35
	disco.Size = Vector3.new(0.2, 2, 2)
	disco.CFrame = CFrame.new(posicao) * CFrame.Angles(0, 0, math.rad(90))
	disco.Parent = workspace

	local alvo = 9 * escala
	TweenService:Create(disco, TweenInfo.new(duracao, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		Size = Vector3.new(0.2, alvo, alvo),
		Transparency = 1,
	}):Play()
	Efeitos.limparEm(disco, duracao + 0.3)
end

return {
	id = "des_chumbo",
	nome = "Peso de Chumbo",
	direcao = "descida",
	pesoVisual = 2,
	duracaoBase = 0.9,
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
			local esticar = math.clamp(1 + math.abs(contexto.delta or 0) * 0.03, 1, 1.8)
			local pes = raiz.Position - Vector3.new(0, 2.8, 0)

			sombraAchatada(pes, fator * esticar)
			Efeitos.anel(pes, COR_ONDA, intensidade, 0.5)

			local anexo = Efeitos.anexo(raiz, "ChumboLuz", Vector3.new(0, -2.5, 0))
			Efeitos.luz(anexo, {
				Color = COR_ONDA,
				Brightness = 3 * fator,
				Range = 10 * fator,
			}, 0.3)
		end)
	end,
}
