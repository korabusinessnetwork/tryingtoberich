--!strict
-- Shuriken de Vento: um disco de quatro lâminas se condensa NO AR, à frente do
-- boneco na linha de viagem, gira, e o boneco é sugado pelo centro dele.
--
-- Porte do primeiro efeito do estudo em Three.js — quatro lâminas em rotação,
-- correntes de vento em hélice, anéis de choque. Três decisões do porte:
--
--  1. O original é um objeto voando: nariz em +X, escape em -X, tudo pendurado
--     nesse eixo. Aqui o eixo é `Efeitos.eixoDoMovimento` — a linha da escada em
--     espiral —, e o pivô nasce de um `lookAt` nela. Z local do pivô É a viagem.
--  2. O disco NÃO viaja junto com o boneco. Ele ficou parado de propósito: o
--     movimento do boneco é um Tween Quad-Out (movimento.lua) e qualquer peça
--     acompanhando em Linear seria ultrapassada no primeiro terço — o reboque
--     terminaria atrás de quem deveria puxar. Parado, o disco vira portal, o
--     boneco atravessa o centro, e lê igual em delta de 3 ou de 50.
--  3. A hélice de vento aponta para TRÁS do disco, ou seja, PARA o boneco: é a
--     sucção do original, não o escape.
--
-- Isto não substitui `sub_shuriken`: aquele crava o disco no tampo da plataforma
-- de origem, este fica no ar e é atravessado.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local TweenService = game:GetService("TweenService")

local DURACAO_BASE = 2.0

-- Batidas da ficha, em segundos.
local FIM_DA_FORMACAO = 0.3
local ARRANQUE = 0.55
local INICIO_DO_SUMICO = 1.5

local COR_NUCLEO = Color3.fromRGB(234, 248, 255)
local COR_LAMINA = Color3.fromRGB(143, 212, 245)
local COR_VENTO = Color3.fromRGB(110, 207, 255)
local COR_BORDA = Color3.fromRGB(31, 134, 216)
local COR_FUMACA = Color3.fromRGB(245, 245, 245)

local LAMINAS = 4

-- ~8,5 studs contra os ~5 do boneco. O teto é o HUD: acima de ~10 o disco cobre
-- o número da plataforma, que é o maior elemento da tela (02_DESIGN_SYSTEM).
local LARGURA_DO_DISCO = 8.5

-- A que distância o disco se forma, na linha de viagem. Perto demais e o boneco
-- nasce dentro dele; longe demais e ele sai de quadro num celular.
local AVANCO_DO_DISCO = 4

