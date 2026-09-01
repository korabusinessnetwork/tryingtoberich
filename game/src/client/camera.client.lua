--!strict
-- Camera do jogo — formato vertical, ver docs/02_DESIGN_SYSTEM secao B e
-- Eventos.CAMERA / Eventos.TREMOR em shared/eventos.lua.
--
-- O streamer joga o parkour de verdade e olha o proprio jogo: esta camera
-- PRECISA continuar jogavel o tempo todo, porque e literalmente a visao de
-- quem esta pulando. Por isso o desenho separa dois regimes bem diferentes:
--
-- 1. Enquadramento base (o tempo todo): fica em CameraType.Custom, a camera
--    padrao do Roblox, e so ajusta Humanoid.CameraOffset (eleva o ponto de
--    mira) e Camera.FieldOfView (abre um pouco) pra sobrar mais torre visivel
--    acima do boneco. Reescrever a camera de terceira pessoa do zero —
--    colisao com parede, suavizacao, mouse-look — e um subsistema inteiro
--    fora do escopo daqui, e uma versao propria quebrada tira o jogo de
--    quem esta jogando ao vivo. Ajustar os dois parametros que a camera
--    padrao ja le e o jeito seguro de chegar perto do enquadramento pedido.
--
-- 2. Afastar (Eventos.CAMERA, peso visual 4/5): aqui sim a camera toma
--    controle de verdade (CameraType.Scriptable) pra fazer um afastamento
--    real (a camera se desloca no espaco, nao so abre a lente) — e
--    seguro fazer isso porque o servidor so manda este evento junto com uma
--    animacao que ja ancorou o boneco (ver server/movimento.lua): o
--    streamer nao tem nada pra controlar bem nesse instante mesmo. Cada
--    tomada de controle tem uma geracao propria e um watchdog independente
--    do RenderStepped, igual ao R11 do servidor: se a camera ficar presa em
--    Scriptable, ela nunca mais devolve o jogo pro streamer, e trava a live
--    de um jeito que so um restart resolve.
--
-- Tremor (Eventos.TREMOR) NAO toma a camera: sacode Humanoid.CameraOffset
-- por cima do enquadramento base, porque a camera padrao le esse valor
-- sozinha a cada frame. Escrever CFrame por fora enquanto CameraType e
-- Custom so entraria em disputa com o script interno do Roblox, que
-- tambem mexe no CFrame todo frame — os dois nunca devem escrever o
-- mesmo alvo ao mesmo tempo.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Eventos = require(Compartilhado.eventos)

local jogador = Players.LocalPlayer
local camera = workspace.CurrentCamera

local ZERO = Vector3.new(0, 0, 0)

-- Enquadramento base: eleva o ponto de mira e abre a lente pra sobrar mais
-- torre visivel acima do boneco. Ponto de partida razoavel pra ajuste manual
-- no Studio; nao ha como validar o "certo" fora do editor.
local OFFSET_BASE = Vector3.new(0, 3, 0)
local FOV_BASE = 78

-- Afastar: distancia e altura minimas (presentes desde o primeiro frame do
-- efeito, progresso 0) mais o quanto ainda soma no pico. A base existe pra
-- nunca deixar posicao da camera colada no ponto de mira: CFrame.new(pos,
-- lookAt) com os dois pontos iguais (ou quase) da uma direcao de olhar quase
-- zero, e o resultado fica instavel. Com uma base sempre presente, a camera
-- nunca fica a distancia zero do alvo, em nenhum frame.
local DISTANCIA_BASE = 10
local DISTANCIA_EXTRA = 14
local ALTURA_BASE = 4
local ALTURA_EXTRA = 6
local ALTURA_MIRA = 3
-- Fracao da duracao gasta entrando e saindo do afastamento, pra nao ser um
-- corte seco. O meio fica no pico.
local FRACAO_TRANSICAO = 0.25

-- Tremor: teto em studs, pra intensidade 5 nao jogar a camera pra fora do mapa.
local TREMOR_MAX = 1.2

-- Sobra do watchdog sobre a duracao pedida pelo servidor. Mesmo valor e
-- mesma razao do FOLGA_WATCHDOG de server/movimento.lua.
local FOLGA_WATCHDOG = 1

local NOME_BIND = "KoraCameraEfeitos"

--[[
	Duas geracoes separadas, uma por efeito. Se fosse uma so, um tremor
	comecando no meio de um afastamento invalidaria o watchdog do afastamento
	(e vice-versa), e o efeito mais antigo perderia a propria rede de
	seguranca so por coincidir no tempo com o outro. Mesma ideia da geracao em
	server/movimento.lua, aplicada duas vezes porque aqui sao dois "controles"
	independentes, nao um so.
]]
local estado = {
	conectado = false,

	afastarAtivo = false,
	geracaoAfastar = 0,
	afastarInicio = 0,
	afastarDuracao = 0,
	direcaoAfastar = Vector3.new(0, 0, -1),

	tremorAtivo = false,
	geracaoTremor = 0,
	tremorFim = 0,
	tremorDuracao = 0,
	tremorIntensidade = 0,
}

