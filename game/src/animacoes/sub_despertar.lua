--!strict
-- Despertar: meio segundo em que nada acontece e o chão começa a subir. Depois
-- a aura estoura e o boneco é lançado para a frente na diagonal, dentro de uma
-- coluna de luz. É a cena de power-up do pacote anime.
--
-- Peso 5, ao lado da Fênix. As duas afastam a câmera e clareiam a tela, e é
-- justamente por isso que esta NÃO repete o dourado: dourado já é da Fênix, e
-- duas animações peso 5 da mesma cor viram a mesma cena para quem assiste.
-- Aqui é branco-violeta, com as cores saindo de data/tokens.json (faixa 3 e
-- estado de vitória).
--
-- A coluna deita na LINHA DE VIAGEM. Numa escada em espiral quadrada o boneco
-- sai na diagonal, e uma coluna vertical o deixaria para trás no primeiro
-- terço do movimento. Ver Efeitos.eixoDoMovimento.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local DURACAO_BASE = 3.0

-- Batidas da ficha, em segundos.
local FIM_DA_PRESSAO = 0.5
local FIM_DO_ESTOURO = 0.9
local FIM_DA_ASCENSAO = 2.4

local COR_AURA = Color3.fromRGB(232, 233, 255)
local COR_COLUNA = Color3.fromRGB(139, 92, 246)
local COR_BORDA = Color3.fromRGB(34, 211, 238)

return {
	id = "sub_despertar",
	nome = "Despertar",
	direcao = "subida",
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
			-- Delta estica a coluna, nunca a duração. Teto de 3,5s da R11.2.
			local comprimento = 9 + math.clamp(math.abs(contexto.delta or 0) * 0.45, 0, 11)

			local eixo = Efeitos.eixoDoMovimento(raiz, contexto)
			local eixoMundo = raiz.CFrame:VectorToWorldSpace(eixo)
			local chao = Efeitos.pontoDeChao(raiz)
			local altura = -(Efeitos.ALTURA_DOS_PES - Efeitos.FOLGA_DO_DECK)

			-- Pressão: cascalho subindo do tampo e mais nada. Meio segundo
			-- parado é caro, e é exatamente ele que faz o estouro valer.
			local pes = Efeitos.anexo(raiz, "DespertarPes", Vector3.new(0, altura, 0))
			Efeitos.particula(pes, {
				Color = Efeitos.sequenciaDeCor(Color3.fromRGB(109, 106, 133), COR_COLUNA),
				Transparency = Efeitos.sequenciaDeNumero(0.2, 1),
				Lifetime = NumberRange.new(0.4, 0.7),
				Speed = NumberRange.new(4, 9),
				SpreadAngle = Vector2.new(28, 28),
				Acceleration = eixoMundo * 14,
				Rate = 40,
				RotSpeed = NumberRange.new(-120, 120),
			}, intensidade, FIM_DO_ESTOURO)

			Efeitos.luz(raiz, { Color = COR_AURA, Brightness = 10 * fator, Range = 28 * fator }, DURACAO_BASE)
			Efeitos.afastarCamera(DURACAO_BASE)

			-- Estouro: clarão de tela, dois anéis em sequência, tremor. Os
			-- anéis ficam no tampo da plataforma, nunca dentro dele.
			task.delay(FIM_DA_PRESSAO, function()
				Efeitos.flash(COR_AURA, 0.35, 0.5 * fator)
				Efeitos.tremor(intensidade, 0.35)
				Efeitos.anel(chao, COR_AURA, intensidade, 0.5)
			end)
			task.delay(FIM_DA_PRESSAO + 0.12, function()
				Efeitos.anel(chao, COR_COLUNA, intensidade, 0.6)
			end)

			-- Coluna: dois feixes deitados na linha de viagem, um largo e
			-- fosco e um fino e branco por dentro.
			local raizDaColuna = Efeitos.anexo(raiz, "DespertarBase", eixo * -2)
			local topoDaColuna = Efeitos.anexo(raiz, "DespertarTopo", eixo * comprimento)

			Efeitos.feixe(raizDaColuna, topoDaColuna, {
				Color = Efeitos.sequenciaDeCor(COR_AURA, COR_COLUNA),
				Transparency = Efeitos.sequenciaDeNumero(0.25, 1),
				Width0 = 8.5 * fator,
				Width1 = 1.4 * fator,
				LightEmission = 0.75,
				Segments = 10,
			}, FIM_DA_ASCENSAO)

			Efeitos.feixe(raizDaColuna, topoDaColuna, {
				Color = Efeitos.sequenciaDeCor(Color3.fromRGB(255, 255, 255), COR_BORDA),
				Transparency = Efeitos.sequenciaDeNumero(0.1, 0.9),
				Width0 = 3.2 * fator,
				Width1 = 0.3,
				LightEmission = 1,
				Segments = 10,
			}, FIM_DA_ASCENSAO)

			Efeitos.brilho(personagem, {
				FillColor = COR_AURA,
				OutlineColor = Color3.fromRGB(255, 255, 255),
				FillTransparency = 0.25,
			}, FIM_DA_ASCENSAO)

			-- Fagulhas subindo por fora da coluna, no sentido da viagem.
			local aura = Efeitos.anexo(raiz, "DespertarAura", Vector3.new(0, 0, 0))
			Efeitos.particula(aura, {
				Color = Efeitos.sequenciaDeCor(COR_AURA, COR_BORDA),
				Transparency = Efeitos.sequenciaDeNumero(0.15, 1),
				Lifetime = NumberRange.new(0.4, 0.75),
				Speed = NumberRange.new(3, 8),
				SpreadAngle = Vector2.new(50, 50),
				Acceleration = eixoMundo * 24,
				Rate = 55,
			}, intensidade, FIM_DA_ASCENSAO)

			-- Repouso: a coluna já morreu por prazo; sobra um halo curto em
			-- volta do boneco para o fim não ser um corte seco.
			task.delay(FIM_DA_ASCENSAO, function()
				local atual = Efeitos.raiz(personagem)
				if not atual then
					return
				end
				Efeitos.anel(atual.Position, COR_BORDA, intensidade, 0.5)
				Efeitos.brilho(personagem, {
					FillColor = COR_BORDA,
					OutlineColor = COR_AURA,
					FillTransparency = 0.7,
				}, 0.5)
			end)
		end)
	end,
}
