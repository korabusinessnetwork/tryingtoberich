--!strict
-- Lança de Raios: uma haste com ponta de plasma se arma na linha de viagem,
-- com arcos elétricos girando em volta dela, e o boneco sai lançado por ali.
--
-- Porte do sexto efeito do estudo em Three.js — haste torneada, colares frios,
-- quatro arcos elétricos girando e aura violeta.
--
-- É a mais curta do pacote (1,2s) de propósito: raio é estalo, não voo. A ficha
-- inteira cabe entre o clarão e o sumiço, e por isso ela é a única sem fumaça na
-- esteira — baforada branca lê como escape de motor, o oposto de elétrico.
--
-- Os arcos do original piscam ligando e desligando o `visible`. Aqui piscam por
-- Tween de transparência com repetição: é a mesma leitura, e não custa nem uma
-- linha rodando de frame em frame.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local TweenService = game:GetService("TweenService")

local DURACAO_BASE = 1.2

-- Batidas da ficha, em segundos.
local ARMAR = 0.16
local DISPARO = 0.3
local INICIO_DO_SUMICO = 0.85

local COR_HASTE = Color3.fromRGB(207, 210, 255)
local COR_ARCO = Color3.fromRGB(243, 233, 255)
local COR_COLAR = Color3.fromRGB(232, 236, 255)
local COR_AURA = Color3.fromRGB(139, 92, 255)
local COR_VIOLETA = Color3.fromRGB(106, 46, 224)

local COLARES = 3
local ARCOS = 4

-- ~12 studs de haste. Ela é comprida em vez de larga: deitada na linha de
-- viagem, o comprimento não briga com o número da plataforma no HUD, que é o
-- que limita a largura das outras cinco (02_DESIGN_SYSTEM).
local COMPRIMENTO = 12
local CALIBRE = 1.1

