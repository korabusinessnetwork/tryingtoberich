--!strict
-- Ponte: fala com o servidor Node por HTTP. Único módulo do jogo que conhece
-- a rede — o resto do servidor só vê eventos já validados e funções de busca
-- que devolvem dado pronto para uso.
--
-- Ver docs/08_DECISOES/adr-002-ponte-long-poll.md: quem inicia a conexão é
-- sempre o Roblox (o HttpService não recebe chamada de fora), por isso o
-- laço de long-poll é o coração deste módulo. Se a "Questão em aberto"
-- daquele ADR se confirmar e o túnel sair de cena, nada muda aqui: a URL
-- configurada em ServerStorage já podia sempre ter sido
-- "http://127.0.0.1:8787", e este módulo nunca soube a diferença.
--
-- Escrito no subconjunto Lua 5.1 (sem anotação de tipo, sem `continue`, sem
-- `+=`), pelo mesmo motivo de tipos.lua: `luac5.1 -p` valida a sintaxe sem
-- precisar do Studio.

local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Compartilhado = ReplicatedStorage:WaitForChild("KoraCompartilhado")
local Tipos = require(Compartilhado.tipos)
local Configuracao = require(Compartilhado.configuracao)

local Ponte = {}

-- API pública:
-- Ponte.iniciar(opcoes) -> ok, erro
--   opcoes = {
--     aoEvento = function(evento) end,   -- evento JÁ validado por Tipos.validarEvento
--     aoConexao = function(online, detalhe) end,  -- opcional, para o HUD saber
--     aoComando = function(tipo) end,    -- ordem do painel, ver ADR-013
--   }
-- Ponte.parar()
-- Ponte.online() -> boolean
-- Ponte.buscarMapa() -> spec, erro
-- Ponte.buscarLook() -> look, erro
-- Ponte.buscarItensDoCatalogo(busca) -> itens, erro    -- GET /jogo/catalogo-itens?busca=
-- Ponte.salvarLook(lookId, look) -> ok, erro           -- PUT /jogo/looks/:lookId
-- Ponte.enviarEstado(estado)                            -- POST /jogo/estado, FIRE-AND-FORGET
-- Ponte.enviarFimDeRodada(resultado, vitorias, derrotas) -- POST /jogo/rodada, FIRE-AND-FORGET (ADR-014)

local BACKOFF_INICIAL = 1
local BACKOFF_MAXIMO = 30
local THROTTLE_ESTADO = 2

-- Teto de segurança contra laço livre. Com 0,5s, mesmo uma ponte respondendo
-- instantaneamente fica em 120 requisições por minuto, bem abaixo das ~500 que
-- o HttpService aceita por servidor. Só vale para volta sem evento entregue.
local PISO_ENTRE_VOLTAS = 0.5

--[[
	O teto de retenção da ponte, em segundos (F0-4).

	Espelha `longpollTimeoutMs` de `bridge/src/config.mjs`, e um teste em
	`test/jogo.test.mjs` compara os dois: divergência quebra no mesmo commit.
	É a lição do BUG-001 — constante duplicada em duas linguagens só é contrato
	se algum teste ler os dois lados.
]]
local TETO_DA_PONTE = 20

--[[
	A partir de quanto uma FALHA passa a ser lida como "o Roblox fechou a
	conexão ociosa", e não como erro de verdade.

	Metade do teto é folgado de propósito. Erro real de rede — conexão recusada,
	host desconhecido, token errado — volta em milissegundos, muito longe dessa
	linha. O que demora dez segundos e morre é conexão que estava aberta
	esperando, e essa é exatamente a que não pode virar backoff.
]]
local FRACAO_PARA_SER_TETO = 0.5

--[[
	Margem abaixo do teto observado. Se o Roblox fecha em 10s, pedimos 8: a
	volta ociosa passa a terminar em 204 limpo, do nosso lado, antes de o
	Roblox cortar. É isso que devolve o sinal de online durante live quieta.
]]
local FOLGA_ABAIXO_DO_TETO = 0.8

-- Estado do módulo. Não faz parte do contrato público — só Ponte.online()
-- expõe uma leitura dele.
local configuracao = nil
local rodando = false
local emExecucao = false
local estaOnline = false
-- A live da TikTok esta conectada? Vem na resposta de POST /jogo/estado, que e
-- o unico canal periodico ponte -> jogo que ja existia.
local liveConectada = false
local avisouHttpDesligado = false

