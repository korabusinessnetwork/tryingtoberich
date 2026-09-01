--!strict
-- Meteoro: rocha em chamas cai do céu perto de onde o boneco começou a
-- animação e estala no chão. Uma das duas descidas que a tabela pede tremor
-- (a outra é des_rajada).
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local TweenService = game:GetService("TweenService")

local COR_ROCHA = Color3.fromRGB(35, 30, 28)
local COR_FOGO = Color3.fromRGB(255, 110, 40)
local COR_CRATERA = Color3.fromRGB(120, 25, 15)

return {
	id = "des_meteoro",
	nome = "Meteoro",
	direcao = "descida",
	pesoVisual = 3,
	duracaoBase = 1.6,
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

			local origem = raiz.Position
			local desvio = Vector3.new((math.random() - 0.5) * 3, 0, (math.random() - 0.5) * 3)
			local inicio = origem + desvio + Vector3.new(0, 22, 0)
			local fim = origem + desvio - Vector3.new(0, 2.8, 0)
			local tamanho = 1.6 * fator * esticar

			local rocha = Instance.new("Part")
			rocha.Anchored = true
			rocha.CanCollide = false
			rocha.CanQuery = false
			rocha.CanTouch = false
			rocha.Material = Enum.Material.Slate
			rocha.Shape = Enum.PartType.Ball
			rocha.Color = COR_ROCHA
			rocha.Size = Vector3.new(tamanho, tamanho, tamanho)
			rocha.CFrame = CFrame.new(inicio)
			rocha.Parent = workspace

			local anexoFogo = Efeitos.anexo(rocha, "MeteoroFogo", Vector3.new(0, 0, 0))
			Efeitos.particula(anexoFogo, {
				Color = Efeitos.sequenciaDeCor(COR_FOGO, COR_ROCHA),
				Lifetime = NumberRange.new(0.15, 0.3),
				Speed = NumberRange.new(1, 3),
				SpreadAngle = Vector2.new(30, 30),
				Rate = 90,
				LightEmission = 0.8,
			}, intensidade, 1.1)
			Efeitos.luz(anexoFogo, { Color = COR_FOGO, Brightness = 3 * fator, Range = 12 * fator }, 1.1)

			local tempoQueda = 0.9
			local tween = TweenService:Create(
				rocha,
				TweenInfo.new(tempoQueda, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
				{ CFrame = CFrame.new(fim) }
			)
			tween.Completed:Connect(function()
				rocha:Destroy()
				-- Posição fresca: o boneco pode ter continuado descendo desde
				-- o disparo, então o impacto acompanha onde ele está agora.
				local raizAtual = Efeitos.raiz(personagem)
				local pontoImpacto = raizAtual and (raizAtual.Position - Vector3.new(0, 2.8, 0)) or fim
				Efeitos.anel(pontoImpacto, COR_CRATERA, intensidade, 0.6)
				if raizAtual then
					local anexoImpacto = Efeitos.anexo(raizAtual, "MeteoroImpacto", Vector3.new(0, -2.6, 0))
					Efeitos.luz(anexoImpacto, { Color = COR_FOGO, Brightness = 4 * fator, Range = 16 * fator }, 0.5)
				end
				Efeitos.tremor(intensidade, 0.4)
			end)
			tween:Play()
			Efeitos.limparEm(rocha, tempoQueda + 0.5)
		end)
	end,
}
