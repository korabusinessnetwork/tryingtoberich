--!strict
-- Selo Amaldiçoado: um círculo de selo se desenha à frente e acima do boneco e
-- prende nele quatro correntes de sombra, que o arrastam para trás na diagonal,
-- degrau abaixo.
--
-- É o espelho do sub_despertar e o par de peso 5 da descida. O Despertar
-- acende a tela; este apaga: o `flash` sai quase preto e com opacidade baixa,
-- que é a única forma de escurecer o pixel que não tem geometria atrás (luz e
-- Highlight só iluminam o que existe).
--
-- O selo nasce em `-eixo`, de onde o boneco veio, e não em cima da cabeça: numa
-- escada em espiral quadrada a queda é diagonal, e um selo vertical ficaria
-- pendurado no vazio enquanto o corpo sai de baixo dele.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local TweenService = game:GetService("TweenService")

local DURACAO_BASE = 3.0

-- Batidas da ficha, em segundos.
local FIM_DO_SELO = 0.6
local FIM_DAS_CORRENTES = 1.0
local FIM_DO_ARRASTO = 2.5

local COR_SELO = Color3.fromRGB(168, 85, 247)
local COR_SIGILO = Color3.fromRGB(255, 45, 85)
local COR_VAZIO = Color3.fromRGB(26, 11, 46)

local CORRENTES = 4

