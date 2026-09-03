--!strict
-- Shuriken Espiral: o boneco condensa um disco de vento na mão, crava no tampo
-- da plataforma de origem e é jogado PARA A FRENTE na diagonal, no coice.
--
-- Duas coisas mandam na geometria deste módulo, e as duas vêm da torre e não
-- da animação:
--
--  1. A torre é uma escada em espiral quadrada (construtorMapa). O boneco não
--     sobe reto: ele sobe para a frente, na diagonal, rumo à quina seguinte.
--     Por isso nada aqui usa o eixo Y do mundo — tudo pendura em
--     Efeitos.eixoDoMovimento, que é a linha de viagem de verdade.
--  2. O boneco está EM CIMA de um disco sólido. Efeito de chão nasce em
--     Efeitos.pontoDeChao, um dedo acima do tampo. Meio stud para baixo e o
--     disco engole o anel: da câmera da live não se vê nada.
--
-- As lâminas são Parts ANCORADAS, não soldadas no personagem. Parece errado
-- perto da des_dimensional, que solda os fragmentos, mas aqui é de propósito:
-- o disco FICA na plataforma de origem enquanto o boneco vai embora, então não
-- pode acompanhar o Tween do movimento.lua.
--
-- O giro do disco quem carrega é o RotSpeed da partícula, não a peça. Girar
-- Part de verdade exigiria mexer nela todo frame, e o doc proíbe efeito dentro
-- de loop de render.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local TweenService = game:GetService("TweenService")

local DURACAO_BASE = 2.0

-- Batidas da ficha, em segundos.
local FIM_DA_CARGA = 0.35
local LANCAMENTO = 0.7
local FIM_DA_ASCENSAO = 1.7

local COR_NUCLEO = Color3.fromRGB(232, 254, 255)
local COR_LAMINA = Color3.fromRGB(125, 249, 255)
local COR_BORDA = Color3.fromRGB(47, 169, 196)
local COR_FOGO = Color3.fromRGB(255, 138, 40)
local COR_FUMACA = Color3.fromRGB(245, 245, 245)

local LAMINAS = 4

-- O disco é GRANDE de propósito: ~9 studs contra os ~5 do boneco, quase o
-- dobro dele. A referência de mercado joga um objeto que ocupa meia tela e é
-- por isso que ela lê num celular, comprimida, no meio de comentário e HUD.
-- Efeito fino e elegante some nesse contexto — quem paga tem que ver o que
-- comprou de relance. O teto é a câmera: acima de ~10 studs o disco cobre o
-- número da plataforma, que é o maior elemento do HUD (ver 02_DESIGN_SYSTEM).
local LARGURA_DO_DISCO = 9

