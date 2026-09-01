--!strict
-- Buraco Negro: esfera escura presa ao personagem (WeldConstraint, sem
-- massa — não pode alterar peso nem física do boneco) que suga partícula
-- para perto de si. "Distorção" é a câmera afastando (Efeitos.afastarCamera);
-- quem desenha o efeito de tela é o módulo de câmera, não este.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local TweenService = game:GetService("TweenService")

local COR_ESFERA = Color3.fromRGB(18, 8, 26)
local COR_BORDA = Color3.fromRGB(90, 40, 130)

return {
	id = "des_buraco_negro",
	nome = "Buraco Negro",
	direcao = "descida",
	pesoVisual = 4,
	duracaoBase = 2.4,
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
			local esticar = math.clamp(1 + math.abs(contexto.delta or 0) * 0.02, 1, 1.6)
			local tamanhoAlvo = 3 * fator * esticar

			local esfera = Instance.new("Part")
			esfera.CanCollide = false
			esfera.CanQuery = false
			esfera.CanTouch = false
			esfera.Material = Enum.Material.Neon
			esfera.Shape = Enum.PartType.Ball
			esfera.Color = COR_ESFERA
			esfera.Size = Vector3.new(0.2, 0.2, 0.2)
			esfera.CFrame = raiz.CFrame + Vector3.new(0, 3, 0)
			esfera.Parent = workspace
			Efeitos.prenderNoPersonagem(esfera, raiz)

			TweenService:Create(esfera, TweenInfo.new(0.4, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
				Size = Vector3.new(tamanhoAlvo, tamanhoAlvo, tamanhoAlvo),
			}):Play()

			local anexoBorda = Efeitos.anexo(esfera, "BuracoNegroBorda", Vector3.new(0, 0, 0))
			Efeitos.luz(anexoBorda, { Color = COR_BORDA, Brightness = 2 * fator, Range = 10 * fator }, 2.4)

			-- Partícula sugada: nasce grande perto da esfera e encolhe até
			-- sumir, com bastante arrasto, como se fosse consumida.
			Efeitos.particula(anexoBorda, {
				Color = Efeitos.sequenciaDeCor(COR_BORDA, COR_ESFERA),
				Lifetime = NumberRange.new(0.5, 0.9),
				Speed = NumberRange.new(6, 10),
				SpreadAngle = Vector2.new(180, 180),
				Rate = 55,
				Drag = 8,
				Size = Efeitos.sequenciaDeNumero(0.9 * fator, 0),
				Transparency = Efeitos.sequenciaDeNumero(0.1, 0.9),
			}, intensidade, 2.2)

			task.delay(2.0, function()
				TweenService:Create(esfera, TweenInfo.new(0.4, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
					Size = Vector3.new(0.2, 0.2, 0.2),
				}):Play()
			end)
			Efeitos.limparEm(esfera, 2.6)

			-- movimento.lua já afasta a câmera para peso visual >= 4, mas o
			-- efeito chama por conta própria — precisa funcionar mesmo se um
			-- dia rodar fora do fluxo do Movimento.aplicar.
			Efeitos.afastarCamera(2.4)
		end)
	end,
}
