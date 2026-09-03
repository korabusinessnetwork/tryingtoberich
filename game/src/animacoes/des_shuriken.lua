--!strict
-- Shuriken Reverso: o mesmo disco da sub_shuriken, agora vindo de onde o
-- boneco veio e empurrando ele PARA TRÁS na diagonal, degrau abaixo.
--
-- Geometria, igual ao par de subida, mandada pela torre e não pela animação:
-- a escada é uma espiral quadrada, então a queda é diagonal para trás. O disco
-- entra pela linha de viagem invertida (`-eixo`), que é exatamente de onde o
-- boneco acabou de vir, e sai empurrando no sentido da queda.
--
-- Diferença de implementação para a subida: aqui as lâminas ficam SOLDADAS na
-- raiz depois do impacto (Efeitos.prenderNoPersonagem, sem massa — ADR-005),
-- porque o disco acompanha o boneco a queda inteira em vez de ficar no degrau.
--
-- Sem Efeitos.flash: descida não estoura a tela. O aviso é a sombra do disco
-- crescendo e a luz do ambiente caindo.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local TweenService = game:GetService("TweenService")

local DURACAO_BASE = 1.8

-- Batidas da ficha, em segundos.
local IMPACTO = 0.3
local FIM_DA_PERFURACAO = 1.5

local COR_NUCLEO = Color3.fromRGB(237, 233, 255)
local COR_LAMINA = Color3.fromRGB(124, 107, 255)
local COR_IMPACTO = Color3.fromRGB(255, 59, 107)
local COR_FOGO = Color3.fromRGB(255, 110, 60)
local COR_FUMACA = Color3.fromRGB(240, 238, 250)

local LAMINAS = 4
local ENTRADA = 12
-- Mesmo tamanho do par de subida, pelo mesmo motivo: objeto que ocupa meia
-- tela é o que lê num celular. Ver o comentário do sub_shuriken.
local LARGURA_DO_DISCO = 9

