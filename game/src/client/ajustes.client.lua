--!strict
-- Painel de afinação da torre, dentro do jogo.
--
-- Existe para matar um ciclo caro: achar o formato certo da torre pelo caminho
-- longo — mudar o prompt, regerar com o Gemini, remontar o place, abrir o
-- Studio, dar Play — custa minutos por tentativa. Aqui é um clique, e dá para
-- ver o resultado enquanto ainda se lembra do que se queria testar.
--
-- Só afina. O mapa em disco não muda: quando os números ficarem bons, o botão
-- COPIAR entrega o JSON para colar no prompt, e o mapa passa a nascer assim.
-- Editar mapa à mão no Studio seria burlar a validação que o ADR-009 existe
-- para impor.
--
-- Escrito no subconjunto Lua 5.1, como os módulos vizinhos.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")

local Compartilhado = ReplicatedStorage:WaitForChild("KoraCompartilhado")
local Eventos = require(Compartilhado.eventos)
local Tokens = require(Compartilhado.tokens)

local CORES = Tokens.painel
local COR_ERRO = Tokens.estado.erro
local FONTE = Enum.Font.Gotham
local FONTE_TITULO = Enum.Font.GothamBold
local TECLA_ATALHO = Enum.KeyCode.G

local jogador = Players.LocalPlayer
local jogadorGui = jogador:WaitForChild("PlayerGui")

local function Novo(classe, propriedades, pai)
	local inst = Instance.new(classe)
	if propriedades then
		for chave, valor in pairs(propriedades) do
			inst[chave] = valor
		end
	end
	if pai then
		inst.Parent = pai
	end
	return inst
end

--[[
	Os campos que valem afinar, com faixa e o que cada um faz.

	`passo` é o incremento dos botões - e +, escolhido por campo: mexer em
	variacaoRaio de 1 em 1 seria inútil, e em totalPlataformas de 0,1 também.
]]
local CAMPOS = {
	{ chave = "espacamentoVertical", rotulo = "Altura do degrau", padrao = 3.5, passo = 0.5, min = 1, max = 20 },
	{ chave = "raioBase", rotulo = "Tamanho da plataforma", padrao = 7.5, passo = 0.5, min = 1.5, max = 20 },
	{ chave = "variacaoHorizontal", rotulo = "Distância entre degraus", padrao = 20, passo = 1, min = 1, max = 60 },
	{ chave = "variacaoRaio", rotulo = "Variação de tamanho", padrao = 0.1, passo = 0.05, min = 0, max = 0.5 },
	{ chave = "jumpHeight", rotulo = "Altura do pulo", padrao = 12, passo = 0.5, min = 7, max = 12 },
	{ chave = "totalPlataformas", rotulo = "Quantidade de degraus", padrao = 5000, passo = 250, min = 10, max = 5000 },
}

local valores = {}
for _, campo in ipairs(CAMPOS) do
	valores[campo.chave] = campo.padrao
end

local rotulosDeValor = {}
local rotuloRecado
local caixaJson

--[[ Número curto: 4.5 e não 4.500000, 1000 e não 1000.0. O painel é para ler
	de relance, e casa decimal à toa atrapalha. ]]
local function formatar(numero)
	if numero == math.floor(numero) then
		return string.format("%d", numero)
	end
	return string.format("%.2f", numero):gsub("0+$", ""):gsub("%.$", "")
end

local function montarJson()
	return string.format(
		'"jumpHeight": %s,\n"totalPlataformas": %s,\n"plataformas": {\n  "raioBase": %s,\n  "variacaoRaio": %s,\n  "espacamentoVertical": %s,\n  "variacaoHorizontal": %s\n}',
		formatar(valores.jumpHeight), formatar(valores.totalPlataformas),
		formatar(valores.raioBase), formatar(valores.variacaoRaio),
		formatar(valores.espacamentoVertical), formatar(valores.variacaoHorizontal)
	)
end

local function recado(texto, cor)
	if rotuloRecado then
		rotuloRecado.Text = texto
		rotuloRecado.TextColor3 = cor or CORES.textoSecundario
	end
end

local function aplicar()
	recado("Reconstruindo a torre...", CORES.textoSecundario)
	Eventos.obter(Eventos.AJUSTAR_MAPA):FireServer(valores)
end


--[[
	A GUI.

	Canto inferior ESQUERDO, e não junto do vestiário: são ferramentas de
	naturezas diferentes e a direita já está ocupada pelo vestiário e pelo aviso
	dele. Botão separado também deixa claro que isto é afinação, não jogo.
]]
-- Sibling explicito: em Global o ZIndex vale para a tela inteira, e filho com
-- ZIndex menor que o do proprio pai desaparece atras dele. Ver a nota longa em
-- vestiario.client.lua, onde isso apagou o painel inteiro.
local telaCheia = Novo("ScreenGui", {
	Name = "KoraAjustes",
	ResetOnSpawn = false,
	DisplayOrder = 60,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
}, jogadorGui)

