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

-- Teto de pontos que `caminhoEntre` devolve. A torre tem milhares de degraus e
-- um presente pode empurrar centenas de uma vez; amostrar é o que impede o
-- movimento de virar uma corrente de Tweens mais curtos que um frame. Quem
-- aperta mais este número, por duração, é o movimento.lua.
local MAX_PONTOS_DO_CAMINHO = 24
local ESPERA_DO_PERSONAGEM = 10

-- Mapa
local totalPlataformas = 0
local espacamentoVertical = ESPACAMENTO_PADRAO

--[[ Quanto recuar do CENTRO do degrau para achar chão de verdade.

	Na passarela os degraus se sobrepõem muito: com degrau de 20 e avanço de 2,
	o degrau 1 fica enterrado embaixo dos nove seguintes, e só a faixa de trás
	dele fica exposta. Pousar no centro põe o boneco DENTRO da rampa — foi assim
	que ele nasceu para fora da plataforma.

	Zero na escada, onde o degrau é livre e o centro é o melhor lugar. ]]
local recuoDePouso = 0
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

	--[[ Sem checkpoint, cai no PÉ da torre — nunca em lugar nenhum.

		A referência começa em 0, e não existe plataforma 0: `posicaoDePouso(0)`
		devolvia nada, este `return false` saía, e o boneco continuava caindo
		para sempre. Do lado de fora parecia que o checkpoint "não pegava".

		A referência agora nasce em 1 (`Sessao.subirMapa`), então o caso ficou
		raro — mas raro não é nunca: mapa recarregado no meio de uma queda, ou
		índice que sumiu, chegam aqui do mesmo jeito. Cair no primeiro degrau é
		pior que o checkpoint certo e MUITO melhor que cair no vazio. ]]
	local destino = Plataformas.posicaoDePouso(plataformaReferencia)
	if not destino and #ordenadas > 0 then
		local pe = ordenadas[1].indice
		warn(string.format(
			"[Kora][plataformas] sem checkpoint em %s; caindo no pé da torre (%s)",
			tostring(plataformaReferencia), tostring(pe)
		))
		destino = Plataformas.posicaoDePouso(pe)
		if destino then
			plataformaReferencia = pe
		end
	end
	if not destino then
		warn("[Kora][plataformas] torre sem plataforma nenhuma: não há para onde voltar")
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
					local entrada = {
						indice = bruta.indice,
						parte = bruta.parte,
						-- Todos os pedaços do degrau, para o `Touched`.
						partes = bruta.partes,
						-- Deslocamento do centro até onde dá para ficar de pé.
						-- No anel o centro é o FURO, e pousar ali é cair.
						pouso = bruta.pouso,
						posicao = posicao,
					}
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
	recuoDePouso = 0
	local bloco = spec.plataformas
	--[[ A faixa exposta do degrau, na passarela.

		O degrau tem `2 * raioBase` de tamanho e avança `variacaoHorizontal`; o
		que sobra descoberto é a faixa de trás, com a largura do avanço. O meio
		dela fica a (tamanho - avanço) / 2 atrás do centro, e é ali que há chão. ]]
	if type(bloco) == "table" and bloco.formato == "laje"
		and Tipos.ehNumero(bloco.raioBase) and Tipos.ehNumero(bloco.variacaoHorizontal) then
		recuoDePouso = math.max(0, (2 * bloco.raioBase - bloco.variacaoHorizontal) / 2)
	end

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
	--[[ TODOS os pedaços do degrau contam, não só o principal.

		Um degrau pode ser vários Parts: a rosquinha é um anel de 16 segmentos,
		a madeira são 5 tábuas. Ligar `Touched` só no primeiro faria o jogador
		pisar no anel e a referência não andar — e, pior, o detector de queda
		acharia que ele saiu da plataforma. ]]
	for i = 1, #ordenadas do
		local entrada = ordenadas[i]
		local pedacos = entrada.partes
		if type(pedacos) ~= "table" or #pedacos == 0 then
			pedacos = entrada.parte and { entrada.parte } or {}
		end

		for _, parte in ipairs(pedacos) do
			local indice = entrada.indice
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

