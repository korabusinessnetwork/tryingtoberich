--!strict
-- HUD do jogo — ver docs/02_DESIGN_SYSTEM secao B.
--
-- Regra de ouro da secao B: legivel num video vertical comprimido, numa tela
-- de 6 polegadas, muitas vezes sem som. Por isso o desenho inteiro segue tres
-- ideias: numeros enormes, rotulos curtissimos, e contraste que nao depende
-- do fundo (o mapa e gerado por IA e pode ter qualquer paleta).
--
-- Layout: uma "area segura" central deixa 3% de margem lateral, 2% no topo e
-- corta os 15% inferiores (o TikTok sobrepoe a propria interface ali). Dentro
-- dela, so as laterais tem conteudo — o centro e do boneco e do comentario do
-- TikTok. Coluna direita: numero da plataforma, o maior elemento da tela.
-- Coluna esquerda: quem mandou o ultimo presente.
--
-- ==========================================================================
-- DECISAO: como o HUD mostra o combate (ADR-012), decisao pendente que este
-- arquivo fecha.
--
-- Dois estados novos, tratados de formas diferentes porque sao psicologicamente
-- diferentes pro espectador:
--
-- 1. Disputa contestada (Eventos.PRESENTE com disputa.contestado == true): a
--    animacao que tocou pode nao ser a do presente de quem esta assistindo.
--    Isso e SURPRESA, nao confusao — a leitura do painel de presente ganha uma
--    etiqueta "DISPUTA" na cor Tokens.hud.combate e as duas somas, subida em
--    Tokens.hud.subida e descida em Tokens.hud.descida, bem abaixo do valor
--    liquido que ja apareceu grande no topo do mesmo painel. A ordem importa:
--    o espectador ve primeiro o resultado (o numero que já reconhece do dia a
--    dia), depois, se quiser, entende o motivo. Fica visivel 1s a mais que um
--    presente comum (4s em vez de 3s) porque tem mais conteudo pra ler.
--
-- 2. Empate exato (Eventos.COMBATE_ANULADO): NENHUM Eventos.PRESENTE dispara
--    junto — pelo contrato, delta 0 nao existe — entao sem tratamento
--    dedicado a tela fica muda no exato momento em que mais gente mandou
--    presente ao mesmo tempo. Isso le como travamento, nao como "empate", e
--    e o oposto do que a mecanica merece (o proprio ADR chama isso do
--    "momento mais divertido"). Tratamento: um selo "EMPATE" dourado que
--    aparece nas DUAS laterais ao mesmo tempo (mesmo conteudo espelhado), com
--    uma animacao de "pop" (escala 1.3 -> 1.0), pra pegar o olho do
--    espectador onde quer que ele esteja olhando na tela — sem invadir o
--    centro nem os 15% inferiores. As duas somas aparecem embaixo do selo,
--    mostrando que se cancelaram.
-- ==========================================================================

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Eventos = require(Compartilhado.eventos)
local Tokens = require(Compartilhado.tokens)
-- A contagem regressiva vem daqui, a MESMA que o servidor usa para saber
-- quando reiniciar. Ver Tipos.CONTAGEM_DE_RODADA.
local Tipos = require(Compartilhado.tipos)

local jogadorLocal = Players.LocalPlayer
local playerGui = jogadorLocal:WaitForChild("PlayerGui")

-- Regra do design system: nome do doador some em 3s e nunca acumula lista.
local DURACAO_NOME = 3
-- +1s sobre a regra acima: o painel de disputa tem duas somas a mais pra ler.
local DURACAO_DISPUTA = 4
-- Empate e raro e e o momento mais divertido da mecanica — fica um pouco mais
-- que a disputa, ja que nao ha presente nenhum chegando atras pra substitui-lo.
local DURACAO_EMPATE = 4.5

--------------------------------------------------------------------------
-- Auxiliares de estilo. Toda cor vem de Tokens; nenhum literal no resto do
-- arquivo.
--------------------------------------------------------------------------

