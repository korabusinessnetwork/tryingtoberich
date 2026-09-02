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

-- ===== coluna direita: numero da plataforma =====

local painelPlataforma = Instance.new("Frame")
painelPlataforma.Name = "PainelPlataforma"
painelPlataforma.BackgroundTransparency = 1
painelPlataforma.AnchorPoint = Vector2.new(1, 0)
painelPlataforma.Position = UDim2.fromScale(1, 0)
painelPlataforma.Size = UDim2.fromScale(0.4, 0.32)
painelPlataforma.Parent = areaSegura

local escalaPlataforma = Instance.new("UIScale")
escalaPlataforma.Parent = painelPlataforma

local layoutPlataforma = Instance.new("UIListLayout")
layoutPlataforma.FillDirection = Enum.FillDirection.Vertical
layoutPlataforma.SortOrder = Enum.SortOrder.LayoutOrder
layoutPlataforma.HorizontalAlignment = Enum.HorizontalAlignment.Right
layoutPlataforma.VerticalAlignment = Enum.VerticalAlignment.Top
layoutPlataforma.Parent = painelPlataforma

local rotuloAltura = criarRotulo(painelPlataforma, {
	Name = "RotuloAltura",
	LayoutOrder = 1,
	Size = UDim2.fromScale(1, 0.18),
	Font = Enum.Font.GothamBold,
	TextXAlignment = Enum.TextXAlignment.Right,
})
rotuloAltura.Text = "ALTURA"

-- O maior elemento da tela. Precisa ler sobre qualquer fundo de mapa, por
-- isso e o unico rotulo comum que leva sombra alem do contorno.
local numeroGrande = criarRotulo(painelPlataforma, {
	Name = "NumeroGrande",
	LayoutOrder = 2,
	Size = UDim2.fromScale(1, 0.6),
	TextXAlignment = Enum.TextXAlignment.Right,
}, true)
numeroGrande.Text = "0"

local fracaoTotal, fracaoTotalSlot = criarRotulo(painelPlataforma, {
	Name = "FracaoTotal",
	LayoutOrder = 3,
	Size = UDim2.fromScale(1, 0.22),
	Font = Enum.Font.GothamBold,
	TextXAlignment = Enum.TextXAlignment.Right,
})
fracaoTotalSlot.Visible = false

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
	if referencia then
		local mudou = numeroGrande.Text ~= tostring(referencia)
		numeroGrande.Text = tostring(referencia)
		if mudou then
			-- Pulso pequeno: reforca que o numero reagiu na hora ao presente,
			-- o Principio no1 do projeto (latencia percebida).
			pulsar(escalaPlataforma, 1.08, 0.18)
		end
	end

	local total = tonumber(dados.totalPlataformas)
	if total and total > 0 then
		fracaoTotal.Text = "/" .. tostring(total)
		fracaoTotalSlot.Visible = true
	else
		fracaoTotalSlot.Visible = false
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
