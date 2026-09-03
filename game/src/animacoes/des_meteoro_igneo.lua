--!strict
-- Meteoro Ígneo: uma rocha rachada de lava desce do alto da linha de viagem,
-- alcança o boneco e o arrasta para baixo com ela, rolando e largando brasa.
--
-- Porte do quinto efeito do estudo em Three.js — rocha facetada com veias de
-- lava, chama em espiral e rastro de brasas.
--
-- É o único do pacote que percorre o caminho inteiro junto com o boneco, e o
-- percurso foi escolhido para isso funcionar sem sincronizar nada: a rocha sai
-- 20 studs ATRÁS da origem e chega no mesmo destino, em Linear, enquanto o
-- boneco faz o mesmo trecho em Quad-In (movimento.lua acelera a descida). Ela
-- alcança o boneco no primeiro terço, passa na frente no meio e os dois chegam
-- juntos. Sem essa vantagem inicial, a rocha só apareceria atrás dele.
--
-- O icosaedro do original vira Ball com lascas grudadas em volta. Facetamento
-- real exigiria malha, malha exige upload, e o ADR-004 proíbe.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local TweenService = game:GetService("TweenService")

local DURACAO_BASE = 2.2

-- Batidas da ficha, em segundos.
local ALCANCE = 0.35
local INICIO_DO_SUMICO = 1.8

local COR_ROCHA = Color3.fromRGB(107, 91, 82)
local COR_LAVA = Color3.fromRGB(255, 154, 60)
local COR_BRASA = Color3.fromRGB(255, 90, 30)
local COR_CHAMA = Color3.fromRGB(255, 122, 77)
local COR_FUMACA = Color3.fromRGB(192, 64, 90)

local LASCAS = 4
local MANCHAS = 6

-- ~7 studs contra os ~5 do boneco. Acima de ~10 a rocha cobre o número da
-- plataforma no HUD, que é o maior elemento da tela (02_DESIGN_SYSTEM).
local DIAMETRO = 7

-- A vantagem inicial da rocha, em studs, atrás do ponto de partida do boneco.
local VANTAGEM = 20

