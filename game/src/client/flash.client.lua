--!strict
-- Clarão de tela inteira, pedido pelo servidor via Eventos.FLASH.
--
-- Existe porque efeito de TELA não é efeito de mundo: Highlight e PointLight
-- iluminam geometria, e a "tela dourada" da Fênix (peso visual 5) precisa
-- cobrir também o pixel que não tem nada atrás. Só o cliente alcança isso.
--
-- Um Frame só, criado uma vez e reusado. Criar e destruir ScreenGui a cada
-- presente vazaria instância numa live de 2 horas, e é justamente o presente
-- de peso 5 que chega em rajada quando a plateia empolga.

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Eventos = require(Compartilhado.eventos)

local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")

local tela = Instance.new("ScreenGui")
-- Sibling explicito: em Global o ZIndex vale para a tela inteira e filho pode
-- sumir atras do proprio pai. Ver a nota em vestiario.client.lua.
tela.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
tela.Name = "KoraFlash"
tela.ResetOnSpawn = false
tela.IgnoreGuiInset = true
-- Acima do HUD: o clarão é o efeito que o espectador pagou, e ele passa por
-- cima do número da plataforma pelo instante em que dura.
tela.DisplayOrder = 100
tela.Parent = playerGui

local painel = Instance.new("Frame")
painel.Size = UDim2.fromScale(1, 1)
painel.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
painel.BackgroundTransparency = 1
painel.BorderSizePixel = 0
-- Sem isto o Frame come o clique do vestiário quando ele estiver aberto.
painel.Active = false
painel.ZIndex = 100
painel.Parent = tela

local tweenAtual = nil

Eventos.obter(Eventos.FLASH).OnClientEvent:Connect(function(pedido)
	if type(pedido) ~= "table" then
		return
	end

	local duracao = tonumber(pedido.duracao) or 0.4
	local opacidade = tonumber(pedido.opacidade) or 0.55

	-- Um flash chegando por cima de outro corta o anterior em vez de somar:
	-- dois tweens disputando a mesma propriedade deixam a tela acesa.
	if tweenAtual then
		tweenAtual:Cancel()
	end

	painel.BackgroundColor3 = typeof(pedido.cor) == "Color3" and pedido.cor or Color3.fromRGB(255, 255, 255)
	painel.BackgroundTransparency = 1 - math.clamp(opacidade, 0, 1)

	-- Sobe na hora e desce devagar: clarão que entra suave não lê como clarão.
	tweenAtual = TweenService:Create(
		painel,
		TweenInfo.new(duracao, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
		{ BackgroundTransparency = 1 }
	)
	tweenAtual:Play()
end)
