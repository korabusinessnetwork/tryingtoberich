--!strict
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local TweenService = game:GetService("TweenService")

--[[
	"Deformação do boneco" sem tocar no rig: reescalar Part.Size do personagem
	quebra visualmente o Motor6D (o R6 não reajusta o encaixe dos membros). Em
	vez disso, um balão de Neon ao lado do personagem comprime e estica, como
	se fosse a mola vista de fora. Os dois anéis (Efeitos.anel, que já existe)
	fazem o "boing": um curto de compressão, um maior de soltura.
]]
local DURACAO_BASE = 0.8

return {
	id = "sub_mola",
	nome = "Mola",
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

			local cor = Color3.fromRGB(140, 255, 90)
			local fator = Efeitos.escala(contexto.intensidade)
			local esticado = math.min(math.abs(contexto.delta or 1) / 15, 1)

			local function chao()
				return raiz.Position - Vector3.new(0, 3, 0) -- ~pé do rig R6
			end

			local balao = Instance.new("Part")
			balao.Shape = Enum.PartType.Ball
			balao.Material = Enum.Material.Neon
			balao.Color = cor
			balao.Anchored = true
			balao.CanCollide = false
			balao.CanQuery = false
			balao.CanTouch = false
			balao.Transparency = 0.3
			balao.Size = Vector3.new(3, 1.2, 3) * fator
			balao.CFrame = raiz.CFrame
			balao.Parent = workspace
			Efeitos.limparEm(balao, DURACAO_BASE + 1)

			TweenService:Create(balao, TweenInfo.new(DURACAO_BASE * 0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
				Size = Vector3.new(2, 3.4 + esticado * 2, 2) * fator,
				Transparency = 1,
			}):Play()

			Efeitos.anel(chao(), cor, contexto.intensidade, 0.25)
			task.wait(DURACAO_BASE * 0.35)
			Efeitos.anel(chao(), cor, math.min(contexto.intensidade + 1 + esticado, 5), 0.5)
		end)
	end,
}