return {
	id = "des_meteoro_igneo",
	nome = "Meteoro Ígneo",
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
			local esticado = math.min(math.abs(contexto.delta or 1) / 10, 2.0)

			local eixo = Efeitos.eixoDoMovimento(raiz, contexto)
			local eixoMundo = raiz.CFrame:VectorToWorldSpace(eixo)

			-- Sem `posicaoDestino` — animação tocada fora do ciclo, ou na mão — a
			-- rocha ainda precisa de um fim; 30 studs na linha de viagem é o
			-- suficiente para o efeito não ficar parado no ar.
			local destino = contexto.posicaoDestino
			if typeof(destino) ~= "Vector3" then
				destino = raiz.Position + eixoMundo * 30
			end

			local partida = raiz.Position - eixoMundo * VANTAGEM
			local pivo = Efeitos.pivo(Efeitos.olharPara(partida, eixoMundo), DURACAO_BASE + 1)

			local raio = DIAMETRO * fator

			-- Núcleo de basalto.
			Efeitos.peca(pivo, {
				Material = Enum.Material.Slate,
				Shape = Enum.PartType.Ball,
				Color = COR_ROCHA,
				Size = Vector3.new(raio, raio, raio),
				CFrame = pivo.CFrame,
			})

			-- Lascas grudadas: é o que quebra a silhueta de bola e faz a rocha
			-- parecer rocha quando ela rola.
			for i = 1, LASCAS do
				local angulo = (i - 1) * (math.pi * 2 / LASCAS) + 0.4
				local tamanho = raio * (0.3 + (i % 3) * 0.08)
				Efeitos.peca(pivo, {
					Material = Enum.Material.Slate,
					Shape = Enum.PartType.Ball,
					Color = COR_ROCHA,
					Size = Vector3.new(tamanho, tamanho, tamanho),
					CFrame = pivo.CFrame
						* CFrame.Angles(0, 0, angulo)
						* CFrame.new(raio * 0.42, raio * 0.2, raio * (0.2 - (i % 2) * 0.4)),
				})
			end

			-- Veias de lava: dois aros inclinados atravessando a rocha.
			for i = 1, 2 do
				Efeitos.peca(pivo, {
					Material = Enum.Material.Neon,
					Shape = Enum.PartType.Cylinder,
					Color = COR_LAVA,
					Size = Vector3.new(raio * 1.02, raio * 0.14, raio * 1.02),
					CFrame = pivo.CFrame * CFrame.Angles(i * 1.1, i * 1.4, i * 0.6) * CFrame.Angles(0, math.pi / 2, 0),
				})
			end

			-- Manchas incandescentes na casca. São elas que dão o "quente" à rocha
			-- escura de longe, onde a veia fina já não lê.
			for i = 1, MANCHAS do
				local a = i * 1.9
				local b = i * 0.87
				local tamanho = raio * (0.16 + (i % 3) * 0.05)
				Efeitos.peca(pivo, {
					Material = Enum.Material.Neon,
					Shape = Enum.PartType.Ball,
					Color = COR_LAVA,
					Size = Vector3.new(tamanho, tamanho, tamanho * 0.4),
					CFrame = pivo.CFrame
						* CFrame.new(
							math.cos(a) * math.cos(b) * raio * 0.46,
							math.sin(b) * raio * 0.46,
							math.sin(a) * math.cos(b) * raio * 0.46
						),
				})
			end

			-- Chama em espiral, subindo atrás da rocha enquanto ela desce.
			Efeitos.helice(pivo, {
				bracos = 3,
				contas = 4,
				comprimento = (9 + esticado * 4) * fator,
				raio = raio * 0.5,
				voltas = 1.7,
				espessura = 0.9 * fator,
				cor = COR_CHAMA,
				transparencia = 0.42,
				recuo = raio * 0.55,
				afinar = 0.9,
			})

			Efeitos.luz(pivo, { Color = COR_BRASA, Brightness = 10 * fator, Range = 32 * fator }, DURACAO_BASE)

			-- A queda: posição e rolagem no mesmo encadeamento de Tween, porque uma
			-- peça só tem um CFrame e dois Tween disputando o mesmo campo brigam.
			Efeitos.girar(
				pivo,
				Efeitos.olharPara(partida, eixoMundo),
				Efeitos.olharPara(destino, eixoMundo),
				2,
				DURACAO_BASE
			)

			-- Brasas e fumaça saindo da rocha o caminho inteiro.
			local rastro = Efeitos.anexo(pivo, "MeteoroRastro", Vector3.new(0, 0, raio * 0.5))
			Efeitos.particula(rastro, {
				Color = Efeitos.sequenciaDeCor(COR_LAVA, COR_BRASA),
				Transparency = Efeitos.sequenciaDeNumero(0.1, 1),
				Size = Efeitos.sequenciaDeNumero(2.6 * fator, 0.3),
				Lifetime = NumberRange.new(0.3, 0.65),
				Speed = NumberRange.new(6, 16),
				SpreadAngle = Vector2.new(55, 55),
				Acceleration = eixoMundo * -(22 + esticado * 8),
				Rate = 130,
				RotSpeed = NumberRange.new(-300, 300),
				LightEmission = 1,
			}, intensidade, INICIO_DO_SUMICO)

			Efeitos.particula(rastro, {
				Color = Efeitos.sequenciaDeCor(COR_FUMACA),
				Transparency = Efeitos.sequenciaDeNumero(0.35, 1),
				Size = Efeitos.sequenciaDeNumero(3 * fator, 11 * fator),
				Lifetime = NumberRange.new(0.5, 1),
				Speed = NumberRange.new(4, 12),
				SpreadAngle = Vector2.new(90, 90),
				Acceleration = eixoMundo * -12,
				Rate = 60,
				LightEmission = 0.3,
			}, intensidade, INICIO_DO_SUMICO)

			-- Alcance: o instante em que a rocha encosta no boneco. Peso 5 ganha
			-- clarão de tela, que é efeito de TELA e por isso mora no cliente.
			local encontro = raiz.Position + eixoMundo * 2
			task.delay(ALCANCE, function()
				Efeitos.onda(encontro, eixoMundo, COR_LAVA, intensidade, 0.4)
				Efeitos.flash(COR_BRASA, 0.3, 0.4)
				Efeitos.tremor(intensidade, 0.35)
			end)
			task.delay(ALCANCE + 0.2, function()
				Efeitos.onda(encontro, eixoMundo, COR_BRASA, intensidade, 0.6)
			end)

			-- Chegada: cratera no tampo da plataforma de destino. O ponto vem do
			-- `destino` já calculado, com a mesma folga que o `pontoDeChao` usa,
			-- para o efeito nascer ACIMA do disco e não dentro dele.
			local cratera = destino - Vector3.new(0, Efeitos.ALTURA_DOS_PES - Efeitos.FOLGA_DO_DECK, 0)
			task.delay(DURACAO_BASE - 0.1, function()
				Efeitos.anel(cratera, COR_LAVA, intensidade, 0.5)
				Efeitos.anel(cratera, COR_BRASA, intensidade, 0.75)
				Efeitos.tremor(intensidade, 0.3)
			end)

			for _, peca in ipairs(pivo:GetChildren()) do
				if peca:IsA("BasePart") then
					TweenService:Create(
						peca,
						TweenInfo.new(0.4, Enum.EasingStyle.Quad, Enum.EasingDirection.In, 0, false, INICIO_DO_SUMICO),
						{ Transparency = 1 }
					):Play()
				end
			end

			Efeitos.esteira(raiz, eixo, eixoMundo, {
				corQuente = COR_LAVA,
				corFria = COR_BRASA,
				corFumaca = COR_FUMACA,
				largura = 4.2 * (1 + esticado * 0.2),
				recuo = 2 + esticado,
				vida = 0.5 + esticado * 0.2,
				empurrao = 26 + esticado * 10,
			}, intensidade, DURACAO_BASE)
		end)
	end,
}
