--!strict
-- Motor de movimento híbrido do ADR-005.
--
-- Física é o estado padrão: o streamer joga o parkour de verdade. O presente é
-- uma tomada de controle temporária. A troca de regime é o ponto mais frágil do
-- jogo — velocidade residual, ancoragem presa e colisão perdida nascem todas
-- aqui —, então cada passo do ciclo está explícito e na ordem do ADR.
--
-- Escrito no subconjunto Lua 5.1 (sem anotação de tipo, sem `+=`, sem
-- `continue`): é o que permite `luac5.1 -p` validar o jogo sem abrir o Studio.

local TweenService = game:GetService("TweenService")

local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Tipos = require(Compartilhado.tipos)
local Indice = require(Compartilhado.indiceAnimacoes)

-- Câmera é enfeite; entregar o movimento é contrato com quem pagou. Um erro
-- dentro de efeitos.lua não pode impedir o boneco de andar, por isso este
-- require é tolerante enquanto os outros dois são duros.
local Efeitos = nil
local moduloEfeitos = Compartilhado:FindFirstChild("efeitos")
if moduloEfeitos then
	local ok, resultado = pcall(require, moduloEfeitos)
	if ok then
		Efeitos = resultado
	else
		warn("[Kora] movimento segue sem efeitos: " .. tostring(resultado))
	end
end

local Movimento = {}

-- ADR-012: efeito curto entrega o delta sem tomar o controle pelo tempo cheio.
local DURACAO_CURTA = 0.25
-- R11.3: folga do watchdog sobre a duração da animação.
local FOLGA_WATCHDOG = 1
-- Peso visual 4 ou 5 afasta a câmera.
local PESO_CAMERA = 4
local ZERO = Vector3.new(0, 0, 0)

-- Chave fraca: personagem destruído no respawn não segura o estado dele.
local estados = setmetatable({}, { __mode = "k" })

local function pecas(personagem)
	if not personagem or typeof(personagem) ~= "Instance" then
		return nil, nil
	end
	return personagem:FindFirstChild("HumanoidRootPart"), personagem:FindFirstChildOfClass("Humanoid")
end

local function obterEstado(personagem)
	local estado = estados[personagem]
	if not estado then
		estado = { geracao = 0, ativo = false, conexoes = {} }
		estados[personagem] = estado
	end
	return estado
end

--[[
	Dispara o `aoTerminar` do ciclo, no máximo uma vez, fora desta thread.
	Callback de outro módulo não pode segurar nem derrubar a restauração.
]]
local function dispararTermino(estado)
	local callback = estado.aoTerminar
	estado.aoTerminar = nil
	if type(callback) ~= "function" then
		return
	end
	task.spawn(function()
		local ok, erro = pcall(callback)
		if not ok then
			warn("[Kora] aoTerminar falhou: " .. tostring(erro))
		end
	end)
end

local function cancelarTween(estado)
	local tween = estado.tween
	estado.tween = nil
	if tween then
		pcall(function()
			tween:Cancel()
		end)
	end
end

local function desconectar(estado)
	for i = #estado.conexoes, 1, -1 do
		pcall(function()
			estado.conexoes[i]:Disconnect()
		end)
		estado.conexoes[i] = nil
	end
end

--[[
	Passo 1 do ciclo, e também a R11.1: o presente arranca o boneco do ar na
	hora, sem esperar aterrissar. Seguro de chamar sozinho e com o personagem já
	removido.
]]
function Movimento.interromperPulo(personagem)
	local raiz, humanoid = pecas(personagem)
	if raiz then
		raiz.AssemblyLinearVelocity = ZERO
		raiz.AssemblyAngularVelocity = ZERO
	end
	if humanoid then
		-- Sem limpar a flag, o pulo pendente reaplica velocidade no frame
		-- seguinte e desfaz o passo 1.
		humanoid.Jump = false
		if humanoid:GetState() == Enum.HumanoidStateType.Jumping then
			humanoid:ChangeState(Enum.HumanoidStateType.Freefall)
		end
	end
end

--[[ Passos 2 do ciclo: ancorar e tirar o controle do jogador. ]]
local function tomarControle(estado, raiz, humanoid)
	if not estado.ativo then
		-- Só na primeira tomada. Um presente que substitui outro no meio
		-- guardaria os valores já zerados e devolveria o boneco parado para
		-- sempre.
		estado.original = {
			ancorada = raiz.Anchored,
			walkSpeed = humanoid.WalkSpeed,
			jumpPower = humanoid.JumpPower,
			jumpHeight = humanoid.JumpHeight,
			autoRotate = humanoid.AutoRotate,
			pulo = humanoid:GetStateEnabled(Enum.HumanoidStateType.Jumping),
		}
	end
	estado.ativo = true

	-- Sem tirar a propriedade de rede do cliente, ele continua simulando o
	-- personagem e a posição do Tween volta rubber-band. Erra em parte ancorada,
	-- então vem antes do Anchored e vai dentro de pcall.
	pcall(function()
		raiz:SetNetworkOwner(nil)
	end)
	raiz.Anchored = true

	humanoid.AutoRotate = false
	humanoid.WalkSpeed = 0
	humanoid.JumpPower = 0
	humanoid.JumpHeight = 0
	humanoid:SetStateEnabled(Enum.HumanoidStateType.Jumping, false)
	-- Estado Physics: a máquina de estados do Humanoid para de disputar a
	-- posição com o Tween.
	humanoid:ChangeState(Enum.HumanoidStateType.Physics)
