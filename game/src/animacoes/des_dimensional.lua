--!strict
-- Queda Dimensional: a mais pesada das descidas. Fenda clara contra fundo
-- escuro (a live é vista comprimida no celular — contraste alto lê melhor
-- que sutileza) e estilhaços presos ao personagem (WeldConstraint, sem
-- massa). "Câmera gira" é decisão do módulo de câmera; aqui só avisa com
-- Efeitos.afastarCamera, igual ao buraco negro.
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

local COR_FENDA = Color3.fromRGB(225, 245, 255)
local COR_FRAGMENTO = Color3.fromRGB(30, 20, 45)

--[[
	Primitiva que falta em efeitos.lua: prender um Part solto no personagem
	sem tocar em Humanoid. Massless = true de propósito — mesma solução usada
	em des_buraco_negro; repetida aqui porque cada módulo é independente.
]]
local function prenderNoPersonagem(parte, raiz)
	parte.Anchored = false
	parte.Massless = true
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = raiz
	weld.Part1 = parte
	weld.Parent = parte
	return weld
end

local OFFSETS_FRAGMENTO = {
	Vector3.new(1.6, 1.5, 0.8),
	Vector3.new(-1.7, 2.6, -0.6),
	Vector3.new(0.9, 0.2, -1.6),
	Vector3.new(-1.1, -0.6, 1.5),
	Vector3.new(0.4, 3.4, 0.3),
}

return {
	id = "des_dimensional",
	nome = "Queda Dimensional",
	direcao = "descida",
	pesoVisual = 5,
	duracaoBase = 3.0,
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
			local esticar = math.clamp(1 + math.abs(contexto.delta or 0) * 0.02, 1, 1.6)
			local altura = 5 + math.clamp(math.abs(contexto.delta or 0) * 0.12, 0, 5)

			-- Fenda: dois segmentos de feixe em ziguezague sutil, presos no
			-- próprio personagem para acompanhar o Tween do movimento.lua.
			local topo = Efeitos.anexo(raiz, "DimensionalTopo", Vector3.new(0.3, altura, 0))
			local meio = Efeitos.anexo(raiz, "DimensionalMeio", Vector3.new(-0.3, altura * 0.45, 0))
			local base = Efeitos.anexo(raiz, "DimensionalBase", Vector3.new(0, -1, 0))
			local propsFenda = {
				Color = Efeitos.sequenciaDeCor(COR_FENDA),
				Width0 = 0.35 * fator,
				Width1 = 0.6 * fator,
				LightEmission = 1,
				Segments = 4,
			}
			Efeitos.feixe(topo, meio, propsFenda, 3.0)
			Efeitos.feixe(meio, base, propsFenda, 3.0)

			Efeitos.particula(meio, {
				Color = Efeitos.sequenciaDeCor(COR_FENDA, COR_FRAGMENTO),
				Lifetime = NumberRange.new(0.3, 0.6),
				Speed = NumberRange.new(2, 6),
				SpreadAngle = Vector2.new(60, 60),
				Rate = 45,
				LightEmission = 1,
			}, intensidade, 3.0)

			-- Fragmentos: cacos escuros presos ao redor do personagem. É a
			-- versão em mundo 3D de "fragmento de tela" — recorte de tela em
			-- si é do módulo de câmera/HUD, fora do escopo desta animação.
			local quantidade = math.clamp(math.floor(2 + fator + esticar), 2, #OFFSETS_FRAGMENTO)
			for i = 1, quantidade do
				local offset = OFFSETS_FRAGMENTO[i]
				local fragmento = Instance.new("Part")
				fragmento.CanCollide = false
				fragmento.CanQuery = false
				fragmento.CanTouch = false
				fragmento.Material = Enum.Material.Neon
				fragmento.Color = COR_FRAGMENTO
				fragmento.Transparency = 0.15
				fragmento.Size = Vector3.new(0.9, 0.9, 0.1) * fator
				fragmento.CFrame = raiz.CFrame * CFrame.new(offset) * CFrame.Angles(
					math.random() * math.pi,
					math.random() * math.pi,
					math.random() * math.pi
				)
				fragmento.Parent = workspace
				prenderNoPersonagem(fragmento, raiz)
				Efeitos.limparEm(fragmento, 3.4)
			end

			-- movimento.lua já afasta a câmera para peso visual >= 4, mas o
			-- efeito chama por conta própria — precisa funcionar mesmo se um
			-- dia rodar fora do fluxo do Movimento.aplicar.
			Efeitos.afastarCamera(3.0)
		end)
	end,
}
