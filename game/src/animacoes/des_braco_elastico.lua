--!strict
-- Braço Elástico: um ombro se planta acima do boneco e o braço ESTICA para
-- baixo, segmento por segmento, com a palma aberta empurrando o boneco na frente.
--
-- Porte do terceiro efeito do estudo em Three.js — mão aberta, braço de borracha
-- com cotovelo marcado, propulsão a vapor e brasas orbitando.
--
-- Como o `des_punho_impacto`, o módulo não sabe que é descida: ele monta o braço
-- ATRÁS do boneco e estica para a FRENTE na linha de viagem, e quem decide o que
-- é atrás e frente é `Efeitos.eixoDoMovimento`. A ficha escolheu descida porque
-- braço de borracha empurrando para baixo lê como afundar, que é o que a descida
-- quer dizer.
--
-- O que carrega o efeito aqui é o ESTICAR, e ele é de graça: o braço é uma fila
-- de segmentos soldados num pivô parado, e cada segmento nasce achatado e abre
-- no seu tempo. A onda de aberturas correndo do ombro para a palma é a leitura
-- de "esticou" — sem nada mexendo de frame em frame, que o CLAUDE.md proíbe e
-- que replicaria mal vindo do servidor.
--
-- O comprimento acompanha o delta (`esticado`), não a duração: presente de 50
-- plataformas estica mais braço, e não braço por mais tempo. Ver R11.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local TweenService = game:GetService("TweenService")

local DURACAO_BASE = 1.6

-- Batidas da ficha, em segundos.
local ABERTURA_DO_SEGMENTO = 0.16
local FIM_DO_ESTICAO = 0.55
local INICIO_DO_SUMICO = 1.0

local COR_PELE = Color3.fromRGB(220, 174, 132)
local COR_VINCO = Color3.fromRGB(199, 148, 104)
local COR_FAIXA = Color3.fromRGB(182, 47, 48)
local COR_VAPOR = Color3.fromRGB(255, 154, 107)
local COR_BRASA = Color3.fromRGB(255, 217, 160)
local COR_FUMACA = Color3.fromRGB(245, 245, 245)

local SEGMENTOS = 10
local DEDOS = 4

-- O ombro fica atrás do boneco; o braço sai dali para a frente. 14 studs é o
-- mínimo para o braço ler como braço, e o delta soma até +6.
local RECUO_DO_OMBRO = 4
local ALCANCE_BASE = 14