end

--[[
	Passo 4 do ciclo, na ordem do ADR: posicionar, zerar velocidade de novo,
	desancorar, devolver o controle.

	Idempotente e tolerante a personagem morto ou já removido: Tween completo,
	watchdog, morte e substituição disputam este mesmo fim o tempo todo.
]]
local function finalizar(personagem, motivo)
	local estado = estados[personagem]
	if not estado or not estado.ativo then
		return
	end
	estado.ativo = false
	estado.motivo = motivo
	cancelarTween(estado)
	desconectar(estado)

	local original = estado.original or {}
	estado.original = nil

	local raiz, humanoid = pecas(personagem)
	if raiz then
		if estado.destino then
			raiz.CFrame = estado.destino
		end
		-- Zerar de novo não é redundância: sem isto o momento residual do Tween
		-- lança o boneco no primeiro frame depois de desancorar (ADR-005).
		raiz.AssemblyLinearVelocity = ZERO
		raiz.AssemblyAngularVelocity = ZERO
		raiz.Anchored = original.ancorada == true
		pcall(function()
			raiz:SetNetworkOwnershipAuto()
		end)
	end

	if humanoid then
		humanoid.WalkSpeed = original.walkSpeed or 16
		humanoid.JumpPower = original.jumpPower or 50
		humanoid.JumpHeight = original.jumpHeight or 7.2
		humanoid.AutoRotate = original.autoRotate ~= false
		humanoid:SetStateEnabled(Enum.HumanoidStateType.Jumping, original.pulo ~= false)
		if humanoid.Health > 0 then
			-- Tira do Physics: sem isto o Humanoid ignora o input do streamer
			-- mesmo já desancorado.
			humanoid:ChangeState(Enum.HumanoidStateType.Freefall)
		end
	end

	estado.destino = nil
	dispararTermino(estado)
end

--[[ Força devolver o controle. Idempotente. ]]
function Movimento.restaurar(personagem)
	finalizar(personagem, "manual")
end

function Movimento.emAnimacao(personagem)
	local estado = estados[personagem]
	return estado ~= nil and estado.ativo == true
end

--[[
	Roda o `executar` da animação fora do caminho do movimento.

	O `Indice.obter` mora aqui dentro de propósito: ele faz `require` do
	ModuleScript, e require pode ceder a thread. No caminho crítico isso atrasaria
	o primeiro frame de movimento, que é o que o Princípio nº1 protege. Animação
	que falta ou que explode vira warn — o boneco anda do mesmo jeito, porque o
	movimento é o contrato com quem pagou.
]]
local function tocarAnimacao(personagem, animacaoId, contexto)
	task.spawn(function()
		local animacao, erro = Indice.obter(animacaoId)
		if not animacao then
			warn("[Kora] animação indisponível (" .. tostring(erro) .. "), movimento segue")
			return
		end
		local ok, falha = pcall(animacao.executar, personagem, contexto)
		if not ok then
			warn("[Kora] animação " .. tostring(animacaoId) .. " falhou: " .. tostring(falha))
		end
	end)
end

