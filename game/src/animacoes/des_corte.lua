--!strict
-- Corte Descendente: o espelho do sub_corte. Nada de arco — uma linha reta e
-- carmesim rasgando de cima para baixo, e o boneco é levado pelo corte.
--
-- A reta é o que separa a leitura das duas direções à distância: no celular,
-- comprimido, o espectador não lê cor antes de forma. Arco sobe, reta desce.
--
-- Reta na LINHA DE VIAGEM, não no eixo Y: a torre é uma escada em espiral
-- quadrada e a queda é diagonal para trás, rumo ao degrau anterior. A fenda
-- deita junto com o corpo. Ver Efeitos.eixoDoMovimento.
--
-- O rabo da fenda é curto de propósito (2,2 studs). Esticar ele com o delta
-- faria a ponta entrar no tampo da plataforma de destino na hora do pouso, e
-- efeito por baixo do disco não aparece para ninguém.
--
-- Sem flash e sem tremor, pelo mesmo motivo do par de subida: peso 3 chega
-- várias vezes por minuto. O escurecimento é Highlight escuro no personagem,
-- não efeito de tela.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local DURACAO_BASE = 1.0

-- Batidas da ficha, em segundos.
local FIM_DO_SILENCIO = 0.12
local FIM_DO_CORTE = 0.28
local FIM_DA_QUEDA = 0.8

local COR_FIO = Color3.fromRGB(255, 232, 232)
local COR_CORTE = Color3.fromRGB(255, 59, 59)
local COR_FENDA = Color3.fromRGB(122, 20, 20)

return {
	id = "des_corte",
	nome = "Corte Descendente",
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
			-- Delta maior = fenda mais comprida, tanto para cima quanto para
			-- baixo do boneco. A linha atravessa a tela em queda grande.
			local alcance = 5 + math.clamp(math.abs(contexto.delta or 0) * 0.35, 0, 9)

			-- Silêncio: o eco do preparo da subida, invertido. Lá pisca branco,
			-- aqui apaga.
			Efeitos.brilho(personagem, {
				FillColor = Color3.fromRGB(26, 5, 7),
				OutlineColor = COR_CORTE,
				FillTransparency = 0.3,
			}, FIM_DO_SILENCIO)

			-- `-eixo` é de onde o boneco veio, `+eixo` é para onde ele vai. A
			-- fenda entra por cima da linha e sai por baixo dela.
			local eixo = Efeitos.eixoDoMovimento(raiz, contexto)
			local topo = Efeitos.anexo(raiz, "CorteTopo", eixo * -alcance)
			local fundo = Efeitos.anexo(raiz, "CorteFundo", eixo * 2.2)

			-- Dois feixes, não três: a reta não precisa da camada de halo que o
			-- arco precisa, e um feixe a menos é um feixe a menos na live.
			-- CurveSize zerado é o que faz a linha ser reta.
			Efeitos.feixe(topo, fundo, {
				Color = Efeitos.sequenciaDeCor(COR_CORTE, COR_FENDA),
				Transparency = Efeitos.sequenciaDeNumero(0.2, 0.75),
				Width0 = 4.6 * fator,
				Width1 = 4.6 * fator,
				CurveSize0 = 0,
				CurveSize1 = 0,
				LightEmission = 0.6,
			}, FIM_DA_QUEDA)

			Efeitos.feixe(topo, fundo, {
				Color = Efeitos.sequenciaDeCor(COR_FIO),
				Transparency = Efeitos.sequenciaDeNumero(0.05, 0.6),
				Width0 = 0.9 * fator,
				Width1 = 0.9 * fator,
				CurveSize0 = 0,
				CurveSize1 = 0,
				LightEmission = 1,
			}, FIM_DA_QUEDA)

			local rastro = Efeitos.anexo(raiz, "CorteRastroDes", eixo * -1.6)
			local pes = Efeitos.anexo(raiz, "CortePesDes", eixo * 1.4)
			Efeitos.trilha(pes, rastro, {
				Color = Efeitos.sequenciaDeCor(COR_CORTE, COR_FENDA),
				Transparency = Efeitos.sequenciaDeNumero(0.25, 1),
				Lifetime = 0.3,
				Width0 = 3.4 * fator,
				Width1 = 0.05,
			}, FIM_DA_QUEDA)

			Efeitos.luz(raiz, { Color = COR_CORTE, Brightness = 4 * fator, Range = 13 * fator }, FIM_DA_QUEDA)

			-- Brasas do pouso, na altura do pé com folga: dentro do tampo da
			-- plataforma elas não apareceriam.
			task.delay(FIM_DA_QUEDA, function()
				local atual = Efeitos.raiz(personagem)
				if not atual then
					return
				end
				local altura = -(Efeitos.ALTURA_DOS_PES - Efeitos.FOLGA_DO_DECK)
				local chao = Efeitos.anexo(atual, "CorteBrasa", Vector3.new(0, altura, 0))
				Efeitos.particula(chao, {
					Color = Efeitos.sequenciaDeCor(COR_FIO, COR_CORTE),
					Transparency = Efeitos.sequenciaDeNumero(0.1, 1),
					Lifetime = NumberRange.new(0.15, 0.28),
					Speed = NumberRange.new(6, 12),
					SpreadAngle = Vector2.new(75, 75),
					Rate = 60,
				}, intensidade, 0.2)
			end)
		end)
	end,
}