local aoEvento = nil
local aoConexao = nil
local aoCombateAnulado = nil
local aoComando = nil

local cursorAtual = 0
local backoffAtual = BACKOFF_INICIAL

-- O teto que o Roblox realmente impôs, descoberto em execução. `nil` até a
-- primeira volta ociosa ser cortada. `tetoRelatado` guarda que o aviso já saiu:
-- ele é para o dono anotar o número, não para poluir o Output a cada volta.
local tetoObservado = nil
local tetoRelatado = false

local enviandoEstado = false
local ultimoEnvioEstado = 0
local ultimaReferenciaEstado = nil

--[[
	Chama uma função fornecida por quem usa a ponte (aoEvento, aoConexao) sem
	deixar um erro dela derrubar o laço de long-poll. A ponte é dona só da
	rede; um bug em outro módulo do servidor não pode tirar o jogo do ar.
]]
local function chamarComSeguranca(funcao, ...)
	if not funcao then
		return
	end
	local ok, erro = pcall(funcao, ...)
	if not ok then
		warn("[Ponte] callback do chamador falhou: " .. tostring(erro))
	end
end

--[[
	Só notifica e loga na transição, nunca a cada volta do laço: com o
	long-poll normal isso seria chamado a cada ciclo de sucesso e viraria
	ruído (é exatamente o "sem poluir o output em laço" da tarefa, aplicado
	de forma geral e não só ao aviso de HttpService).
]]
local function definirOnline(online, detalhe)
	if online == estaOnline then
		return
	end
	estaOnline = online
	if not online then
		warn("[Ponte] ficou offline: " .. tostring(detalhe))
	end
	chamarComSeguranca(aoConexao, online, detalhe)
end

--[[
	HttpService desligado é o único erro de rede que nenhum backoff resolve
	sozinho, por isso é o único que vira aviso de instrução. `avisouHttpDesligado`
	garante que sai uma vez só mesmo com o laço tentando de novo a cada backoff.
]]
local function avisarSeHttpDesligado(erro)
	if avisouHttpDesligado or type(erro) ~= "string" then
		return
	end
	if string.find(string.lower(erro), "not enabled", 1, true) then
		warn("[Ponte] HttpService desligado. Ligue em Game Settings -> Security -> Allow HTTP Requests.")
		avisouHttpDesligado = true
	end
end

-- JSON inválido não pode derrubar o laço: vira só "sem corpo utilizável".
local function decodificar(corpo)
	if corpo == nil or corpo == "" then
		return nil
	end
	local ok, dados = pcall(function()
		return HttpService:JSONDecode(corpo)
	end)
	if not ok then
		return nil
	end
	return dados
end

-- Contrato de erro comum a toda a API (docs/07_APIS, "Contrato de erro").
-- Cai no status cru quando o corpo não vier nesse formato.
local function mensagemDeErro(corpo, statusCode)
	if type(corpo) == "table" and type(corpo.mensagem) == "string" then
		return corpo.mensagem
	end
	return "status HTTP " .. tostring(statusCode)
end

--[[
	Chamada HTTP crua: monta URL e headers, roda dentro de pcall (ADR-002,
	notas de implementação: erro de rede não pode matar o laço) e devolve
	(statusCode, corpoDecodificado, erroDeTransporte).

	`erroDeTransporte` só vem preenchido quando a chamada nem saiu — token
	ausente, HttpService desligado, túnel fora do ar. Status HTTP de erro
	(401, 500...) chega normalmente em statusCode, para quem chamou decidir
	o que fazer: a mesma resposta "não é 200" significa coisas diferentes em
	rotas diferentes (204 é sucesso em /jogo/eventos, erro em todo o resto).
]]
--[[
	Carrega a config na primeira vez que alguém precisa dela.

	Sob demanda, e não só no `Ponte.iniciar`, por uma razão concreta: a ordem de
	`Sessao.iniciar` é buscar o mapa -> construir a torre -> ligar o laço de
	eventos, e essa ordem está certa (evento chegando antes da torre existir não
	tem onde ser aplicado). Só que quem preenchia a config era o ÚLTIMO passo,
	então o PRIMEIRO sempre falhava com "ponte não configurada" — em qualquer
	máquina, com a KoraConfig perfeitamente montada.

	Carregar aqui também faz a config ser reencontrada quando ela chega depois,
	que é o caso do Rojo sincronizando com o jogo já rodando.
]]
local function garantirConfiguracao()
	if configuracao then
		return true, nil
	end

	local carregada, erro = Configuracao.carregar()
	if not carregada then
		return false, erro
	end

	configuracao = carregada
	return true, nil