return {
	id = "des_shuriken",
	nome = "Shuriken Reverso",
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

			-- Linha de viagem da queda: para trás e para baixo, na diagonal.
			local eixo = Efeitos.eixoDoMovimento(raiz, contexto)
			local eixoMundo = raiz.CFrame:VectorToWorldSpace(eixo)
			local largura = LARGURA_DO_DISCO * fator
			local grossura = 1.1 * fator

			-- Sombra: o disco já existe antes de encostar, e a luz do
			-- personagem escurece em vez de acender.
			Efeitos.luz(raiz, { Color = COR_LAMINA, Brightness = 4 * fator, Range = 14 * fator }, DURACAO_BASE)
			Efeitos.brilho(personagem, {
				FillColor = Color3.fromRGB(20, 12, 40),
				OutlineColor = COR_LAMINA,
				FillTransparency = 0.45,
			}, IMPACTO)

			-- O disco entra por `-eixo`, de onde o boneco veio, e encosta no
			-- ombro. Plano perpendicular à linha de viagem, como na subida.
			local entrada = raiz.Position + raiz.CFrame:VectorToWorldSpace(eixo * -ENTRADA)
			local encaixe = eixo * -1.4
			local giroDoDisco = CFrame.lookAt(entrada, entrada + eixoMundo) - entrada

			for i = 1, LAMINAS do
				local radial = CFrame.Angles(0, 0, math.rad((i - 1) * (360 / LAMINAS)))
				local braco = radial * CFrame.new(0, largura * 0.5, 0)

				local lamina = Instance.new("Part")
				lamina.CanCollide = false
				lamina.CanQuery = false
				lamina.CanTouch = false
				lamina.Material = Enum.Material.Neon
				lamina.Color = (i % 2 == 0) and COR_LAMINA or COR_NUCLEO
				lamina.Transparency = 0.1
				lamina.Size = Vector3.new(grossura, largura, grossura * 0.45)
				lamina.Anchored = true
				lamina.CFrame = CFrame.new(entrada) * giroDoDisco * braco
				lamina.Parent = workspace

				-- Fogo na ponta de cada lâmina, igual à subida: é o que
				-- transforma o disco em "objeto acontecendo" na tela pequena.
				local ponta = Efeitos.anexo(lamina, "ShurikenRevPonta", Vector3.new(0, largura * 0.45, 0))
				Efeitos.particula(ponta, {
					Color = Efeitos.sequenciaDeCor(COR_NUCLEO, COR_FOGO),
					Transparency = Efeitos.sequenciaDeNumero(0.2, 1),
					Size = Efeitos.sequenciaDeNumero(2 * fator, 0.2),
					Lifetime = NumberRange.new(0.2, 0.4),
					Speed = NumberRange.new(2, 6),
					SpreadAngle = Vector2.new(40, 40),
					Rate = 45,
					LightEmission = 1,
				}, intensidade, FIM_DA_PERFURACAO)

				-- A descida do disco até o ombro é tween em peça ancorada. Só
				-- depois de encostar ele vira soldado: a partir daí quem manda
				-- na posição é o Tween do movimento.lua.
				TweenService:Create(
					lamina,
					TweenInfo.new(IMPACTO, Enum.EasingStyle.Quint, Enum.EasingDirection.In),
					{ CFrame = raiz.CFrame * CFrame.new(encaixe) * giroDoDisco * braco }
				):Play()

				task.delay(IMPACTO, function()
					local atual = Efeitos.raiz(personagem)
					if lamina.Parent and atual then
						lamina.CFrame = atual.CFrame * CFrame.new(encaixe) * giroDoDisco * braco
						Efeitos.prenderNoPersonagem(lamina, atual)
					end
				end)

				TweenService:Create(
					lamina,
					TweenInfo.new(0.3, Enum.EasingStyle.Quad, Enum.EasingDirection.Out, 0, false, FIM_DA_PERFURACAO),
					{ Transparency = 1 }
				):Play()

				Efeitos.limparEm(lamina, DURACAO_BASE + 1)
			end

			-- Impacto no ombro: começo do movimento. Tremor curto, sem anel —
			-- o anel é do pouso.
			task.delay(IMPACTO, function()
				Efeitos.tremor(intensidade, 0.2)
			end)

			-- Perfuração: hélice na linha de viagem, e partícula empurrada no
			-- sentido CONTRÁRIO ao da queda. A leitura de velocidade vem do que
			-- sobe, não do que desce.
			local frente = Efeitos.anexo(raiz, "ShurikenRevFrente", eixo * 0.6)
			local cauda = Efeitos.anexo(raiz, "ShurikenRevCauda", eixo * -(1.4 + esticado) + Vector3.new(0.35, 0, 0))
			local cauda2 = Efeitos.anexo(raiz, "ShurikenRevCauda2", eixo * -(1.4 + esticado) + Vector3.new(-0.35, 0, 0))

			Efeitos.trilha(frente, cauda, {
				Color = Efeitos.sequenciaDeCor(COR_NUCLEO, COR_LAMINA),
				Transparency = Efeitos.sequenciaDeNumero(0.2, 1),
				Lifetime = 0.35 + esticado * 0.15,
				Width0 = 4 * fator,
				Width1 = 0.2,
			}, FIM_DA_PERFURACAO)

			Efeitos.trilha(frente, cauda2, {
				Color = Efeitos.sequenciaDeCor(COR_LAMINA, COR_IMPACTO),
				Transparency = Efeitos.sequenciaDeNumero(0.3, 1),
				Lifetime = 0.3 + esticado * 0.1,
				Width0 = 3.2 * fator,
				Width1 = 0.2,
			}, FIM_DA_PERFURACAO)

			Efeitos.particula(cauda, {
				Color = Efeitos.sequenciaDeCor(COR_LAMINA, COR_IMPACTO),
				Transparency = Efeitos.sequenciaDeNumero(0.2, 1),
				Size = Efeitos.sequenciaDeNumero(1.6 * fator, 0.2),
				Lifetime = NumberRange.new(0.3, 0.55),
				Speed = NumberRange.new(3, 7),
				SpreadAngle = Vector2.new(35, 35),
				Acceleration = eixoMundo * -(30 + esticado * 8),
				Rate = 40,
			}, intensidade, FIM_DA_PERFURACAO)

			Efeitos.particula(cauda2, {
				Color = Efeitos.sequenciaDeCor(COR_FUMACA),
				Transparency = Efeitos.sequenciaDeNumero(0.5, 1),
				Size = Efeitos.sequenciaDeNumero(1.4 * fator, 5 * fator),
				Lifetime = NumberRange.new(0.35, 0.7),
				Speed = NumberRange.new(2, 6),
				SpreadAngle = Vector2.new(60, 60),
				Acceleration = eixoMundo * -14,
				Rate = 30,
				LightEmission = 0.2,
			}, intensidade, FIM_DA_PERFURACAO)

			-- Aterrissagem: anel no tampo da plataforma de destino, nunca
			-- dentro dela. A raiz é relida porque o boneco andou desde o
			-- começo do efeito.
			task.delay(FIM_DA_PERFURACAO, function()
				local atual = Efeitos.raiz(personagem)
				if not atual then
					return
				end
				local chao = Efeitos.pontoDeChao(atual)
				Efeitos.anel(chao, COR_IMPACTO, intensidade, 0.4)
				Efeitos.anel(chao, COR_FOGO, intensidade, 0.65)
				Efeitos.tremor(intensidade, 0.25)

				-- Baforão branco do pouso, na altura do pé com folga: dentro do
				-- tampo da plataforma não apareceria para ninguém.
				local altura = -(Efeitos.ALTURA_DOS_PES - Efeitos.FOLGA_DO_DECK)
				local pes = Efeitos.anexo(atual, "ShurikenRevPouso", Vector3.new(0, altura, 0))
				Efeitos.particula(pes, {
					Color = Efeitos.sequenciaDeCor(COR_FUMACA, COR_LAMINA),
					Transparency = Efeitos.sequenciaDeNumero(0.3, 1),
					Size = Efeitos.sequenciaDeNumero(1.8 * fator, 7 * fator),
					Lifetime = NumberRange.new(0.35, 0.7),
					Speed = NumberRange.new(8, 18),
					SpreadAngle = Vector2.new(85, 85),
					Rate = 110,
					LightEmission = 0.3,
				}, intensidade, 0.35)
			end)
		end)
	end,
}
