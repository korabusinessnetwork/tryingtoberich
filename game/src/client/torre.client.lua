--!strict
-- A barra da torre: quanto da subida já foi feita, e em que degrau o boneco está.
--
-- É o único HUD que ficou DENTRO do jogo. O resto saiu para o overlay do OBS
-- (ADR-015), e esta barra chegou a ir junto — voltou por decisão do dono, e o
-- motivo é contagem, não gosto:
--
-- No overlay ela só anda quando um estado chega da ponte, e o estado sai no
-- máximo a cada 2s (ver THROTTLE_ESTADO em ponte.lua). O streamer sobe três
-- degraus no parkour e a barra fica parada, até dar o pulo de três de uma vez.
-- Aqui ela ouve o mesmo Eventos.ESTADO que o servidor publica a CADA toque de
-- plataforma: o número anda no degrau, que é o que faz o espectador entender
-- que a escalada dele conta.
--
-- Escrito no subconjunto Lua 5.1, como o resto do jogo: sem anotação de tipo,
-- sem `+=`, sem `continue` — é o que permite `luac5.1 -p` validar sem Studio.

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Eventos = require(Compartilhado.eventos)
local Tokens = require(Compartilhado.tokens)

local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")

-- 02_DESIGN_SYSTEM, seção B: o HUD ocupa as LATERAIS. O centro é do boneco e é
-- onde a TikTok põe o comentário; e nada crítico nos 15% de baixo, que a
-- interface do app cobre.
local LARGURA = 0.032
local ALTURA = 0.30
local MARGEM_DIREITA = 0.05
local TOPO = 0.34

--[[ Raio do trilho em PIXEL, não em escala.

	`UDim.new(0.4, 0)` é 40% do menor lado, e num trilho alto e estreito isso
	arredonda quase metade da altura: a barra virava uma pastilha gorda com um
	risco verde no fundo, que foi o que o dono viu. Raio fixo mantém o canto
	discreto seja qual for a altura da tela. ]]
local RAIO = 8

local tela = Instance.new("ScreenGui")
-- Sibling explícito: em Global o ZIndex vale para a tela inteira e um filho sem
-- ZIndex some atrás do próprio pai. Ver a nota em vestiario.client.lua.
tela.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
tela.Name = "KoraTorre"
tela.ResetOnSpawn = false
tela.IgnoreGuiInset = true
tela.Parent = playerGui

local painel = Instance.new("Frame")
painel.Name = "BarraDaTorre"
painel.AnchorPoint = Vector2.new(1, 0)
painel.Position = UDim2.fromScale(1 - MARGEM_DIREITA, TOPO)
painel.Size = UDim2.fromScale(LARGURA, ALTURA)
painel.BackgroundTransparency = 1
painel.Parent = tela

local trilho = Instance.new("Frame")
trilho.Name = "Trilho"
trilho.Size = UDim2.fromScale(1, 1)
trilho.BackgroundColor3 = Tokens.painel.fundo
trilho.BackgroundTransparency = 0.5
trilho.BorderSizePixel = 0
trilho.Parent = painel

local cantoTrilho = Instance.new("UICorner")
cantoTrilho.CornerRadius = UDim.new(0, RAIO)
cantoTrilho.Parent = trilho

local contornoTrilho = Instance.new("UIStroke")
contornoTrilho.Color = Tokens.hud.contorno
contornoTrilho.Thickness = 2
contornoTrilho.Transparency = 0.35
contornoTrilho.Parent = trilho

-- Preenchimento ancorado embaixo: a torre sobe, e barra que cresce para cima é
-- a única leitura possível para "quanto falta para o topo".
local preenchimento = Instance.new("Frame")
preenchimento.Name = "Preenchimento"
preenchimento.AnchorPoint = Vector2.new(0, 1)
preenchimento.Position = UDim2.fromScale(0, 1)
preenchimento.Size = UDim2.fromScale(1, 0)
preenchimento.BackgroundColor3 = Tokens.hud.subida
preenchimento.BorderSizePixel = 0
preenchimento.Parent = trilho

local cantoPreenchimento = Instance.new("UICorner")
cantoPreenchimento.CornerRadius = UDim.new(0, RAIO)
cantoPreenchimento.Parent = preenchimento

-- A bandeira do topo, acima do trilho: dá o "para onde" sem uma palavra.
local bandeira = Instance.new("TextLabel")
bandeira.Name = "Bandeira"
bandeira.AnchorPoint = Vector2.new(0.5, 1)
bandeira.Position = UDim2.fromScale(0.5, 0)
bandeira.Size = UDim2.fromScale(1.4, 0.09)
bandeira.BackgroundTransparency = 1
bandeira.Text = "\240\159\143\129"
bandeira.TextScaled = true
bandeira.Parent = painel

-- O número embaixo do trilho. Contorno grosso: o mapa é gerado por IA e pode
-- ter qualquer paleta atrás (02_DESIGN_SYSTEM, seção B).
local numero = Instance.new("TextLabel")
numero.Name = "Numero"
numero.AnchorPoint = Vector2.new(1, 0)
numero.Position = UDim2.fromScale(1, 1.02)
numero.Size = UDim2.fromScale(5, 0.085)
numero.BackgroundTransparency = 1
numero.Font = Enum.Font.GothamBlack
numero.TextColor3 = Tokens.hud.texto
numero.TextScaled = true
numero.TextXAlignment = Enum.TextXAlignment.Right
numero.Text = "0 / 0"
numero.Parent = painel

local contornoNumero = Instance.new("UIStroke")
contornoNumero.Color = Tokens.hud.contorno
contornoNumero.Thickness = 3
contornoNumero.Parent = numero

--[[ "1372" vira "1.372": número grande sem separador não lê em vídeo vertical. ]]
local function comPonto(valor)
	local texto = tostring(math.max(0, math.floor(valor or 0)))
	local saida = ""
	local sobra = texto
	while #sobra > 3 do
		saida = "." .. string.sub(sobra, -3) .. saida
		sobra = string.sub(sobra, 1, #sobra - 3)
	end
	return sobra .. saida
end

local tweenAtual = nil

local function atualizar(atual, total)
	atual = math.max(0, math.floor(tonumber(atual) or 0))
	total = math.max(0, math.floor(tonumber(total) or 0))
	numero.Text = comPonto(atual) .. " / " .. comPonto(total)

	local fracao = 0
	if total > 0 then
		fracao = math.clamp(atual / total, 0, 1)
	end

	-- Tween curto em vez de salto: a barra anda a cada degrau, e degrau a degrau
	-- sem suavização pisca. Cancelado antes do próximo para dois tweens não
	-- disputarem a mesma propriedade quando o presente move 300 andares.
	if tweenAtual then
		tweenAtual:Cancel()
	end
	tweenAtual = TweenService:Create(
		preenchimento,
		TweenInfo.new(0.25, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
		{ Size = UDim2.fromScale(1, fracao) }
	)
	tweenAtual:Play()
end

Eventos.obter(Eventos.ESTADO).OnClientEvent:Connect(function(dados)
	if type(dados) ~= "table" then
		return
	end
	atualizar(dados.plataformaReferencia, dados.totalPlataformas)
end)
