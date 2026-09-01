--!strict
-- Caixa de ferramentas das 20 animações.
--
-- Existe para as animações serem escritas por gente diferente sem cada uma
-- inventar o próprio jeito de criar partícula e limpar instância. Se falta
-- alguma primitiva aqui, o certo é acrescentar aqui, não improvisar no módulo
-- da animação.
--
-- Três regras que este módulo faz valer sozinho:
--  1. Toda instância com prazo é destruída, com Debris como rede de segurança.
--     Live de 2 horas com vazamento de ParticleEmitter trava o cliente. Passar
--     `duracao` nil transfere essa responsabilidade para quem chamou, e é o
--     caminho do efeito permanente do personagem — o único que dura a sessão.
--  2. Nada é criado dentro de RenderStepped. As funções daqui são chamadas uma
--     vez, no início do efeito.
--  3. `executarSeguro` embrulha em pcall: animação com erro no meio não pode
--     derrubar o resto do jogo nem deixar o personagem ancorado. Ver R11.

local Debris = game:GetService("Debris")
local TweenService = game:GetService("TweenService")

local Eventos = require(script.Parent.eventos)
local Tipos = require(script.Parent.tipos)

local Efeitos = {}

-- Teto de partículas por emissor, mesmo na intensidade 5. Acima disso o ganho
-- visual some e o custo de render aparece na live.
local PARTICULAS_MAX = 250

Efeitos.escala = Tipos.escalaDeIntensidade

--[[
	Sobra de segurança sobre a duração: o efeito some pouco depois do movimento.

	`segundos` nil significa **sem limpeza automática**: quem chamou vira dono
	da instância e destrói na mão. É o que o efeito permanente do personagem
	precisa (ADR-010) — ele dura a sessão inteira, e agendar Debris para ele
	exigiria inventar um prazo grande o bastante, que é número mágico com data
	de validade.
]]
function Efeitos.limparEm(instancia, segundos)
	if instancia and segundos ~= nil then
		Debris:AddItem(instancia, segundos)
	end
	return instancia
end

-- Folga de um segundo sobre a duração da animação, para o efeito não sumir no
-- mesmo frame em que o movimento acaba. `nil` atravessa como `nil`.
local function prazoDe(duracao)
	if duracao == nil then
		return nil
	end
	return duracao + 1
end

--[[ HumanoidRootPart, ou nil se o personagem já foi embora no meio do efeito. ]]
function Efeitos.raiz(personagem)
	if not personagem then
		return nil
	end
	return personagem:FindFirstChild("HumanoidRootPart")
end

function Efeitos.anexo(parte, nome, deslocamento)
	if not parte then
		return nil
	end
	local anexo = Instance.new("Attachment")
	anexo.Name = nome or "KoraAnexo"
	anexo.Position = deslocamento or Vector3.new(0, 0, 0)
	anexo.Parent = parte
	return anexo
end

--[[ Aplica os campos de `props` na instância, ignorando o que não existir. ]]
local function aplicar(instancia, props)
	if not props then
		return instancia
	end
	for chave, valor in pairs(props) do
		pcall(function()
			instancia[chave] = valor
		end)
	end
	return instancia
end

Efeitos.aplicar = aplicar

function Efeitos.sequenciaDeNumero(inicio, fim)
	return NumberSequence.new({
		NumberSequenceKeypoint.new(0, inicio),
		NumberSequenceKeypoint.new(1, fim),
	})
end

function Efeitos.sequenciaDeCor(inicio, fim)
	return ColorSequence.new(inicio, fim or inicio)
end

--[[
	ParticleEmitter já parented e com limpeza agendada.
	`intensidade` multiplica taxa e tamanho, nunca duração.
]]
function Efeitos.particula(pai, props, intensidade, duracao)
	if not pai then
		return nil
	end
	local emissor = Instance.new("ParticleEmitter")
	local fator = Efeitos.escala(intensidade)

	emissor.Rate = 40
	emissor.Lifetime = NumberRange.new(0.3, 0.7)
	emissor.Speed = NumberRange.new(4, 10)
	emissor.SpreadAngle = Vector2.new(25, 25)
	aplicar(emissor, props)

	emissor.Rate = math.min(emissor.Rate * fator, PARTICULAS_MAX)
	emissor.Size = NumberSequence.new(0.6 * fator)
	if props and props.Size then
		emissor.Size = props.Size
	end
	emissor.Parent = pai

	return Efeitos.limparEm(emissor, prazoDe(duracao))
end

function Efeitos.trilha(anexoA, anexoB, props, duracao)
	if not anexoA or not anexoB then
		return nil
	end
	local trilha = Instance.new("Trail")
	trilha.Attachment0 = anexoA
	trilha.Attachment1 = anexoB
	trilha.Lifetime = 0.4
	trilha.LightEmission = 0.5
	aplicar(trilha, props)
	trilha.Parent = anexoA.Parent
	return Efeitos.limparEm(trilha, prazoDe(duracao))