--[[
	Cria um TextLabel dentro de um "slot" (Frame invisivel do tamanho da
	celula no UIListLayout do pai). O slot existe pra poder esconder a linha
	inteira sem descasar o layout: UIListLayout ignora filho com Visible
	false, entao esconder o slot fecha o espaco, e esconder so o texto lá
	dentro deixaria um buraco.

	`comSombra` cria um segundo texto atras, escurecido e deslocado — a
	combinacao "contorno grosso e sombra" que o design system pede para o
	numero da plataforma e para o selo de EMPATE, os dois elementos que
	precisam do destaque maximo da tela. A sombra fica sincronizada com o
	texto principal sozinha (GetPropertyChangedSignal), entao quem usa isto
	so escreve num lugar.
]]
local function criarRotulo(pai, propriedades, comSombra)
	local slot = Instance.new("Frame")
	slot.BackgroundTransparency = 1
	slot.Name = (propriedades.Name or "Rotulo") .. "Slot"
	slot.Size = propriedades.Size
	slot.LayoutOrder = propriedades.LayoutOrder or 0
	slot.Parent = pai

	local function novoTexto(zIndex)
		local rotulo = Instance.new("TextLabel")
		rotulo.BackgroundTransparency = 1
		rotulo.Size = UDim2.new(1, 0, 1, 0)
		rotulo.Font = Enum.Font.GothamBlack
		rotulo.TextColor3 = Tokens.hud.texto
		rotulo.TextStrokeColor3 = Tokens.hud.contorno
		rotulo.TextStrokeTransparency = 0
		rotulo.TextScaled = true
		rotulo.RichText = false
		rotulo.TextXAlignment = Enum.TextXAlignment.Left
		rotulo.Text = ""
		rotulo.ZIndex = zIndex
		for chave, valor in pairs(propriedades) do
			if chave ~= "Size" and chave ~= "LayoutOrder" and chave ~= "Name" then
				rotulo[chave] = valor
			end
		end
		rotulo.Parent = slot
		return rotulo
	end

	local sombra = nil
	if comSombra then
		sombra = novoTexto(1)
		sombra.Position = UDim2.fromScale(0.02, 0.06)
		sombra.TextColor3 = Tokens.hud.contorno
		sombra.TextTransparency = 0.3
	end

	local principal = novoTexto(2)
	if sombra then
		local sombraFixa = sombra
		principal:GetPropertyChangedSignal("Text"):Connect(function()
			sombraFixa.Text = principal.Text
		end)
	end

	return principal, slot
end

local function corRgb(cor)
	return string.format(
		"rgb(%d,%d,%d)",
		math.floor(cor.R * 255 + 0.5),
		math.floor(cor.G * 255 + 0.5),
		math.floor(cor.B * 255 + 0.5)
	)
end

--[[ Uma linha com duas cores (ex.: soma de subida em verde, de descida em
	vermelho) dentro do mesmo TextLabel, via RichText. So usar com texto que o
	proprio HUD formata (numero com sinal) — nunca com nomeDoador ou
	presenteNome, que vem de fora e nao e confiavel pra virar marcacao. ]]
local function textoComDuasCores(textoA, corA, textoB, corB)
	return string.format(
		'<font color="%s">%s</font>   <font color="%s">%s</font>',
		corRgb(corA), textoA, corRgb(corB), textoB
	)
end

local function formatarDelta(delta)
	if delta >= 0 then
		return "+" .. tostring(delta)
	end
	return tostring(delta)
end

-- Tween anterior por UIScale: um segundo presente chegando no meio da
-- animacao do primeiro (comum durante disputa, com varios ESTADO seguidos)
-- nao pode deixar dois tweens escrevendo em .Scale ao mesmo tempo.
local tweensAtivos = {}