return {
	id = "sub_shuriken_vento",
	nome = "Shuriken de Vento",
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
			-- Delta maior estica a hélice, nunca a duração (R11).
			local esticado = math.min(math.abs(contexto.delta or 1) / 10, 2.0)

			local eixo = Efeitos.eixoDoMovimento(raiz, contexto)
			local eixoMundo = raiz.CFrame:VectorToWorldSpace(eixo)

			local centro = raiz.Position + eixoMundo * AVANCO_DO_DISCO
			local pivo = Efeitos.pivo(Efeitos.olharPara(centro, eixoMundo), DURACAO_BASE + 1)

			local largura = LARGURA_DO_DISCO * fator
			local grossura = 0.55 * fator

			-- Miolo: o original monta com esfera, toro e cilindro. O toro vira um
			-- Cylinder fininho — de perfil, comprimido num vídeo vertical, os dois
			-- leem igual, e um deles não custa upload de asset (ADR-004).
			Efeitos.peca(pivo, {
				Material = Enum.Material.Neon,
				Shape = Enum.PartType.Ball,
				Color = COR_NUCLEO,
				Size = Vector3.new(1.5 * fator, 1.5 * fator, 1.5 * fator),
				CFrame = pivo.CFrame,
			})
			Efeitos.peca(pivo, {
				Material = Enum.Material.Neon,
				Shape = Enum.PartType.Cylinder,
				Color = COR_LAMINA,
				Transparency = 0.15,
				Size = Vector3.new(0.35 * fator, 2.1 * fator, 2.1 * fator),
				CFrame = pivo.CFrame * CFrame.Angles(0, math.pi / 2, 0),
			})
			Efeitos.peca(pivo, {
				Material = Enum.Material.Neon,
				Shape = Enum.PartType.Cylinder,
				Color = COR_BORDA,
				Size = Vector3.new(1.1 * fator, 1.35 * fator, 1.35 * fator),
				CFrame = pivo.CFrame * CFrame.Angles(0, math.pi / 2, 0),
			})

			-- As quatro lâminas. Cunha porque é a única ponta nativa do Roblox:
			-- cone não existe sem asset, e asset é proibido pelo ADR-004.
			local pontas = {}
			for i = 1, LAMINAS do
				local radial = CFrame.Angles(0, 0, (i - 1) * (math.pi * 2 / LAMINAS))

				pontas[i] = Efeitos.cunha(pivo, {
					Material = Enum.Material.Neon,
					Color = (i % 2 == 0) and COR_LAMINA or COR_NUCLEO,
					Transparency = 0.1,
					Size = Vector3.new(grossura, largura * 0.34, largura * 0.5),
					CFrame = pivo.CFrame
						* radial
						* CFrame.new(0, largura * 0.34, 0)
						* CFrame.Angles(-math.pi / 2, 0, 0),
				})

				-- Nervura: o fio claro que corre pelo dorso da lâmina. É o que
				-- separa "triângulo azul" de "lâmina" quando a imagem comprime.
				Efeitos.peca(pivo, {
					Material = Enum.Material.Neon,
					Color = COR_NUCLEO,
					Size = Vector3.new(grossura * 0.5, largura * 0.42, 0.28 * fator),
					CFrame = pivo.CFrame * radial * CFrame.new(0, largura * 0.3, 0),
				})
			end

			-- Correntes de vento em hélice, apontando para TRÁS do disco — que é
			-- onde está o boneco. É a sucção que o puxa para dentro.
			Efeitos.helice(pivo, {
				bracos = 3,
				contas = 4,
				comprimento = (AVANCO_DO_DISCO + 2 + esticado) * fator,
				raio = largura * 0.4,
				voltas = 1.1,
				espessura = 0.7 * fator,
				cor = COR_VENTO,
				transparencia = 0.45,
				afinar = 0.8,
			})

			-- Formação: a lâmina nasce recolhida no miolo e salta para fora. Peça
			-- soldada não tem escala no Roblox, então quem cresce é o Size dela.
			for i = 1, LAMINAS do
				local lamina = pontas[i]
				local alvo = lamina.Size
				lamina.Size = Vector3.new(alvo.X, 0.4, 0.4)
				TweenService:Create(
					lamina,
					TweenInfo.new(FIM_DA_FORMACAO, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
					{ Size = alvo }
				):Play()
			end

			-- Giro: duas voltas e meia na duração inteira. O servidor replica
			-- CFrame de peça ancorada devagar, e giro rápido chega tremendo no
			-- espectador. A sensação de velocidade fica com a partícula, que é
			-- simulada no cliente. Mesma conclusão do `sub_shuriken`.
			Efeitos.girar(pivo, pivo.CFrame, nil, 2.5, DURACAO_BASE)

			-- Fogo e faísca na ponta de cada lâmina.
			for i = 1, LAMINAS do
				local ponta = Efeitos.anexo(pontas[i], "VentoPonta", Vector3.new(0, 0, 0))
				Efeitos.particula(ponta, {
					Color = Efeitos.sequenciaDeCor(COR_NUCLEO, COR_VENTO),
					Transparency = Efeitos.sequenciaDeNumero(0.2, 1),
					Size = Efeitos.sequenciaDeNumero(2 * fator, 0.2),
					Lifetime = NumberRange.new(0.2, 0.45),
					Speed = NumberRange.new(4, 10),
					SpreadAngle = Vector2.new(50, 50),
					Rate = 40,
					RotSpeed = NumberRange.new(-260, 260),
					LightEmission = 1,
				}, intensidade, INICIO_DO_SUMICO)
			end

			-- Sucção no miolo: Speed NEGATIVO faz a partícula andar para DENTRO do
			-- emissor. É como se lê "puxando" sem um script por partícula.
			local boca = Efeitos.anexo(pivo, "VentoBoca", Vector3.new(0, 0, 0))
			Efeitos.particula(boca, {
				Color = Efeitos.sequenciaDeCor(COR_VENTO, COR_NUCLEO),
				Transparency = Efeitos.sequenciaDeNumero(0.15, 1),
				Size = Efeitos.sequenciaDeNumero(2.4 * fator, 0.3),
				Lifetime = NumberRange.new(0.25, 0.45),
				Speed = NumberRange.new(-26, -14),
				SpreadAngle = Vector2.new(180, 180),
				Rate = 70,
				RotSpeed = NumberRange.new(-200, 200),
				LightEmission = 1,
			}, intensidade, INICIO_DO_SUMICO)

			Efeitos.particula(boca, {
				Color = Efeitos.sequenciaDeCor(COR_FUMACA),
				Transparency = Efeitos.sequenciaDeNumero(0.55, 1),
				Size = Efeitos.sequenciaDeNumero(2 * fator, 7 * fator),
				Lifetime = NumberRange.new(0.4, 0.8),
				Speed = NumberRange.new(3, 8),
				SpreadAngle = Vector2.new(90, 90),
				Rate = 26,
				LightEmission = 0.2,
			}, intensidade, INICIO_DO_SUMICO)

			Efeitos.luz(pivo, { Color = COR_VENTO, Brightness = 8 * fator, Range = 26 * fator }, DURACAO_BASE)

			-- Arranque: as ondas do original, de pé na linha de viagem, no instante
			-- em que o boneco atravessa o disco.
			task.delay(ARRANQUE, function()
				Efeitos.onda(centro, eixoMundo, COR_NUCLEO, intensidade, 0.45)
				Efeitos.tremor(intensidade, 0.22)
			end)
			task.delay(ARRANQUE + 0.25, function()
				Efeitos.onda(centro, eixoMundo, COR_VENTO, intensidade, 0.6)
			end)

			-- Sumiço: o disco não pode ficar pendurado no ar depois que o boneco já
			-- chegou. Ele apaga sozinho antes do Debris levar, para não piscar.
			for _, peca in ipairs(pivo:GetChildren()) do
				if peca:IsA("BasePart") then
					TweenService:Create(
						peca,
						TweenInfo.new(0.4, Enum.EasingStyle.Quad, Enum.EasingDirection.In, 0, false, INICIO_DO_SUMICO),
						{ Transparency = 1 }
					):Play()
				end
			end

			-- No boneco, e não no disco: a esteira precisa acompanhar o Tween do
			-- movimento com exatidão, e só quem está soldado na raiz faz isso.
			Efeitos.esteira(raiz, eixo, eixoMundo, {
				corQuente = COR_NUCLEO,
				corFria = COR_BORDA,
				corFumaca = COR_FUMACA,
				largura = 4 * (1 + esticado * 0.2),
				recuo = 1.8 + esticado,
				vida = 0.4 + esticado * 0.2,
				empurrao = 28 + esticado * 8,
			}, intensidade, DURACAO_BASE)
		end)
	end,
}
