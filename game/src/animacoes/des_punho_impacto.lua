--!strict
-- Punho de Impacto: uma manopla blindada do tamanho do boneco surge ACIMA dele,
-- recua, e desce socando. O boneco desaba junto com o golpe.
--
-- Porte do segundo efeito do estudo em Three.js — mão fechada com chapas de
-- bronze, canhão de antebraço, anéis de choque à frente e esteira quente atrás.
--
-- Nada aqui sabe que é descida. O punho nasce ATRÁS do boneco na linha de
-- viagem e soca PARA A FRENTE nela; quem decide que "atrás" é em cima e "frente"
-- é para baixo é `Efeitos.eixoDoMovimento`, que devolve a direção do delta. O
-- mesmo código serviria de subida — o que o prende à descida é a ficha, e a
-- ficha escolheu descida porque punho esmagando lê melhor do que punho erguendo.
--
-- O que o porte muda, e por quê:
--
--  * O original modela dedo por dedo: falange, nó, chapa e ponta enrolada, quatro
--    vezes. Aqui sobrou nó + chapa. O resto é detalhe que some num vídeo vertical
--    comprimido, e cada peça a mais é uma peça a mais para o servidor replicar.
--  * O punho VIAJA, e essa é a única peça do pacote que viaja: são 6 studs em
--    0,25s, um soco. Distância curta e fixa não briga com o Tween Quad-Out do
--    boneco do jeito que um reboque de percurso inteiro brigaria.
--  * O toro (aro do cano, faixas do antebraço) vira Cylinder chato. De perfil os
--    dois leem igual, e Cylinder não custa upload — o ADR-004 proíbe asset.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local TweenService = game:GetService("TweenService")

local DURACAO_BASE = 1.4

-- Batidas da ficha, em segundos.
local FIM_DO_RECUO = 0.18
local SOCO = 0.3
local INICIO_DO_SUMICO = 0.85

local COR_LUVA = Color3.fromRGB(168, 44, 62)
local COR_BRONZE = Color3.fromRGB(199, 144, 85)
local COR_BRASA = Color3.fromRGB(255, 208, 138)
local COR_FOGO = Color3.fromRGB(255, 122, 46)
local COR_FUMACA = Color3.fromRGB(245, 245, 245)

local DEDOS = 4

-- O punho tem que ser da ordem do boneco (~5 studs) para o soco ler. O conjunto
-- inteiro — mão mais canhão de antebraço — dá ~9 studs de comprimento.
local LARGURA_DA_MAO = 4.2

-- Quanto o punho está atrás do boneco quando nasce, e quanto ele anda no soco.
local RECUO_INICIAL = 7
local ALCANCE_DO_SOCO = 6

