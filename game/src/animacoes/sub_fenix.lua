--!strict
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

--[[
	"Tela dourada" pede um flash de tela inteira, e isso só existe no cliente
	via ScreenGui — não há RemoteEvent pra isso em eventos.lua (só TREMOR e
	CAMERA), e criar um novo é fora dos 10 arquivos deste agente (ver relatório
	final). Aqui o substituto é o mais forte que o servidor consegue sozinho:
	Highlight quase opaco + PointLight forte, os dois dourados, no personagem.
]]
local DURACAO_BASE = 3.0

return {
	id = "sub_fenix",
	nome = "Ascensão da Fênix",
	direcao = "subida",
	pesoVisual = 5,
	duracaoBase = DURACAO_BASE,
	aceitaDeltaVariavel = true,
	executar = function(personagem, contexto)
		Efeitos.executarSeguro(function()
			local raiz = Efeitos.raiz(personagem)
			if not raiz then
				return
			end

			local fator = Efeitos.escala(contexto.intensidade)
			local esticado = math.min(math.abs(contexto.delta or 1) / 8, 2.5)
			local dourado = Color3.fromRGB(255, 200, 60)
			local brasa = Color3.fromRGB(255, 110, 40)

			for _, lado in ipairs({ -1, 1 }) do
				local asa = Efeitos.anexo(raiz, "FenixAsa", Vector3.new(lado * 1.8, 0.5, 0.5))
				Efeitos.particula(asa, {
					Color = Efeitos.sequenciaDeCor(dourado, brasa),
					Transparency = Efeitos.sequenciaDeNumero(0.1, 1),
					Lifetime = NumberRange.new(0.5, 0.8),
					Speed = NumberRange.new(6, 10 + esticado * 2),
					SpreadAngle = Vector2.new(60, 20),
					EmissionDirection = lado < 0 and Enum.NormalId.Left or Enum.NormalId.Right,
					Rate = 45,
				}, contexto.intensidade, DURACAO_BASE)
			end

			local topo = Efeitos.anexo(raiz, "FenixTopo", Vector3.new(0, 1, -2))
			local cauda = Efeitos.anexo(raiz, "FenixCauda", Vector3.new(0, -1, 4 + esticado))
			Efeitos.trilha(topo, cauda, {
				Color = Efeitos.sequenciaDeCor(dourado, brasa),
				Transparency = Efeitos.sequenciaDeNumero(0.05, 1),
				Lifetime = 0.6 + esticado * 0.2,
				Width0 = 2.6 * fator,
				Width1 = 0.2,
			}, DURACAO_BASE)

			Efeitos.brilho(personagem, {
				FillColor = dourado,
				OutlineColor = Color3.fromRGB(255, 255, 255),
				FillTransparency = 0.15,
			}, DURACAO_BASE)

			Efeitos.luz(raiz, { Color = dourado, Brightness = 10 * fator, Range = 26 * fator }, DURACAO_BASE)

			-- Elemento explícito da tabela: peso 5 afasta a câmera do cliente.
			Efeitos.afastarCamera(DURACAO_BASE)
		end)
	end,
}
