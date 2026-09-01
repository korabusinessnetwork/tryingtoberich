--!strict
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

--[[
	"Boneco some e reaparece" não tem primitiva pronta em Efeitos: a única
	forma nativa de esconder o personagem é zerar a Transparency de cada
	BasePart dele (a mesma Part que desenha a roupa por cima, então some
	junto). Guarda o valor original de cada uma antes de esconder — nem toda
	parte nasce em 0 — e só mexe em parte que ainda está no personagem, caso
	alguma tenha sumido no meio do efeito (acessório desequipado etc).
]]
local DURACAO_BASE = 2.2

local function corpoDoPersonagem(personagem)
	local partes = {}
	for _, item in ipairs(personagem:GetDescendants()) do
		if item:IsA("BasePart") then
			table.insert(partes, item)
		end
	end
	return partes
end

return {
	id = "sub_portal",
	nome = "Portal",
	direcao = "subida",
	pesoVisual = 4,
	duracaoBase = DURACAO_BASE,
	aceitaDeltaVariavel = false,
	executar = function(personagem, contexto)
		Efeitos.executarSeguro(function()
			local raiz = Efeitos.raiz(personagem)
			if not raiz then
				return
			end

			local corEntrada = Color3.fromRGB(170, 80, 255)
			local corSaida = Color3.fromRGB(120, 160, 255)

			Efeitos.anel(raiz.Position, corEntrada, contexto.intensidade, 0.5)
			Efeitos.brilho(personagem, {
				FillColor = corEntrada,
				OutlineColor = Color3.fromRGB(255, 255, 255),
				FillTransparency = 0.4,
			}, DURACAO_BASE * 0.5)

			local partes = corpoDoPersonagem(personagem)
			local original = {}
			for _, parte in ipairs(partes) do
				original[parte] = parte.Transparency
			end

			task.wait(DURACAO_BASE * 0.25)
			for _, parte in ipairs(partes) do
				if parte.Parent then
					parte.Transparency = 1
				end
			end

			task.wait(DURACAO_BASE * 0.35)
			Efeitos.anel(raiz.Position, corSaida, contexto.intensidade, 0.5)
			for _, parte in ipairs(partes) do
				if parte.Parent then
					parte.Transparency = original[parte]
				end
			end
		end)
	end,
}
