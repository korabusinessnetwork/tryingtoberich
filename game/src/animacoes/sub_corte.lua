--!strict
-- Corte Ascendente: um golpe só, branco, riscado de baixo para cima, e o
-- boneco sobe montado no próprio risco.
--
-- É o cavalo de batalha do pacote anime: um segundo, barato de tela, feito
-- para chegar várias vezes seguidas sem cansar. Por isso NÃO tem tremor —
-- tremor repetido a cada dez segundos enjoa o espectador — e o flash é de
-- 0,1s, curto o bastante para ler como brilho de lâmina e não como explosão.
--
-- O arco é o mesmo truque de CurveSize do sub_raio, com os dois sinais IGUAIS
-- em vez de opostos: dá arco em vez de S.
--
-- E o arco é traçado sobre a LINHA DE VIAGEM, não sobre o eixo Y do mundo: a
-- torre é uma escada em espiral quadrada e o boneco sai para a frente na
-- diagonal. Arco vertical num pulo diagonal fica apontado para o teto enquanto
-- o corpo vai para a quina seguinte. Ver Efeitos.eixoDoMovimento.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local DURACAO_BASE = 1.0

-- Batidas da ficha, em segundos.
local FIM_DO_PREPARO = 0.12
local FIM_DO_ARCO = 0.3
local FIM_DA_SUBIDA = 0.8

local COR_FIO = Color3.fromRGB(255, 255, 255)
local COR_LAMINA = Color3.fromRGB(207, 233, 255)
local COR_HALO = Color3.fromRGB(107, 168, 232)

return {
	id = "sub_corte",
	nome = "Corte Ascendente",
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
			-- Delta maior = arco mais alto e mais curvado. Pulo curto sai quase
			-- reto, pulo longo sai bem arqueado.
			local alcance = 5 + math.clamp(math.abs(contexto.delta or 0) * 0.35, 0, 9)
			local curva = 2 + math.clamp(math.abs(contexto.delta or 0) * 0.12, 0, 4)

			-- Preparo: um frame de highlight branco e nada mais. Sem ele o
			-- corte lê como teleporte; com ele o olho sabe onde olhar.
			Efeitos.brilho(personagem, {
				FillColor = COR_FIO,
				OutlineColor = COR_LAMINA,
				FillTransparency = 0.35,
			}, FIM_DO_PREPARO)

			-- Ponta e base na linha de viagem, com um desvio lateral que é o que
			-- transforma dois pontos numa lâmina em vez de num pau.
			local eixo = Efeitos.eixoDoMovimento(raiz, contexto)
			local base = Efeitos.anexo(raiz, "CorteBase", eixo * -2.2 + Vector3.new(-1.2, 0, 0))
			local ponta = Efeitos.anexo(raiz, "CortePonta", eixo * alcance + Vector3.new(1, 0, 0))

			-- Três feixes empilhados no mesmo par de anexos: um largo e fosco,
			-- um médio, um fio branco no meio. É o que dá a impressão de lâmina
			-- afinando sem precisar de textura.
			local arco = {
				{ largura = 7.5 * fator, cor = COR_HALO, emissao = 0.4 },
				{ largura = 3.2 * fator, cor = COR_LAMINA, emissao = 0.9 },
				{ largura = 0.8 * fator, cor = COR_FIO, emissao = 1 },
			}
			for _, camada in ipairs(arco) do
				Efeitos.feixe(base, ponta, {
					Color = Efeitos.sequenciaDeCor(camada.cor),
					Transparency = Efeitos.sequenciaDeNumero(0.05, 0.85),
					Width0 = camada.largura,
					Width1 = camada.largura * 0.08,
					CurveSize0 = curva,
					CurveSize1 = curva,
					LightEmission = camada.emissao,
					Segments = 12,
				}, FIM_DA_SUBIDA)
			end

			-- Pós-imagem: dois brilhos com prazo curto e escalonado. Highlight
			-- é a única coisa na caixa de ferramentas que veste o boneco
			-- inteiro, e é exatamente o que a pós-imagem precisa.
			task.delay(FIM_DO_ARCO, function()
				Efeitos.brilho(personagem, {
					FillColor = COR_LAMINA,
					OutlineColor = COR_FIO,
					FillTransparency = 0.6,
				}, 0.12)
			end)
			task.delay(FIM_DO_ARCO + 0.12, function()
				Efeitos.brilho(personagem, {
					FillColor = COR_LAMINA,
					OutlineColor = COR_FIO,
					FillTransparency = 0.78,
				}, 0.12)
			end)

			local rastro = Efeitos.anexo(raiz, "CorteRastro", eixo * -1.8)
			Efeitos.trilha(ponta, rastro, {
				Color = Efeitos.sequenciaDeCor(COR_FIO, COR_HALO),
				Transparency = Efeitos.sequenciaDeNumero(0.2, 1),
				Lifetime = 0.28,
				Width0 = 3 * fator,
				Width1 = 0.05,
			}, FIM_DA_SUBIDA)

			Efeitos.luz(raiz, { Color = COR_LAMINA, Brightness = 6 * fator, Range = 16 * fator }, FIM_DA_SUBIDA)
			Efeitos.flash(COR_FIO, 0.1, 0.22 * fator)

			-- Faíscas do pouso. O anexo fica na altura do pé COM folga
			-- (ALTURA_DOS_PES menos FOLGA_DO_DECK): meio stud mais para baixo e
			-- a faísca nasce dentro do tampo da plataforma e não aparece.
			task.delay(FIM_DA_SUBIDA, function()
				local atual = Efeitos.raiz(personagem)
				if not atual then
					return
				end
				local altura = -(Efeitos.ALTURA_DOS_PES - Efeitos.FOLGA_DO_DECK)
				local pes = Efeitos.anexo(atual, "CorteFaisca", Vector3.new(0, altura, 0))
				Efeitos.particula(pes, {
					Color = Efeitos.sequenciaDeCor(COR_FIO, COR_HALO),
					Transparency = Efeitos.sequenciaDeNumero(0.1, 1),
					Lifetime = NumberRange.new(0.12, 0.22),
					Speed = NumberRange.new(7, 13),
					SpreadAngle = Vector2.new(70, 70),
					Rate = 70,
				}, intensidade, 0.2)
			end)
		end)
	end,
}
