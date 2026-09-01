--!strict
-- Tropeço: a queda mais leve da lista. "Rotação curta" não pode ser o boneco
-- girando de verdade — quem mexe em CFrame/Humanoid do personagem é só o
-- movimento.lua. O giro sai de uma lasca solta que gira perto dos pés.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local TweenService = game:GetService("TweenService")

local COR_POEIRA = Color3.fromRGB(120, 104, 82)
local COR_LASCA = Color3.fromRGB(70, 65, 60)

--[[
	Primitiva que falta em efeitos.lua: uma lasca que gira rápido no chão, para
	ler como "tropeço" sem tocar no personagem real. Duração fixa (0.25s) de
	propósito — intensidade nunca multiplica duração, só a escala da lasca.
]]
local function girarLasca(posicao, escala)
	local duracao = 0.25
	local lasca = Instance.new("Part")
	lasca.Anchored = true
	lasca.CanCollide = false
	lasca.CanQuery = false
	lasca.CanTouch = false
	lasca.Material = Enum.Material.SmoothPlastic
	lasca.Shape = Enum.PartType.Block
	lasca.Size = Vector3.new(1.4, 0.15, 0.5) * escala
	lasca.Color = COR_LASCA
	lasca.Transparency = 0.1
	lasca.CFrame = CFrame.new(posicao)
	lasca.Parent = workspace

	TweenService:Create(lasca, TweenInfo.new(duracao, Enum.EasingStyle.Linear), {
		CFrame = CFrame.new(posicao) * CFrame.Angles(0, math.rad(280), 0),
		Transparency = 1,
	}):Play()

	Efeitos.limparEm(lasca, duracao + 0.3)
end

return {
	id = "des_tropeco",
	nome = "Tropeço",
	direcao = "descida",
	pesoVisual = 1,
	duracaoBase = 0.4,
	aceitaDeltaVariavel = false,
	executar = function(personagem, contexto)
		Efeitos.executarSeguro(function()
			contexto = contexto or {}
			local raiz = Efeitos.raiz(personagem)
			if not raiz then
				return
			end
			local intensidade = contexto.intensidade
			local fator = Efeitos.escala(intensidade)

			local pes = Efeitos.anexo(raiz, "TropecoPes", Vector3.new(0, -2.9, 0))
			Efeitos.particula(pes, {
				Color = Efeitos.sequenciaDeCor(COR_POEIRA),
				Lifetime = NumberRange.new(0.2, 0.35),
				Speed = NumberRange.new(2, 5),
				SpreadAngle = Vector2.new(50, 15),
				Rate = 60,
				Transparency = Efeitos.sequenciaDeNumero(0.2, 1),
			}, intensidade, 0.4)

			girarLasca(raiz.Position - Vector3.new(0, 2.9, 0), fator)
		end)
	end,
}