end

local function requisitar(metodo, caminho, corpoTabela)
	-- O erro sobe INTEIRO: antes virava "ponte não configurada" e a explicação
	-- de `Configuracao.carregar` — qual Folder ou StringValue falta — era jogada
	-- fora justamente na linha que o streamer ia ler.
	local temConfig, erroConfig = garantirConfiguracao()
	if not temConfig then
		return nil, nil, erroConfig
	end

	local opcoes = {
		Url = configuracao.url .. caminho,
		Method = metodo,
		Headers = {
			["X-Bridge-Token"] = configuracao.token,
			["Content-Type"] = "application/json",
		},
	}

	if corpoTabela ~= nil then
		local okCorpo, corpoJson = pcall(function()
			return HttpService:JSONEncode(corpoTabela)
		end)
		if not okCorpo then
			return nil, nil, "falha ao codificar corpo: " .. tostring(corpoJson)
		end
		opcoes.Body = corpoJson
	end

	local ok, respostaOuErro = pcall(function()
		return HttpService:RequestAsync(opcoes)
	end)

	if not ok then
		avisarSeHttpDesligado(respostaOuErro)
		return nil, nil, tostring(respostaOuErro)
	end

	local resposta = respostaOuErro
	return resposta.StatusCode, decodificar(resposta.Body), nil
end

--[[
	O laço do long-poll (ADR-002). Backoff só em erro de verdade: 204 é
	timeout limpo do servidor (a ponte segurou 20s e não tinha evento) e
	chama de novo na mesma hora — senão o long-poll vira polling lento por
	engano. 200 e 204 zeram o backoff, porque os dois provam que a ponte
	respondeu.
]]
--[[
	Uma volta ociosa foi cortada pelo Roblox. Guarda o número e avisa UMA vez.

	O aviso existe para o F0-4 sair de uma sessão normal, em vez de custar dez
	minutos de teste dedicado: o dono lê o número no Output e anota. Repetir a
	cada volta transformaria o Output em ruído durante a live inteira.
]]
local function registrarTeto(decorrido)
	if tetoObservado == nil or decorrido < tetoObservado then
		tetoObservado = decorrido
	end

	if tetoRelatado then
		return
	end
	tetoRelatado = true

	warn(string.format(
		"[Ponte] F0-4: o Roblox fecha o long-poll em ~%.1fs, antes dos %ds da ponte. "
			.. "Passando a pedir teto menor, e a volta ociosa volta a fechar limpa. "
			.. "Anote esse número em memory/learnings.md e no item F0-4.",
		decorrido,
		TETO_DA_PONTE
	))
end

--[[
	O sufixo `&teto=` da próxima requisição.

	Vazio enquanto não houver teto observado: sem número, o padrão da ponte é o
	certo. Com número, pede uma folga abaixo dele — a ponte faz clamp do outro
	lado, então um valor absurdo daqui não a obriga a nada.
]]
local function tetoPedido()
	if tetoObservado == nil then
		return nil
	end
	return math.max(1, math.floor(tetoObservado * FOLGA_ABAIXO_DO_TETO))
end

local function sufixoDeTeto()
	local pedido = tetoPedido()
	if pedido == nil then
		return ""
	end
	return "&teto=" .. tostring(pedido)
end

--[[
	Isto é mesmo o teto do Roblox, ou é a ponte pendurada?

	As duas coisas são "falha depois de espera longa", e antes da negociação não
	há como separá-las. DEPOIS da negociação, há: se pedimos 8s e a conexão
	ainda assim morre com 15s, a ponte não está honrando o pedido — ou não está
	respondendo. Isso é erro de verdade, e precisa voltar a marcar offline,
	senão o painel diz "Jogo online" com a live morta.

	É a única perda de observabilidade que o conserto do backoff introduziria, e
	fechá-la custa esta função.
]]
local function pareceTetoDoRoblox(decorrido)
	if decorrido < TETO_DA_PONTE * FRACAO_PARA_SER_TETO then
		return false
	end

	local pedido = tetoPedido()
	if pedido == nil then
		return true
	end

	return decorrido <= pedido * 1.5
end

