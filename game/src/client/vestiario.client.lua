--!strict
-- GUI de vestiário dentro do jogo (ADR-011, estende ADR-010).
--
-- A prévia é a feature: mostrar ícone de peça é trivial, mostrar o BONECO
-- MONTADO com combinação arbitrária só é barato aqui dentro, com a
-- iluminação e a câmera reais. Por isso este menu compõe o personagem ao
-- vivo, com HumanoidDescription, do mesmo jeito que game/src/server/
-- personagem.lua faz na aplicação de verdade (SetAccessories com
-- AccessoryType.Unknown, deixando o Roblox decidir o slot) — é o que dá
-- paridade entre o que o streamer vê aqui e o que a live realmente aplica.
--
-- Dono exclusivo deste arquivo (ver instrução da tarefa). Nunca toca em
-- shared/*, server/* nem em outro arquivo de client/: o que falta desses
-- contratos foi implementado LOCALMENTE aqui e fica documentado abaixo, para
-- quem for escrever o lado servidor.
--
-- ============================================================================
-- CONTRATO DOS TRÊS REMOTEEVENT (eu não implemento o lado servidor)
-- ============================================================================
--
-- Eventos.VESTIARIO_BUSCAR
--   cliente → servidor : { termo = "tocha" }                 (mín. 2 letras)
--   servidor → cliente : sucesso -> { termo = "tocha", itens = {
--                           { assetId = 123456, nome = "Tocha Élfica", preco = 0 }, ...
--                         } }                                 (itens = {} é "sem resultado", estado válido)
--                         erro    -> { termo = "tocha", erro = "mensagem" }
--   `itens` já deveria vir só com preço zero (o filtro é na origem, na ponte,
--   GET /jogo/catalogo-itens). Mesmo assim este arquivo DESCARTA na tela
--   qualquer item que chegue com `preco` numérico diferente de 0 — defesa em
--   profundidade pedida pela regra 2 da tarefa. `preco` ausente é tratado
--   como gratuito (a ponte não manda o campo se já filtrou).
--
-- Eventos.VESTIARIO_EQUIPAR
--   cliente → servidor : { assetId = 123456, equipar = true, nome = "Tocha Élfica" }
--                         (`equipar = false` desequipa; `nome` é só rótulo,
--                         melhor esforço, servidor não depende dele)
--   servidor → cliente : OPCIONAL, só para reconciliar rejeição server-side:
--                         { assetId = 123456, equipar = true, ok = false, erro = "mensagem" }
--   Este arquivo aplica a prévia OTIMISTA na hora do clique (ver princípio de
--   latência do CLAUDE.md: o valor inteiro é a reação instantânea). Se o
--   servidor nunca responder, nada quebra — a prévia local já é a verdade
--   que o streamer vê. Uma resposta com `ok = false` só desfaz o que já foi
--   mostrado e avisa por quê.
--
-- Eventos.VESTIARIO_SALVAR
--   cliente → servidor : {
--     nome = "Escalador Vulcânico",
--     itensCatalogo = { 123456, 234567 },
--     coresCorpo = { cabeca = "#C4462A", torso = "#2B1B18" },   -- só campo definido, pode vir {}
--     efeitoPermanente = { tipo = "aura", cor = "#F5A623", intensidade = 2 },  -- ou nil = sem efeito
--     fallbackItens = { 123456, 234567 },                        -- nunca vazia, ver regra 4
--   }
--   servidor → cliente : sucesso -> { ok = true, lookId = "escalador-vulcanico" }
--                         erro    -> { ok = false, erro = "mensagem" }
--   Este cliente NUNCA manda `lookId`, `streamerId`, `atualizadoEm` nem
--   `roupaCustomizada`: o id nasce do nome no servidor (slug), streamerId e
--   atualizadoEm são responsabilidade de quem persiste (ADR-003), e
--   roupaCustomizada fica de fora de propósito — rota paga adiada (regra 5,
--   ADR-010). O payload já sai com fallbackItens não vazio: se o streamer não
--   marcou nenhum item de reserva, este arquivo usa os itens equipados no
--   momento do salvar (regra 4). Se nem isso existir, o salvar é BLOQUEADO
--   aqui no cliente com aviso — nunca manda lista vazia pro schema rejeitar.
--
-- Eventos.ESTADO (servidor → cliente, eu só CONSUMO)
--   Formato em shared/eventos.lua. O campo que importa aqui é `sessaoAtiva`:
--   é ele que tranca o vestiário durante a live, como o ADR-011 exige.
--
-- ============================================================================
local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")

local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Eventos = require(Compartilhado.eventos)
local Tokens = require(Compartilhado.tokens)
local Efeitos = require(Compartilhado.efeitos)

local jogador = Players.LocalPlayer

-- ============================================================================
-- Fábrica de instância — reduz o Instance.new(...) repetido em toda a GUI.
-- ============================================================================
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

local function ehLayout(inst)
	return inst:IsA("UIGridLayout") or inst:IsA("UIListLayout") or inst:IsA("UIPadding")
		or inst:IsA("UICorner") or inst:IsA("UIStroke")
end

--[[ Destrói todo filho que não seja um objeto de layout/decoração fixo. ]]
local function limparFilhos(pai)
	local filhos = pai:GetChildren()
	for _, filho in ipairs(filhos) do
		if not ehLayout(filho) then
			filho:Destroy()
		end
	end
end

local function hexParaCor3(hex)
	if type(hex) ~= "string" then
		return nil
	end
	local r, g, b = string.match(hex, "^#(%x%x)(%x%x)(%x%x)$")
	if not r then
		return nil
	end
	return Color3.fromRGB(tonumber(r, 16), tonumber(g, 16), tonumber(b, 16))
end

local function corHexValida(hex)
	return type(hex) == "string" and string.match(hex, "^#%x%x%x%x%x%x$") ~= nil
end

-- Mesma paleta do painel: o vestiário é tela de configuração, não HUD de live.
-- Vem do gerador (data/tokens.json -> tokens.lua), nunca literal aqui, senão
-- o white-label da Fase 3 teria que caçar hex dentro de GUI.
local CORES = Tokens.painel

local FONTE = Enum.Font.Gotham
local FONTE_TITULO = Enum.Font.GothamBold
local FONTE_MEDIA = Enum.Font.GothamMedium

local LIMITE_ITENS = 20 -- espelha maxItems de itensCatalogo no schema de look
local TAMANHO_MIN_BUSCA = 2
local TECLA_ATALHO = Enum.KeyCode.V
local DURACAO_AVISO = 3.5
local COR_EFEITO_PADRAO = "#F5A623"
local INTENSIDADE_PADRAO = 2

-- Mesma tabela de shared/server/personagem.lua: nome de domínio do look ->
-- propriedade real de HumanoidDescription. Duplicado aqui de propósito (não
-- posso requerer módulo de ServerScriptService a partir do client).
local CAMPO_COR = {
	cabeca = { chave = "HeadColor", rotulo = "Cabeça" },
	torso = { chave = "TorsoColor", rotulo = "Torso" },
	bracoEsquerdo = { chave = "LeftArmColor", rotulo = "Braço E" },
	bracoDireito = { chave = "RightArmColor", rotulo = "Braço D" },
	pernaEsquerda = { chave = "LeftLegColor", rotulo = "Perna E" },
	pernaDireita = { chave = "RightLegColor", rotulo = "Perna D" },
}
local ORDEM_CAMPO_COR = { "cabeca", "torso", "bracoEsquerdo", "bracoDireito", "pernaEsquerda", "pernaDireita" }

-- ============================================================================
-- Estado (tudo local a este arquivo — nada disso é persistido até Salvar)
-- ============================================================================
local itensEquipadosLista = {} -- array ordenado de assetId, ordem = ordem de equipar
local itensEquipadosSet = {} -- assetId -> true, pra checagem O(1)
local nomesPorAssetId = {} -- assetId -> nome (melhor esforço, pra lista de equipados)
local fallbackSelecionado = {} -- assetId -> true, subconjunto dos equipados marcado como reserva

local coresCorpoDefinidas = {} -- campo -> hex, só entra quando o streamer define um valor válido

local tipoEfeitoAtual = nil -- nil | "aura" | "rastro" | "brilho"
local corEfeitoAtual = COR_EFEITO_PADRAO
local intensidadeEfeitoAtual = INTENSIDADE_PADRAO

local celulasResultado = {} -- assetId -> Instance da célula de busca, pra restilizar sem re-renderizar
local botoesTipoEfeito = {}
local botoesIntensidade = {}

local ultimoTermoBuscado = nil
local buscando = false
local salvando = false

local sessaoAtivaExplicita = nil
local guiAberta = false

local estadoPreviewEfeito = { instancia = nil, anexos = {} }

-- Referências de GUI preenchidas na construção (ver seção final do arquivo).
-- Declaradas antes das funções de lógica porque os closures abaixo capturam
-- estas variáveis por referência: o valor só precisa existir quando a função
-- RODA, não quando ela é definida.
local telaCheia
local backdrop
local painel
local botaoAlternarVestiario
local rotuloAviso
local avisoGeracao = 0

local caixaBusca
local botaoBuscar
local rotuloHintBusca
local rotuloEstadoResultados
local gradeResultados

local containerEquipados
local rotuloContagemEquipados

local containerFallback

local caixaNomeLook
local rotuloEstadoSalvar
local botaoSalvar

-- ============================================================================
-- Aviso temporário (toast) — usado pelo bloqueio de sessão e por erros.
-- ============================================================================
local function mostrarAviso(texto, cor)
	avisoGeracao = avisoGeracao + 1
	local minhaGeracao = avisoGeracao

	rotuloAviso.Text = texto
	rotuloAviso.TextColor3 = cor or CORES.textoPrimario
	rotuloAviso.Visible = true

	task.delay(DURACAO_AVISO, function()
		if minhaGeracao == avisoGeracao then
			rotuloAviso.Visible = false
		end
	end)
end

-- ============================================================================
-- Bloqueio de sessão ao vivo (ADR-011, consequência negativa; regra 1)
-- ============================================================================
-- `sessaoAtiva` é campo do contrato de ESTADO (ver shared/eventos.lua). Antes
-- de ele existir isto era heurística de tempo — "recebi ESTADO há pouco, logo
-- tem sessão" —, e heurística erra nos dois sentidos: tranca o vestiário fora
-- da live e abre no meio dela, que é o caso que o ADR-011 proíbe.
local function sessaoEstaAtiva()
	return sessaoAtivaExplicita == true
end

-- ============================================================================
-- Composição do personagem (prévia) — mesma técnica de server/personagem.lua
-- ============================================================================

--[[
	SetAccessories espera lista de descrição, não só o id. AccessoryType.Unknown
	deixa o próprio Roblox decidir o slot (chapéu, cabelo, costas...), porque o
	look só guarda o id escolhido no vestiário, nunca a categoria do item.
]]
local function listaDeAcessorios(itens)
	local lista = {}
	for _, assetId in ipairs(itens) do
		table.insert(lista, {
			AssetId = assetId,
			AccessoryType = Enum.AccessoryType.Unknown,
			IsLayered = false,
			Order = #lista + 1,
		})
	end
	return lista
end

local function humanoidAtual()
	local personagem = jogador.Character
	if not personagem then
		return nil
	end
	return personagem:FindFirstChildOfClass("Humanoid")
end

--[[
	Reconstrói a HumanoidDescription inteira a partir do estado local e
	aplica. ApplyDescription substitui o personagem por completo — por isso
	NUNCA soma incremental, sempre monta do zero a partir de
	itensEquipadosLista + coresCorpoDefinidas. Devolve true/false: quem chama
	decide se desfaz o clique que gerou a falha.
]]
local function atualizarPreviaPersonagem()
	local humanoid = humanoidAtual()
	if not humanoid then
		return false
	end

	local ok = pcall(function()
		local descricao = Instance.new("HumanoidDescription")
		for _, campo in ipairs(ORDEM_CAMPO_COR) do
			local hex = coresCorpoDefinidas[campo]
			local cor = hex and hexParaCor3(hex)
			if cor then
				descricao[CAMPO_COR[campo].chave] = cor
			end
		end
		descricao:SetAccessories(listaDeAcessorios(itensEquipadosLista), true)
		humanoid:ApplyDescription(descricao)
	end)

	return ok
end

--[[ Espelha criarEfeito de server/personagem.lua, só que sem Debris: quem
	é dono da instância aqui é o próprio menu, destruída explicitamente toda
	vez que o efeito muda ou o vestiário fecha. ]]
local function destruirEfeitoPreview()
	if estadoPreviewEfeito.instancia then
		pcall(function()
			estadoPreviewEfeito.instancia:Destroy()
		end)
		estadoPreviewEfeito.instancia = nil
	end
	for _, anexo in ipairs(estadoPreviewEfeito.anexos) do
		pcall(function()
			anexo:Destroy()
		end)
	end
	estadoPreviewEfeito.anexos = {}
end

local function aplicarEfeitoPreview()
	destruirEfeitoPreview()

	if tipoEfeitoAtual == nil then
		return
	end

	local personagem = jogador.Character
	local raiz = personagem and Efeitos.raiz(personagem)
	if not raiz then
		return
	end

	local cor = hexParaCor3(corEfeitoAtual) or Color3.fromRGB(245, 166, 35)
	local fator = Efeitos.escala(intensidadeEfeitoAtual)

	pcall(function()
		if tipoEfeitoAtual == "aura" then
			local anexo = Efeitos.anexo(raiz, "KoraVestiarioPreviewAnexo")
			table.insert(estadoPreviewEfeito.anexos, anexo)
			estadoPreviewEfeito.instancia = Efeitos.particula(anexo, { Color = ColorSequence.new(cor) }, intensidadeEfeitoAtual, nil)
		elseif tipoEfeitoAtual == "rastro" then
			local topo = Efeitos.anexo(raiz, "KoraVestiarioPreviewTopo", Vector3.new(0, 1, 0))
			local base = Efeitos.anexo(raiz, "KoraVestiarioPreviewBase", Vector3.new(0, -1, 0))
			table.insert(estadoPreviewEfeito.anexos, topo)
			table.insert(estadoPreviewEfeito.anexos, base)
			estadoPreviewEfeito.instancia = Efeitos.trilha(topo, base, {
				Color = ColorSequence.new(cor),
				WidthScale = Efeitos.sequenciaDeNumero(fator, fator),
			}, nil)
		else
			estadoPreviewEfeito.instancia = Efeitos.brilho(personagem, {
				FillColor = cor,
				OutlineColor = cor,
				FillTransparency = math.max(0.1, 0.9 - (fator * 0.4)),
			})
		end
	end)
end

-- ============================================================================
-- RemoteEvents
-- ============================================================================
local RemotoBuscar = Eventos.obter(Eventos.VESTIARIO_BUSCAR)
local RemotoEquipar = Eventos.obter(Eventos.VESTIARIO_EQUIPAR)
local RemotoSalvar = Eventos.obter(Eventos.VESTIARIO_SALVAR)
local RemotoEstado = Eventos.obter(Eventos.ESTADO)

-- ============================================================================
-- Equipados / fallback / resultados — renderização e alternância de item
-- ============================================================================
local function estilizarCelulaResultado(assetId)
	local celula = celulasResultado[assetId]
	if not celula then
		return
	end
	local equipado = itensEquipadosSet[assetId] == true
	celula.BackgroundColor3 = equipado and Tokens.estado.ok or CORES.fundo
	local aro = celula:FindFirstChild("aroSelecao")
	if aro then
		aro.Enabled = equipado
	end
end

local function renderizarFallback()
	limparFilhos(containerFallback)
	for indice, assetId in ipairs(itensEquipadosLista) do
		local nome = nomesPorAssetId[assetId] or ("Item " .. tostring(assetId))
		local linha = Novo("Frame", {
			Name = "Fallback_" .. tostring(assetId),
			BackgroundTransparency = 1,
			Size = UDim2.new(1, 0, 0, 26),
			LayoutOrder = indice,
		}, containerFallback)

		local marcado = fallbackSelecionado[assetId] == true
		local caixa = Novo("TextButton", {
			Name = "Caixa",
			Size = UDim2.new(0, 20, 0, 20),
			Position = UDim2.new(0, 0, 0.5, -10),
			BackgroundColor3 = marcado and Tokens.estado.ok or CORES.fundo,
			BorderSizePixel = 0,
			Text = marcado and "X" or "",
			TextColor3 = CORES.textoPrimario,
			Font = FONTE_TITULO,
			TextSize = 14,
			AutoButtonColor = false,
		}, linha)
		Novo("UICorner", { CornerRadius = UDim.new(0, 4) }, caixa)
		Novo("UIStroke", { Color = CORES.borda, Thickness = 1 }, caixa)

		Novo("TextLabel", {
			Name = "Nome",
			BackgroundTransparency = 1,
			Position = UDim2.new(0, 30, 0, 0),
			Size = UDim2.new(1, -30, 1, 0),
			Font = FONTE,
			TextSize = 13,
			TextColor3 = CORES.textoSecundario,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextTruncate = Enum.TextTruncate.AtEnd,
			Text = nome,
		}, linha)

		caixa.MouseButton1Click:Connect(function()
			if fallbackSelecionado[assetId] then
				fallbackSelecionado[assetId] = nil
			else
				fallbackSelecionado[assetId] = true
			end
			renderizarFallback()
		end)
	end
end

-- Declarado antes de alternarEquip por causa da referência circular:
-- alternarEquip re-renderiza a lista, e cada linha da lista chama
-- alternarEquip pro botão de remover. Um dos dois precisa existir como
-- upvalue antes de ser definido de verdade.
local renderizarEquipados

--[[
	Equipa/desequipa. Aplica a prévia OTIMISTA antes de falar com o servidor —
	é o princípio de latência percebida do CLAUDE.md aplicado aqui dentro: o
	streamer vê o boneco mudar na hora, sem esperar round-trip nenhum. Some
	desfeito só se a própria aplicação local falhar (pcall dentro de
	atualizarPreviaPersonagem) ou se o servidor rejeitar depois (ver
	RemotoEquipar.OnClientEvent, mais abaixo).
]]
local function alternarEquip(assetId, nome)
	local jaEquipado = itensEquipadosSet[assetId] == true

	if not jaEquipado and #itensEquipadosLista >= LIMITE_ITENS then
		mostrarAviso("Máximo de " .. LIMITE_ITENS .. " peças por look.", Tokens.estado.atencao)
		return
	end

	local listaAnterior = {}
	for indice, id in ipairs(itensEquipadosLista) do
		listaAnterior[indice] = id
	end
	local setAnterior = {}
	for id in pairs(itensEquipadosSet) do
		setAnterior[id] = true
	end

	if jaEquipado then
		itensEquipadosSet[assetId] = nil
		fallbackSelecionado[assetId] = nil
		local nova = {}
		for _, id in ipairs(itensEquipadosLista) do
			if id ~= assetId then
				table.insert(nova, id)
			end
		end
		itensEquipadosLista = nova
	else
		itensEquipadosSet[assetId] = true
		fallbackSelecionado[assetId] = true
		nomesPorAssetId[assetId] = nome
		table.insert(itensEquipadosLista, assetId)
	end

	local ok = atualizarPreviaPersonagem()

	if not ok then
		itensEquipadosLista = listaAnterior
		itensEquipadosSet = setAnterior
		mostrarAviso("Não foi possível equipar esse item agora.", Tokens.estado.erro)
		estilizarCelulaResultado(assetId)
		renderizarEquipados()
		return
	end

	estilizarCelulaResultado(assetId)
	renderizarEquipados()

	RemotoEquipar:FireServer({ assetId = assetId, equipar = not jaEquipado, nome = nome })
end

renderizarEquipados = function()
	rotuloContagemEquipados.Text = "Equipados (" .. #itensEquipadosLista .. "/" .. LIMITE_ITENS .. ")"

	limparFilhos(containerEquipados)
	if #itensEquipadosLista == 0 then
		Novo("TextLabel", {
			Name = "Vazio",
			BackgroundTransparency = 1,
			Size = UDim2.new(1, 0, 0, 28),
			Font = FONTE,
			TextSize = 13,
			TextColor3 = CORES.textoSecundario,
			TextXAlignment = Enum.TextXAlignment.Left,
			Text = "Nada equipado ainda. Busque um item ao lado.",
		}, containerEquipados)
	else
		for indice, assetId in ipairs(itensEquipadosLista) do
			local nome = nomesPorAssetId[assetId] or ("Item " .. tostring(assetId))
			local linha = Novo("Frame", {
				Name = "Equipado_" .. tostring(assetId),
				BackgroundColor3 = CORES.fundo,
				BorderSizePixel = 0,
				Size = UDim2.new(1, 0, 0, 30),
				LayoutOrder = indice,
			}, containerEquipados)
			Novo("UICorner", { CornerRadius = UDim.new(0, 4) }, linha)

			Novo("TextLabel", {
				Name = "Nome",
				BackgroundTransparency = 1,
				Position = UDim2.new(0, 8, 0, 0),
				Size = UDim2.new(1, -46, 1, 0),
				Font = FONTE,
				TextSize = 13,
				TextColor3 = CORES.textoPrimario,
				TextXAlignment = Enum.TextXAlignment.Left,
				TextTruncate = Enum.TextTruncate.AtEnd,
				Text = nome,
			}, linha)

			local botaoRemover = Novo("TextButton", {
				Name = "Remover",
				AnchorPoint = Vector2.new(1, 0.5),
				Position = UDim2.new(1, -6, 0.5, 0),
				Size = UDim2.new(0, 28, 0, 22),
				BackgroundColor3 = CORES.borda,
				BorderSizePixel = 0,
				Font = FONTE_TITULO,
				TextSize = 13,
				TextColor3 = CORES.textoPrimario,
				Text = "X",
			}, linha)
			Novo("UICorner", { CornerRadius = UDim.new(0, 4) }, botaoRemover)

			botaoRemover.MouseButton1Click:Connect(function()
				alternarEquip(assetId, nome)
			end)
		end
	end

	renderizarFallback()
end

local function renderizarResultados(itens)
	celulasResultado = {}
	limparFilhos(gradeResultados)

	for indice, item in ipairs(itens) do
		local celula = Novo("TextButton", {
			Name = "Item_" .. tostring(item.assetId),
			BackgroundColor3 = itensEquipadosSet[item.assetId] and Tokens.estado.ok or CORES.fundo,
			BorderSizePixel = 0,
			AutoButtonColor = false,
			Text = "",
			LayoutOrder = indice,
		}, gradeResultados)
		Novo("UICorner", { CornerRadius = UDim.new(0, 6) }, celula)
		Novo("UIStroke", {
			Name = "aroSelecao",
			Color = Tokens.estado.ok,
			Thickness = 2,
			Enabled = itensEquipadosSet[item.assetId] == true,
		}, celula)

		Novo("ImageLabel", {
			Name = "Miniatura",
			BackgroundTransparency = 1,
			Size = UDim2.new(1, -12, 0, 70),
			Position = UDim2.new(0, 6, 0, 6),
			Image = "rbxthumb://type=Asset&id=" .. tostring(item.assetId) .. "&w=150&h=150",
			ScaleType = Enum.ScaleType.Fit,
		}, celula)

		Novo("TextLabel", {
			Name = "Nome",
			BackgroundTransparency = 1,
			Position = UDim2.new(0, 4, 0, 78),
			Size = UDim2.new(1, -8, 0, 28),
			Font = FONTE,
			TextSize = 11,
			TextColor3 = CORES.textoPrimario,
			TextWrapped = true,
			Text = item.nome or ("Item " .. tostring(item.assetId)),
		}, celula)

		celulasResultado[item.assetId] = celula

		celula.MouseButton1Click:Connect(function()
			alternarEquip(item.assetId, item.nome)
		end)
	end
end

-- ============================================================================
-- Busca (regra 2: só item gratuito; estados de carregando/erro/vazio obrigatórios)
-- ============================================================================
local function definirEstadoResultados(texto, mostrarGrade)
	rotuloEstadoResultados.Text = texto or ""
	rotuloEstadoResultados.Visible = texto ~= nil and texto ~= ""
	gradeResultados.Visible = mostrarGrade == true
end

local function executarBusca()
	-- Ignora clique/Enter repetido enquanto a busca anterior ainda está no ar:
	-- a API do catálogo tem limite de taxa (ADR-011), não faz sentido martelar.
	if buscando then
		return
	end

	local termo = string.gsub(caixaBusca.Text, "^%s*(.-)%s*$", "%1")
	if #termo < TAMANHO_MIN_BUSCA then
		rotuloHintBusca.Text = "Digite ao menos " .. TAMANHO_MIN_BUSCA .. " letras."
		rotuloHintBusca.TextColor3 = Tokens.estado.atencao
		return
	end

	rotuloHintBusca.Text = ""
	buscando = true
	botaoBuscar.BackgroundTransparency = 0.5
	ultimoTermoBuscado = termo
	definirEstadoResultados("Buscando \"" .. termo .. "\"...", false)
	RemotoBuscar:FireServer({ termo = termo })

	task.delay(15, function()
		if buscando and ultimoTermoBuscado == termo then
			buscando = false
			botaoBuscar.BackgroundTransparency = 0
			definirEstadoResultados("A busca demorou demais. Tente de novo.", false)
		end
	end)
end

RemotoBuscar.OnClientEvent:Connect(function(dados)
	if type(dados) ~= "table" or dados.termo ~= ultimoTermoBuscado then
		-- Resposta de uma busca anterior (chegou fora de ordem) ou payload
		-- malformado: ignora. A API do catálogo tem limite de taxa (ADR-011)
		-- e pode atrasar, então isto evita resultado velho pisando no novo.
		return
	end
	buscando = false
	botaoBuscar.BackgroundTransparency = 0

	if type(dados.erro) == "string" then
		definirEstadoResultados("Erro na busca: " .. dados.erro, false)
		return
	end

	local itens = dados.itens
	if type(itens) ~= "table" then
		definirEstadoResultados("Resposta inválida do servidor.", false)
		return
	end

	local filtrados = {}
	for _, item in ipairs(itens) do
		if type(item) == "table" and type(item.assetId) == "number" then
			local preco = item.preco
			if preco == nil or preco == 0 then
				table.insert(filtrados, item)
			end
			-- Item com preço fica de fora: defesa em profundidade da regra 2.
			-- O filtro de origem é a ponte, mas o streamer não pode montar um
			-- look que não consegue vestir.
		end
	end

	if #filtrados == 0 then
		definirEstadoResultados("Nada encontrado para \"" .. tostring(dados.termo) .. "\".", false)
		return
	end

	definirEstadoResultados(nil, true)
	renderizarResultados(filtrados)
end)

RemotoEquipar.OnClientEvent:Connect(function(dados)
	if type(dados) ~= "table" or dados.ok ~= false or type(dados.assetId) ~= "number" then
		-- Só reconcilia rejeição explícita (ok == false). Sucesso é
		-- silencioso de propósito: a prévia já é otimista, então uma
		-- confirmação não muda nada na tela.
		return
	end
	if itensEquipadosSet[dados.assetId] then
		local nome = nomesPorAssetId[dados.assetId]
		alternarEquip(dados.assetId, nome)
		mostrarAviso("O servidor recusou \"" .. tostring(nome or dados.assetId) .. "\": " .. tostring(dados.erro or "motivo não informado"), Tokens.estado.erro)
	end
end)

-- ============================================================================
-- Efeito permanente — seleção de tipo/intensidade
-- ============================================================================
-- A escala 1-5 reaproveita Tokens.faixa (já é uma rampa de 5 passos no
-- design system) em vez de inventar cor nova só pro medidor de intensidade.
local OPCOES_TIPO_EFEITO = {
	{ valor = nil, rotulo = "Nenhum" },
	{ valor = "aura", rotulo = "Aura" },
	{ valor = "rastro", rotulo = "Rastro" },
	{ valor = "brilho", rotulo = "Brilho" },
}

local function restilizarBotoesTipoEfeito()
	for _, opcao in ipairs(OPCOES_TIPO_EFEITO) do
		local botao = botoesTipoEfeito[opcao.rotulo]
		if botao then
			local selecionado = opcao.valor == tipoEfeitoAtual
			botao.BackgroundColor3 = selecionado and Tokens.estado.ok or CORES.fundo
		end
	end
end

local function selecionarTipoEfeito(valor)
	tipoEfeitoAtual = valor
	restilizarBotoesTipoEfeito()
	aplicarEfeitoPreview()
end

local function restilizarBotoesIntensidade()
	for n = 1, 5 do
		local botao = botoesIntensidade[n]
		if botao then
			botao.BackgroundColor3 = Tokens.faixa[n].cor
			botao.BackgroundTransparency = (n == intensidadeEfeitoAtual) and 0 or 0.7
		end
	end
end

local function selecionarIntensidade(n)
	intensidadeEfeitoAtual = n
	restilizarBotoesIntensidade()
	aplicarEfeitoPreview()
end

--[[ Campo de cor em hex reutilizado pelas 6 linhas de cor de corpo e pela cor
	do efeito. `valorInicial` pode ser nil (cor de corpo começa "não
	definida", ou seja, mantém o tom padrão da HumanoidDescription).
	`aoConfirmar(hex)` recebe hex válido em maiúsculas, ou nil quando o campo
	é limpo ou inválido. ]]
local function criarCampoHex(pai, rotuloTexto, valorInicial, aoConfirmar)
	local linha = Novo("Frame", {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, 26),
	}, pai)

	Novo("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.new(0, 70, 1, 0),
		Font = FONTE,
		TextSize = 12,
		TextColor3 = CORES.textoSecundario,
		TextXAlignment = Enum.TextXAlignment.Left,
		Text = rotuloTexto,
	}, linha)

	local amostra = Novo("Frame", {
		Position = UDim2.new(0, 72, 0.5, -9),
		Size = UDim2.new(0, 18, 0, 18),
		BackgroundColor3 = hexParaCor3(valorInicial) or CORES.borda,
		BorderSizePixel = 0,
	}, linha)
	Novo("UICorner", { CornerRadius = UDim.new(0, 4) }, amostra)
	Novo("UIStroke", { Color = CORES.borda, Thickness = 1 }, amostra)

	local caixa = Novo("TextBox", {
		Position = UDim2.new(0, 98, 0.5, -11),
		Size = UDim2.new(1, -98, 0, 22),
		BackgroundColor3 = CORES.fundo,
		BorderSizePixel = 0,
		Font = FONTE,
		TextSize = 12,
		TextColor3 = CORES.textoPrimario,
		PlaceholderText = "#RRGGBB",
		PlaceholderColor3 = CORES.textoSecundario,
		ClearTextOnFocus = false,
		Text = valorInicial or "",
	}, linha)
	Novo("UICorner", { CornerRadius = UDim.new(0, 4) }, caixa)

	caixa.FocusLost:Connect(function()
		local texto = string.gsub(caixa.Text, "^%s*(.-)%s*$", "%1")
		if texto == "" then
			amostra.BackgroundColor3 = CORES.borda
			aoConfirmar(nil)
			return
		end
		texto = string.upper(texto)
		if not corHexValida(texto) then
			caixa.Text = ""
			amostra.BackgroundColor3 = CORES.borda
			mostrarAviso("Cor inválida. Use o formato #RRGGBB.", Tokens.estado.erro)
			aoConfirmar(nil)
			return
		end
		caixa.Text = texto
		amostra.BackgroundColor3 = hexParaCor3(texto)
		aoConfirmar(texto)
	end)

	return linha
end

local function criarLinhaCor(pai, campo)
	criarCampoHex(pai, CAMPO_COR[campo].rotulo, coresCorpoDefinidas[campo], function(hex)
		coresCorpoDefinidas[campo] = hex
		atualizarPreviaPersonagem()
	end)
end

-- ============================================================================
-- Salvar (regras 3, 4 e 5)
-- ============================================================================
local function definirEstadoSalvar(texto, cor)
	rotuloEstadoSalvar.Text = texto or ""
	rotuloEstadoSalvar.Visible = texto ~= nil and texto ~= ""
	rotuloEstadoSalvar.TextColor3 = cor or CORES.textoSecundario
end

local function executarSalvar()
	if salvando then
		return
	end

	local nome = string.gsub(caixaNomeLook.Text, "^%s*(.-)%s*$", "%1")
	if #nome < 1 or #nome > 60 then
		definirEstadoSalvar("Dê um nome ao look (até 60 caracteres).", Tokens.estado.erro)
		return
	end

	local fallback = {}
	for _, assetId in ipairs(itensEquipadosLista) do
		if fallbackSelecionado[assetId] then
			table.insert(fallback, assetId)
		end
	end
	if #fallback == 0 then
		-- Regra 4: nunca manda fallbackItens vazio. Sem marcação explícita,
		-- reserva = os itens equipados agora.
		for _, assetId in ipairs(itensEquipadosLista) do
			table.insert(fallback, assetId)
		end
	end
	if #fallback == 0 then
		definirEstadoSalvar("Equipe ao menos um item (ou marque uma reserva) antes de salvar.", Tokens.estado.erro)
		return
	end

	local coresCorpoPayload = {}
	for campo, hex in pairs(coresCorpoDefinidas) do
		coresCorpoPayload[campo] = hex
	end

	local efeitoPayload = nil
	if tipoEfeitoAtual ~= nil then
		efeitoPayload = {
			tipo = tipoEfeitoAtual,
			cor = corHexValida(corEfeitoAtual) and corEfeitoAtual or COR_EFEITO_PADRAO,
			intensidade = intensidadeEfeitoAtual,
		}
	end

	salvando = true
	botaoSalvar.BackgroundTransparency = 0.5
	definirEstadoSalvar("Salvando...", CORES.textoSecundario)

	-- roupaCustomizada nunca é mandado: rota paga adiada por regra de custo
	-- do CLAUDE.md (regra 5 da tarefa / ADR-010). O servidor default para nil.
	RemotoSalvar:FireServer({
		nome = nome,
		itensCatalogo = itensEquipadosLista,
		coresCorpo = coresCorpoPayload,
		efeitoPermanente = efeitoPayload,
		fallbackItens = fallback,
	})

	task.delay(10, function()
		if salvando then
			salvando = false
			botaoSalvar.BackgroundTransparency = 0
			definirEstadoSalvar("Sem resposta do servidor. Tente de novo.", Tokens.estado.erro)
		end
	end)
end

RemotoSalvar.OnClientEvent:Connect(function(dados)
	salvando = false
	botaoSalvar.BackgroundTransparency = 0
	if type(dados) ~= "table" then
		definirEstadoSalvar("Resposta inválida do servidor.", Tokens.estado.erro)
		return
	end
	if dados.ok == true then
		definirEstadoSalvar("Look salvo como \"" .. tostring(dados.lookId) .. "\". Vale a partir do início da próxima sessão ou do próximo respawn.", Tokens.estado.ok)
	else
		definirEstadoSalvar("Erro ao salvar: " .. tostring(dados.erro or "desconhecido"), Tokens.estado.erro)
	end
end)

-- ============================================================================
-- Abrir / fechar / bloqueio durante sessão ao vivo (regra 1 da tarefa)
-- ============================================================================
local function fecharVestiario(mensagemOpcional, corMensagem)
	if not guiAberta then
		return
	end
	guiAberta = false
	backdrop.Visible = false
	painel.Visible = false
	if mensagemOpcional then
		mostrarAviso(mensagemOpcional, corMensagem)
	end
end

local function abrirVestiario()
	guiAberta = true
	backdrop.Visible = true
	painel.Visible = true
end

--[[ Ponto único de entrada pro botão E pro atalho de teclado — a regra 1
	pede que os dois se comportem igual: nunca "morto e silencioso". ]]
local function tentarAbrirVestiario()
	if guiAberta then
		fecharVestiario()
		return
	end
	if sessaoEstaAtiva() then
		mostrarAviso("Vestiário indisponível durante a sessão ao vivo.", Tokens.estado.atencao)
		return
	end
	abrirVestiario()
end

RemotoEstado.OnClientEvent:Connect(function(dados)
	if type(dados) == "table" and type(dados.sessaoAtiva) == "boolean" then
		sessaoAtivaExplicita = dados.sessaoAtiva
	end
end)

task.spawn(function()
	while true do
		task.wait(1)
		if guiAberta and sessaoEstaAtiva() then
			fecharVestiario("Sessão ao vivo começou. Vestiário fechado.", Tokens.estado.atencao)
		end
		if botaoAlternarVestiario then
			botaoAlternarVestiario.BackgroundColor3 = sessaoEstaAtiva() and CORES.borda or CORES.superficie
		end
	end
end)

-- ============================================================================
-- Respawn: reaplica a prévia atual no personagem novo
-- ============================================================================
local function aoPersonagemAdicionado()
	task.defer(function()
		atualizarPreviaPersonagem()
		aplicarEfeitoPreview()
	end)
end

if jogador.Character then
	aoPersonagemAdicionado()
end
jogador.CharacterAdded:Connect(aoPersonagemAdicionado)

-- ============================================================================
-- Construção da GUI (Instance.new puro, sem asset — ver instrução da tarefa)
-- ============================================================================
local jogadorGui = jogador:WaitForChild("PlayerGui")

telaCheia = Novo("ScreenGui", {
	Name = "KoraVestiarioGui",
	ResetOnSpawn = false,
	DisplayOrder = 50,
}, jogadorGui)

-- Botão sempre visível (regra 1: nunca some, só recusa com aviso quando a
-- sessão está ao vivo) + o rótulo de aviso/toast que ele e o atalho usam.
local containerBotao = Novo("Frame", {
	Name = "BotaoContainer",
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim2.new(1, -16, 0, 16),
	Size = UDim2.new(0, 190, 0, 40),
	BackgroundTransparency = 1,
	ZIndex = 5,
}, telaCheia)

botaoAlternarVestiario = Novo("TextButton", {
	Name = "Alternar",
	Size = UDim2.new(1, 0, 1, 0),
	BackgroundColor3 = CORES.superficie,
	BorderSizePixel = 0,
	Font = FONTE_MEDIA,
	TextSize = 14,
	TextColor3 = CORES.textoPrimario,
	Text = "Vestiário  (" .. TECLA_ATALHO.Name .. ")",
	ZIndex = 5,
}, containerBotao)
Novo("UICorner", { CornerRadius = UDim.new(0, 8) }, botaoAlternarVestiario)
Novo("UIStroke", { Color = CORES.borda, Thickness = 1 }, botaoAlternarVestiario)

rotuloAviso = Novo("TextLabel", {
	Name = "Aviso",
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim2.new(1, -16, 0, 60),
	Size = UDim2.new(0, 300, 0, 56),
	BackgroundColor3 = CORES.fundo,
	BackgroundTransparency = 0.05,
	BorderSizePixel = 0,
	Font = FONTE,
	TextSize = 13,
	TextColor3 = CORES.textoPrimario,
	TextWrapped = true,
	Text = "",
	Visible = false,
	ZIndex = 6,
}, telaCheia)
Novo("UICorner", { CornerRadius = UDim.new(0, 8) }, rotuloAviso)
Novo("UIStroke", { Color = CORES.borda, Thickness = 1 }, rotuloAviso)
Novo("UIPadding", {
	PaddingTop = UDim.new(0, 8), PaddingBottom = UDim.new(0, 8),
	PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10),
}, rotuloAviso)

backdrop = Novo("TextButton", {
	Name = "Backdrop",
	Size = UDim2.new(1, 0, 1, 0),
	BackgroundColor3 = Color3.new(0, 0, 0),
	BackgroundTransparency = 0.45,
	BorderSizePixel = 0,
	AutoButtonColor = false,
	Text = "",
	Visible = false,
	ZIndex = 1,
}, telaCheia)
backdrop.MouseButton1Click:Connect(function()
	fecharVestiario()
end)

painel = Novo("Frame", {
	Name = "Painel",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.new(0.5, 0, 0.5, 0),
	Size = UDim2.new(0, 920, 0, 680),
	BackgroundColor3 = CORES.superficie,
	BorderSizePixel = 0,
	Active = true, -- consome clique: não deixa passar pro backdrop atrás
	Visible = false,
	ZIndex = 2,
}, telaCheia)
Novo("UICorner", { CornerRadius = UDim.new(0, 12) }, painel)
Novo("UIStroke", { Color = CORES.borda, Thickness = 1 }, painel)

-- Cabeçalho
local cabecalho = Novo("Frame", {
	Name = "Cabecalho",
	Size = UDim2.new(1, 0, 0, 64),
	BackgroundTransparency = 1,
}, painel)
Novo("UIPadding", {
	PaddingLeft = UDim.new(0, 20), PaddingRight = UDim.new(0, 20), PaddingTop = UDim.new(0, 10),
}, cabecalho)

Novo("TextLabel", {
	Name = "Titulo",
	BackgroundTransparency = 1,
	Size = UDim2.new(0.7, 0, 0, 26),
	Font = FONTE_TITULO,
	TextSize = 20,
	TextColor3 = CORES.textoPrimario,
	TextXAlignment = Enum.TextXAlignment.Left,
	Text = "Vestiário",
}, cabecalho)
Novo("TextLabel", {
	Name = "Subtitulo",
	BackgroundTransparency = 1,
	Position = UDim2.new(0, 0, 0, 28),
	Size = UDim2.new(0.85, 0, 0, 18),
	Font = FONTE,
	TextSize = 12,
	TextColor3 = CORES.textoSecundario,
	TextXAlignment = Enum.TextXAlignment.Left,
	Text = "Monta o look aqui. Aplica no início da sessão ou no próximo respawn — nunca no meio da partida.",
}, cabecalho)

local botaoFechar = Novo("TextButton", {
	Name = "Fechar",
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim2.new(1, 0, 0, 0),
	Size = UDim2.new(0, 32, 0, 32),
	BackgroundColor3 = CORES.fundo,
	BorderSizePixel = 0,
	Font = FONTE_TITULO,
	TextSize = 16,
	TextColor3 = CORES.textoPrimario,
	Text = "X",
}, cabecalho)
Novo("UICorner", { CornerRadius = UDim.new(0, 6) }, botaoFechar)
botaoFechar.MouseButton1Click:Connect(function()
	fecharVestiario()
end)

-- Corpo: duas colunas
local corpo = Novo("Frame", {
	Name = "Corpo",
	Position = UDim2.new(0, 0, 0, 64),
	Size = UDim2.new(1, 0, 1, -64),
	BackgroundTransparency = 1,
}, painel)

local colunaEsquerda = Novo("Frame", {
	Name = "ColunaEsquerda",
	Position = UDim2.new(0, 16, 0, 8),
	Size = UDim2.new(0.55, -24, 1, -16),
	BackgroundTransparency = 1,
}, corpo)
Novo("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }, colunaEsquerda)

local colunaDireita = Novo("Frame", {
	Name = "ColunaDireita",
	Position = UDim2.new(0.55, 8, 0, 8),
	Size = UDim2.new(0.45, -24, 1, -16),
	BackgroundTransparency = 1,
}, corpo)
Novo("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }, colunaDireita)

-- --- Coluna esquerda: busca, resultados, equipados ---------------------
Novo("TextLabel", {
	LayoutOrder = 1, BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 20),
	Font = FONTE_MEDIA, TextSize = 14, TextColor3 = CORES.textoPrimario,
	TextXAlignment = Enum.TextXAlignment.Left, Text = "Buscar item gratuito",
}, colunaEsquerda)

local linhaBusca = Novo("Frame", {
	LayoutOrder = 2, BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 34),
}, colunaEsquerda)
caixaBusca = Novo("TextBox", {
	Size = UDim2.new(1, -96, 1, 0),
	BackgroundColor3 = CORES.fundo, BorderSizePixel = 0,
	Font = FONTE, TextSize = 14, TextColor3 = CORES.textoPrimario,
	PlaceholderText = "mínimo " .. TAMANHO_MIN_BUSCA .. " letras",
	PlaceholderColor3 = CORES.textoSecundario,
	ClearTextOnFocus = false, Text = "",
}, linhaBusca)
Novo("UICorner", { CornerRadius = UDim.new(0, 6) }, caixaBusca)
Novo("UIPadding", { PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10) }, caixaBusca)

botaoBuscar = Novo("TextButton", {
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim2.new(1, 0, 0, 0),
	Size = UDim2.new(0, 88, 1, 0),
	BackgroundColor3 = CORES.borda, BorderSizePixel = 0,
	Font = FONTE_MEDIA, TextSize = 14, TextColor3 = CORES.textoPrimario,
	Text = "Buscar",
}, linhaBusca)
Novo("UICorner", { CornerRadius = UDim.new(0, 6) }, botaoBuscar)

rotuloHintBusca = Novo("TextLabel", {
	LayoutOrder = 3, BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 16),
	Font = FONTE, TextSize = 11, TextColor3 = CORES.textoSecundario,
	TextXAlignment = Enum.TextXAlignment.Left, Text = "",
}, colunaEsquerda)

local areaResultados = Novo("Frame", {
	LayoutOrder = 4, BackgroundColor3 = CORES.fundo, BorderSizePixel = 0,
	Size = UDim2.new(1, 0, 0, 220),
}, colunaEsquerda)
Novo("UICorner", { CornerRadius = UDim.new(0, 8) }, areaResultados)

rotuloEstadoResultados = Novo("TextLabel", {
	Name = "Estado",
	Size = UDim2.new(1, -20, 1, -20), Position = UDim2.new(0, 10, 0, 10),
	BackgroundTransparency = 1,
	Font = FONTE, TextSize = 13, TextColor3 = CORES.textoSecundario,
	TextWrapped = true, TextXAlignment = Enum.TextXAlignment.Left, TextYAlignment = Enum.TextYAlignment.Top,
	Text = "Busque um item pra começar.",
	Visible = true,
}, areaResultados)

gradeResultados = Novo("ScrollingFrame", {
	Name = "Grade",
	Size = UDim2.new(1, 0, 1, 0),
	BackgroundTransparency = 1, BorderSizePixel = 0,
	ScrollBarThickness = 6, ScrollBarImageColor3 = CORES.textoSecundario,
	AutomaticCanvasSize = Enum.AutomaticSize.Y,
	CanvasSize = UDim2.new(0, 0, 0, 0),
	Visible = false,
}, areaResultados)
Novo("UIPadding", {
	PaddingTop = UDim.new(0, 8), PaddingBottom = UDim.new(0, 8),
	PaddingLeft = UDim.new(0, 8), PaddingRight = UDim.new(0, 8),
}, gradeResultados)
Novo("UIGridLayout", {
	CellSize = UDim2.new(0, 118, 0, 116),
	CellPadding = UDim2.new(0, 8, 0, 8),
	SortOrder = Enum.SortOrder.LayoutOrder,
}, gradeResultados)

rotuloContagemEquipados = Novo("TextLabel", {
	LayoutOrder = 5, BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 20),
	Font = FONTE_MEDIA, TextSize = 14, TextColor3 = CORES.textoPrimario,
	TextXAlignment = Enum.TextXAlignment.Left, Text = "Equipados (0/" .. LIMITE_ITENS .. ")",
}, colunaEsquerda)

containerEquipados = Novo("ScrollingFrame", {
	Name = "Equipados",
	LayoutOrder = 6, Size = UDim2.new(1, 0, 0, 148),
	BackgroundColor3 = CORES.fundo, BorderSizePixel = 0,
	ScrollBarThickness = 6, ScrollBarImageColor3 = CORES.textoSecundario,
	AutomaticCanvasSize = Enum.AutomaticSize.Y,
	CanvasSize = UDim2.new(0, 0, 0, 0),
}, colunaEsquerda)
Novo("UICorner", { CornerRadius = UDim.new(0, 8) }, containerEquipados)
Novo("UIPadding", {
	PaddingTop = UDim.new(0, 6), PaddingBottom = UDim.new(0, 6),
	PaddingLeft = UDim.new(0, 8), PaddingRight = UDim.new(0, 8),
}, containerEquipados)
Novo("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }, containerEquipados)

-- --- Coluna direita: cores de corpo, efeito permanente, salvar ----------
Novo("TextLabel", {
	LayoutOrder = 1, BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 20),
	Font = FONTE_MEDIA, TextSize = 14, TextColor3 = CORES.textoPrimario,
	TextXAlignment = Enum.TextXAlignment.Left, Text = "Cor de corpo",
}, colunaDireita)

local blocoCores = Novo("Frame", {
	LayoutOrder = 2, BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 6 * 26 + 5 * 4),
}, colunaDireita)
Novo("UIListLayout", { Padding = UDim.new(0, 4), SortOrder = Enum.SortOrder.LayoutOrder }, blocoCores)
for indice, campo in ipairs(ORDEM_CAMPO_COR) do
	criarLinhaCor(blocoCores, campo)
end

Novo("TextLabel", {
	LayoutOrder = 3, BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 20),
	Font = FONTE_MEDIA, TextSize = 14, TextColor3 = CORES.textoPrimario,
	TextXAlignment = Enum.TextXAlignment.Left, Text = "Efeito permanente",
}, colunaDireita)

local linhaTipoEfeito = Novo("Frame", {
	LayoutOrder = 4, BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 30),
}, colunaDireita)
Novo("UIListLayout", {
	FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 6),
	SortOrder = Enum.SortOrder.LayoutOrder,
}, linhaTipoEfeito)
for indice, opcao in ipairs(OPCOES_TIPO_EFEITO) do
	local botaoTipo = Novo("TextButton", {
		LayoutOrder = indice,
		Size = UDim2.new(0, 78, 1, 0),
		BackgroundColor3 = CORES.fundo, BorderSizePixel = 0,
		Font = FONTE, TextSize = 12, TextColor3 = CORES.textoPrimario,
		Text = opcao.rotulo,
	}, linhaTipoEfeito)
	Novo("UICorner", { CornerRadius = UDim.new(0, 6) }, botaoTipo)
	botoesTipoEfeito[opcao.rotulo] = botaoTipo
	botaoTipo.MouseButton1Click:Connect(function()
		selecionarTipoEfeito(opcao.valor)
	end)
end

criarCampoHex(colunaDireita, "Cor", corEfeitoAtual, function(hex)
	corEfeitoAtual = hex or COR_EFEITO_PADRAO
	aplicarEfeitoPreview()
end).LayoutOrder = 5

local linhaIntensidade = Novo("Frame", {
	LayoutOrder = 6, BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 30),
}, colunaDireita)
Novo("UIListLayout", {
	FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 6),
	SortOrder = Enum.SortOrder.LayoutOrder,
}, linhaIntensidade)
for n = 1, 5 do
	local botaoIntensidade = Novo("TextButton", {
		LayoutOrder = n,
		Size = UDim2.new(0, 40, 1, 0),
		BorderSizePixel = 0,
		Font = FONTE_TITULO, TextSize = 13, TextColor3 = CORES.textoPrimario,
		Text = tostring(n),
	}, linhaIntensidade)
	Novo("UICorner", { CornerRadius = UDim.new(0, 6) }, botaoIntensidade)
	botoesIntensidade[n] = botaoIntensidade
	botaoIntensidade.MouseButton1Click:Connect(function()
		selecionarIntensidade(n)
	end)
end

Novo("TextLabel", {
	LayoutOrder = 7, BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 20),
	Font = FONTE_MEDIA, TextSize = 14, TextColor3 = CORES.textoPrimario,
	TextXAlignment = Enum.TextXAlignment.Left, Text = "Salvar look",
}, colunaDireita)

caixaNomeLook = Novo("TextBox", {
	LayoutOrder = 8, Size = UDim2.new(1, 0, 0, 30),
	BackgroundColor3 = CORES.fundo, BorderSizePixel = 0,
	Font = FONTE, TextSize = 14, TextColor3 = CORES.textoPrimario,
	PlaceholderText = "Nome do look", PlaceholderColor3 = CORES.textoSecundario,
	ClearTextOnFocus = false, Text = "",
}, colunaDireita)
Novo("UICorner", { CornerRadius = UDim.new(0, 6) }, caixaNomeLook)
Novo("UIPadding", { PaddingLeft = UDim.new(0, 10), PaddingRight = UDim.new(0, 10) }, caixaNomeLook)

Novo("TextLabel", {
	LayoutOrder = 9, BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 16),
	Font = FONTE, TextSize = 11, TextColor3 = CORES.textoSecundario,
	TextXAlignment = Enum.TextXAlignment.Left,
	Text = "Reserva (fallback) — some se um item sair do catálogo:",
}, colunaDireita)

containerFallback = Novo("ScrollingFrame", {
	Name = "Fallback",
	LayoutOrder = 10, Size = UDim2.new(1, 0, 0, 82),
	BackgroundColor3 = CORES.fundo, BorderSizePixel = 0,
	ScrollBarThickness = 6, ScrollBarImageColor3 = CORES.textoSecundario,
	AutomaticCanvasSize = Enum.AutomaticSize.Y,
	CanvasSize = UDim2.new(0, 0, 0, 0),
}, colunaDireita)
Novo("UICorner", { CornerRadius = UDim.new(0, 8) }, containerFallback)
Novo("UIPadding", {
	PaddingTop = UDim.new(0, 6), PaddingBottom = UDim.new(0, 6),
	PaddingLeft = UDim.new(0, 8), PaddingRight = UDim.new(0, 8),
}, containerFallback)
Novo("UIListLayout", { Padding = UDim.new(0, 4), SortOrder = Enum.SortOrder.LayoutOrder }, containerFallback)

Novo("TextLabel", {
	LayoutOrder = 11, BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 30),
	Font = FONTE, TextSize = 11, TextColor3 = CORES.textoSecundario, TextWrapped = true,
	Text = "Trocar de look não aplica no meio da partida: só no início da sessão ou no próximo respawn de checkpoint.",
}, colunaDireita)

botaoSalvar = Novo("TextButton", {
	LayoutOrder = 12, Size = UDim2.new(1, 0, 0, 38),
	BackgroundColor3 = Tokens.estado.ok, BorderSizePixel = 0,
	Font = FONTE_TITULO, TextSize = 15, TextColor3 = Color3.new(1, 1, 1),
	Text = "Salvar look",
}, colunaDireita)
Novo("UICorner", { CornerRadius = UDim.new(0, 8) }, botaoSalvar)

rotuloEstadoSalvar = Novo("TextLabel", {
	LayoutOrder = 13, BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 18),
	Font = FONTE, TextSize = 12, TextColor3 = CORES.textoSecundario, TextWrapped = true,
	Text = "", Visible = false,
}, colunaDireita)

-- ============================================================================
-- Wiring final (só agora as instâncias acima existem de verdade)
-- ============================================================================
botaoAlternarVestiario.MouseButton1Click:Connect(tentarAbrirVestiario)
botaoBuscar.MouseButton1Click:Connect(executarBusca)
caixaBusca.FocusLost:Connect(function(enterPressionado)
	if enterPressionado then
		executarBusca()
	end
end)
botaoSalvar.MouseButton1Click:Connect(executarSalvar)

UserInputService.InputBegan:Connect(function(input, processado)
	if processado then
		return
	end
	if UserInputService:GetFocusedTextBox() then
		return
	end
	if input.KeyCode == TECLA_ATALHO then
		tentarAbrirVestiario()
	end
end)

-- Estado inicial das listas (sem isso a tela abre com os placeholders do
-- construtor, que já cobrem "vazio", mas isto garante que os rótulos batem
-- com o estado real assim que o vestiário for aberto pela primeira vez).
renderizarEquipados()
restilizarBotoesTipoEfeito()
restilizarBotoesIntensidade()