end

function Efeitos.feixe(anexoA, anexoB, props, duracao)
	if not anexoA or not anexoB then
		return nil
	end
	local feixe = Instance.new("Beam")
	feixe.Attachment0 = anexoA
	feixe.Attachment1 = anexoB
	feixe.Width0 = 0.6
	feixe.Width1 = 0.6
	feixe.LightEmission = 0.8
	feixe.FaceCamera = true
	aplicar(feixe, props)
	feixe.Parent = anexoA.Parent
	return Efeitos.limparEm(feixe, prazoDe(duracao))
end

function Efeitos.luz(pai, props, duracao)
	if not pai then
		return nil
	end
	local luz = Instance.new("PointLight")
	luz.Brightness = 4
	luz.Range = 18
	aplicar(luz, props)
	luz.Parent = pai
	return Efeitos.limparEm(luz, prazoDe(duracao))
end

--[[ Highlight no personagem inteiro. Bom para flash e para o efeito permanente. ]]
function Efeitos.brilho(personagem, props, duracao)
	if not personagem then
		return nil
	end
	local brilho = Instance.new("Highlight")
	brilho.FillTransparency = 0.6
	brilho.OutlineTransparency = 0
	aplicar(brilho, props)
	brilho.Adornee = personagem
	brilho.Parent = personagem
	if duracao then
		Efeitos.limparEm(brilho, duracao + 0.3)
	end
	return brilho
end

--[[
	Prende uma Part solta ao personagem, para ela acompanhar o boneco sem
	disputar a posição com o Tween do movimento.

	`Massless` não é detalhe: durante o presente a raiz está ancorada e sendo
	tweenada, e peça com massa somaria peso ao personagem quando ele
	desancorasse no fim do ciclo. Ver ADR-005.

	WeldConstraint em vez de Attachment porque Attachment não carrega geometria:
	serve para partícula e trilha, não para caco sólido.
]]
function Efeitos.prenderNoPersonagem(parte, raiz)
	if not parte or not raiz then
		return nil
	end
	parte.Anchored = false
	parte.Massless = true

	local solda = Instance.new("WeldConstraint")
	solda.Part0 = raiz
	solda.Part1 = parte
	solda.Parent = parte
	return solda
end

--[[ Anel de choque no chão. Usado por várias animações de impulso e impacto. ]]
function Efeitos.anel(posicao, cor, intensidade, duracao)
	local fator = Efeitos.escala(intensidade)
	local anel = Instance.new("Part")
	anel.Anchored = true
	anel.CanCollide = false
	anel.CanQuery = false
	anel.CanTouch = false
	anel.Material = Enum.Material.Neon
	anel.Shape = Enum.PartType.Cylinder
	anel.Color = cor or Color3.fromRGB(255, 255, 255)
	anel.Size = Vector3.new(0.3, 1, 1)
	anel.CFrame = CFrame.new(posicao) * CFrame.Angles(0, 0, math.rad(90))
	anel.Parent = workspace

	local alvo = 14 * fator
	TweenService:Create(anel, TweenInfo.new(duracao or 0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		Size = Vector3.new(0.3, alvo, alvo),
		Transparency = 1,
	}):Play()

	return Efeitos.limparEm(anel, (duracao or 0.5) + 0.3)
end

--[[
	Tremor de câmera e afastamento são do cliente: o servidor só avisa.
	Ver eventos.lua para o formato.
]]
function Efeitos.tremor(intensidade, duracao)
	local remoto = Eventos.obter(Eventos.TREMOR)
	remoto:FireAllClients({ intensidade = intensidade or 1, duracao = duracao or 0.3 })
end

--[[
	Clarão de tela inteira. Efeito de TELA, não de mundo: Highlight e PointLight
	iluminam geometria, e a "tela dourada" que a Fênix pede precisa cobrir
	também o pixel que não tem nada atrás. Só o cliente consegue, então o
	servidor avisa.
]]
function Efeitos.flash(cor, duracao, opacidade)
	local remoto = Eventos.obter(Eventos.FLASH)
	remoto:FireAllClients({
		cor = cor or Color3.fromRGB(255, 255, 255),
		duracao = duracao or 0.4,
		opacidade = opacidade or 0.55,
	})
end

function Efeitos.afastarCamera(duracao)
	local remoto = Eventos.obter(Eventos.CAMERA)
	remoto:FireAllClients({ afastar = true, duracao = duracao or 1 })
end

--[[
	Roda o corpo do efeito fora da thread de quem chamou, dentro de pcall.
	`executar` NUNCA bloqueia: é isto que garante isso.
]]
function Efeitos.executarSeguro(corpo)
	task.spawn(function()
		local ok, erro = pcall(corpo)
		if not ok then
			warn("[Kora] efeito falhou: " .. tostring(erro))
		end
	end)
end

return Efeitos