local function cicloEventos()
	while rodando do
		local comecou = os.clock()
		local entregou = false
		local statusCode, corpo, erro = requisitar("GET", "/jogo/eventos?desde=" .. tostring(cursorAtual) .. sufixoDeTeto())

		-- Ponte.parar() pode ter sido chamado enquanto a linha acima estava
		-- presa em pé no long-poll (até 20s). Não processa nem dorme depois
		-- de mandado parar.
		if not rodando then
			break
		end

		if erro then
			--[[
				Falha DEPOIS de uma espera longa não é erro: é o Roblox fechando
				o long-poll ocioso antes do teto da ponte (F0-4).

				Tratar isso como erro — que era o comportamento até 2026-09-09 —
				fazia o backoff dobrar até 30 segundos numa live quieta, e o
				presente seguinte esperava por ele. Trinta vezes o orçamento
				inteiro do princípio nº 1, e só com a live parada, que é quando
				ninguém está olhando o painel.

				Não vira offline tampouco: conexão ociosa fechada não é prova de
				que a ponte caiu. O que a mantém honesta é a negociação — depois
				do primeiro corte pedimos um teto menor, as voltas ociosas voltam
				a terminar em 204, e o 204 é que afirma "está no ar".

				Erro de verdade — recusado, host desconhecido, token — volta em
				milissegundos e continua caindo no ramo de baixo.
			]]
			local decorrido = os.clock() - comecou
			if pareceTetoDoRoblox(decorrido) then
				registrarTeto(decorrido)
			else
				definirOnline(false, erro)
				task.wait(backoffAtual)
				backoffAtual = math.min(backoffAtual * 2, BACKOFF_MAXIMO)
			end
		elseif statusCode == 200 then
			definirOnline(true)
			backoffAtual = BACKOFF_INICIAL

			if type(corpo) ~= "table" then
				warn("[Ponte] resposta 200 sem corpo JSON válido")
			else
				if Tipos.ehInteiro(corpo.cursor) then
					cursorAtual = corpo.cursor
				else
					warn("[Ponte] resposta 200 sem cursor válido, cursor mantido")
				end

				if type(corpo.eventos) == "table" then
					for _, bruto in ipairs(corpo.eventos) do
						local evento, erroValidacao = Tipos.validarEvento(bruto)
						if evento then
							entregou = true
							chamarComSeguranca(aoEvento, evento)
						else
							warn("[Ponte] evento descartado: " .. tostring(erroValidacao))
						end
					end
				end

				--[[
					Comando do painel (ADR-013). Não é presente: não tem delta,
					não casa com slot e não veio de espectador nenhum.

					Processado ANTES dos anulados e DEPOIS dos eventos, na ordem
					em que o envelope os traz: reiniciar depois de um presente
					que já saiu é diferente de reiniciar antes dele, e o cursor
					único é o que preserva essa ordem.

					O TRANSPORTE não escolhe comando. Ele repassa tudo que tem
					um `tipo` de texto, e quem decide o que fazer é a sessão,
					que ignora o que não conhece.

					Isto aqui filtrava por `comando.tipo == "reiniciar"`, e o
					comentário dizia "só reiniciar existe hoje". Passaram a
					existir mais quatro — zerar-placar, recarregar-mapa, vitoria
					e derrota — e cada um foi tratado na sessão sem que ninguém
					lembrasse desta linha. Os três botões do painel e o vínculo
					de placar por presente saíam da ponte, chegavam no jogo e
					morriam aqui, sem erro, sem aviso, sem nada na tela.

					Tipo desconhecido continua ignorado em silêncio de propósito
					— uma ponte mais nova falando com um jogo mais velho não
					pode derrubar o laço — só que agora quem ignora é a sessão.
				]]
				if type(corpo.comandos) == "table" then
					for _, comando in ipairs(corpo.comandos) do
						if type(comando) == "table" and type(comando.tipo) == "string" then
							entregou = true
							-- `quantidade` vai junto: um donate de placar pode
							-- valer N rodadas (R4). Repassar só o tipo faria
							-- seis derrotas chegarem como uma, em silêncio.
							chamarComSeguranca(aoComando, comando.tipo, comando.quantidade)
						end
					end
				end

				-- Combate que se anulou (ADR-012). Não move o boneco — delta 0
				-- não existe no contrato — mas o HUD mostra, senão o empate lê
				-- como travamento. Vem em lista separada por isso mesmo.
				if type(corpo.anulados) == "table" then
					for _, anulado in ipairs(corpo.anulados) do
						if Tipos.ehInteiro(anulado.participantes) and anulado.participantes >= 2 then
							entregou = true
							chamarComSeguranca(aoCombateAnulado, {
								somaSubida = anulado.somaSubida,
								somaDescida = anulado.somaDescida,
								participantes = anulado.participantes,
							})
						end
					end
				end
			end
		elseif statusCode == 204 then
			-- Corpo vazio de propósito: nada para processar, só a prova de
			-- que a ponte está viva e não tinha evento para este cursor.
			definirOnline(true)
			backoffAtual = BACKOFF_INICIAL
		else
			definirOnline(false, mensagemDeErro(corpo, statusCode))
			task.wait(backoffAtual)
			backoffAtual = math.min(backoffAtual * 2, BACKOFF_MAXIMO)
		end

		--[[
			Piso entre voltas que não entregaram evento.

			O backoff acima só cobre erro. Uma ponte que responde na hora sem
			ter evento — long-poll mal configurado, 200 com corpo inválido,
			página de erro do túnel devolvida como 200 — faria este laço girar
			livre e estourar o teto de ~500 requisições por minuto do
			HttpService, e aí o Roblox recusa tudo e o jogo fica no escuro.

			Volta que ENTREGOU evento nunca espera: aí o cursor andou e pode
			haver mais coisa esperando, e latência é o Princípio nº1. O piso
			só morde quando não havia nada para entregar, então ele não custa
			um milissegundo de latência de presente.
		]]
		if rodando and not entregou then
			local decorrido = os.clock() - comecou
			if decorrido < PISO_ENTRE_VOLTAS then
				task.wait(PISO_ENTRE_VOLTAS - decorrido)
			end
		end
	end
	emExecucao = false