--[[ O PÉ da torre: a menor plataforma que o construtor entregou.

	Não é `PLATAFORMA_MIN`. Aquele é o piso do CONTRATO — 0 quer dizer "abaixo
	da torre" e existe para o delta negativo ter onde parar. Plataforma 0 não
	existe no mundo, e mandar o boneco para lá é mandá-lo para lugar nenhum. ]]
function Plataformas.primeira()
	if #ordenadas == 0 then
		return Tipos.PLATAFORMA_INICIAL
	end
	local menor = ordenadas[1].indice
	for i = 2, #ordenadas do
		if ordenadas[i].indice < menor then
			menor = ordenadas[i].indice
		end
	end
	return menor
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
	R6 — volta a corrida ao pé da torre, por ordem do painel (ADR-013).

	Zera referência, máxima e quedas, e reposiciona pela MESMA sequência da
	queda natural (zera velocidade, posiciona, zera de novo), sem contar como
	queda: reiniciar não é o streamer tendo caído.

	O que este módulo NÃO faz é decidir quando reiniciar. Chegar ao topo não
	reinicia nada sozinho (R6): quem manda é o streamer, no painel, e a ordem
	atravessa a ponte. Aqui é só a execução.
]]
function Plataformas.reiniciarCorrida(motivo)
	local base = Tipos.PLATAFORMA_MIN
	if #ordenadas > 0 then
		-- O pé da torre é a menor plataforma que o construtor entregou, não o
		-- zero teórico: mapa numerado a partir de 1 não tem plataforma 0, e
		-- teleportar para ela cairia no vizinho mais próximo por sorte.
		base = ordenadas[1].indice
		for i = 2, #ordenadas do
			if ordenadas[i].indice < base then
				base = ordenadas[i].indice
			end
		end
	end

	plataformaReferencia = Tipos.limitarPlataforma(base, totalPlataformas)
	plataformaMaxima = plataformaReferencia
	quedasNaturais = 0
	tempoCaindo = 0

	-- `reposicionar` já notifica; quando ele não roda (personagem morto, raiz
	-- ancorada por animação) o estado acima mudou mesmo assim e o painel
	-- precisa ver. Por isso a notificação de reserva.
	if not reposicionar(motivo or "reinício pelo painel (R6)", false) then
		notificar()
	end

	return plataformaReferencia
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

	--[[ Dois deslocamentos, por motivos diferentes.

		`recuoDePouso` é da PASSARELA: os degraus se sobrepõem e o centro do
		primeiro fica enterrado sob os seguintes.

		`entrada.pouso` é da FORMA: a rosquinha tem furo no meio, e o centro
		dela não é chão nenhum. Vem do construtor, que é quem sabe o desenho. ]]
	local desvio = entrada.pouso
	if typeof(desvio) ~= "Vector3" then
		desvio = Vector3.new(0, 0, 0)
	end

	return Vector3.new(
		entrada.posicao.X - recuoDePouso + desvio.X,
		topo + altura + FOLGA_DE_POUSO,
		entrada.posicao.Z + desvio.Z
	)
end

--[[ Quanto o pouso recua do centro do degrau. Zero na escada. ]]
function Plataformas.recuoDePouso()
	return recuoDePouso
end