local function pulsar(uiScale, escalaPico, duracao)
	local anterior = tweensAtivos[uiScale]
	if anterior then
		anterior:Cancel()
	end
	uiScale.Scale = escalaPico
	local tween = TweenService:Create(
		uiScale,
		TweenInfo.new(duracao, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
		{ Scale = 1 }
	)
	tweensAtivos[uiScale] = tween
	tween:Play()
end

--------------------------------------------------------------------------
-- Arvore de UI
--------------------------------------------------------------------------

local tela = Instance.new("ScreenGui")
-- Sibling explicito: em Global o ZIndex vale para a tela inteira e filho pode
-- sumir atras do proprio pai. Ver a nota em vestiario.client.lua.
tela.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
tela.Name = "KoraHud"
tela.ResetOnSpawn = false
tela.IgnoreGuiInset = true
tela.DisplayOrder = 10

local areaSegura = Instance.new("Frame")
areaSegura.Name = "AreaSegura"
areaSegura.BackgroundTransparency = 1
areaSegura.AnchorPoint = Vector2.new(0.5, 0)
areaSegura.Position = UDim2.fromScale(0.5, 0.02)
-- Altura 0.83 a partir de Y 0.02 termina em 0.85: os 15% inferiores da tela
-- ficam fora da area segura por construcao, nao por convencao.
areaSegura.Size = UDim2.fromScale(0.94, 0.83)
areaSegura.Parent = tela

-- ===== barra da meta: topo, centralizada =====
--
-- Overlay de meta, como o de inscritos numa live: uma barra que enche, com o
-- numero DENTRO dela. Os dados moram no proprio elemento que os representa, e
-- nao numa coluna ao lado — e uma leitura so, nao duas.
--
-- Topo e nao meio: o 02_DESIGN_SYSTEM reserva o centro da tela para o boneco e
-- para o comentario que o TikTok sobrepoe. Centralizada na horizontal, colada
-- no topo, ela nao disputa com nenhum dos dois.

local painelPlataforma = Instance.new("Frame")
painelPlataforma.Name = "PainelMeta"
painelPlataforma.BackgroundTransparency = 1
painelPlataforma.AnchorPoint = Vector2.new(0.5, 0)
painelPlataforma.Position = UDim2.fromScale(0.5, 0)
painelPlataforma.Size = UDim2.fromScale(0.62, 0.09)
painelPlataforma.Parent = areaSegura

local escalaPlataforma = Instance.new("UIScale")
escalaPlataforma.Parent = painelPlataforma

-- Fundo escuro com contorno: o mapa e gerado e pode ter qualquer paleta, entao
-- o HUD nunca depende do fundo para ser legivel.
local trilhoMeta = Instance.new("Frame")
trilhoMeta.Name = "TrilhoMeta"
trilhoMeta.Size = UDim2.fromScale(1, 1)
trilhoMeta.BackgroundColor3 = Tokens.hud.contorno
trilhoMeta.BackgroundTransparency = 0.3
trilhoMeta.BorderSizePixel = 0
--[[ Recorta o preenchimento na propria forma arredondada.

	Sem isto o preenchimento desenha por cima da ponta do trilho e escapa do
	arredondado — um risco verde solto na borda esquerda, que e como a barra
	aparecia "quebrada" com pouco progresso. ]]
trilhoMeta.ClipsDescendants = true
trilhoMeta.Parent = painelPlataforma

local cantoTrilho = Instance.new("UICorner")
cantoTrilho.CornerRadius = UDim.new(1, 0)
cantoTrilho.Parent = trilhoMeta

local contornoTrilho = Instance.new("UIStroke")
contornoTrilho.Color = Tokens.hud.contorno
contornoTrilho.Thickness = 3
contornoTrilho.Parent = trilhoMeta

-- Verde de SUBIDA, o mesmo do delta positivo: a barra enche quando se sobe, e
-- reusar a cor evita ensinar um segundo vocabulario ao espectador.
local preenchimentoMeta = Instance.new("Frame")
preenchimentoMeta.Name = "Preenchimento"
preenchimentoMeta.Size = UDim2.fromScale(0, 1)
preenchimentoMeta.BackgroundColor3 = Tokens.hud.subida
preenchimentoMeta.BorderSizePixel = 0
preenchimentoMeta.ZIndex = 2
preenchimentoMeta.Parent = trilhoMeta

--[[ SEM UICorner proprio, de proposito.

	Arredondar o preenchimento fazia dele uma pilula independente: com 1% de
	progresso virava um risco fino e arredondado dos dois lados, solto dentro do
	trilho. Quem arredonda e o PAI, pelo ClipsDescendants — assim a ponta
	esquerda acompanha a curva do trilho e a direita fica reta, que e o desenho
	certo de uma barra que enche. ]]

--[[ O numero POR CIMA do preenchimento.

	ZIndex acima da barra de proposito: quando ela passar por baixo do texto, o
	numero continua legivel — e o contorno grosso garante isso tanto sobre o
	verde quanto sobre o fundo escuro. Sem ele, o texto sumiria na metade da
	subida, que e justamente quando ele mais importa. ]]
local numeroGrande = Instance.new("TextLabel")
numeroGrande.Name = "NumeroMeta"
numeroGrande.BackgroundTransparency = 1
numeroGrande.Size = UDim2.fromScale(1, 1)
numeroGrande.Font = Enum.Font.GothamBlack
numeroGrande.TextColor3 = Tokens.hud.texto
numeroGrande.TextStrokeColor3 = Tokens.hud.contorno
numeroGrande.TextStrokeTransparency = 0
numeroGrande.TextScaled = true
numeroGrande.RichText = false
numeroGrande.TextXAlignment = Enum.TextXAlignment.Center
numeroGrande.Text = "0"
numeroGrande.ZIndex = 3
numeroGrande.Parent = trilhoMeta

local margemNumero = Instance.new("UIPadding")
margemNumero.PaddingTop = UDim.new(0, 4)
margemNumero.PaddingBottom = UDim.new(0, 4)
margemNumero.Parent = numeroGrande

--[[
	O placar, logo abaixo da barra.

	Vitorias e derrotas da SESSAO, nao do streamer: some quando a sessao acaba.
	Fica colado na barra porque conta a mesma historia — quanto falta agora, e
	como foram as tentativas anteriores.
]]
local placar = Instance.new("TextLabel")
placar.Name = "Placar"
placar.BackgroundTransparency = 1
placar.AnchorPoint = Vector2.new(0.5, 0)
placar.Position = UDim2.fromScale(0.5, 1.15)
placar.Size = UDim2.fromScale(0.6, 0.55)
placar.Font = Enum.Font.GothamBlack
placar.TextColor3 = Tokens.hud.texto
placar.TextStrokeColor3 = Tokens.hud.contorno
placar.TextStrokeTransparency = 0
placar.TextScaled = true
placar.RichText = false
placar.Text = "0 V   0 D"
placar.Parent = painelPlataforma

local function atualizarPlacar(vitorias, derrotas)
	placar.Text = tostring(vitorias or 0) .. " V   " .. tostring(derrotas or 0) .. " D"
end

--[[
	A barra do PORTAL, logo abaixo do placar.

	Aparece so quando o portal esta de pe, e some quando ele quebra ou fecha. E
	a peca que transforma a derrota em disputa: sem numero na tela, o publico ve
	o boneco parado no chao e nao entende que ha uma briga acontecendo — nem
	quanto falta para ganha-la.

	Roxa, a cor do portal do Nether, e nao a de descida: ela nao mede queda,
	mede quanto o portal ainda aguenta. Esvazia da direita para a esquerda,
	como vida de chefe.
]]
local painelPortal = Instance.new("Frame")
painelPortal.Name = "PainelPortal"
painelPortal.BackgroundTransparency = 1
painelPortal.AnchorPoint = Vector2.new(0.5, 0)
painelPortal.Position = UDim2.fromScale(0.5, 1.85)
painelPortal.Size = UDim2.fromScale(0.9, 0.5)
painelPortal.Visible = false
painelPortal.Parent = painelPlataforma

local trilhoPortal = Instance.new("Frame")
trilhoPortal.Name = "Trilho"
trilhoPortal.Size = UDim2.fromScale(1, 1)
trilhoPortal.BackgroundColor3 = Tokens.hud.contorno
trilhoPortal.BackgroundTransparency = 0.3
trilhoPortal.BorderSizePixel = 0
-- Mesmo recorte da barra de meta: sem ele o preenchimento escapa do
-- arredondado e a barra aparece "quebrada" nas pontas.
trilhoPortal.ClipsDescendants = true
trilhoPortal.Parent = painelPortal

local cantoPortal = Instance.new("UICorner")
cantoPortal.CornerRadius = UDim.new(1, 0)
cantoPortal.Parent = trilhoPortal

local contornoPortal = Instance.new("UIStroke")
contornoPortal.Color = Tokens.hud.contorno
contornoPortal.Thickness = 3
contornoPortal.Parent = trilhoPortal

local preenchimentoPortal = Instance.new("Frame")
preenchimentoPortal.Name = "Preenchimento"
preenchimentoPortal.Size = UDim2.fromScale(1, 1)
preenchimentoPortal.BackgroundColor3 = Color3.fromRGB(126, 44, 214)
preenchimentoPortal.BorderSizePixel = 0
preenchimentoPortal.ZIndex = 2
preenchimentoPortal.Parent = trilhoPortal

local textoPortal = Instance.new("TextLabel")
textoPortal.Name = "Texto"
textoPortal.BackgroundTransparency = 1
textoPortal.Size = UDim2.fromScale(1, 1)
textoPortal.Font = Enum.Font.GothamBlack
textoPortal.TextColor3 = Tokens.hud.texto
textoPortal.TextStrokeColor3 = Tokens.hud.contorno
textoPortal.TextStrokeTransparency = 0
textoPortal.TextScaled = true
textoPortal.RichText = false
textoPortal.ZIndex = 3
textoPortal.Text = "PORTAL"
textoPortal.Parent = trilhoPortal

local function atualizarPortal(dados)
	if type(dados) ~= "table" or not dados.aberto then
		painelPortal.Visible = false
		return
	end

	local maxima = dados.vidaMaxima
	if type(maxima) ~= "number" or maxima <= 0 then
		maxima = 1
	end
	local vida = math.max(0, math.min(maxima, dados.vida or 0))

	painelPortal.Visible = true
	preenchimentoPortal.Size = UDim2.fromScale(vida / maxima, 1)
	textoPortal.Text = "PORTAL  " .. tostring(math.floor(vida)) .. "/" .. tostring(math.floor(maxima))

	-- Vermelho no fim: a cor avisa antes de o numero ser lido.
	if vida / maxima <= 0.25 then
		preenchimentoPortal.BackgroundColor3 = Color3.fromRGB(226, 58, 58)
	else
		preenchimentoPortal.BackgroundColor3 = Color3.fromRGB(126, 44, 214)
	end
end

--[[
	A contagem regressiva do fim de rodada.

	Numero enorme no centro da tela, e a UNICA coisa que ocupa o centro em todo
	o HUD: aqui o boneco nao esta subindo, entao o espaco esta livre — e a
	excecao dura os 10 segundos da contagem, nao a partida inteira.

	As duracoes vem de Tipos.CONTAGEM_DE_RODADA, o mesmo lugar de onde o
	servidor tira o atraso do reinicio. Escrever os segundos de novo aqui faria
	a torre reiniciar antes ou depois do numero sumir.
]]
local painelContagem = Instance.new("Frame")
painelContagem.Name = "PainelContagem"
painelContagem.BackgroundTransparency = 1
painelContagem.AnchorPoint = Vector2.new(0.5, 0.5)
painelContagem.Position = UDim2.fromScale(0.5, 0.5)
painelContagem.Size = UDim2.fromScale(0.5, 0.4)
painelContagem.Visible = false
painelContagem.Parent = tela

local escalaContagem = Instance.new("UIScale")
escalaContagem.Parent = painelContagem

local resultadoContagem = Instance.new("TextLabel")
resultadoContagem.Name = "Resultado"
resultadoContagem.BackgroundTransparency = 1
resultadoContagem.Size = UDim2.fromScale(1, 0.25)
resultadoContagem.Font = Enum.Font.GothamBlack
resultadoContagem.TextColor3 = Tokens.hud.texto
resultadoContagem.TextStrokeColor3 = Tokens.hud.contorno
resultadoContagem.TextStrokeTransparency = 0
resultadoContagem.TextScaled = true
resultadoContagem.Text = ""
resultadoContagem.Parent = painelContagem

local numeroContagem = Instance.new("TextLabel")
numeroContagem.Name = "Numero"
numeroContagem.BackgroundTransparency = 1
numeroContagem.Position = UDim2.fromScale(0, 0.25)
numeroContagem.Size = UDim2.fromScale(1, 0.75)
numeroContagem.Font = Enum.Font.GothamBlack
numeroContagem.TextColor3 = Tokens.hud.texto
numeroContagem.TextStrokeColor3 = Tokens.hud.contorno
numeroContagem.TextStrokeTransparency = 0
numeroContagem.TextScaled = true
numeroContagem.Text = ""
numeroContagem.Parent = painelContagem

local contagemEmCurso = 0

--[[ O streamer saiu da plataforma que disparou a contagem.

	Some da tela na hora, sem esperar o "1": a contagem prometia um reinicio que
	nao vai mais acontecer, e deixa-la correr seria mentir com numero grande no
	meio da tela. O `contagemEmCurso` sobe para o laco que ainda esta rodando
	desistir na proxima volta. ]]
local function cancelarContagem()
	contagemEmCurso = contagemEmCurso + 1
	painelContagem.Visible = false
	numeroContagem.Text = ""
end

local function rodarContagem(resultado)
	contagemEmCurso = contagemEmCurso + 1
	local minha = contagemEmCurso

	resultadoContagem.Text = (resultado == "vitoria") and "TOPO!" or "CAIU!"
	resultadoContagem.TextColor3 = (resultado == "vitoria") and Tokens.hud.subida or Tokens.hud.descida
	painelContagem.Visible = true

	task.spawn(function()
		for _, passo in ipairs(Tipos.CONTAGEM_DE_RODADA) do
			-- Outra rodada comecou por cima desta: abandona sem tocar na tela,
			-- senao duas contagens escreveriam no mesmo rotulo.
			if contagemEmCurso ~= minha then
				return
			end
			numeroContagem.Text = tostring(passo.numero)
			pulsar(escalaContagem, 1.25, 0.25)
			task.wait(passo.segundos)
		end

		if contagemEmCurso == minha then
			painelContagem.Visible = false
			numeroContagem.Text = ""
		end
	end)
end

local tweenMeta = nil

--[[ A barra ANDA ate o valor novo em vez de saltar.

	Nao e enfeite: o movimento e o que comunica "subiu", e num salto seco de
	dois presentes seguidos o espectador nao veria diferenca entre um e outro.
	Curto (0,25s) para nao competir com a animacao do boneco. ]]
local function atualizarMeta(plataforma, total)
	if not total or total <= 0 then
		numeroGrande.Text = tostring(plataforma)
		preenchimentoMeta.Size = UDim2.fromScale(0, 1)
		return
	end

	numeroGrande.Text = tostring(plataforma) .. " / " .. tostring(total)

	local fracao = math.max(0, math.min(1, plataforma / total))
	if tweenMeta then
		tweenMeta:Cancel()
	end
	tweenMeta = TweenService:Create(
		preenchimentoMeta,
		TweenInfo.new(0.25, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
		{ Size = UDim2.fromScale(fracao, 1) }
	)
	tweenMeta:Play()
end

-- ===== coluna esquerda: ultimo presente (+ disputa) =====

local painelPresente = Instance.new("Frame")
painelPresente.Name = "PainelPresente"
painelPresente.BackgroundTransparency = 1
painelPresente.AnchorPoint = Vector2.new(0, 0)
painelPresente.Position = UDim2.fromScale(0, 0)
painelPresente.Size = UDim2.fromScale(0.42, 0.42)
painelPresente.Visible = false
painelPresente.Parent = areaSegura

local escalaPresente = Instance.new("UIScale")
escalaPresente.Parent = painelPresente

local layoutPresente = Instance.new("UIListLayout")
layoutPresente.FillDirection = Enum.FillDirection.Vertical
layoutPresente.SortOrder = Enum.SortOrder.LayoutOrder
layoutPresente.HorizontalAlignment = Enum.HorizontalAlignment.Left
layoutPresente.VerticalAlignment = Enum.VerticalAlignment.Top
layoutPresente.Parent = painelPresente

-- Rotulo de presente: no maximo 8 caracteres na pratica (o delta formatado,
-- ex. "+100"), regra do design system.
local rotuloValor = criarRotulo(painelPresente, {
	Name = "RotuloValor",
	LayoutOrder = 1,
	Size = UDim2.fromScale(1, 0.26),
})

local nomeDoadorLabel, nomeDoadorSlot = criarRotulo(painelPresente, {
	Name = "NomeDoador",
	LayoutOrder = 2,
	Size = UDim2.fromScale(1, 0.18),
	Font = Enum.Font.GothamBold,
})

local presenteNomeLabel, presenteNomeSlot = criarRotulo(painelPresente, {
	Name = "PresenteNome",
	LayoutOrder = 3,
	Size = UDim2.fromScale(1, 0.13),
	Font = Enum.Font.Gotham,
	TextTransparency = 0.15,
})

local disputaTag, disputaTagSlot = criarRotulo(painelPresente, {
	Name = "DisputaTag",
	LayoutOrder = 4,
	Size = UDim2.fromScale(1, 0.15),
	Font = Enum.Font.GothamBold,
	TextColor3 = Tokens.hud.combate,
})
disputaTag.Text = "DISPUTA"

local disputaSomas, disputaSomasSlot = criarRotulo(painelPresente, {
	Name = "DisputaSomas",
	LayoutOrder = 5,
	Size = UDim2.fromScale(1, 0.15),
	Font = Enum.Font.GothamBold,
	RichText = true,
})

-- ===== selo de empate, espelhado nas duas laterais =====

local function criarPainelEmpate(ladoEsquerdo)
	local painel = Instance.new("Frame")
	painel.Name = ladoEsquerdo and "PainelEmpateEsquerda" or "PainelEmpateDireita"
	painel.BackgroundTransparency = 1
	painel.Size = UDim2.fromScale(0.4, 0.2)
	painel.Visible = false
	if ladoEsquerdo then
		painel.AnchorPoint = Vector2.new(0, 0.5)
		painel.Position = UDim2.fromScale(0, 0.56)
	else
		painel.AnchorPoint = Vector2.new(1, 0.5)
		painel.Position = UDim2.fromScale(1, 0.56)
	end
	painel.Parent = areaSegura

	local escala = Instance.new("UIScale")
	escala.Parent = painel

	local layout = Instance.new("UIListLayout")
	layout.FillDirection = Enum.FillDirection.Vertical
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.HorizontalAlignment = Enum.HorizontalAlignment.Center
	layout.VerticalAlignment = Enum.VerticalAlignment.Top
	layout.Parent = painel

	local titulo = criarRotulo(painel, {
		Name = "Titulo",
		LayoutOrder = 1,
		Size = UDim2.fromScale(1, 0.55),
		TextColor3 = Tokens.hud.combate,
		TextXAlignment = Enum.TextXAlignment.Center,
	}, true)
	titulo.Text = "EMPATE"

	local somas = criarRotulo(painel, {
		Name = "Somas",
		LayoutOrder = 2,
		Size = UDim2.fromScale(1, 0.45),
		Font = Enum.Font.GothamBold,
		TextXAlignment = Enum.TextXAlignment.Center,
		RichText = true,
	})

	return { frame = painel, somas = somas, escala = escala }
end

local paineisEmpate = { criarPainelEmpate(true), criarPainelEmpate(false) }

-- ===== selo de topo (R6) =====
--
-- Fica no alto e no centro, o unico elemento que ocupa o meio da tela. Isso
-- contraria a regra "HUD nas laterais" de proposito e por um caso so: aqui a
-- corrida ACABOU, nao ha mais presente chegando pra ler nem boneco subindo
-- pra acompanhar, e o que o espectador precisa ver e que a torre foi vencida.
--
-- E o unico aviso do HUD sem tempo de tela: ele fica ate o streamer reiniciar
-- no painel, porque e exatamente essa a regra do R6 — chegar no topo nao
-- reinicia sozinho. Sumir depois de 4 segundos apagaria a unica pista de que
-- o jogo esta esperando uma decisao.

local painelVitoria = Instance.new("Frame")
painelVitoria.Name = "PainelVitoria"
painelVitoria.BackgroundTransparency = 1
painelVitoria.AnchorPoint = Vector2.new(0.5, 0)
painelVitoria.Position = UDim2.fromScale(0.5, 0.06)
painelVitoria.Size = UDim2.fromScale(0.5, 0.22)
painelVitoria.Visible = false
painelVitoria.Parent = areaSegura

local escalaVitoria = Instance.new("UIScale")
escalaVitoria.Parent = painelVitoria

local layoutVitoria = Instance.new("UIListLayout")
layoutVitoria.FillDirection = Enum.FillDirection.Vertical
layoutVitoria.SortOrder = Enum.SortOrder.LayoutOrder
layoutVitoria.HorizontalAlignment = Enum.HorizontalAlignment.Center
layoutVitoria.VerticalAlignment = Enum.VerticalAlignment.Top
layoutVitoria.Parent = painelVitoria

-- 4 caracteres: o design system manda no maximo 8 no rotulo de destaque.
local tituloVitoria = criarRotulo(painelVitoria, {
	Name = "TituloVitoria",
	LayoutOrder = 1,
	Size = UDim2.fromScale(1, 0.62),
	TextColor3 = Tokens.estado.vitoria,
	TextXAlignment = Enum.TextXAlignment.Center,
}, true)
tituloVitoria.Text = "TOPO"

local alturaVitoria = criarRotulo(painelVitoria, {
	Name = "AlturaVitoria",
	LayoutOrder = 2,
	Size = UDim2.fromScale(1, 0.38),
	Font = Enum.Font.GothamBold,
	TextXAlignment = Enum.TextXAlignment.Center,
})

tela.Parent = playerGui

--------------------------------------------------------------------------
-- Estado e temporizadores. Geracao por painel evita o bug classico de dois
-- presentes seguidos: o timer do primeiro nao pode esconder o texto do
-- segundo que ja chegou. Mesma ideia do watchdog de geracao em
-- server/movimento.lua, so que aqui e so pra esconder texto, nao pra devolver
-- controle do boneco.
--------------------------------------------------------------------------

local estadoPresente = { geracao = 0 }
local estadoEmpate = { geracao = 0 }

local function agendarOcultar(estado, duracao, ocultarFn)
	estado.geracao = estado.geracao + 1
	local minhaGeracao = estado.geracao
	task.delay(duracao, function()
		if estado.geracao == minhaGeracao then
			ocultarFn()
		end
	end)
end

local function aoReceberEstado(dados)
	if type(dados) ~= "table" then
		return
	end

	local referencia = tonumber(dados.plataformaReferencia)
	local total = tonumber(dados.totalPlataformas)
	local anterior = numeroGrande.Text

	atualizarMeta(referencia or 0, total)

	atualizarPlacar(tonumber(dados.vitorias), tonumber(dados.derrotas))

	if referencia and numeroGrande.Text ~= anterior then
		-- Pulso pequeno: reforca que o numero reagiu na hora ao presente, o
		-- Principio no1 do projeto (latencia percebida).
		pulsar(escalaPlataforma, 1.08, 0.18)
	end
end

local function ocultarPresente()
	painelPresente.Visible = false
end

local function aoReceberPresente(dados)
	if type(dados) ~= "table" then
		return
	end

	local delta = tonumber(dados.delta) or 0
	local corDelta = delta >= 0 and Tokens.hud.subida or Tokens.hud.descida
	rotuloValor.Text = formatarDelta(delta)
	rotuloValor.TextColor3 = corDelta

	if type(dados.nomeDoador) == "string" and dados.nomeDoador ~= "" then
		nomeDoadorLabel.Text = dados.nomeDoador
		nomeDoadorSlot.Visible = true
	else
		nomeDoadorSlot.Visible = false
	end

	if type(dados.presenteNome) == "string" and dados.presenteNome ~= "" then
		presenteNomeLabel.Text = dados.presenteNome
		presenteNomeSlot.Visible = true
	else
		presenteNomeSlot.Visible = false
	end

	local disputa = dados.disputa
	local contestado = type(disputa) == "table" and disputa.contestado == true
	if contestado then
		disputaSomas.Text = textoComDuasCores(
			formatarDelta(tonumber(disputa.somaSubida) or 0), Tokens.hud.subida,
			formatarDelta(tonumber(disputa.somaDescida) or 0), Tokens.hud.descida
		)
		disputaTagSlot.Visible = true
		disputaSomasSlot.Visible = true
		pulsar(escalaPresente, 1.15, 0.25)
	else
		disputaTagSlot.Visible = false
		disputaSomasSlot.Visible = false
	end

	painelPresente.Visible = true

	local duracao = contestado and DURACAO_DISPUTA or DURACAO_NOME
	agendarOcultar(estadoPresente, duracao, ocultarPresente)
end

local function ocultarEmpate()
	for _, badge in ipairs(paineisEmpate) do
		badge.frame.Visible = false
	end
end

local function aoReceberCombateAnulado(dados)
	if type(dados) ~= "table" then
		return
	end

	local somas = textoComDuasCores(
		formatarDelta(tonumber(dados.somaSubida) or 0), Tokens.hud.subida,
		formatarDelta(tonumber(dados.somaDescida) or 0), Tokens.hud.descida
	)

	for _, badge in ipairs(paineisEmpate) do
		badge.somas.Text = somas
		badge.frame.Visible = true
		pulsar(badge.escala, 1.3, 0.35)
	end

	agendarOcultar(estadoEmpate, DURACAO_EMPATE, ocultarEmpate)
end

--[[
	R6 — chegou ao topo, ou voltou dele pelo reinicio do painel.

	O servidor so dispara na TRANSICAO, entao aqui nao ha o que debouncar: cada
	chegada e uma mudanca de verdade.
]]
local function aoReceberVitoria(dados)
	if type(dados) ~= "table" then
		return
	end

	if dados.reiniciou == true then
		painelVitoria.Visible = false
		return
	end

	local plataforma = tonumber(dados.plataforma)
	local total = tonumber(dados.totalPlataformas)
	if plataforma and total and total > 0 then
		alturaVitoria.Text = tostring(plataforma) .. "/" .. tostring(total)
	else
		alturaVitoria.Text = ""
	end

	painelVitoria.Visible = true
	-- Pulso maior que o do numero da plataforma: e o unico momento da partida
	-- em que a torre acabou, e ele compete com a euforia do chat.
	pulsar(escalaVitoria, 1.25, 0.35)
end

--------------------------------------------------------------------------
-- Conexoes. Cada evento e opcional na pratica (o servidor pode nao ter
-- criado todos ainda quando este LocalScript sobe); um Eventos.obter que
-- falha nao pode derrubar os outros dois.
--------------------------------------------------------------------------

local function conectar(nomeEvento, manipulador)
	local ok, remoto = pcall(Eventos.obter, nomeEvento)
	if not ok or not remoto then
		warn("[Kora] HUD sem " .. tostring(nomeEvento) .. ": " .. tostring(remoto))
		return
	end
	remoto.OnClientEvent:Connect(manipulador)
end

conectar(Eventos.ESTADO, aoReceberEstado)
conectar(Eventos.PRESENTE, aoReceberPresente)
conectar(Eventos.COMBATE_ANULADO, aoReceberCombateAnulado)
conectar(Eventos.VITORIA, aoReceberVitoria)

--[[ O portal: abriu, apanhou, quebrou.

	Chega a cada golpe, e nao a cada batimento de estado: a barra precisa andar
	no MESMO instante em que o presente entra, senao o espectador nao liga o que
	mandou ao estrago que fez. ]]
conectar(Eventos.PORTAL, function(dados)
	atualizarPortal(dados)
end)

conectar(Eventos.RODADA_ENCERRADA, function(dados)
	if type(dados) ~= "table" then
		return
	end
	-- O placar sobe na hora, sem esperar o proximo batimento de estado: o
	-- numero mudando junto com o "TOPO!" e o que liga uma coisa a outra.
	atualizarPlacar(dados.vitorias, dados.derrotas)

	-- Cancelado: o streamer saiu da plataforma antes de a contagem terminar. O
	-- placar FICA como esta — o ponto foi feito ao tocar a plataforma, e
	-- desfaze-lo faria o numero piscar por um passo em falso.
	if dados.resultado == "cancelado" then
		cancelarContagem()
		return
	end

	rodarContagem(dados.resultado)
end)