end

function Ponte.iniciar(opcoes)
	opcoes = opcoes or {}

	if emExecucao then
		return nil, "ponte já está rodando"
	end

	local temConfig, erroConfig = garantirConfiguracao()
	if not temConfig then
		return nil, erroConfig
	end

	aoEvento = opcoes.aoEvento
	aoConexao = opcoes.aoConexao
	aoCombateAnulado = opcoes.aoCombateAnulado
	aoComando = opcoes.aoComando

	cursorAtual = 0
	backoffAtual = BACKOFF_INICIAL
	avisouHttpDesligado = false
	estaOnline = false
	enviandoEstado = false
	ultimoEnvioEstado = 0
	ultimaReferenciaEstado = nil

	rodando = true
	emExecucao = true
	task.spawn(cicloEventos)

	return true
end

--[[
	Seguro de chamar duas vezes: `rodando` já começa em false, e definirOnline
	só dispara callback numa transição de verdade — a segunda chamada é
	sempre um no-op silencioso.
]]
function Ponte.parar()
	rodando = false
	definirOnline(false, "ponte parada")
end

function Ponte.online()
	return estaOnline
end

function Ponte.buscarMapa()
	local statusCode, corpo, erro = requisitar("GET", "/jogo/mapa")
	if erro then
		return nil, erro
	end
	if statusCode ~= 200 then
		return nil, mensagemDeErro(corpo, statusCode)
	end
	return Tipos.validarMapa(corpo)
end

function Ponte.buscarLook()
	local statusCode, corpo, erro = requisitar("GET", "/jogo/look")
	if erro then
		return nil, erro
	end
	if statusCode ~= 200 then
		return nil, mensagemDeErro(corpo, statusCode)
	end
	return Tipos.validarLook(corpo)
end

--[[
	Não existe Tipos.validarItemCatalogo, e a 07_APIS não fixa se a resposta
	vem como lista crua ou como { itens = [...] }. Aceita os dois formatos em
	vez de chutar um.
]]
function Ponte.buscarItensDoCatalogo(busca)
	local caminho = "/jogo/catalogo-itens"
	if type(busca) == "string" and #busca > 0 then
		caminho = caminho .. "?busca=" .. HttpService:UrlEncode(busca)
	end

	local statusCode, corpo, erro = requisitar("GET", caminho)
	if erro then
		return nil, erro
	end
	if statusCode ~= 200 then
		return nil, mensagemDeErro(corpo, statusCode)
	end
	if type(corpo) ~= "table" then
		return nil, "resposta de catálogo inválida"
	end
	if type(corpo.itens) == "table" then
		return corpo.itens
	end
	return corpo
end