local painel = Novo("Frame", {
	Name = "Painel",
	AnchorPoint = Vector2.new(0, 1),
	Position = UDim2.new(0, 16, 1, -64),
	Size = UDim2.new(0, 320, 0, 396),
	BackgroundColor3 = CORES.fundo,
	BackgroundTransparency = 0.05,
	BorderSizePixel = 0,
	Visible = false,
	ZIndex = 8,
}, telaCheia)
Novo("UICorner", { CornerRadius = UDim.new(0, 8) }, painel)
Novo("UIStroke", { Color = CORES.borda, Thickness = 1 }, painel)
Novo("UIPadding", {
	PaddingTop = UDim.new(0, 12), PaddingBottom = UDim.new(0, 12),
	PaddingLeft = UDim.new(0, 12), PaddingRight = UDim.new(0, 12),
}, painel)

local coluna = Novo("UIListLayout", {
	FillDirection = Enum.FillDirection.Vertical,
	SortOrder = Enum.SortOrder.LayoutOrder,
	Padding = UDim.new(0, 6),
}, painel)
coluna.Name = "Coluna"

Novo("TextLabel", {
	LayoutOrder = 1,
	Size = UDim2.new(1, 0, 0, 20),
	BackgroundTransparency = 1,
	Font = FONTE_TITULO,
	TextSize = 13,
	TextColor3 = CORES.textoPrimario,
	TextXAlignment = Enum.TextXAlignment.Left,
	Text = "AFINAR A TORRE",
	ZIndex = 9,
}, painel)

-- Uma linha por campo: rótulo, [-], valor, [+].
for indice, campo in ipairs(CAMPOS) do
	local linha = Novo("Frame", {
		LayoutOrder = indice + 1,
		Size = UDim2.new(1, 0, 0, 30),
		BackgroundTransparency = 1,
		ZIndex = 9,
	}, painel)

	Novo("TextLabel", {
		Size = UDim2.new(1, -110, 1, 0),
		BackgroundTransparency = 1,
		Font = FONTE,
		TextSize = 12,
		TextColor3 = CORES.textoSecundario,
		TextXAlignment = Enum.TextXAlignment.Left,
		Text = campo.rotulo,
		ZIndex = 9,
	}, linha)

	local function botao(texto, posX, delta)
		local b = Novo("TextButton", {
			AnchorPoint = Vector2.new(1, 0.5),
			Position = UDim2.new(1, posX, 0.5, 0),
			Size = UDim2.new(0, 26, 0, 26),
			BackgroundColor3 = CORES.superficie,
			BorderSizePixel = 0,
			Font = FONTE_TITULO,
			TextSize = 16,
			TextColor3 = CORES.textoPrimario,
			Text = texto,
			ZIndex = 9,
		}, linha)
		Novo("UICorner", { CornerRadius = UDim.new(0, 6) }, b)

		b.MouseButton1Click:Connect(function()
			local proximo = valores[campo.chave] + delta
			-- Preso na faixa: passar do limite não é ajuste, é erro esperando
			-- para acontecer na hora de reconstruir.
			proximo = math.max(campo.min, math.min(campo.max, proximo))
			-- Arredonda para o passo, senão 0,1+0,05 vira 0,15000000000000002.
			valores[campo.chave] = math.floor(proximo * 1000 + 0.5) / 1000
			rotulosDeValor[campo.chave].Text = formatar(valores[campo.chave])
			if caixaJson then
				caixaJson.Text = montarJson()
			end
		end)
		return b
	end

	botao("-", -74, -campo.passo)
	botao("+", -4, campo.passo)

	rotulosDeValor[campo.chave] = Novo("TextLabel", {
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -34, 0.5, 0),
		Size = UDim2.new(0, 40, 0, 26),
		BackgroundTransparency = 1,
		Font = FONTE_TITULO,
		TextSize = 13,
		TextColor3 = CORES.textoPrimario,
		Text = formatar(campo.padrao),
		ZIndex = 9,
	}, linha)
end

local aplicarBotao = Novo("TextButton", {
	LayoutOrder = 50,
	Size = UDim2.new(1, 0, 0, 34),
	BackgroundColor3 = CORES.superficie,
	BorderSizePixel = 0,
	Font = FONTE_TITULO,
	TextSize = 13,
	TextColor3 = CORES.textoPrimario,
	Text = "Aplicar e reconstruir",
	ZIndex = 9,
}, painel)
Novo("UICorner", { CornerRadius = UDim.new(0, 6) }, aplicarBotao)
aplicarBotao.MouseButton1Click:Connect(aplicar)