return {
	id = "sub_shuriken",
	nome = "Shuriken Espiral",
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
			-- Delta maior estica a hélice da ascensão, nunca a duração.
			local esticado = math.min(math.abs(contexto.delta or 1) / 10, 2.0)

			-- Linha de viagem: para a frente e para cima, na diagonal do degrau.
			local eixo = Efeitos.eixoDoMovimento(raiz, contexto)
			local eixoMundo = raiz.CFrame:VectorToWorldSpace(eixo)

			-- Carga. Speed NEGATIVO faz a partícula andar para dentro do
			-- emissor: é como se lê "condensando" sem um script por partícula.
			local mao = Efeitos.anexo(raiz, "ShurikenMao", Vector3.new(1.1, 0.4, -0.6))
			Efeitos.particula(mao, {
				Color = Efeitos.sequenciaDeCor(COR_NUCLEO, COR_LAMINA),
				Transparency = Efeitos.sequenciaDeNumero(0.1, 1),
				Lifetime = NumberRange.new(0.2, 0.35),
				Speed = NumberRange.new(-16, -9),
				SpreadAngle = Vector2.new(180, 180),
				Rate = 60,
				RotSpeed = NumberRange.new(-220, 220),
				LightEmission = 1,
			}, intensidade, FIM_DA_CARGA)

			Efeitos.luz(raiz, { Color = COR_LAMINA, Brightness = 7 * fator, Range = 20 * fator }, DURACAO_BASE)

			-- O disco nasce na mão e crava no tampo da plataforma de origem,
			-- não abaixo dele. `pontoDeChao` é o pé do boneco com folga.
			local centro = raiz.Position + raiz.CFrame:VectorToWorldSpace(Vector3.new(1.1, 0.4, -0.6))
			local alvo = Efeitos.pontoDeChao(raiz)

			-- Disco de pé no plano perpendicular à linha de viagem: ele corta a
			-- plataforma no mesmo sentido em que o boneco vai sair.
			local giroDoDisco = CFrame.lookAt(centro, centro + eixoMundo) - centro
			local largura = LARGURA_DO_DISCO * fator
			local grossura = 1.1 * fator

			for i = 1, LAMINAS do
				local radial = CFrame.Angles(0, 0, math.rad((i - 1) * (360 / LAMINAS)))

				local lamina = Instance.new("Part")
				lamina.Anchored = true
				lamina.CanCollide = false
				lamina.CanQuery = false
				lamina.CanTouch = false
				lamina.Material = Enum.Material.Neon
				lamina.Color = (i % 2 == 0) and COR_LAMINA or COR_NUCLEO
				lamina.Transparency = 0.1
				lamina.Size = Vector3.new(0.4, 0.4, 0.4)
				lamina.CFrame = CFrame.new(centro) * giroDoDisco * radial
				lamina.Parent = workspace

				-- Fogo na ponta de cada lâmina. É o que separa "linha ciano
				-- bonita" de "objeto que está acontecendo" na tela do celular.
				local ponta = Efeitos.anexo(lamina, "ShurikenPonta", Vector3.new(0, largura * 0.45, 0))
				Efeitos.particula(ponta, {
					Color = Efeitos.sequenciaDeCor(COR_NUCLEO, COR_FOGO),
					Transparency = Efeitos.sequenciaDeNumero(0.2, 1),
					Size = Efeitos.sequenciaDeNumero(2.2 * fator, 0.2),
					Lifetime = NumberRange.new(0.2, 0.4),
					Speed = NumberRange.new(2, 6),
					SpreadAngle = Vector2.new(40, 40),
					Rate = 45,
					LightEmission = 1,
				}, intensidade, LANCAMENTO + 0.4)

				-- Abertura e lançamento são Tween com `delayTime` (6º argumento
				-- do TweenInfo) em vez de task.wait: o agendamento fica com o
				-- TweenService e nenhuma thread para.
				TweenService:Create(
					lamina,
					TweenInfo.new(FIM_DA_CARGA, Enum.EasingStyle.Back, Enum.EasingDirection.Out, 0, false, FIM_DA_CARGA),
					{
						Size = Vector3.new(grossura, largura, grossura * 0.45),
						CFrame = CFrame.new(centro) * giroDoDisco * radial * CFrame.new(0, largura * 0.5, 0),
					}
				):Play()

				TweenService:Create(
					lamina,
					TweenInfo.new(0.1, Enum.EasingStyle.Quint, Enum.EasingDirection.In, 0, false, LANCAMENTO - 0.1),
					{ CFrame = CFrame.new(alvo) * giroDoDisco * radial * CFrame.new(0, largura * 0.5, 0) }
				):Play()

				TweenService:Create(
					lamina,
					TweenInfo.new(0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out, 0, false, LANCAMENTO),
					{ Transparency = 1, Size = Vector3.new(0.2, largura * 1.6, 0.2) }
				):Play()

				Efeitos.limparEm(lamina, DURACAO_BASE + 1)
			end

			-- Impacto no tampo: é aqui que o movimento começa, então é aqui que
			-- o anel, o tremor, o fogo e a fumaça entram. Tudo na superfície,
			-- nunca dentro do disco da plataforma.
			task.delay(LANCAMENTO, function()
				Efeitos.anel(alvo, COR_LAMINA, intensidade, 0.5)
				Efeitos.anel(alvo, COR_FOGO, intensidade, 0.75)
				Efeitos.tremor(intensidade, 0.25)

				local cratera = Instance.new("Part")
				cratera.Anchored = true
				cratera.CanCollide = false
				cratera.CanQuery = false
				cratera.CanTouch = false
				cratera.Transparency = 1
				cratera.Size = Vector3.new(0.4, 0.4, 0.4)
				cratera.CFrame = CFrame.new(alvo)
				cratera.Parent = workspace
				local bocaDoImpacto = Efeitos.anexo(cratera, "ShurikenImpacto", Vector3.new(0, 0, 0))

				-- Plumas de fogo e o baforão branco: os dois efeitos que a
				-- referência usa para o impacto ler de longe.
				Efeitos.particula(bocaDoImpacto, {
					Color = Efeitos.sequenciaDeCor(Color3.fromRGB(255, 236, 170), COR_FOGO),
					Transparency = Efeitos.sequenciaDeNumero(0.1, 1),
					Size = Efeitos.sequenciaDeNumero(1.2 * fator, 5 * fator),
					Lifetime = NumberRange.new(0.3, 0.6),
					Speed = NumberRange.new(14, 26),
					SpreadAngle = Vector2.new(60, 60),
					Rate = 120,
					LightEmission = 1,
				}, intensidade, 0.35)

				Efeitos.particula(bocaDoImpacto, {
					Color = Efeitos.sequenciaDeCor(COR_FUMACA),
					Transparency = Efeitos.sequenciaDeNumero(0.35, 1),
					Size = Efeitos.sequenciaDeNumero(2 * fator, 8 * fator),
					Lifetime = NumberRange.new(0.4, 0.8),
					Speed = NumberRange.new(6, 14),
					SpreadAngle = Vector2.new(80, 80),
					Rate = 70,
					LightEmission = 0.2,
				}, intensidade, 0.4)

				Efeitos.limparEm(cratera, 2)
			end)

			-- Ascensão: duas trilhas trançadas ATRÁS do boneco na linha de
			-- viagem — não abaixo dele. Numa escada em diagonal, rastro
			-- vertical passa por dentro do degrau que ele acabou de deixar.
			local frente = Efeitos.anexo(raiz, "ShurikenFrente", eixo * 0.6)
			local cauda = Efeitos.anexo(raiz, "ShurikenCauda", eixo * -(1.6 + esticado) + Vector3.new(0.35, 0, 0))
			local cauda2 = Efeitos.anexo(raiz, "ShurikenCauda2", eixo * -(1.6 + esticado) + Vector3.new(-0.35, 0, 0))
			local vida = 0.4 + esticado * 0.2

			Efeitos.trilha(frente, cauda, {
				Color = Efeitos.sequenciaDeCor(COR_NUCLEO, COR_LAMINA),
				Transparency = Efeitos.sequenciaDeNumero(0.15, 1),
				Lifetime = vida,
				Width0 = 4.2 * fator,
				Width1 = 0.2,
			}, FIM_DA_ASCENSAO)

			Efeitos.trilha(frente, cauda2, {
				Color = Efeitos.sequenciaDeCor(COR_LAMINA, COR_BORDA),
				Transparency = Efeitos.sequenciaDeNumero(0.25, 1),
				Lifetime = vida * 0.8,
				Width0 = 3.4 * fator,
				Width1 = 0.2,
			}, FIM_DA_ASCENSAO)

			-- Partícula empurrada para trás pela linha de viagem, que é o que dá
			-- velocidade aparente sem depender de para onde a câmera olha.
			-- `Acceleration` é em espaço de MUNDO, por isso usa eixoMundo e não
			-- o eixo local dos anexos.
			Efeitos.particula(frente, {
				Color = Efeitos.sequenciaDeCor(COR_NUCLEO, COR_BORDA),
				Transparency = Efeitos.sequenciaDeNumero(0.2, 1),
				Size = Efeitos.sequenciaDeNumero(1.6 * fator, 0.2),
				Lifetime = NumberRange.new(0.25, 0.5),
				Speed = NumberRange.new(3, 7),
				SpreadAngle = Vector2.new(45, 45),
				Acceleration = eixoMundo * -(28 + esticado * 8),
				Rate = 35,
				RotSpeed = NumberRange.new(-180, 180),
			}, intensidade, FIM_DA_ASCENSAO)

			-- Baforada branca na esteira, o mesmo recurso do impacto: é o que
			-- dá volume ao rastro quando o fundo do mapa é claro. Mapa gerado
			-- por IA pode ter qualquer paleta, e branco fofo lê nas duas.
			Efeitos.particula(cauda, {
				Color = Efeitos.sequenciaDeCor(COR_FUMACA),
				Transparency = Efeitos.sequenciaDeNumero(0.5, 1),
				Size = Efeitos.sequenciaDeNumero(1.4 * fator, 5 * fator),
				Lifetime = NumberRange.new(0.35, 0.7),
				Speed = NumberRange.new(2, 6),
				SpreadAngle = Vector2.new(60, 60),
				Acceleration = eixoMundo * -14,
				Rate = 30,
				LightEmission = 0.2,
			}, intensidade, FIM_DA_ASCENSAO)
		end)
	end,
}
