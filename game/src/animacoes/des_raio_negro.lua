--!strict
-- Raio Negro: relâmpago em ziguezague, roxo escuro. "Flash invertido": ao
-- contrário do raio de subida (branco, clareando), este escurece o contorno
-- do boneco por um instante antes de sumir.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local COR_RAIO = Color3.fromRGB(70, 10, 110)
local COR_FLASH = Color3.fromRGB(5, 0, 10)

return {
	id = "des_raio_negro",
	nome = "Raio Negro",
	direcao = "descida",
	pesoVisual = 3,
	duracaoBase = 1.0,
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
			local altura = 6 + math.clamp(math.abs(contexto.delta or 0) * 0.18, 0, 7)

			local topo = Efeitos.anexo(raiz, "RaioNegroTopo", Vector3.new(0.6, altura, 0))
			local meio = Efeitos.anexo(raiz, "RaioNegroMeio", Vector3.new(-0.7, altura * 0.5, 0))
			local base = Efeitos.anexo(raiz, "RaioNegroBase", Vector3.new(0, 0.5, 0))

			-- Ziguezague: dois segmentos entre três pontos deslocados de lado,
			-- em vez de uma textura de raio (asset com upload, proibido).
			local propsFeixe = {
				Color = Efeitos.sequenciaDeCor(COR_RAIO),
				Width0 = 0.25 * fator,
				Width1 = 0.12 * fator,
				LightEmission = 1,
				Segments = 3,
			}
			Efeitos.feixe(topo, meio, propsFeixe, 0.4)
			Efeitos.feixe(meio, base, propsFeixe, 0.4)

			Efeitos.brilho(personagem, {
				FillColor = COR_FLASH,
				OutlineColor = COR_RAIO,
				FillTransparency = 0.25,
				OutlineTransparency = 0,
			}, 0.25)

			local anexoLuz = Efeitos.anexo(raiz, "RaioNegroLuz", Vector3.new(0, 1, 0))
			Efeitos.luz(anexoLuz, { Color = COR_RAIO, Brightness = 5 * fator, Range = 14 * fator }, 0.3)
		end)
	end,
}