return {
	id = "sub_lanca_raios",
	nome = "Lança de Raios",
	direcao = "subida",
	pesoVisual = 4,
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
			local esticado = math.min(math.abs(contexto.delta or 1) / 10, 2.0)

			local eixo = Efeitos.eixoDoMovimento(raiz, contexto)
			local eixoMundo = raiz.CFrame:VectorToWorldSpace(eixo)

			-- A lança fica parada e o boneco sai por cima dela. Acompanhar o Tween
			-- Quad-Out do movimento em Linear a deixaria para trás no primeiro
			-- terço, e uma lança atrás de quem ela lançou não lê.
			local centro = raiz.Position + eixoMundo * 2
			local pivo = Efeitos.pivo(Efeitos.olharPara(centro, eixoMundo), DURACAO_BASE + 1)

			local haste = COMPRIMENTO * fator
			local calibre = CALIBRE * fator
			local deitar = CFrame.Angles(0, math.pi / 2, 0)
			-- Z NEGATIVO é para a frente: a ponta em -Z, a cauda em +Z.
			local em = function(z, giro)
				return pivo.CFrame * CFrame.new(0, 0, z) * (giro or CFrame.new())
			end

			Efeitos.peca(pivo, {
				Material = Enum.Material.Metal,
				Shape = Enum.PartType.Cylinder,
				Color = COR_HASTE,
				Size = Vector3.new(haste, calibre, calibre),
				CFrame = em(0, deitar),
			})

			-- Ponta: três discos afinando no lugar do cone do original. O Roblox
			-- não tem cone, e a saída usual é asset — proibido pelo ADR-004.
			for i = 1, 3 do
				local afinamento = 1 - i * 0.28
				Efeitos.peca(pivo, {
					Material = Enum.Material.Neon,
					Shape = Enum.PartType.Cylinder,
					Color = COR_ARCO,
					Size = Vector3.new(haste * 0.09, calibre * (1.5 * afinamento), calibre * (1.5 * afinamento)),
					CFrame = em(-(haste * 0.5) - haste * 0.05 * i, deitar),
				})
			end

			-- Colares frios ao longo da haste e a esfera da cauda.
			for i = 1, COLARES do
				Efeitos.peca(pivo, {
					Material = Enum.Material.Neon,
					Shape = Enum.PartType.Cylinder,
					Color = COR_COLAR,
					Size = Vector3.new(calibre * 0.5, calibre * (2.2 - i * 0.2), calibre * (2.2 - i * 0.2)),
					CFrame = em(haste * (0.3 - i * 0.26), deitar),
				})
			end
			Efeitos.peca(pivo, {
				Material = Enum.Material.Neon,
				Shape = Enum.PartType.Ball,
				Color = COR_COLAR,
				Size = Vector3.new(calibre * 1.6, calibre * 1.6, calibre * 1.6),
				CFrame = em(haste * 0.52),
			})

			-- Aura violeta: o cilindro translúcido em volta da haste.
			Efeitos.peca(pivo, {
				Material = Enum.Material.Neon,
				Shape = Enum.PartType.Cylinder,
				Color = COR_AURA,
				Transparency = 0.8,
				Size = Vector3.new(haste * 0.9, calibre * 3.4, calibre * 3.4),
				CFrame = em(0, deitar),
			})

			-- Os arcos elétricos enrolados na haste. `helice` devolve as contas
			-- para o pisca-pisca abaixo.
			local contas = Efeitos.helice(pivo, {
				bracos = ARCOS,
				contas = 3,
				comprimento = haste * 0.9,
				raio = calibre * 2,
				voltas = 1.5,
				espessura = 0.5 * fator,
				cor = COR_ARCO,
				transparencia = 0.15,
				recuo = -haste * 0.45,
				afinar = 0.2,
			})

			-- O pisca. Cada conta com a própria fase, senão os quatro arcos
			-- apagariam juntos e o efeito viraria um farol.
			for i, conta in ipairs(contas) do
				TweenService:Create(
					conta,
					TweenInfo.new(0.07, Enum.EasingStyle.Linear, Enum.EasingDirection.InOut, 4, true, (i % 5) * 0.03),
					{ Transparency = 0.95 }
				):Play()
			end

			Efeitos.luz(pivo, { Color = COR_AURA, Brightness = 11 * fator, Range = 30 * fator }, DURACAO_BASE)

			-- Giro dos arcos em volta da haste: uma volta e meia na ficha inteira.
			Efeitos.girar(pivo, pivo.CFrame, nil, 1.5, DURACAO_BASE)

			-- Descarga na ponta e faísca ao longo da haste.
			local ponta = Efeitos.anexo(pivo, "LancaPonta", Vector3.new(0, 0, -haste * 0.6))
			Efeitos.particula(ponta, {
				Color = Efeitos.sequenciaDeCor(COR_ARCO, COR_AURA),
				Transparency = Efeitos.sequenciaDeNumero(0.05, 1),
				Size = Efeitos.sequenciaDeNumero(2.6 * fator, 0.2),
				Lifetime = NumberRange.new(0.15, 0.3),
				Speed = NumberRange.new(18, 34),
				SpreadAngle = Vector2.new(35, 35),
				Rate = 140,
				RotSpeed = NumberRange.new(-600, 600),
				LightEmission = 1,
			}, intensidade, INICIO_DO_SUMICO)

			local corpo = Efeitos.anexo(pivo, "LancaCorpo", Vector3.new(0, 0, 0))
			Efeitos.particula(corpo, {
				Color = Efeitos.sequenciaDeCor(COR_COLAR, COR_VIOLETA),
				Transparency = Efeitos.sequenciaDeNumero(0.2, 1),
				Size = Efeitos.sequenciaDeNumero(1.4 * fator, 0.2),
				Lifetime = NumberRange.new(0.12, 0.28),
				Speed = NumberRange.new(8, 20),
				SpreadAngle = Vector2.new(180, 180),
				Rate = 90,
				RotSpeed = NumberRange.new(-500, 500),
				LightEmission = 1,
			}, intensidade, INICIO_DO_SUMICO)

			-- Armar e disparar. Clarão curto, porque raio é estalo.
			local tampo = Efeitos.pontoDeChao(raiz) or centro
			task.delay(ARMAR, function()
				Efeitos.onda(centro, eixoMundo, COR_COLAR, intensidade, 0.3)
			end)
			task.delay(DISPARO, function()
				Efeitos.flash(COR_ARCO, 0.18, 0.5)
				Efeitos.onda(centro, eixoMundo, COR_AURA, intensidade, 0.45)
				Efeitos.anel(tampo, COR_VIOLETA, intensidade, 0.4)
				Efeitos.tremor(intensidade, 0.24)
			end)

			for _, peca in ipairs(pivo:GetChildren()) do
				if peca:IsA("BasePart") then
					TweenService:Create(
						peca,
						TweenInfo.new(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.In, 0, false, INICIO_DO_SUMICO),
						{ Transparency = 1 }
					):Play()
				end
			end

			-- Sem fumaça: baforada branca lê como escape de motor, e este efeito é
			-- elétrico. É a única esteira do pacote que abre mão dela.
			Efeitos.esteira(raiz, eixo, eixoMundo, {
				corQuente = COR_ARCO,
				corFria = COR_VIOLETA,
				largura = 3.4 * (1 + esticado * 0.2),
				recuo = 1.5 + esticado,
				vida = 0.3 + esticado * 0.12,
				empurrao = 34 + esticado * 10,
				semFumaca = true,
			}, intensidade, DURACAO_BASE)
		end)
	end,
}