--[[
	Não valida `look` contra Tipos.validarLook antes de enviar: quem monta o
	look é o vestiário (fora deste arquivo), a ponte só transporta — e é o
	lado Node quem valida contra o schema antes de gravar (07_APIS,
	PUT /jogo/looks/:lookId).
]]
function Ponte.salvarLook(lookId, look)
	if type(lookId) ~= "string" or #lookId == 0 then
		return false, "lookId inválido"
	end
	if type(look) ~= "table" then
		return false, "look inválido"
	end

	local statusCode, corpo, erro = requisitar("PUT", "/jogo/looks/" .. HttpService:UrlEncode(lookId), look)
	if erro then
		return false, erro
	end
	if statusCode ~= 200 then
		return false, mensagemDeErro(corpo, statusCode)
	end
	return true
end

--[[
	Throttle mora aqui dentro, não em quem chama (pedido explícito da
	tarefa). "A referência" é plataformaReferencia do payload de estado
	(07_APIS): trocar de plataforma é a mudança que o painel precisa ver na
	hora, o resto (emAnimacao, quedasNaturais...) pode esperar o próximo
	batimento de 2s. `enviandoEstado` evita duas requisições no ar ao mesmo
	tempo: se a de trás responder antes da da frente, o painel voltaria a
	mostrar estado velho por cima do novo.
]]
function Ponte.enviarEstado(estado)
	if type(estado) ~= "table" or enviandoEstado then
		return
	end

	local agora = os.clock()
	local referencia = estado.plataformaReferencia
	local mudouReferencia = referencia ~= ultimaReferenciaEstado

	if not mudouReferencia and (agora - ultimoEnvioEstado) < THROTTLE_ESTADO then
		return
	end

	ultimoEnvioEstado = agora
	ultimaReferenciaEstado = referencia
	enviandoEstado = true

	task.spawn(function()
		-- Fire-and-forget de verdade: o resultado não volta para quem
		-- chamou, e um erro aqui não deve mexer no online() do long-poll,
		-- que é o sinal que realmente importa para a latência do jogo.
		local statusCode, corpo = requisitar("POST", "/jogo/estado", estado)
		-- A resposta traz o estado da LIVE. Continua fire-and-forget: ninguém
		-- espera por isto, e uma falha aqui só deixa o valor como estava.
		if statusCode == 200 and type(corpo) == "table" then
			liveConectada = corpo.live == true
		end
		enviandoEstado = false
	end)
end

--[[
	Avisa a ponte que uma rodada acabou DE VERDADE (ADR-014).

	Separado de `enviarEstado` porque o estado é um instantâneo com throttle, e
	isto é um instante: a contagem da vitória zerou sem ser cancelada, ou o
	portal quebrou. É deste aviso que o overlay do OBS toca a cutscene — nunca
	do placar, que sobe no início da contagem.

	Fire-and-forget como o estado: um erro aqui não mexe no online() do
	long-poll, e ninguém espera a resposta.
]]
function Ponte.enviarFimDeRodada(resultado, vitorias, derrotas)
	if resultado ~= "vitoria" and resultado ~= "derrota" then
		return
	end
	task.spawn(function()
		requisitar("POST", "/jogo/rodada", {
			resultado = resultado,
			vitorias = vitorias,
			derrotas = derrotas,
		})
	end)
end

--[[ Os nicks que o streamer curou no painel. Lista curta, sem cache: ela muda
	quando ele acrescenta alguém, e uma galeria desatualizada seria pior que
	uma chamada a mais numa tela que não é caminho crítico. ]]
function Ponte.buscarGaleria()
	local statusCode, corpo, erro = requisitar("GET", "/jogo/galeria")
	if erro or statusCode ~= 200 or type(corpo) ~= "table" then
		return nil, erro or mensagemDeErro(corpo, statusCode)
	end
	return corpo.nicks or {}
end

--[[ A skin que a pessoa está usando agora, para vestir como base. ]]
function Ponte.buscarSkin(nick)
	local statusCode, corpo, erro = requisitar("GET", "/jogo/skin?nick=" .. tostring(nick))
	if erro or statusCode ~= 200 then
		return nil, erro or mensagemDeErro(corpo, statusCode)
	end
	return corpo
end

--[[ Há plateia do outro lado?

	É o que tranca o vestiário (ADR-011). NÃO é o mesmo que "sessão rodando":
	no Studio a sessão roda sem live nenhuma, e bloquear o vestiário ali é
	proibir por causa de uma plateia que não existe. ]]
function Ponte.liveConectada()
	return liveConectada
end

return Ponte
