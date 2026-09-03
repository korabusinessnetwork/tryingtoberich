--!strict
-- Jato Propulsor: um propulsor com ogiva, turbina e bocal sanfonado nasce ATRÁS
-- do boneco, solda nele e sobe junto, cuspindo chama em espiral pelo bocal.
--
-- Porte do quarto efeito do estudo em Three.js. É o único do pacote que VIAJA
-- COLADO no boneco, e por isso é o único soldado na raiz: peça soldada segue o
-- Tween do movimento.lua com exatidão, sem cálculo e sem erro de sincronia. Foi
-- essa escolha que decidiu o resto do porte.
--
-- O preço é a turbina. Soldado, o conjunto não pode girar: o CFrame dele é o da
-- raiz, e disputar isso com o Tween do movimento é exatamente o que o ADR-005
-- proíbe. Então a turbina gira do jeito que o `sub_shuriken` já tinha concluído
-- ser o certo aqui — com `RotSpeed` de partícula, que é simulada no CLIENTE e
-- por isso sai lisa, em vez de peça mexida no servidor, que chega tremendo.
--
-- O bocal do original é um torno (LatheGeometry) e vira três discos de raio
-- crescente. Comprimido num vídeo vertical, o sanfonado lê igual.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local TweenService = game:GetService("TweenService")

local DURACAO_BASE = 1.8

-- Batidas da ficha, em segundos.
local IGNICAO = 0.2
local INICIO_DO_SUMICO = 1.35

local COR_CASCO = Color3.fromRGB(230, 235, 242)
local COR_GRAFITE = Color3.fromRGB(74, 81, 96)
local COR_NUCLEO = Color3.fromRGB(185, 244, 255)
local COR_CHAMA = Color3.fromRGB(99, 200, 255)
local COR_CALOR = Color3.fromRGB(255, 180, 107)
local COR_FUMACA = Color3.fromRGB(245, 245, 245)

local ALETAS = 8

-- O propulsor tem que ser grande sem tapar o boneco: ~10 studs de comprimento
-- por ~3,4 de bocal, pendurado atrás e um pouco abaixo dele.
local CALIBRE = 1.7
local RECUO = 3.2
local QUEDA = 1.6

