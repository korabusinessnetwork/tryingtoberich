--!strict
-- Lado servidor do vestiário. O contrato dos três RemoteEvent está escrito no
-- cabeçalho de game/src/client/vestiario.client.lua, e este arquivo é a outra
-- ponta dele.
--
-- Por que a busca não sai daqui direto para o Roblox: a API de catálogo é web
-- pública, não contratada, com limite de taxa e sujeita a mudar sem aviso
-- (ADR-011). Quem fala com ela é a ponte, num módulo isolado, e o jogo só
-- chama `/jogo/catalogo-itens`. Se ela cair, o vestiário para de trazer item
-- novo e o resto do jogo nem percebe.
--
-- O cliente aplica a prévia de forma otimista e não espera resposta. Este
-- módulo só responde quando precisa RECONCILIAR — rejeitar o que o cliente já
-- mostrou. Silêncio aqui é sucesso.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Compartilhado = ReplicatedStorage:WaitForChild("KoraCompartilhado")
local Eventos = require(Compartilhado.eventos)
local Tipos = require(Compartilhado.tipos)

local Ponte = require(script.Parent.ponte)
local Personagem = require(script.Parent.personagem)

local Vestiario = {}

local BUSCA_MIN = 2
local sessaoRodando = function()

--[[ Avisado depois de um save bem-sucedido, para a sessão reler o look. ]]
local aoSalvarLook = nil
	return false
end

--[[
	"Escalador Vulcânico" -> "escalador-vulcanico".

	O id nasce do nome no servidor de propósito: o cliente não manda `lookId`
	(ver contrato), e o schema exige minúscula com hífen. Deixar o streamer
	digitar o id daria nome de arquivo inválido na primeira acentuação.
]]
local ACENTOS = {
	["á"] = "a", ["à"] = "a", ["â"] = "a", ["ã"] = "a", ["ä"] = "a",
	["é"] = "e", ["ê"] = "e", ["è"] = "e",
	["í"] = "i", ["ì"] = "i", ["î"] = "i",
	["ó"] = "o", ["ô"] = "o", ["õ"] = "o", ["ò"] = "o",
	["ú"] = "u", ["ù"] = "u", ["û"] = "u",
	["ç"] = "c", ["ñ"] = "n",
}

function Vestiario.identificadorDe(nome)
	local texto = string.lower(tostring(nome or ""))
	for acentuado, simples in pairs(ACENTOS) do
		texto = string.gsub(texto, acentuado, simples)
	end
	texto = string.gsub(texto, "[^a-z0-9]+", "-")
	texto = string.gsub(texto, "^-+", "")
	texto = string.gsub(texto, "-+$", "")
	if texto == "" then
		return nil
	end
	return string.sub(texto, 1, 64)
end

--[[
	ADR-011: o vestiário não abre com a sessão rodando, porque streamer parado
	num menu é a tela estática que o ADR-009 evita. O cliente já se tranca
	sozinho pelo `sessaoAtiva` do ESTADO; esta checagem existe porque um
	RemoteEvent é uma porta aberta, e porta aberta não confia no cliente.
]]
local function recusarSeAoVivo(remoto, jogador, resposta)
	if not sessaoRodando() then
		return false
	end
	remoto:FireClient(jogador, resposta)
	return true
end

local function tratarBusca(jogador, pedido)
	local remoto = Eventos.obter(Eventos.VESTIARIO_BUSCAR)
	local termo = type(pedido) == "table" and tostring(pedido.termo or "") or ""

	if recusarSeAoVivo(remoto, jogador, { termo = termo, erro = "O vestiário não abre com a sessão rodando." }) then
		return
	end
	if #termo < BUSCA_MIN then
		remoto:FireClient(jogador, { termo = termo, erro = "Digite ao menos 2 letras." })
		return
	end

	-- Rede: fora de qualquer caminho crítico, e a sessão está parada de
	-- qualquer forma. Mas nunca na thread do RemoteEvent, senão um catálogo
	-- lento segura o servidor inteiro.
	task.spawn(function()
		local itens, erro = Ponte.buscarItensDoCatalogo(termo)
		if not itens then
			remoto:FireClient(jogador, { termo = termo, erro = tostring(erro) })
			return
		end

		-- Só item gratuito atravessa. O filtro de verdade é na origem, na
		-- ponte; este é o segundo, porque um look montado com item pago é um
		-- look que o streamer não consegue vestir (ADR-011).
		local gratuitos = {}
		for _, item in ipairs(itens) do
			local preco = item.preco or item.price or 0
			if preco == 0 and Tipos.ehInteiro(item.assetId) then
				table.insert(gratuitos, { assetId = item.assetId, nome = item.nome, preco = 0 })
			end
		end

		remoto:FireClient(jogador, { termo = termo, itens = gratuitos })
	end)
end

--[[
	O cliente já aplicou a prévia quando este evento chega. Aqui só se recusa.

	Hoje a única recusa é a sessão ao vivo: a composição em si é problema do
	cliente, que é quem tem o boneco na frente. Se um dia a busca passar a
	validar propriedade de asset, é aqui que entra.
]]
local function tratarEquipar(jogador, pedido)
	local remoto = Eventos.obter(Eventos.VESTIARIO_EQUIPAR)
	local assetId = type(pedido) == "table" and pedido.assetId or nil

	recusarSeAoVivo(remoto, jogador, {
		assetId = assetId,
		equipar = type(pedido) == "table" and pedido.equipar or false,
		ok = false,
		erro = "O vestiário não abre com a sessão rodando.",
	})
