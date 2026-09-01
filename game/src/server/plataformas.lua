--!strict
--[[
	Rastreio de posição e checkpoint — R9, R10, ADR-008 (com a emenda do ADR-012).

	Este módulo é o dono de ONDE o boneco está. Ele nunca recebe posição de fora:
	a ponte manda `delta`, e a posição sai daqui (R9.1).

	Duas coisas movem `plataformaReferencia`, e só elas:
	  1. colisão real com uma plataforma (`Touched`), enquanto o streamer joga;
	  2. `definirReferencia`, decreto de quem resolveu o combate.

	Altura NUNCA move a referência. Um pulo longo passa por cima de dez
	plataformas sem encostar em nenhuma, e contar isso como progresso entregaria
	de graça exatamente o que o espectador paga para ver (R9.2).

	Sobre o decreto e o combate: pelo ADR-008 o presente de descida redefine o
	checkpoint mesmo sem o boneco encostar no destino. Com o ADR-012 essa regra
	passou a valer sobre o RESULTADO da disputa, não sobre cada presente — então
	quem chama `definirReferencia` é o orquestrador, DEPOIS de fechar o combate,
	nunca este módulo e nunca por presente. Presente de subida não redefine por
	decreto nenhum: a referência anda sozinha quando o boneco encosta (R10.4).

	Escrito no subconjunto Lua 5.1, como `shared/tipos.lua`, para `luac5.1 -p`
	conseguir validar a sintaxe fora do Studio.
]]

local RunService = game:GetService("RunService")

local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Tipos = require(Compartilhado.tipos)

local Plataformas = {}

-- R10.2 inteiro: 2 plataformas de folga E queda contínua por mais de 0,4s. Os
-- dois ao mesmo tempo. Só a altura derrubaria pulo longo legítimo no vão entre
-- duas plataformas; só o tempo derrubaria quem pula parado no lugar.
local PLATAFORMAS_DE_FOLGA = 2
local TEMPO_MINIMO_QUEDA = 0.4

-- Boneco parado tem Vy oscilando em torno de zero, e `< 0` puro contaria esse
-- tremor como queda. Em queda real a gravidade passa de -70 studs/s bem antes
-- dos 0,4s, então -1 separa os dois casos com folga enorme.
local VELOCIDADE_DE_QUEDA = -1

-- Depois de reposicionar, o detector fica cego por um instante. Sem isso, um
-- checkpoint mal colocado (plataforma removida, spec torto) vira laço infinito
-- de respawn no meio da live.
local CARENCIA_POS_RESPAWN = 0.5

-- Zerar velocidade duas vezes na mesma linha não alcança o momento que a física
-- aplica no passo seguinte. Estes frames extras são o mesmo cuidado do ADR-005,
-- só que estendido para depois do teleporte.
local FRAMES_DE_ASSENTAMENTO = 2

local FOLGA_DE_POUSO = 0.5
-- Rig R6 reporta HipHeight 0; sem piso, o boneco nasceria dentro da plataforma
-- e a física o cuspiria para o lado.
local ALTURA_MINIMA_DE_POUSO = 3

local ESPACAMENTO_PADRAO = 5
local ESPERA_DO_PERSONAGEM = 10

-- Mapa
local totalPlataformas = 0
local espacamentoVertical = ESPACAMENTO_PADRAO
local porIndice = {}
local ordenadas = {}

-- Corrida (sobrevive a respawn do personagem; só `iniciar` zera)
local plataformaReferencia = Tipos.PLATAFORMA_MIN
local plataformaMaxima = Tipos.PLATAFORMA_MIN
local quedasNaturais = 0

-- Acompanhamento do personagem
local personagemAtual = nil
local humanoidAtual = nil
local raizAtual = nil
local partesDoPersonagem = {}
local conexoes = {}
local toquePendente = nil
local detectorSuspenso = false
local tempoCaindo = 0
local carencia = 0
local assentamentos = 0
local ouvintes = {}

