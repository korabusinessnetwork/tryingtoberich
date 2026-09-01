--!strict
-- Redemoinho: espiral que puxa o boneco para baixo, o oposto do tornado de
-- subida. ParticleEmitter não tem trajetória em espiral de verdade: o giro
-- vem da rotação por partícula (RotSpeed) e o "arrasto para baixo" vem de
-- anéis que encolhem — Efeitos.anel só cresce.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local TweenService = game:GetService("TweenService")

local COR_REDEMOINHO = Color3.fromRGB(45, 55, 45)

--[[ Primitiva que falta em efeitos.lua: anel que encolhe, para vender "sendo
	puxado para dentro/para baixo". ]]
local function anelEncolhendo(posicao, cor, raioInicial)
	local duracao = 0.7
	local anel = Instance.new("Part")
	anel.Anchored = true
	anel.CanCollide = false
	anel.CanQuery = false
	anel.CanTouch = false
	anel.Material = Enum.Material.Neon
	anel.Shape = Enum.PartType.Cylinder
	anel.Color = cor
	anel.Size = Vector3.new(0.25, raioInicial, raioInicial)
	anel.CFrame = CFrame.new(posicao) * CFrame.Angles(0, 0, math.rad(90))
	anel.Parent = workspace

	TweenService:Create(anel, TweenInfo.new(duracao, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
		Size = Vector3.new(0.25, 0.4, 0.4),
		Transparency = 1,
	}):Play()
	Efeitos.limparEm(anel, duracao + 0.3)
end

return {
	id = "des_redemoinho",
	nome = "Redemoinho",
	direcao = "descida",
	pesoVisual = 3,
	duracaoBase = 2.0,
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
			local esticar = math.clamp(1 + math.abs(contexto.delta or 0) * 0.02, 1, 1.7)

			local topo = Efeitos.anexo(raiz, "RedemoinhoTopo", Vector3.new(0, 4, 0))
			Efeitos.particula(topo, {
				Color = Efeitos.sequenciaDeCor(COR_REDEMOINHO),
				Lifetime = NumberRange.new(0.6, 1.0),
				Speed = NumberRange.new(3, 6),
				SpreadAngle = Vector2.new(45, 45),
				Rate = 65,
				Rotation = NumberRange.new(0, 360),
				RotSpeed = NumberRange.new(180, 320),
				Acceleration = Vector3.new(0, -22, 0),
				Transparency = Efeitos.sequenciaDeNumero(0.3, 1),
			}, intensidade, 2.0)

			local raioBase = 6 * fator * esticar
			anelEncolhendo(raiz.Position - Vector3.new(0, 2.8, 0), COR_REDEMOINHO, raioBase)

			task.delay(0.4, function()
				local raizAtual = Efeitos.raiz(personagem)
				if raizAtual then
					anelEncolhendo(raizAtual.Position - Vector3.new(0, 2.8, 0), COR_REDEMOINHO, raioBase * 0.8)
				end
			end)
			task.delay(0.8, function()
				local raizAtual = Efeitos.raiz(personagem)
				if raizAtual then
					anelEncolhendo(raizAtual.Position - Vector3.new(0, 2.8, 0), COR_REDEMOINHO, raioBase * 0.6)
				end
			end)
		end)
	end,
}