end

local function tratarSalvar(jogador, pedido)
	local remoto = Eventos.obter(Eventos.VESTIARIO_SALVAR)

	if recusarSeAoVivo(remoto, jogador, { ok = false, erro = "O vestiário não abre com a sessão rodando." }) then
		return
	end
	if type(pedido) ~= "table" then
		remoto:FireClient(jogador, { ok = false, erro = "pedido inválido" })
		return
	end

	local lookId = Vestiario.identificadorDe(pedido.nome)
	if not lookId then
		remoto:FireClient(jogador, { ok = false, erro = "Dê um nome ao look antes de salvar." })
		return
	end

	-- streamerId e atualizadoEm são de quem persiste (ADR-003), e a ponte
	-- carimba os dois. roupaCustomizada fica nula: a rota paga está adiada
	-- pela regra de custo, e o campo existe só para não exigir migração depois.
	local look = {
		lookId = lookId,
		streamerId = "local",
		nome = pedido.nome,
		itensCatalogo = pedido.itensCatalogo or {},
		coresCorpo = pedido.coresCorpo,
		efeitoPermanente = pedido.efeitoPermanente,
		roupaCustomizada = nil,
		fallbackItens = pedido.fallbackItens,
	}

	-- O schema recusa fallback vazio, e com razão: item despublicado não pode
	-- deixar o personagem nascer sem roupa numa live (ADR-010). O cliente já
	-- bloqueia isso, mas a validação de verdade é a de cá.
	local valido, erroValidacao = Tipos.validarLook(look)
	if not valido then
		remoto:FireClient(jogador, { ok = false, erro = tostring(erroValidacao) })
		return
	end

	task.spawn(function()
		local ok, erro = Ponte.salvarLook(lookId, look)
		if ok then
			-- A sessão guarda uma cópia do look e a usa em todo respawn. Sem
			-- avisar, ela continua vestindo o look de antes — que foi como a
			-- aura sobreviveu a todas as tentativas de tirá-la.
			if aoSalvarLook then
				local avisou, erroAviso = pcall(aoSalvarLook)
				if not avisou then
					warn("[Vestiario] a sessão não recarregou o look: " .. tostring(erroAviso))
				end
			end
			remoto:FireClient(jogador, { ok = true, lookId = lookId })
		else
			remoto:FireClient(jogador, { ok = false, erro = tostring(erro) })
		end
	end)
end

--[[
	Liga os três eventos.

	`sessaoAtiva` é uma função e não um booleano de propósito: o estado muda
	durante a vida do servidor, e capturar o valor na subida travaria o
	vestiário no que era verdade naquele instante.
]]
function Vestiario.iniciar(opcoes)
	opcoes = opcoes or {}
	if type(opcoes.sessaoAtiva) == "function" then
		sessaoRodando = opcoes.sessaoAtiva
	end
	if type(opcoes.aoSalvar) == "function" then
		aoSalvarLook = opcoes.aoSalvar
	end

	--[[ A galeria: lista de nicks, ou vestir a skin de um deles.
	
		Duas ações no mesmo remoto porque são a mesma tela e o mesmo passo do
		fluxo — separar em dois eventos só multiplicaria a fiação. ]]
	Eventos.obter(Eventos.VESTIARIO_GALERIA).OnServerEvent:Connect(function(jogador, pedido)
		local remoto = Eventos.obter(Eventos.VESTIARIO_GALERIA)

		if recusarSeAoVivo(remoto, jogador, { erro = "Vestiário indisponível com a live no ar." }) then
			return
		end

		if type(pedido) ~= "table" then
			remoto:FireClient(jogador, { erro = "pedido inválido" })
			return
		end

		if pedido.acao == "listar" then
			local nicks, erro = Ponte.buscarGaleria()
			remoto:FireClient(jogador, { acao = "listar", nicks = nicks, erro = erro })
			return
		end

		if pedido.acao == "vestir" and type(pedido.nick) == "string" then
			local skin, erro = Ponte.buscarSkin(pedido.nick)
			if not skin then
				remoto:FireClient(jogador, { acao = "vestir", ok = false, erro = erro or "não achei essa skin" })
				return
			end

			local ok, erroAplicar = Personagem.aplicarSkin(jogador, skin)
			remoto:FireClient(jogador, {
				acao = "vestir",
				ok = ok,
				erro = erroAplicar,
				nick = skin.nick,
				pecas = #(skin.assets or {}),
			})
			return
		end

		remoto:FireClient(jogador, { erro = "ação desconhecida" })
	end)

	Eventos.obter(Eventos.VESTIARIO_BUSCAR).OnServerEvent:Connect(tratarBusca)
	Eventos.obter(Eventos.VESTIARIO_EQUIPAR).OnServerEvent:Connect(tratarEquipar)
	Eventos.obter(Eventos.VESTIARIO_SALVAR).OnServerEvent:Connect(tratarSalvar)
end

return Vestiario