rotuloRecado = Novo("TextLabel", {
	LayoutOrder = 51,
	Size = UDim2.new(1, 0, 0, 30),
	BackgroundTransparency = 1,
	Font = FONTE,
	TextSize = 11,
	TextColor3 = CORES.textoSecundario,
	TextXAlignment = Enum.TextXAlignment.Left,
	TextWrapped = true,
	Text = "Ajuste e clique em aplicar.",
	ZIndex = 9,
}, painel)

--[[ A caixa do JSON.

	TextBox e não TextLabel porque o Roblox não dá clipboard a script de jogo:
	o jeito que funciona é o texto ficar selecionável e o Ctrl+C ser do sistema.
	O botão abaixo já deixa tudo selecionado, então sobra o Ctrl+C. ]]
caixaJson = Novo("TextBox", {
	LayoutOrder = 52,
	Size = UDim2.new(1, 0, 0, 92),
	BackgroundColor3 = CORES.superficie,
	BorderSizePixel = 0,
	Font = Enum.Font.Code,
	TextSize = 11,
	TextColor3 = CORES.textoPrimario,
	TextXAlignment = Enum.TextXAlignment.Left,
	TextYAlignment = Enum.TextYAlignment.Top,
	TextWrapped = true,
	ClearTextOnFocus = false,
	MultiLine = true,
	Text = montarJson(),
	ZIndex = 9,
}, painel)
Novo("UICorner", { CornerRadius = UDim.new(0, 6) }, caixaJson)

local copiarBotao = Novo("TextButton", {
	LayoutOrder = 53,
	Size = UDim2.new(1, 0, 0, 30),
	BackgroundColor3 = CORES.superficie,
	BorderSizePixel = 0,
	Font = FONTE_TITULO,
	TextSize = 12,
	TextColor3 = CORES.textoPrimario,
	Text = "Selecionar tudo (depois Ctrl+C)",
	ZIndex = 9,
}, painel)
Novo("UICorner", { CornerRadius = UDim.new(0, 6) }, copiarBotao)

copiarBotao.MouseButton1Click:Connect(function()
	caixaJson.Text = montarJson()
	caixaJson:CaptureFocus()
	caixaJson.SelectionStart = 1
	caixaJson.CursorPosition = #caixaJson.Text + 1
	recado("Selecionado. Aperte Ctrl+C e cole na conversa.", CORES.textoPrimario)
end)

-- O botão que abre, no canto inferior esquerdo.
local abrir = Novo("TextButton", {
	Name = "Abrir",
	AnchorPoint = Vector2.new(0, 1),
	Position = UDim2.new(0, 16, 1, -16),
	Size = UDim2.new(0, 190, 0, 40),
	BackgroundColor3 = CORES.superficie,
	BorderSizePixel = 0,
	Font = FONTE,
	TextSize = 14,
	TextColor3 = CORES.textoPrimario,
	Text = "Afinar torre  (" .. TECLA_ATALHO.Name .. ")",
	ZIndex = 8,
}, telaCheia)
Novo("UICorner", { CornerRadius = UDim.new(0, 8) }, abrir)
Novo("UIStroke", { Color = CORES.borda, Thickness = 1 }, abrir)

local function alternar()
	painel.Visible = not painel.Visible
end

abrir.MouseButton1Click:Connect(alternar)

UserInputService.InputBegan:Connect(function(input, capturado)
	if capturado or input.UserInputType ~= Enum.UserInputType.Keyboard then
		return
	end
	if input.KeyCode == TECLA_ATALHO then
		alternar()
	end
end)

-- A resposta do servidor. Sempre chega, inclusive na recusa: sem isso o botão
-- pareceria não funcionar quando o ajuste produz torre intransponível.
Eventos.obter(Eventos.AJUSTAR_MAPA).OnClientEvent:Connect(function(resposta)
	if type(resposta) ~= "table" then
		return
	end
	if resposta.ok then
		recado("Torre reconstruída. Copie o JSON quando gostar do resultado.", CORES.textoPrimario)
		return
	end
	local motivo = "recusado"
	if type(resposta.problemas) == "table" and resposta.problemas[1] then
		motivo = tostring(resposta.problemas[1])
	end
	-- Só o primeiro problema: a torre reprova em centenas de pares de uma vez,
	-- e despejar todos aqui esconderia o que interessa.
	recado(string.sub(motivo, 1, 200), COR_ERRO)
end)