-- HumanoidRootPart e Humanoid do personagem atual, ou nil. Chamada do
-- caminho quente (roda a cada frame com efeito ativo): nunca usa
-- WaitForChild, só devolve nil e deixa quem chamou pular o frame.
local function pecas()
	local personagem = jogador.Character
	if not personagem then
		return nil, nil
	end
	return personagem:FindFirstChild("HumanoidRootPart"), personagem:FindFirstChildOfClass("Humanoid")
end

--[[ Reaplica o enquadramento padrao. Idempotente de proposito: chamada pelo
	fim normal do efeito, pelo watchdog e pelo respawn, e as tres podem
	disputar a mesma corrida. ]]
local function aplicarEnquadramentoBase()
	camera.CameraType = Enum.CameraType.Custom
	camera.FieldOfView = FOV_BASE
	local _, humanoid = pecas()
	if humanoid then
		camera.CameraSubject = humanoid
		humanoid.CameraOffset = OFFSET_BASE
	end
end

local function pararConexao()
	if estado.conectado then
		RunService:UnbindFromRenderStep(NOME_BIND)
		estado.conectado = false
	end
end

--[[ Fim de qualquer efeito, por qualquer motivo: desliga o laco por frame (se
	nao tiver mais nada pra atualizar) e devolve a camera padrao. ]]
local function finalizarEfeitos()
	pararConexao()
	aplicarEnquadramentoBase()
end

local function garantirConexao(passo)
	if not estado.conectado then
		RunService:BindToRenderStep(NOME_BIND, Enum.RenderPriority.Camera.Value - 1, passo)
		estado.conectado = true
	end
end

-- Direcao horizontal (sem componente vertical) de pra onde a camera estava
-- olhando no instante em que o afastamento comecou. Fica congelada por todo
-- o efeito de proposito: se seguisse a rotacao do boneco durante o pulo, o
-- afastamento giraria junto e ficaria enjoativo de assistir.
local function direcaoHorizontalAtual()
	local look = camera.CFrame.LookVector
	local plano = Vector3.new(look.X, 0, look.Z)
	if plano.Magnitude < 0.001 then
		return Vector3.new(0, 0, -1)
	end
	return plano.Unit
end

-- Envelope 0..1: sobe nos primeiros FRACAO_TRANSICAO da duracao, segura no
-- pico, desce nos ultimos FRACAO_TRANSICAO. Sem isso o afastamento entra e
-- sai num corte seco, que le como um glitch em vez de uma decisao de camera.
local function progressoAfastar(decorrido, duracao)
	local transicao = math.max(duracao * FRACAO_TRANSICAO, 0.05)
	if decorrido < transicao then
		return decorrido / transicao
	end
	local restante = duracao - decorrido
	if restante < transicao then
		return math.max(restante / transicao, 0)
	end
	return 1
end

-- Sacudida do instante: decai linearmente ate zero conforme o tremor se
-- aproxima do fim, pra nao parar de repente.
local function calcularSacudida(agora)
	if not estado.tremorAtivo then
		return ZERO
	end
	local restante = estado.tremorFim - agora
	local fator = math.max(math.min(restante / math.max(estado.tremorDuracao, 0.01), 1), 0)
	local forca = TREMOR_MAX * math.min(estado.tremorIntensidade / 5, 1) * fator
	return Vector3.new(
		(math.random() * 2 - 1) * forca,
		(math.random() * 2 - 1) * forca,
		(math.random() * 2 - 1) * forca * 0.4
	)
end

local function atualizarTemporizadores(agora)
	if estado.tremorAtivo and agora >= estado.tremorFim then
		estado.tremorAtivo = false
	end
	if estado.afastarAtivo and agora >= estado.afastarInicio + estado.afastarDuracao then
		estado.afastarAtivo = false
		-- Sai do Scriptable NA HORA, nao so quando os dois efeitos acabarem:
		-- se o tremor continuar sozinho, ele precisa da camera padrao de
		-- volta pra o CameraOffset voltar a fazer diferenca.
		camera.CameraType = Enum.CameraType.Custom
	end
end