return {
	id = "sub_jato_propulsor",
	nome = "Jato Propulsor",
	direcao = "subida",
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

			-- Nasce ANCORADO, na posição certa, e só solda no fim: a solda congela
			-- a posição relativa do instante em que nasce, então tudo tem que estar
			-- montado antes.
			local centro = raiz.Position - eixoMundo * RECUO - Vector3.new(0, QUEDA, 0)
			local pivo = Efeitos.pivo(Efeitos.olharPara(centro, eixoMundo), DURACAO_BASE + 1)

			local calibre = CALIBRE * fator
			local deitar = CFrame.Angles(0, math.pi / 2, 0)
			-- Z NEGATIVO é para a frente: a ogiva em -Z, o bocal em +Z.
			local em = function(z, giro)
				return pivo.CFrame * CFrame.new(0, 0, z) * (giro or CFrame.new())
			end

			-- Ogiva e corpo.
			Efeitos.peca(pivo, {
				Material = Enum.Material.Metal,
				Shape = Enum.PartType.Ball,
				Color = COR_CASCO,
				Size = Vector3.new(calibre * 1.5, calibre * 1.5, calibre * 1.5),
				CFrame = em(-calibre * 3),
			})
			Efeitos.peca(pivo, {
				Material = Enum.Material.Metal,
				Shape = Enum.PartType.Cylinder,
				Color = COR_CASCO,
				Size = Vector3.new(calibre * 3.6, calibre * 1.6, calibre * 1.6),
				CFrame = em(-calibre * 1.4, deitar),
			})

			-- Três aros de grafite ao longo do corpo.
			for i = 1, 3 do
				Efeitos.peca(pivo, {
					Material = Enum.Material.Metal,
					Shape = Enum.PartType.Cylinder,
					Color = COR_GRAFITE,
					Size = Vector3.new(calibre * 0.18, calibre * 1.78, calibre * 1.78),
					CFrame = em(-calibre * (2.6 - i * 0.85), deitar),
				})
			end

			-- Bocal: três discos de raio crescente no lugar do torno do original,
			-- mais o lábio de grafite na boca.
			for i = 1, 3 do
				Efeitos.peca(pivo, {
					Material = Enum.Material.Metal,
					Shape = Enum.PartType.Cylinder,
					Color = COR_CASCO,
					Size = Vector3.new(calibre * 0.7, calibre * (1.6 + i * 0.5), calibre * (1.6 + i * 0.5)),
					CFrame = em(calibre * (0.4 + i * 0.62), deitar),
				})
			end
			Efeitos.peca(pivo, {
				Material = Enum.Material.Metal,
				Shape = Enum.PartType.Cylinder,
				Color = COR_GRAFITE,
				Size = Vector3.new(calibre * 0.2, calibre * 3.3, calibre * 3.3),
				CFrame = em(calibre * 2.6, deitar),
			})

			-- Turbina: cubo e oito aletas inclinadas, na boca do bocal.
			Efeitos.peca(pivo, {
				Material = Enum.Material.Metal,
				Shape = Enum.PartType.Cylinder,
				Color = COR_GRAFITE,
				Size = Vector3.new(calibre * 0.5, calibre * 0.8, calibre * 0.8),
				CFrame = em(calibre * 1.5, deitar),
			})
			for i = 1, ALETAS do
				local angulo = (i - 1) * (math.pi * 2 / ALETAS)
				Efeitos.peca(pivo, {
					Material = Enum.Material.Metal,
					Color = COR_GRAFITE,
					Size = Vector3.new(calibre * 0.16, calibre * 1.1, calibre * 0.5),
					CFrame = em(calibre * 1.5)
						* CFrame.Angles(0, 0, angulo)
						* CFrame.new(0, calibre * 1.0, 0)
						* CFrame.Angles(0.5, 0, 0),
				})
			end

			-- Núcleo: a única peça que se mexe sozinha, e mexe no Size, não no
			-- CFrame — Size de peça soldada não disputa posição com nada.
			local nucleo = Efeitos.peca(pivo, {
				Material = Enum.Material.Neon,
				Shape = Enum.PartType.Ball,
				Color = COR_NUCLEO,
				Size = Vector3.new(calibre * 1.4, calibre * 1.4, calibre * 1.4),
				CFrame = em(calibre * 0.7),
			})
			TweenService:Create(nucleo, TweenInfo.new(0.28, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, 4, true), {
				Size = nucleo.Size * 1.22,
			}):Play()

			-- Chama em espiral saindo do bocal, o comprimento acompanhando o delta.
			Efeitos.helice(pivo, {
				bracos = 3,
				contas = 4,
				comprimento = (7 + esticado * 3) * fator,
				raio = calibre * 1.9,
				voltas = 1.6,
				espessura = 0.9 * fator,
				cor = COR_CHAMA,
				transparencia = 0.45,
				recuo = calibre * 2.8,
				afinar = 0.9,
			})

			Efeitos.luz(pivo, { Color = COR_CHAMA, Brightness = 8 * fator, Range = 26 * fator }, DURACAO_BASE)

			-- Bocal: fogo, calor e baforada. O `RotSpeed` alto é o que faz a
			-- turbina parecer girar sem nenhuma peça girar de verdade.
			local boca = Efeitos.anexo(pivo, "JatoBoca", Vector3.new(0, 0, calibre * 2.8))
			Efeitos.particula(boca, {
				Color = Efeitos.sequenciaDeCor(COR_NUCLEO, COR_CHAMA),
				Transparency = Efeitos.sequenciaDeNumero(0.1, 1),
				Size = Efeitos.sequenciaDeNumero(2.4 * fator, 0.4),
				Lifetime = NumberRange.new(0.25, 0.5),
				Speed = NumberRange.new(22, 40),
				SpreadAngle = Vector2.new(28, 28),
				Rate = 130,
				RotSpeed = NumberRange.new(-720, 720),
				LightEmission = 1,
			}, intensidade, INICIO_DO_SUMICO)

			Efeitos.particula(boca, {
				Color = Efeitos.sequenciaDeCor(COR_CALOR, COR_CHAMA),
				Transparency = Efeitos.sequenciaDeNumero(0.35, 1),
				Size = Efeitos.sequenciaDeNumero(1.8 * fator, 6 * fator),
				Lifetime = NumberRange.new(0.3, 0.6),
				Speed = NumberRange.new(10, 20),
				SpreadAngle = Vector2.new(60, 60),
				Rate = 70,
				RotSpeed = NumberRange.new(-400, 400),
				LightEmission = 0.8,
			}, intensidade, INICIO_DO_SUMICO)

			Efeitos.particula(boca, {
				Color = Efeitos.sequenciaDeCor(COR_FUMACA),
				Transparency = Efeitos.sequenciaDeNumero(0.45, 1),
				Size = Efeitos.sequenciaDeNumero(2.4 * fator, 9 * fator),
				Lifetime = NumberRange.new(0.45, 0.9),
				Speed = NumberRange.new(6, 14),
				SpreadAngle = Vector2.new(85, 85),
				Rate = 45,
				LightEmission = 0.2,
			}, intensidade, INICIO_DO_SUMICO)

			-- Solda no boneco. A partir daqui o conjunto é da raiz e o Tween do
			-- movimento manda nele. `prenderNoPersonagem` deixa tudo Massless: o
			-- boneco não pode sair mais pesado do salto do que entrou (ADR-005).
			Efeitos.prenderNoPersonagem(pivo, raiz)

			-- Ignição: a onda sai no ponto de PARTIDA, e os dois pontos são
			-- calculados agora. Lidos dentro do `task.delay` eles viriam da posição
			-- de 0,2s depois — com o boneco já no ar, o anel de chão abriria
			-- pendurado no vazio, longe do tampo de onde ele saiu.
			local partida = centro
			local tampo = Efeitos.pontoDeChao(raiz) or partida
			task.delay(IGNICAO, function()
				Efeitos.onda(partida, eixoMundo, COR_NUCLEO, intensidade, 0.4)
				Efeitos.anel(tampo, COR_CHAMA, intensidade, 0.5)
				Efeitos.tremor(intensidade, 0.2)
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
				corQuente = COR_NUCLEO,
				corFria = COR_CHAMA,
				corFumaca = COR_FUMACA,
				largura = 3.8 * (1 + esticado * 0.2),
				recuo = 2 + esticado,
				vida = 0.45 + esticado * 0.2,
				empurrao = 30 + esticado * 10,
			}, intensidade, DURACAO_BASE)
		end)
	end,
}