local function registrar(conexao)
	conexoes[#conexoes + 1] = conexao
end

local function notificar()
	if #ouvintes == 0 then
		return
	end
	local estado = {
		plataformaReferencia = plataformaReferencia,
		plataformaMaxima = plataformaMaxima,
		quedasNaturais = quedasNaturais,
	}
	for i = 1, #ouvintes do
		-- Ouvinte com erro não pode derrubar o Heartbeat: sem detector de queda
		-- a live continua, mas com o boneco preso no vazio.
		local ok, err = pcall(ouvintes[i], estado)
		if not ok then
			warn("[Kora][plataformas] ouvinte falhou: " .. tostring(err))
		end
	end
end

local function entradaDe(indice)
	if not Tipos.ehNumero(indice) then
		return nil
	end
	local alvo = Tipos.limitarPlataforma(math.floor(indice), totalPlataformas)
	local entrada = porIndice[alvo]
	if entrada then
		return entrada
	end
	-- Índice sem plataforma (mapa esparso, ou base numerada a partir de 1 com o
	-- piso do R6 em 0): cai na existente mais próxima. Respawn sem destino é
	-- live travada, e isso é pior que um checkpoint um degrau fora do ideal.
	local melhor = nil
	local distancia = math.huge
	for i = 1, #ordenadas do
		local d = math.abs(ordenadas[i].indice - alvo)
		if d < distancia then
			distancia = d
			melhor = ordenadas[i]
		end
	end
	return melhor
end

local function zerarMomento()
	if not raizAtual then
		return
	end
	raizAtual.AssemblyLinearVelocity = Vector3.new()
	raizAtual.AssemblyAngularVelocity = Vector3.new()
end

local function registrarToque(indice)
	local alvo = Tipos.limitarPlataforma(indice, totalPlataformas)
	if alvo == plataformaReferencia then
		-- Parado em cima da plataforma o `Touched` repete sem parar. Sair aqui
		-- é o que impede o resto do servidor de receber notificação por frame.
		return
	end
	plataformaReferencia = alvo
	if alvo > plataformaMaxima then
		-- Só estatística (R9.4). Nunca vira destino de nada.
		plataformaMaxima = alvo
	end
	-- Referência nova é limiar de queda novo: o tempo acumulado foi medido
	-- contra outra altura e não vale mais.
	tempoCaindo = 0
	notificar()
end

--[[
	Sequência do ADR-008, e a ordem importa: zerar velocidade, posicionar,
	zerar de novo. O segundo zero existe porque o momento residual lança o
	boneco no primeiro frame depois do teleporte — o mesmo problema que o
	ADR-005 descreve na saída do Tween.

	O passo "devolver controle" não aparece aqui porque este módulo nunca tira:
	queda natural acontece com o boneco em física normal, e o teleporte não
	ancora nada. Se a raiz está ancorada, o dono do movimento está no comando e
	quem sai é o detector, não o Tween.
]]
local function reposicionar(motivo, contarComoQueda)
	if not personagemAtual or not raizAtual then
		return false
	end
	if raizAtual.Anchored then
		-- Raiz ancorada = alguém tomou o controle (animação, vestiário). Quem
		-- manda ali é o Tween, não este módulo. Ver F4b.4 e R11.
		tempoCaindo = 0
		return false
	end

	local destino = Plataformas.posicaoDePouso(plataformaReferencia)
	if not destino then
		warn("[Kora][plataformas] sem plataforma para o checkpoint " .. tostring(plataformaReferencia))
		tempoCaindo = 0
		return false
	end

	zerarMomento()
	-- Mantém só o giro horizontal: o tombo da queda deixaria o boneco deitado
	-- em cima do checkpoint.
	local _, giro = raizAtual.CFrame:ToEulerAnglesYXZ()
	personagemAtual:PivotTo(CFrame.new(destino) * CFrame.Angles(0, giro, 0))
	zerarMomento()
	assentamentos = FRAMES_DE_ASSENTAMENTO

	tempoCaindo = 0
	carencia = CARENCIA_POS_RESPAWN
	if contarComoQueda then
		quedasNaturais = quedasNaturais + 1
	end

	print(string.format(
		"[Kora][plataformas] checkpoint %d (%s)",
		plataformaReferencia,
		tostring(motivo or "sem motivo")
	))
	notificar()
	return true
end

local function passo(dt)
	if toquePendente ~= nil then
		local indice = toquePendente
		toquePendente = nil
		registrarToque(indice)
	end

	if assentamentos > 0 then
		assentamentos = assentamentos - 1
		zerarMomento()
	end

	if not raizAtual then
		return
	end

	if carencia > 0 then
		carencia = math.max(0, carencia - dt)
		tempoCaindo = 0
		return
	end

	-- F4b.4: se a queda acontece durante uma animação, quem manda é o Tween.
	-- Repare que o toque acima continua sendo processado: a referência precisa
	-- andar quando o boneco encosta no destino de uma subida (R10.4). O que
	-- fica suspenso é só o respawn.
	if detectorSuspenso or raizAtual.Anchored then
		tempoCaindo = 0
		return
	end

	local referencia = entradaDe(plataformaReferencia)
	if not referencia then
		tempoCaindo = 0
		return
	end

	local limite = referencia.posicao.Y - (PLATAFORMAS_DE_FOLGA * espacamentoVertical)
	if raizAtual.Position.Y < limite and raizAtual.AssemblyLinearVelocity.Y < VELOCIDADE_DE_QUEDA then
		tempoCaindo = tempoCaindo + dt
		if tempoCaindo > TEMPO_MINIMO_QUEDA then
			reposicionar("queda natural", true)
		end
	else
		tempoCaindo = 0
	end
end

--[[
	`mapa` é o spec (totalPlataformas, jumpHeight, plataformas.espacamentoVertical),
	`plataformas` é o array { indice, parte, posicao } do construtor de mapa, do
	menor para o maior. Zera o estado da corrida: mapa novo é sessão nova.
]]
function Plataformas.iniciar(mapa, plataformas)
	local spec = mapa
	if type(spec) ~= "table" then
		spec = {}
	end
	local valido, erro = Tipos.validarMapa(spec)
	if not valido then
		-- Aviso e segue. Quem barra spec inválido é quem baixou o spec; parar o
		-- rastreio aqui deixaria a live rodando sem checkpoint nenhum.
		warn("[Kora][plataformas] spec suspeito: " .. tostring(erro))
	end

	porIndice = {}
	ordenadas = {}
	local maior = Tipos.PLATAFORMA_MIN
	local menor = nil

	if type(plataformas) == "table" then
		for i = 1, #plataformas do
			local bruta = plataformas[i]
			if type(bruta) == "table" and Tipos.ehInteiro(bruta.indice) then
				local posicao = bruta.posicao
				if posicao == nil and bruta.parte then
					posicao = bruta.parte.Position
				end
				if posicao then
					local entrada = { indice = bruta.indice, parte = bruta.parte, posicao = posicao }
					porIndice[entrada.indice] = entrada
					ordenadas[#ordenadas + 1] = entrada
					if entrada.indice > maior then
						maior = entrada.indice
					end
					if menor == nil or entrada.indice < menor then
						menor = entrada.indice
					end
				end
			end
		end
	end

	if Tipos.ehInteiro(spec.totalPlataformas) and spec.totalPlataformas > 0 then
		totalPlataformas = spec.totalPlataformas
	else
		totalPlataformas = maior
	end

	espacamentoVertical = ESPACAMENTO_PADRAO
	local bloco = spec.plataformas
	if type(bloco) == "table" and Tipos.ehNumero(bloco.espacamentoVertical) and bloco.espacamentoVertical > 0 then
		espacamentoVertical = bloco.espacamentoVertical
	elseif #ordenadas >= 2 then
		-- Sem o spec, o limiar de queda sai da geometria que o construtor
		-- entregou. O ADR-009 mantém o espaçamento vertical constante, então a
		-- primeira diferença basta.
		local d = math.abs(ordenadas[2].posicao.Y - ordenadas[1].posicao.Y)
		if d > 0.01 then
			espacamentoVertical = d
		end
	end

	plataformaReferencia = Tipos.limitarPlataforma(menor or Tipos.PLATAFORMA_MIN, totalPlataformas)
	plataformaMaxima = plataformaReferencia
	quedasNaturais = 0
	tempoCaindo = 0
	carencia = 0
	assentamentos = 0
	toquePendente = nil

	-- Mapa novo, partes novas: as conexões de `Touched` antigas apontam para
	-- plataformas que não existem mais.
	local personagem = personagemAtual
	if personagem then
		Plataformas.acompanhar(personagem)
	end

	notificar()
	return totalPlataformas
end

--[[
	Liga o `Touched` das plataformas e o detector de queda. Seguro de chamar de
	novo (morte, troca de look): desliga o que estava ligado antes.
]]
function Plataformas.acompanhar(personagem)
	if not personagem then
		warn("[Kora][plataformas] acompanhar sem personagem")
		return false
	end

	Plataformas.pararDeAcompanhar()

	local raiz = personagem:FindFirstChild("HumanoidRootPart")
	if not raiz then
		raiz = personagem:WaitForChild("HumanoidRootPart", ESPERA_DO_PERSONAGEM)
	end
	local humanoid = personagem:FindFirstChildOfClass("Humanoid")
	if not raiz or not humanoid then
		warn("[Kora][plataformas] personagem sem HumanoidRootPart ou Humanoid: rastreio não ligou")
		return false
	end

	personagemAtual = personagem
	raizAtual = raiz
	humanoidAtual = humanoid

	-- Conjunto de partes do personagem para o handler de `Touched` decidir em
	-- uma busca de tabela se o toque interessa. `IsDescendantOf` no handler
	-- seria uma subida de árvore por contato, e contato acontece aos milhares.
	partesDoPersonagem = {}
	local descendentes = personagem:GetDescendants()
	for i = 1, #descendentes do
		if descendentes[i]:IsA("BasePart") then
			partesDoPersonagem[descendentes[i]] = true
		end
	end
	registrar(personagem.DescendantAdded:Connect(function(item)
		if item:IsA("BasePart") then
			partesDoPersonagem[item] = true
		end
	end))
	registrar(personagem.DescendantRemoving:Connect(function(item)
		partesDoPersonagem[item] = nil
	end))

	-- `Touched` dispara muito: por perna, por frame de contato, por plataforma.
	-- O handler anota o índice e sai. Quem trabalha é o Heartbeat, uma vez por
	-- frame, com o último toque anotado — que é a definição de "última
	-- plataforma que encostou" (R9.2).
	for i = 1, #ordenadas do
		local parte = ordenadas[i].parte
		if parte then
			local indice = ordenadas[i].indice
			registrar(parte.Touched:Connect(function(outra)
				if partesDoPersonagem[outra] then
					toquePendente = indice
				end
			end))
		end
	end

	registrar(humanoid.Died:Connect(function()
		-- A morte destrói o Model; seguir lendo a raiz daqui é ler lixo. Quem
		-- religa é o dono do personagem, chamando `acompanhar` de novo. A
		-- referência não se perde: respawn não custa progresso (R10.1).
		Plataformas.pararDeAcompanhar()
	end))

	registrar(RunService.Heartbeat:Connect(passo))
	return true
end

function Plataformas.pararDeAcompanhar()
	for i = 1, #conexoes do
		local conexao = conexoes[i]
		if conexao and conexao.Connected then
			conexao:Disconnect()
		end
	end
	conexoes = {}
	partesDoPersonagem = {}
	personagemAtual = nil
	humanoidAtual = nil
	raizAtual = nil
	toquePendente = nil
	tempoCaindo = 0
	assentamentos = 0
	-- Referência, máxima e quedas continuam de pé: quem zera é `iniciar`.
end

function Plataformas.referencia()
	return plataformaReferencia
end

function Plataformas.maxima()
	return plataformaMaxima
end

function Plataformas.quedas()
	return quedasNaturais
end

--[[
	Decreto de referência (ADR-008 regra 2, com a emenda do ADR-012). Chamado
	pelo ORQUESTRADOR depois de resolver o combate, sobre o resultado líquido,
	nunca por presente e nunca por este módulo. `motivo` só aparece no log.
]]
function Plataformas.definirReferencia(indice, motivo)
	if not Tipos.ehNumero(indice) then
		warn("[Kora][plataformas] definirReferencia com índice inválido: " .. tostring(indice))
		return plataformaReferencia
	end

	local alvo = Tipos.limitarPlataforma(math.floor(indice), totalPlataformas)
	plataformaReferencia = alvo
	if alvo > plataformaMaxima then
		plataformaMaxima = alvo
	end
	tempoCaindo = 0

	print(string.format(
		"[Kora][plataformas] referência = %d (%s)",
		alvo,
		tostring(motivo or "sem motivo")
	))
	notificar()
	return alvo
end

--[[
	Cala o detector durante animação (F4b.4). Quem chama é o orquestrador, no
	começo e no fim da tomada de controle. O rastreio de toque continua ligado.
]]
function Plataformas.suspenderDetector(suspenso)
	local novo = suspenso == true
	if novo == detectorSuspenso then
		return detectorSuspenso
	end
	detectorSuspenso = novo
	tempoCaindo = 0
	if not novo then
		-- Voltando do Tween o boneco ainda pode estar assentando no destino,
		-- descendo. Sem carência, o primeiro frame de volta viraria respawn.
		carencia = CARENCIA_POS_RESPAWN
	end
	return detectorSuspenso
end

--[[
	Posição da plataforma como o construtor entregou. Nil se o mapa ainda não
	foi iniciado.
]]
function Plataformas.posicaoDe(indice)
	local entrada = entradaDe(indice)
	if not entrada then
		return nil
	end
	return entrada.posicao
end

--[[
	Onde o boneco fica EM CIMA da plataforma — o centro da parte não serve para
	teleporte. Usado pelo respawn e disponível para quem precisa aterrissar
	alguém sem calcular altura de rig na mão.
]]
function Plataformas.posicaoDePouso(indice)
	local entrada = entradaDe(indice)
	if not entrada then
		return nil
	end

	local topo = entrada.posicao.Y
	if entrada.parte then
		topo = topo + (entrada.parte.Size.Y * 0.5)
	end

	local altura = ALTURA_MINIMA_DE_POUSO
	if humanoidAtual and raizAtual then
		altura = math.max(altura, humanoidAtual.HipHeight + (raizAtual.Size.Y * 0.5))
	end

	return Vector3.new(entrada.posicao.X, topo + altura + FOLGA_DE_POUSO, entrada.posicao.Z)
end

--[[
	Devolve o boneco ao checkpoint pela mesma sequência da queda, sem contar
	queda. Existe para o dono do personagem tratar morte e reentrada sem
	reimplementar o zera-posiciona-zera.
]]
function Plataformas.reposicionarNoCheckpoint(motivo)
	return reposicionar(motivo or "reposicionamento", false)
end

--[[
	Avisa a cada mudança de { plataformaReferencia, plataformaMaxima,
	quedasNaturais }. Devolve a função que cancela a inscrição.
]]
function Plataformas.aoMudar(callback)
	if type(callback) ~= "function" then
		warn("[Kora][plataformas] aoMudar recebeu algo que não é função")
		return function() end
	end
	ouvintes[#ouvintes + 1] = callback
	return function()
		for i = #ouvintes, 1, -1 do
			if ouvintes[i] == callback then
				table.remove(ouvintes, i)
			end
		end
	end
end

return Plataformas