local function passoCamera()
	local ok, erro = pcall(function()
		local agora = os.clock()
		atualizarTemporizadores(agora)

		if not estado.afastarAtivo and not estado.tremorAtivo then
			finalizarEfeitos()
			return
		end

		local raiz, humanoid = pecas()
		if not raiz then
			finalizarEfeitos()
			return
		end

		local sacode = calcularSacudida(agora)

		if estado.afastarAtivo then
			local progresso = progressoAfastar(agora - estado.afastarInicio, estado.afastarDuracao)
			local foco = raiz.Position + Vector3.new(0, ALTURA_MIRA, 0)
			local posicao = foco
				- (estado.direcaoAfastar * (DISTANCIA_BASE + DISTANCIA_EXTRA * progresso))
				+ Vector3.new(0, ALTURA_BASE + ALTURA_EXTRA * progresso, 0)
				+ sacode
			camera.CFrame = CFrame.new(posicao, foco)
		elseif humanoid then
			humanoid.CameraOffset = OFFSET_BASE + sacode
		end
	end)
	if not ok then
		warn("[Kora] passo de camera falhou: " .. tostring(erro))
	end
end

local function iniciarAfastar(duracao)
	estado.geracaoAfastar = estado.geracaoAfastar + 1
	local minhaGeracao = estado.geracaoAfastar

	estado.afastarDuracao = math.max(tonumber(duracao) or 1, 0.05)
	estado.afastarInicio = os.clock()
	estado.direcaoAfastar = direcaoHorizontalAtual()
	estado.afastarAtivo = true
	camera.CameraType = Enum.CameraType.Scriptable

	garantirConexao(passoCamera)

	-- Watchdog independente do laco por frame: se o RenderStepped por algum
	-- motivo parar de rodar, isto devolve a camera do mesmo jeito que o R11
	-- devolve o boneco. Camera presa em Scriptable e tao grave quanto boneco
	-- ancorado pra sempre — ninguem mais ve o jogo direito.
	task.delay(estado.afastarDuracao + FOLGA_WATCHDOG, function()
		if estado.geracaoAfastar == minhaGeracao and estado.afastarAtivo then
			warn("[Kora] watchdog de camera devolveu o enquadramento (afastar)")
			estado.afastarAtivo = false
			estado.tremorAtivo = false
			finalizarEfeitos()
		end
	end)
end

local function iniciarTremor(intensidade, duracao)
	estado.geracaoTremor = estado.geracaoTremor + 1
	local minhaGeracao = estado.geracaoTremor

	estado.tremorDuracao = math.max(tonumber(duracao) or 0.3, 0.05)
	estado.tremorIntensidade = tonumber(intensidade) or 1
	estado.tremorFim = os.clock() + estado.tremorDuracao
	estado.tremorAtivo = true

	garantirConexao(passoCamera)

	task.delay(estado.tremorDuracao + FOLGA_WATCHDOG, function()
		if estado.geracaoTremor == minhaGeracao and estado.tremorAtivo then
			estado.afastarAtivo = false
			estado.tremorAtivo = false
			finalizarEfeitos()
		end
	end)
end

-- ===== respawn e troca de camera =====

local function aoPersonagemAdicionado(personagem)
	-- Personagem novo invalida qualquer efeito em andamento: a raiz antiga
	-- nao existe mais. Esperar o watchdog (ate +1s) deixaria a camera presa
	-- num enquadramento velho bem na hora do respawn.
	estado.geracaoAfastar = estado.geracaoAfastar + 1
	estado.geracaoTremor = estado.geracaoTremor + 1
	estado.afastarAtivo = false
	estado.tremorAtivo = false
	finalizarEfeitos()

	task.spawn(function()
		local humanoid = personagem:WaitForChild("Humanoid", 5)
		-- Confere se ainda e o personagem atual: um segundo respawn rapido
		-- nao pode deixar esta thread velha reaplicar por cima da nova.
		if humanoid and jogador.Character == personagem then
			aplicarEnquadramentoBase()
		end
	end)
end

jogador.CharacterAdded:Connect(aoPersonagemAdicionado)
if jogador.Character then
	aoPersonagemAdicionado(jogador.Character)
end

-- CurrentCamera pode ser trocada pelo motor em cenarios raros (ex.: certas
-- transicoes de respawn). Sem isto, o enquadramento base ficaria preso na
-- instancia de camera antiga.
workspace:GetPropertyChangedSignal("CurrentCamera"):Connect(function()
	camera = workspace.CurrentCamera
	aplicarEnquadramentoBase()
end)

aplicarEnquadramentoBase()

-- ===== eventos do servidor =====

local function conectar(nomeEvento, manipulador)
	local ok, remoto = pcall(Eventos.obter, nomeEvento)
	if not ok or not remoto then
		warn("[Kora] camera sem " .. tostring(nomeEvento) .. ": " .. tostring(remoto))
		return
	end
	remoto.OnClientEvent:Connect(manipulador)
end

conectar(Eventos.CAMERA, function(dados)
	if type(dados) == "table" and dados.afastar == true then
		iniciarAfastar(dados.duracao)
	end
end)

conectar(Eventos.TREMOR, function(dados)
	if type(dados) == "table" then
		iniciarTremor(dados.intensidade, dados.duracao)
	end
end)