--[[
	Os pontos de pouso ENTRE duas plataformas, na ordem da viagem, terminando
	sempre no destino. `nil` quando não há viagem (mesma plataforma) ou quando o
	mapa ainda não foi iniciado.

	Existe porque a torre é uma espiral quadrada (ADR-009): a reta de um degrau
	ao outro corta o miolo da torre, e um presente de +100 leva o boneco pelo
	vazio em vez de pela escada. O passo 3 do ADR-005 é "ao longo do caminho" —
	este é o caminho.

	Amostra os degraus em passo constante, com teto em `MAX_PONTOS_DO_CAMINHO`:
	um delta de 180 não pode virar 180 trechos de 12ms, que dura menos que um
	frame e não desenha degrau nenhum. O destino entra SEMPRE, porque é o único
	ponto que o contrato com quem pagou exige.

	Devolve posição de POUSO e não o centro da parte: o boneco tem que rasar o
	tampo de cada degrau, não atravessar por dentro dele.
]]
function Plataformas.caminhoEntre(origem, destino, maxPontos)
	if not Tipos.ehNumero(origem) or not Tipos.ehNumero(destino) then
		return nil
	end

	local de = Tipos.limitarPlataforma(math.floor(origem), totalPlataformas)
	local ate = Tipos.limitarPlataforma(math.floor(destino), totalPlataformas)
	local degraus = math.abs(ate - de)
	if degraus == 0 then
		return nil
	end

	local teto = MAX_PONTOS_DO_CAMINHO
	if Tipos.ehNumero(maxPontos) and maxPontos >= 1 then
		teto = math.min(teto, math.floor(maxPontos))
	end

	local sentido = 1
	if ate < de then
		sentido = -1
	end

	local trechos = math.min(degraus, teto)
	local caminho = {}
	for i = 1, trechos do
		-- Arredonda a fração do percurso em vez de somar um passo fracionário:
		-- o acumulado erraria o último degrau por resto e o destino sairia uma
		-- plataforma fora do que a ponte prometeu.
		local indice = de + sentido * math.floor(((degraus * i) / trechos) + 0.5)
		local ponto = Plataformas.posicaoDePouso(indice)
		if ponto then
			caminho[#caminho + 1] = ponto
		end
	end

	if #caminho == 0 then
		return nil
	end
	return caminho
end

--[[
	O centro da face de CIMA da plataforma — onde cenário se apoia.

	`posicaoDePouso` responde outra pergunta (onde o boneco CABE em pé) e por
	isso soma a folga do rig. Apoiar uma peça naquela altura a deixa flutuando
	três studs acima do chão, que foi como o portal nasceu.
]]
function Plataformas.topoDe(indice)
	local entrada = entradaDe(indice)
	if not entrada then
		return nil
	end

	local topo = entrada.posicao.Y
	if entrada.parte then
		topo = topo + (entrada.parte.Size.Y * 0.5)
	end
	return Vector3.new(entrada.posicao.X, topo, entrada.posicao.Z)
end

--[[
	Quanto a caixa da parte alcança numa direção: a soma das projeções dos três
	meio-lados. Fórmula geral de propósito — a laje é girada para acompanhar a
	volta, e meia largura só serviria para degrau alinhado aos eixos.
]]
local function alcanceDaParte(parte, direcao)
	if not parte then
		return 0
	end
	local cf = parte.CFrame
	local tamanho = parte.Size
	return math.abs(direcao:Dot(cf.RightVector)) * tamanho.X * 0.5
		+ math.abs(direcao:Dot(cf.UpVector)) * tamanho.Y * 0.5
		+ math.abs(direcao:Dot(cf.LookVector)) * tamanho.Z * 0.5
end

--[[
	A beirada da plataforma voltada para o FIM do mapa:

	  { frente = <direção horizontal unitária>,
	    meiaExtensao = <studs do centro até a borda, no sentido da frente>,
	    meiaLargura = <studs do centro até a borda, de través> }

	Serve para apoiar cenário na borda em vez do meio — o portal usa isso para
	ficar atravessado no caminho em vez de nascer em cima do respawn, e para
	saber até onde pode crescer sem deixar os pilares no ar.

	A direção sai da diferença até a plataforma SEGUINTE, não da orientação da
	parte: no formato "disco" a parte não é girada e não tem frente nenhuma, e
	"para onde a torre vai" é literalmente onde está o próximo degrau. Sem
	seguinte (última plataforma, mapa de uma só) cai em +Z, a frente padrão do
	construtor.
]]
function Plataformas.beiradaDe(indice)
	local entrada = entradaDe(indice)
	if not entrada then
		return nil
	end

	local frente = Vector3.new(0, 0, 1)
	local seguinte = entradaDe(entrada.indice + 1)
	if seguinte then
		local delta = seguinte.posicao - entrada.posicao
		local plana = Vector3.new(delta.X, 0, delta.Z)
		if plana.Magnitude > 1e-3 then
			frente = plana.Unit
		end
	end

	-- De través é a frente girada 90 graus no plano do chão. A plataforma pode
	-- ser bem mais larga que funda (a laje é 2,2x), então são dois números.
	local lado = Vector3.new(-frente.Z, 0, frente.X)

	return {
		frente = frente,
		meiaExtensao = alcanceDaParte(entrada.parte, frente),
		meiaLargura = alcanceDaParte(entrada.parte, lado),
	}
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