return {
	id = "des_selo",
	nome = "Selo Amaldiçoado",
	direcao = "descida",
	pesoVisual = 5,
	duracaoBase = DURACAO_BASE,
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
			-- Delta estica a corrente, nunca a duração.
			local corda = 6 + math.clamp(math.abs(contexto.delta or 0) * 0.4, 0, 10)

			local eixo = Efeitos.eixoDoMovimento(raiz, contexto)
			local eixoMundo = raiz.CFrame:VectorToWorldSpace(eixo)

			Efeitos.luz(raiz, { Color = COR_SELO, Brightness = 5 * fator, Range = 20 * fator }, DURACAO_BASE)
			Efeitos.afastarCamera(DURACAO_BASE)

			-- Selo: um disco Neon fino, deitado de frente para a linha de
			-- viagem, soldado no personagem para acompanhar o Tween do
			-- movimento (mesmo caminho do fragmento da des_dimensional).
			local ancoragem = eixo * -corda
			local posicaoDoSelo = raiz.Position + raiz.CFrame:VectorToWorldSpace(ancoragem)
			local giro = CFrame.lookAt(posicaoDoSelo, posicaoDoSelo + eixoMundo) - posicaoDoSelo

			local selo = Instance.new("Part")
			selo.CanCollide = false
			selo.CanQuery = false
			selo.CanTouch = false
			selo.Material = Enum.Material.Neon
			selo.Shape = Enum.PartType.Cylinder
			selo.Color = COR_SELO
			selo.Transparency = 1
			selo.Size = Vector3.new(0.2, 0.5, 0.5)
			selo.Anchored = true
			-- Cilindro do Roblox aponta no X; girar 90° em Y deixa a face
			-- redonda olhando para a linha de viagem.
			selo.CFrame = CFrame.new(posicaoDoSelo) * giro * CFrame.Angles(0, math.rad(90), 0)
			selo.Parent = workspace

			local largura = 13 * fator
			TweenService:Create(selo, TweenInfo.new(FIM_DO_SELO, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
				Size = Vector3.new(0.2, largura, largura),
				Transparency = 0.35,
			}):Play()

			task.delay(FIM_DO_SELO, function()
				local atual = Efeitos.raiz(personagem)
				if selo.Parent and atual then
					selo.CFrame = atual.CFrame * CFrame.new(ancoragem) * giro * CFrame.Angles(0, math.rad(90), 0)
					Efeitos.prenderNoPersonagem(selo, atual)
				end
			end)

			TweenService:Create(
				selo,
				TweenInfo.new(0.4, Enum.EasingStyle.Quad, Enum.EasingDirection.In, 0, false, FIM_DO_ARRASTO),
				{ Transparency = 1, Size = Vector3.new(0.2, largura * 1.5, largura * 1.5) }
			):Play()
			Efeitos.limparEm(selo, DURACAO_BASE + 0.5)

			-- Escurecimento em duas doses: quando o selo fecha e quando ele
			-- sela. Opacidade baixa, senão a live vira uma tela preta.
			task.delay(FIM_DO_SELO, function()
				Efeitos.flash(COR_VAZIO, 0.5, 0.32 * fator)
			end)

			-- Correntes: quatro feixes segmentados do selo até o boneco, o
			-- mesmo recurso da des_ancora. As duas pontas ficam no personagem,
			-- então a corrente acompanha o Tween sem este módulo seguir nada.
			local presilha = Efeitos.anexo(raiz, "SeloPresilha", Vector3.new(0, 0.4, 0))
			for i = 1, CORRENTES do
				local lado = math.rad((i - 1) * (360 / CORRENTES))
				local desvio = Vector3.new(math.cos(lado) * 1.6, math.sin(lado) * 1.6, 0)
				local ponto = Efeitos.anexo(raiz, "SeloElo" .. i, ancoragem + desvio)
				Efeitos.feixe(ponto, presilha, {
					Color = Efeitos.sequenciaDeCor(i == 3 and COR_SIGILO or COR_SELO, COR_VAZIO),
					Transparency = Efeitos.sequenciaDeNumero(0.15, 0.6),
					Width0 = 1.15 * fator,
					Width1 = 1.15 * fator,
					Segments = 12,
					CurveSize0 = 0,
					CurveSize1 = 0,
					LightEmission = 0.5,
				}, FIM_DO_ARRASTO)
			end

			task.delay(FIM_DAS_CORRENTES, function()
				Efeitos.tremor(intensidade, 0.3)
			end)

			-- Arrasto: partícula puxada no sentido CONTRÁRIO ao da queda. É o
			-- que dá velocidade aparente sem depender do fundo do mapa, que é
			-- gerado por IA e pode ser de qualquer cor.
			Efeitos.particula(presilha, {
				Color = Efeitos.sequenciaDeCor(COR_SELO, COR_SIGILO),
				Transparency = Efeitos.sequenciaDeNumero(0.2, 1),
				Lifetime = NumberRange.new(0.4, 0.7),
				Speed = NumberRange.new(3, 8),
				SpreadAngle = Vector2.new(45, 45),
				Acceleration = eixoMundo * -32,
				Rate = 45,
			}, intensidade, FIM_DO_ARRASTO)

			Efeitos.brilho(personagem, {
				FillColor = COR_VAZIO,
				OutlineColor = COR_SELO,
				FillTransparency = 0.4,
			}, FIM_DO_ARRASTO)

			-- Selamento: anel no tampo da plataforma de destino e elos soltos.
			task.delay(FIM_DO_ARRASTO, function()
				local atual = Efeitos.raiz(personagem)
				if not atual then
					return
				end
				Efeitos.anel(Efeitos.pontoDeChao(atual), COR_SIGILO, intensidade, 0.5)
				Efeitos.tremor(intensidade, 0.4)
				Efeitos.flash(COR_VAZIO, 0.4, 0.42 * fator)

				local altura = -(Efeitos.ALTURA_DOS_PES - Efeitos.FOLGA_DO_DECK)
				local pes = Efeitos.anexo(atual, "SeloElos", Vector3.new(0, altura, 0))
				Efeitos.particula(pes, {
					Color = Efeitos.sequenciaDeCor(COR_SELO, COR_VAZIO),
					Transparency = Efeitos.sequenciaDeNumero(0.1, 1),
					Lifetime = NumberRange.new(0.3, 0.6),
					Speed = NumberRange.new(8, 15),
					SpreadAngle = Vector2.new(80, 80),
					Rate = 70,
					RotSpeed = NumberRange.new(-200, 200),
				}, intensidade, 0.4)
			end)
		end)
	end,
}