return {
	id = "des_braco_elastico",
	nome = "Braço Elástico",
	direcao = "descida",
	pesoVisual = 3,
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

			-- Pivô no ombro. Z NEGATIVO é para a frente, na linha de viagem.
			local ombroEm = raiz.Position - eixoMundo * RECUO_DO_OMBRO
			local pivo = Efeitos.pivo(Efeitos.olharPara(ombroEm, eixoMundo), DURACAO_BASE + 1)

			local alcance = (ALCANCE_BASE + esticado * 6) * fator
			local passo = alcance / SEGMENTOS

			-- Perfil do braço do original: fino na mão, grosso no ombro, com um
			-- calombo no cotovelo. `u` é 0 no ombro e 1 na palma, invertido em
			-- relação ao estudo, porque aqui o pivô mora no ombro.
			local raioEm = function(u)
				local t = 1 - u
				local cotovelo = (t - 0.52) / 0.1
				return (1.1 + 0.95 * (t * t) + 0.36 * math.exp(-(cotovelo * cotovelo))) * fator
			end

			-- Ombro e manga.
			Efeitos.peca(pivo, {
				Shape = Enum.PartType.Ball,
				Color = COR_PELE,
				Size = Vector3.new(2.7 * fator, 2.7 * fator, 2.7 * fator),
				CFrame = pivo.CFrame,
			})
			Efeitos.peca(pivo, {
				Shape = Enum.PartType.Cylinder,
				Color = COR_FAIXA,
				Size = Vector3.new(2.9 * fator, 3 * fator, 3 * fator),
				CFrame = pivo.CFrame * CFrame.new(0, 0, 1.5 * fator) * CFrame.Angles(0, math.pi / 2, 0),
			})

			-- Os segmentos. Cylinder do Roblox deita no eixo X, e o giro de 90° em
			-- Y é o que põe o comprimento dele na linha de viagem.
			local deitar = CFrame.Angles(0, math.pi / 2, 0)
			for i = 1, SEGMENTOS do
				local u = (i - 0.5) / SEGMENTOS
				local r = raioEm(u) * 2
				local cheio = Vector3.new(passo * 1.05, r, r)

				local segmento = Efeitos.peca(pivo, {
					Color = COR_PELE,
					Shape = Enum.PartType.Cylinder,
					Size = Vector3.new(passo * 1.05, 0.3, 0.3),
					CFrame = pivo.CFrame * CFrame.new(0, 0, -(i - 0.5) * passo) * deitar,
				})

				-- A onda de aberturas correndo para a palma É o esticão.
				TweenService:Create(
					segmento,
					TweenInfo.new(
						ABERTURA_DO_SEGMENTO,
						Enum.EasingStyle.Back,
						Enum.EasingDirection.Out,
						0,
						false,
						(i - 1) * ((FIM_DO_ESTICAO - ABERTURA_DO_SEGMENTO) / SEGMENTOS)
					),
					{ Size = cheio }
				):Play()
			end

			-- Cotovelo e dois vincos da borracha, nos mesmos pontos do original.
			Efeitos.peca(pivo, {
				Shape = Enum.PartType.Ball,
				Color = COR_PELE,
				Size = Vector3.new(3.2 * fator, 3.2 * fator, 3.2 * fator),
				CFrame = pivo.CFrame * CFrame.new(0, 0, -alcance * 0.48),
			})
			for i = 1, 2 do
				local u = 0.28 + i * 0.3
				Efeitos.peca(pivo, {
					Shape = Enum.PartType.Cylinder,
					Color = COR_VINCO,
					Size = Vector3.new(0.35 * fator, raioEm(u) * 2.3, raioEm(u) * 2.3),
					CFrame = pivo.CFrame * CFrame.new(0, 0, -alcance * u) * deitar,
				})
			end

			-- A palma aberta, na ponta. Palma, punhete, quatro dedos e o polegar
			-- saindo pela borda: é o mínimo que ainda lê como mão empurrando.
			local mao = 3.4 * fator
			local naPonta = function(deslocamento)
				return pivo.CFrame * CFrame.new(0, 0, -alcance) * deslocamento
			end

			Efeitos.peca(pivo, {
				Shape = Enum.PartType.Cylinder,
				Color = COR_PELE,
				Size = Vector3.new(mao * 0.5, mao * 0.6, mao * 0.6),
				CFrame = naPonta(CFrame.new(0, 0, mao * 0.5) * deitar),
			})
			Efeitos.peca(pivo, {
				Shape = Enum.PartType.Cylinder,
				Color = COR_FAIXA,
				Size = Vector3.new(mao * 0.18, mao * 0.72, mao * 0.72),
				CFrame = naPonta(CFrame.new(0, 0, mao * 0.72) * deitar),
			})
			Efeitos.peca(pivo, {
				Color = COR_PELE,
				Size = Vector3.new(mao, mao * 0.9, mao * 0.34),
				CFrame = naPonta(CFrame.new(0, 0, 0)),
			})
			for i = 1, DEDOS do
				local desvio = (i - (DEDOS + 1) / 2) * (mao * 0.26)
				local comprimento = mao * (0.62 - math.abs(i - (DEDOS + 1) / 2) * 0.06)
				Efeitos.peca(pivo, {
					Shape = Enum.PartType.Cylinder,
					Color = COR_PELE,
					Size = Vector3.new(comprimento, mao * 0.2, mao * 0.2),
					CFrame = naPonta(CFrame.new(desvio, mao * 0.45 + comprimento * 0.4, 0) * CFrame.Angles(0, 0, math.pi / 2)),
				})
			end
			Efeitos.peca(pivo, {
				Shape = Enum.PartType.Cylinder,
				Color = COR_PELE,
				Size = Vector3.new(mao * 0.6, mao * 0.26, mao * 0.26),
				CFrame = naPonta(CFrame.new(mao * 0.5, -mao * 0.1, mao * 0.12) * CFrame.Angles(0, 0, math.rad(35))),
			})

			-- Propulsão a vapor: a hélice sai por TRÁS do ombro, empurrando.
			Efeitos.helice(pivo, {
				bracos = 3,
				contas = 3,
				comprimento = 7 * fator + esticado * 2,
				raio = 2.4 * fator,
				voltas = 1.3,
				espessura = 0.85 * fator,
				cor = COR_VAPOR,
				transparencia = 0.55,
				recuo = 2 * fator,
				afinar = 0.88,
			})

			Efeitos.luz(pivo, { Color = COR_VAPOR, Brightness = 6 * fator, Range = 22 * fator }, DURACAO_BASE)

			-- Escape de vapor atrás do ombro e brasas subindo com ele.
			local escape = Efeitos.anexo(pivo, "BracoEscape", Vector3.new(0, 0, 3 * fator))
			Efeitos.particula(escape, {
				Color = Efeitos.sequenciaDeCor(COR_BRASA, COR_VAPOR),
				Transparency = Efeitos.sequenciaDeNumero(0.15, 1),
				Size = Efeitos.sequenciaDeNumero(1.5 * fator, 5 * fator),
				Lifetime = NumberRange.new(0.3, 0.6),
				Speed = NumberRange.new(14, 26),
				SpreadAngle = Vector2.new(50, 50),
				Acceleration = eixoMundo * -18,
				Rate = 90,
				LightEmission = 1,
			}, intensidade, INICIO_DO_SUMICO)

			Efeitos.particula(escape, {
				Color = Efeitos.sequenciaDeCor(COR_FUMACA),
				Transparency = Efeitos.sequenciaDeNumero(0.4, 1),
				Size = Efeitos.sequenciaDeNumero(2.2 * fator, 8 * fator),
				Lifetime = NumberRange.new(0.4, 0.85),
				Speed = NumberRange.new(5, 12),
				SpreadAngle = Vector2.new(80, 80),
				Rate = 50,
				LightEmission = 0.2,
			}, intensidade, INICIO_DO_SUMICO)

			-- Onda no ombro quando o braço termina de esticar: é o coice.
			task.delay(FIM_DO_ESTICAO, function()
				Efeitos.onda(ombroEm, eixoMundo, COR_BRASA, intensidade, 0.45)
				Efeitos.tremor(intensidade, 0.2)
			end)

			for _, peca in ipairs(pivo:GetChildren()) do
				if peca:IsA("BasePart") then
					TweenService:Create(
						peca,
						TweenInfo.new(0.45, Enum.EasingStyle.Quad, Enum.EasingDirection.In, 0, false, INICIO_DO_SUMICO),
						{ Transparency = 1 }
					):Play()
				end
			end

			Efeitos.esteira(raiz, eixo, eixoMundo, {
				corQuente = COR_BRASA,
				corFria = COR_VAPOR,
				corFumaca = COR_FUMACA,
				largura = 3.2 * (1 + esticado * 0.2),
				recuo = 1.6 + esticado,
				vida = 0.4 + esticado * 0.15,
				empurrao = 24 + esticado * 8,
			}, intensidade, DURACAO_BASE)
		end)
	end,
}