return {
	id = "des_punho_impacto",
	nome = "Punho de Impacto",
	direcao = "descida",
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

			-- Z local do pivô é a linha de viagem, e Z NEGATIVO é para a frente
			-- (`lookAt` aponta o -Z). Os nós ficam em -Z, o canhão em +Z.
			local partida = raiz.Position - eixoMundo * RECUO_INICIAL
			local pivo = Efeitos.pivo(Efeitos.olharPara(partida, eixoMundo), DURACAO_BASE + 1)

			local mao = LARGURA_DA_MAO * fator

			-- Mão fechada: um bloco mais alto que largo. É a massa que lê.
			Efeitos.peca(pivo, {
				Color = COR_LUVA,
				Size = Vector3.new(mao, mao * 0.88, mao * 0.72),
				CFrame = pivo.CFrame,
			})

			-- Nós e chapas de bronze, numa fileira. É a leitura de "punho" — sem
			-- eles o bloco vira caixa.
			for i = 1, DEDOS do
				local desvio = (i - (DEDOS + 1) / 2) * (mao * 0.24)
				local recuoDoNo = mao * 0.06 * math.abs(i - (DEDOS + 1) / 2)

				Efeitos.peca(pivo, {
					Shape = Enum.PartType.Ball,
					Color = COR_LUVA,
					Size = Vector3.new(mao * 0.3, mao * 0.3, mao * 0.3),
					CFrame = pivo.CFrame * CFrame.new(desvio, mao * 0.06, -(mao * 0.42) + recuoDoNo),
				})
				Efeitos.peca(pivo, {
					Material = Enum.Material.Metal,
					Color = COR_BRONZE,
					Size = Vector3.new(mao * 0.22, mao * 0.24, mao * 0.16),
					CFrame = pivo.CFrame * CFrame.new(desvio, mao * 0.26, -(mao * 0.44) + recuoDoNo),
				})
			end

			-- Guarda dos nós e polegar cruzado.
			Efeitos.peca(pivo, {
				Material = Enum.Material.Metal,
				Color = COR_BRONZE,
				Size = Vector3.new(mao * 1.05, mao * 0.2, mao * 0.18),
				CFrame = pivo.CFrame * CFrame.new(0, mao * 0.54, -mao * 0.12),
			})
			Efeitos.peca(pivo, {
				Shape = Enum.PartType.Cylinder,
				Color = COR_LUVA,
				Size = Vector3.new(mao * 0.62, mao * 0.3, mao * 0.3),
				CFrame = pivo.CFrame * CFrame.new(0, mao * 0.1, -mao * 0.26) * CFrame.Angles(0, math.pi / 2, 0),
			})

			-- Canhão do antebraço, abrindo para trás. O original faz com torno
			-- (LatheGeometry); aqui são dois cilindros e um lábio.
			Efeitos.peca(pivo, {
				Shape = Enum.PartType.Cylinder,
				Color = COR_LUVA,
				Size = Vector3.new(mao * 1.15, mao * 0.66, mao * 0.66),
				CFrame = pivo.CFrame * CFrame.new(0, 0, mao * 0.68) * CFrame.Angles(0, math.pi / 2, 0),
			})
			Efeitos.peca(pivo, {
				Shape = Enum.PartType.Cylinder,
				Color = COR_LUVA,
				Size = Vector3.new(mao * 0.5, mao * 0.9, mao * 0.9),
				CFrame = pivo.CFrame * CFrame.new(0, 0, mao * 1.42) * CFrame.Angles(0, math.pi / 2, 0),
			})
			Efeitos.peca(pivo, {
				Material = Enum.Material.Metal,
				Shape = Enum.PartType.Cylinder,
				Color = COR_BRONZE,
				Size = Vector3.new(mao * 0.16, mao * 1.02, mao * 1.02),
				CFrame = pivo.CFrame * CFrame.new(0, 0, mao * 1.66) * CFrame.Angles(0, math.pi / 2, 0),
			})

			-- Duas faixas de bronze no antebraço e a placa do dorso.
			for i = 1, 2 do
				Efeitos.peca(pivo, {
					Material = Enum.Material.Metal,
					Shape = Enum.PartType.Cylinder,
					Color = COR_BRONZE,
					Size = Vector3.new(mao * 0.14, mao * 0.74 + i * mao * 0.08, mao * 0.74 + i * mao * 0.08),
					CFrame = pivo.CFrame * CFrame.new(0, 0, mao * (0.55 + i * 0.35)) * CFrame.Angles(0, math.pi / 2, 0),
				})
			end
			Efeitos.peca(pivo, {
				Material = Enum.Material.Metal,
				Color = COR_BRONZE,
				Size = Vector3.new(mao * 0.7, mao * 0.18, mao * 0.6),
				CFrame = pivo.CFrame * CFrame.new(0, mao * 0.5, mao * 0.1),
			})

			-- Núcleo do pulso e as três ventilações que piscam. É o único ponto
			-- quente do objeto, e é o que dá vida ao metal parado.
			local nucleo = Efeitos.peca(pivo, {
				Material = Enum.Material.Neon,
				Shape = Enum.PartType.Ball,
				Color = COR_BRASA,
				Size = Vector3.new(mao * 0.28, mao * 0.28, mao * 0.28),
				CFrame = pivo.CFrame * CFrame.new(0, mao * 0.48, mao * 0.5),
			})
			for i = 1, 3 do
				Efeitos.peca(pivo, {
					Material = Enum.Material.Neon,
					Color = COR_BRASA,
					Size = Vector3.new(mao * 0.13, mao * 0.07, mao * 0.58),
					CFrame = pivo.CFrame * CFrame.new(0, mao * 0.44, mao * (0.85 + i * 0.22)),
				})
			end

			-- Esteira quente em hélice saindo do canhão, para trás.
			Efeitos.helice(pivo, {
				bracos = 3,
				contas = 3,
				comprimento = (mao * 1.4) + esticado * 2,
				raio = mao * 0.5,
				voltas = 1.2,
				espessura = 0.8 * fator,
				cor = COR_FOGO,
				transparencia = 0.5,
				recuo = mao * 1.8,
				afinar = 0.85,
			})

			Efeitos.luz(pivo, { Color = COR_FOGO, Brightness = 7 * fator, Range = 24 * fator }, DURACAO_BASE)

			-- Núcleo pulsando: o `nucleoPulso.scale` do original vira Tween de Size
			-- de ida e volta. `Reverses` true, sem repetição, para não virar loop
			-- que sobrevive ao efeito.
			local nucleoCheio = nucleo.Size
			TweenService:Create(nucleo, TweenInfo.new(0.22, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, 2, true), {
				Size = nucleoCheio * 1.3,
			}):Play()

			-- Recuo e soco. O punho anda 6 studs em 0,12s — é o único objeto do
			-- pacote que viaja, e viaja pouco justamente para não competir com o
			-- Tween do boneco.
			--
			-- O soco é criado dentro de um `task.delay` em vez de nascer junto com
			-- `delayTime`: assim ele parte de onde o recuo PAROU. Criado antes, ele
			-- partiria de onde o punho estava no instante do Play e comeria a
			-- preparação inteira.
			local chegada = Efeitos.olharPara(partida + eixoMundo * ALCANCE_DO_SOCO, eixoMundo)
			TweenService:Create(pivo, TweenInfo.new(FIM_DO_RECUO, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
				CFrame = Efeitos.olharPara(partida - eixoMundo * 2, eixoMundo),
			}):Play()
			task.delay(FIM_DO_RECUO, function()
				if pivo.Parent then
					TweenService:Create(
						pivo,
						TweenInfo.new(SOCO - FIM_DO_RECUO, Enum.EasingStyle.Quint, Enum.EasingDirection.Out),
						{ CFrame = chegada }
					):Play()
				end
			end)

			-- Impacto: os anéis de choque do original, de pé na linha de viagem,
			-- onde o punho encontra o boneco. O ponto é calculado AGORA e guardado:
			-- ler `raiz.Position` dentro do `task.delay` seria ler uma instância que
			-- pode ter morrido no meio, e fora do pcall do `executarSeguro`.
			local contato = raiz.Position + eixoMundo * 1.5
			task.delay(SOCO, function()
				Efeitos.onda(contato, eixoMundo, COR_BRASA, intensidade, 0.35)
				Efeitos.tremor(intensidade, 0.28)
			end)
			task.delay(SOCO + 0.14, function()
				Efeitos.onda(contato, eixoMundo, COR_FOGO, intensidade, 0.5)
			end)

			-- Baforada e brasa no bocal do canhão, o tempo do soco.
			local escape = Efeitos.anexo(pivo, "PunhoEscape", Vector3.new(0, 0, mao * 1.7))
			Efeitos.particula(escape, {
				Color = Efeitos.sequenciaDeCor(COR_BRASA, COR_FOGO),
				Transparency = Efeitos.sequenciaDeNumero(0.1, 1),
				Size = Efeitos.sequenciaDeNumero(1.4 * fator, 5 * fator),
				Lifetime = NumberRange.new(0.25, 0.5),
				Speed = NumberRange.new(16, 30),
				SpreadAngle = Vector2.new(45, 45),
				Rate = 110,
				LightEmission = 1,
			}, intensidade, INICIO_DO_SUMICO)

			Efeitos.particula(escape, {
				Color = Efeitos.sequenciaDeCor(COR_FUMACA),
				Transparency = Efeitos.sequenciaDeNumero(0.4, 1),
				Size = Efeitos.sequenciaDeNumero(2 * fator, 8 * fator),
				Lifetime = NumberRange.new(0.4, 0.8),
				Speed = NumberRange.new(6, 14),
				SpreadAngle = Vector2.new(80, 80),
				Rate = 60,
				LightEmission = 0.2,
			}, intensidade, INICIO_DO_SUMICO)

			for _, peca in ipairs(pivo:GetChildren()) do
				if peca:IsA("BasePart") then
					TweenService:Create(
						peca,
						TweenInfo.new(0.35, Enum.EasingStyle.Quad, Enum.EasingDirection.In, 0, false, INICIO_DO_SUMICO),
						{ Transparency = 1 }
					):Play()
				end
			end

			Efeitos.esteira(raiz, eixo, eixoMundo, {
				corQuente = COR_BRASA,
				corFria = COR_FOGO,
				corFumaca = COR_FUMACA,
				largura = 3.6 * (1 + esticado * 0.2),
				recuo = 1.6 + esticado,
				vida = 0.35 + esticado * 0.15,
				empurrao = 30 + esticado * 8,
			}, intensidade, DURACAO_BASE)
		end)
	end,
}