--[[
	Aplica um presente: tomada de controle temporária até `posicaoDestino`.

	`aoTerminar` é chamado exatamente uma vez por chamada que devolveu ok, depois
	de o controle voltar — inclusive quando o fim veio do watchdog, da morte do
	personagem ou de outro presente ter substituído este.
]]
function Movimento.aplicar(personagem, opcoes)
	if type(opcoes) ~= "table" then
		return false, "opcoes ausente"
	end
	if typeof(opcoes.posicaoDestino) ~= "Vector3" then
		return false, "posicaoDestino tem que ser Vector3"
	end

	local raiz, humanoid = pecas(personagem)
	if not raiz or not humanoid then
		return false, "personagem sem HumanoidRootPart ou Humanoid"
	end
	if personagem.Parent == nil then
		return false, "personagem fora do workspace"
	end
	if humanoid.Health <= 0 then
		return false, "personagem morto"
	end

	local animacaoId = type(opcoes.animacaoId) == "string" and opcoes.animacaoId or nil
	local efeitoCurto = opcoes.efeitoCurto == true

	local duracao = DURACAO_CURTA
	if not efeitoCurto and animacaoId then
		duracao = Indice.duracao(animacaoId)
		if not Tipos.ehNumero(duracao) or duracao <= 0 then
			duracao = DURACAO_CURTA
		end
	end
	-- R11.2: o bloqueio de controle nunca passa do teto da biblioteca, mesmo se
	-- o índice vier com lixo.
	if duracao > Tipos.DURACAO_MAX then
		duracao = Tipos.DURACAO_MAX
	end

	local intensidade = opcoes.intensidade
	if not Tipos.ehNumero(intensidade) then
		intensidade = 1
	end
	intensidade = math.max(1, math.min(math.floor(intensidade), Tipos.INTENSIDADE_MAX))

	local estado = obterEstado(personagem)
	if estado.ativo then
		-- Presente durante animação normalmente vira combate (ADR-012) e não
		-- chega aqui; o que chega é o efeito curto do combate fechado por tempo.
		-- O destino novo é o cálculo mais recente sobre a plataforma de
		-- referência, então ele vence: cortar o movimento velho é melhor que
		-- descartar o delta de quem pagou. Não desancora no meio — a ancoragem
		-- passa direto de um ciclo para o outro, sem blip de física.
		cancelarTween(estado)
		desconectar(estado)
		dispararTermino(estado)
	end

	estado.geracao = estado.geracao + 1
	local geracao = estado.geracao
	estado.aoTerminar = type(opcoes.aoTerminar) == "function" and opcoes.aoTerminar or nil

	-- Passo 1: cancelar o movimento atual. Com o streamer no ar, é aqui que o
	-- pulo morre (R11.1).
	Movimento.interromperPulo(personagem)

	-- Passo 2.
	tomarControle(estado, raiz, humanoid)

	local subindo = opcoes.posicaoDestino.Y >= raiz.Position.Y
	estado.destino = CFrame.new(opcoes.posicaoDestino) * (raiz.CFrame - raiz.CFrame.Position)

	-- Armado antes do Tween e antes da animação, de propósito: o watchdog da
	-- R11.3 tem que valer justamente quando um dos dois nem chegou a existir.
	-- Ele não é cancelado no fim normal; a geração morta é que o desarma, porque
	-- `task.cancel` em thread já concluída erra e derrubaria a restauração.
	task.delay(duracao + FOLGA_WATCHDOG, function()
		local atual = estados[personagem]
		if not atual or atual.geracao ~= geracao or not atual.ativo then
			return
		end
		warn("[Kora] watchdog devolveu o controle: ciclo de " .. tostring(animacaoId) .. " não terminou sozinho")
		finalizar(personagem, "watchdog")
	end)

	-- Passo 3. A curva vem da direção do movimento e não do módulo da animação:
	-- carregar o módulo antes de tocar o Tween poria um `require` no caminho
	-- crítico. Subida desacelera no fim, descida acelera — é o que lê como
	-- lançamento e como queda.
	local info = TweenInfo.new(
		duracao,
		Enum.EasingStyle.Quad,
		subindo and Enum.EasingDirection.Out or Enum.EasingDirection.In
	)
	local tween = TweenService:Create(raiz, info, { CFrame = estado.destino })
	estado.tween = tween
	table.insert(estado.conexoes, tween.Completed:Connect(function()
		if estados[personagem] == estado and estado.geracao == geracao then
			finalizar(personagem, "tween")
		end
	end))
	tween:Play()

	-- O personagem pode morrer ou sumir no meio do Tween. Sem isto o estado
	-- ficaria ativo até o watchdog, e quem espera o `aoTerminar` ficaria preso.
	table.insert(estado.conexoes, humanoid.Died:Connect(function()
		if estado.geracao == geracao then
			finalizar(personagem, "morte")
		end
	end))
	table.insert(estado.conexoes, personagem.AncestryChanged:Connect(function(_, pai)
		if pai == nil and estado.geracao == geracao then
			finalizar(personagem, "removido")
		end
	end))

	if not efeitoCurto and animacaoId then
		local origem = Tipos.ehNumero(opcoes.plataformaOrigem) and opcoes.plataformaOrigem or 0
		local destino = Tipos.ehNumero(opcoes.plataformaDestino) and opcoes.plataformaDestino or origem
		tocarAnimacao(personagem, animacaoId, {
			delta = Tipos.ehNumero(opcoes.delta) and opcoes.delta or (destino - origem),
			intensidade = intensidade,
			plataformaOrigem = origem,
			plataformaDestino = destino,
			nomeDoador = opcoes.nomeDoador,
			presenteNome = opcoes.presenteNome,
		})

		if Efeitos and Indice.pesoVisual(animacaoId) >= PESO_CAMERA then
			pcall(Efeitos.afastarCamera, duracao)
		end
	end

	return true
end

return Movimento
