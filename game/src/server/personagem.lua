--!strict
-- Composição do personagem por HumanoidDescription e efeito permanente
-- (ADR-010, ADR-011).
--
-- O visual do personagem é DADO, não escolha deste módulo: ele só monta o que
-- o look manda, e nunca decide QUANDO aplicar — isso é do orquestrador
-- (início de sessão ou respawn de checkpoint, nunca no meio da jogatina,
-- porque ApplyDescription reconstrói o personagem inteiro). O ponto frágil
-- daqui é a cadeia de fallback: item do catálogo pode ter sido despublicado
-- entre o vestiário salvar o look e a live rodar, e o personagem não pode
-- nascer pelado por causa disso. A segunda fragilidade é o efeito permanente
-- competir visualmente com o efeito de presente — por isso ele se SUSPENDE
-- (nunca se destrói) durante as 20 animações.
--
-- Escrito no subconjunto Lua 5.1 (sem anotação de tipo, sem `+=`, sem
-- `continue`): é o que permite `luac5.1 -p` validar o jogo sem abrir o Studio.

local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Tipos = require(Compartilhado.tipos)
local Efeitos = require(Compartilhado.efeitos)

local Personagem = {}

-- Mapeia o nome de domínio (schema look.coresCorpo) para a propriedade real
-- do HumanoidDescription.
local CAMPO_COR = {
	cabeca = "HeadColor",
	torso = "TorsoColor",
	bracoEsquerdo = "LeftArmColor",
	bracoDireito = "RightArmColor",
	pernaEsquerda = "LeftLegColor",
	pernaDireita = "RightLegColor",
}

-- Efeitos.particula e Efeitos.trilha SEMPRE agendam limpeza via Debris — é a
-- rede de segurança do próprio módulo (ver cabeçalho de efeitos.lua), sem
-- jeito de pedir "sem limpeza nenhuma". Um efeito permanente não pode morrer
-- no meio de uma live por causa disso, então pede-se uma duração bem maior
-- que qualquer sessão real; a limpeza determinística de verdade é explícita,
-- via Personagem.limpar, no respawn ou no fim de sessão.
local DURACAO_SEGURANCA_EFEITO = 6 * 60 * 60

-- Chave fraca: personagem destruído no respawn não segura o estado dele.
local estados = setmetatable({}, { __mode = "k" })

local function paraColor3(hex)
	if type(hex) ~= "string" then
		return nil
	end
	local r, g, b = string.match(hex, "^#(%x%x)(%x%x)(%x%x)$")
	if not r then
		return nil
	end
	return Color3.fromRGB(tonumber(r, 16), tonumber(g, 16), tonumber(b, 16))
end

local function aplicarCoresCorpo(descricao, coresCorpo)
	if type(coresCorpo) ~= "table" then
		return
	end
	for campo, propriedade in pairs(CAMPO_COR) do
		local cor = paraColor3(coresCorpo[campo])
		if cor then
			descricao[propriedade] = cor
		end
	end
end

-- SetAccessories espera uma lista de descrição, não só o id: cada entrada
-- carrega o AssetId mais o tipo, que aqui fica "Unknown" de propósito — o
-- look guarda só o id escolhido no vestiário, não a categoria do item.
local function listaDeAcessorios(itens)
	local lista = {}
	for _, assetId in ipairs(itens) do
		if Tipos.ehInteiro(assetId) and assetId > 0 then
			table.insert(lista, {
				AssetId = assetId,
				AccessoryType = Enum.AccessoryType.Unknown,
				IsLayered = false,
				Order = #lista + 1,
			})
		end
	end
	return lista
end

--[[
	Uma tentativa da cadeia de fallback do ADR-010. Monta a description do
	zero — nunca reaproveita a de uma tentativa anterior, que pode ter ficado
	com accessory parcial de um item que o Roblox rejeitou — e tenta aplicar.
	A tentativa INTEIRA (montar mais aplicar) vai dentro do mesmo pcall: tanto
	montar quanto ApplyDescription podem falhar por item despublicado ou por
	rede, e nenhum dos dois motivos pode derrubar a sessão.
]]
local function tentarAplicar(humanoid, coresCorpo, itens, roupaCustomizada)
	local ok, erro = pcall(function()
		local descricao = Instance.new("HumanoidDescription")
		aplicarCoresCorpo(descricao, coresCorpo)
		if itens then
			descricao:SetAccessories(listaDeAcessorios(itens), true)
		end
		if Tipos.ehInteiro(roupaCustomizada) and roupaCustomizada > 0 then
			-- Rota paga do ADR-010, ainda adiada: roupaCustomizada é sempre
			-- nil hoje. O schema guarda um id só, sem dizer se é camisa ou
			-- calça; assume-se camisa até essa decisão existir de verdade.
			descricao.Shirt = roupaCustomizada
		end
		humanoid:ApplyDescription(descricao)
	end)
	if not ok then
		return false, erro
	end
	return true
end

--[[
	Personagem.aplicarLook(jogador, look) -> ok, erro

	Compõe por HumanoidDescription com item gratuito do catálogo (ADR-010):
	cor de corpo sempre entra, catálogo tenta com fallback, e o personagem
	nunca fica sem nada por causa de um id despublicado. `jumpHeight` NÃO é
	tratado aqui — HumanoidDescription não tem esse campo, e o ADR-009.3 amarra
	a altura de pulo ao MAPA, não ao look (ver definirAlturaDePulo).
]]
function Personagem.aplicarLook(jogador, look)
	local lookValido, erroValidacao = Tipos.validarLook(look)
	if not lookValido then
		return false, "look inválido: " .. tostring(erroValidacao)
	end

	local personagem = jogador and jogador.Character
	if not personagem then
		return false, "jogador sem personagem"
	end
	local humanoid = personagem:FindFirstChildOfClass("Humanoid")
	if not humanoid then
		return false, "personagem sem Humanoid"
	end

	-- Tentativa 1: o que o streamer escolheu no vestiário.
	local ok, erro = tentarAplicar(humanoid, lookValido.coresCorpo, lookValido.itensCatalogo, lookValido.roupaCustomizada)
	if not ok then
		warn("[Kora] look '" .. tostring(lookValido.nome) .. "': itensCatalogo falhou (" .. tostring(erro) .. "), tentando fallbackItens")
		-- Tentativa 2: reserva do ADR-010, para quando um item do meio foi
		-- despublicado.
		ok, erro = tentarAplicar(humanoid, lookValido.coresCorpo, lookValido.fallbackItens, lookValido.roupaCustomizada)
	end
	if not ok then
		warn("[Kora] look '" .. tostring(lookValido.nome) .. "': fallbackItens também falhou (" .. tostring(erro) .. "), aplicando só cor de corpo")
		-- Tentativa 3: nem catálogo nem roupa própria, só o que é dado puro e
		-- não depende de asset nenhum. O personagem nunca pode nascer sem
		-- roupa numa live, e cor de corpo é o piso que sobra sempre.
		ok, erro = tentarAplicar(humanoid, lookValido.coresCorpo, nil, nil)
	end
	if not ok then
		return false, "nenhuma composição pôde ser aplicada: " .. tostring(erro)
	end

	return true
end

--[[
	Personagem.definirAlturaDePulo(personagem, jumpHeight)

	jumpHeight vem do spec do MAPA (ADR-009.3), nunca do look: mapas diferentes
	têm altura de pulo diferente, e o teto de espaçamento das plataformas sobe
	junto pela fórmula. UseJumpPower tem que ficar falso, senão o Humanoid usa
	JumpPower para decidir a física do pulo e JumpHeight vira decoração.
]]
function Personagem.definirAlturaDePulo(personagem, jumpHeight)
	if not Tipos.ehNumero(jumpHeight) or jumpHeight <= 0 then
		return false, "jumpHeight inválido"
	end

	local ok, erro = pcall(function()
		local humanoid = personagem:FindFirstChildOfClass("Humanoid")
		if not humanoid then
			error("personagem sem Humanoid")
		end
		humanoid.UseJumpPower = false
		humanoid.JumpHeight = jumpHeight
	end)
	if not ok then
		return false, tostring(erro)
	end
	return true
end

local function obterEstado(personagem)
	if not personagem then
		return nil
	end
	local estado = estados[personagem]
	if not estado then
		estado = { efeito = nil, anexos = {}, suspenso = false }
		estados[personagem] = estado
	end
	return estado
end

--[[ Destrói o efeito e os anexos guardados, sem esperar o Debris. ]]
local function destruirEfeito(estado)
	if estado.efeito then
		pcall(function()
			estado.efeito:Destroy()
		end)
		estado.efeito = nil
	end
	for _, anexo in ipairs(estado.anexos) do
		pcall(function()
			anexo:Destroy()
		end)
	end
	estado.anexos = {}
	estado.suspenso = false
end

--[[
	Constrói o primitivo do tipo pedido, sempre com as funções de Efeitos
	(ADR-010). Intensidade só é nativa em Efeitos.particula; rastro e brilho
	não têm parâmetro de intensidade no módulo compartilhado, então a escala
	(Efeitos.escala, mesma fórmula de Tipos.escalaDeIntensidade) é aplicada
	aqui à mão, em cima da cor, pro campo não virar enfeite sem efeito só
	porque o tipo escolhido não foi "aura".
]]
local function criarEfeito(estado, raiz, personagem, tipo, cor, intensidade)
	local fator = Efeitos.escala(intensidade)

	if tipo == "aura" then
		local anexo = Efeitos.anexo(raiz, "KoraEfeitoPermanente")
		table.insert(estado.anexos, anexo)
		return Efeitos.particula(anexo, { Color = ColorSequence.new(cor) }, intensidade, DURACAO_SEGURANCA_EFEITO)
	elseif tipo == "rastro" then
		local topo = Efeitos.anexo(raiz, "KoraEfeitoPermanenteTopo", Vector3.new(0, 1, 0))
		local base = Efeitos.anexo(raiz, "KoraEfeitoPermanenteBase", Vector3.new(0, -1, 0))
		table.insert(estado.anexos, topo)
		table.insert(estado.anexos, base)
		return Efeitos.trilha(topo, base, {
			Color = ColorSequence.new(cor),
			WidthScale = Efeitos.sequenciaDeNumero(fator, fator),
		}, DURACAO_SEGURANCA_EFEITO)
	end

	-- "brilho": sem duração, de propósito — é a única das três primitivas que
	-- só agenda limpeza se receber uma (ver efeitos.lua), então já nasce
	-- permanente de verdade, sem depender da duração de segurança.
	return Efeitos.brilho(personagem, {
		FillColor = cor,
		OutlineColor = cor,
		FillTransparency = math.max(0.1, 0.9 - (fator * 0.4)),
	})
end

--[[
	Personagem.ligarEfeitoPermanente(personagem, efeitoPermanente)

	Substitui qualquer efeito anterior deste personagem antes de criar o novo,
	pra não vazar instância entre respawns com look diferente. `nil` é look
	sem efeito permanente (o schema aceita isso) — não é erro, só não liga
	nada.
]]
function Personagem.ligarEfeitoPermanente(personagem, efeitoPermanente)
	local estado = obterEstado(personagem)
	if not estado then
		return false, "personagem ausente"
	end
	destruirEfeito(estado)

	if efeitoPermanente == nil then
		return true
	end
	if type(efeitoPermanente) ~= "table" then
		return false, "efeitoPermanente com formato inválido"
	end
	if efeitoPermanente.tipo ~= "aura" and efeitoPermanente.tipo ~= "rastro" and efeitoPermanente.tipo ~= "brilho" then
		return false, "tipo de efeito permanente desconhecido: " .. tostring(efeitoPermanente.tipo)
	end

	local raiz = Efeitos.raiz(personagem)
	if not raiz then
		return false, "personagem sem HumanoidRootPart"
	end
	local cor = paraColor3(efeitoPermanente.cor) or Color3.new(1, 1, 1)

	local ok, efeito = pcall(criarEfeito, estado, raiz, personagem, efeitoPermanente.tipo, cor, efeitoPermanente.intensidade)
	if not ok or not efeito then
		destruirEfeito(estado)
		return false, "falha ao construir efeito permanente: " .. tostring(efeito)
	end

	estado.efeito = efeito
	estado.suspenso = false
	return true
end

--[[
	Personagem.suspenderEfeito(personagem, suspenso) -- boolean

	Desliga o EMISSOR, nunca destrói: as 20 animações de presente suspendem e
	restauram isto sem exceção (ADR-010), e destruir/recriar a cada presente
	vaza instância numa live de 2 horas. ParticleEmitter, Trail e Highlight têm
	`Enabled` de sobra pra isto — por isso o mesmo código serve pros três
	tipos. Sem efeito ligado (look sem efeitoPermanente) é sucesso trivial, não
	erro: não há nada competindo com o efeito do presente mesmo.
]]
function Personagem.suspenderEfeito(personagem, suspenso)
	local estado = estados[personagem]
	if not estado or not estado.efeito then
		return true
	end
	estado.suspenso = suspenso == true
	local ok = pcall(function()
		estado.efeito.Enabled = not estado.suspenso
	end)
	return ok
end

--[[
	Personagem.limpar(personagem)

	Idempotente e seguro com o personagem já removido ou com `nil`: chamado no
	respawn e no fim de sessão, pro estado nunca atravessar pro próximo
	boneco. A chave fraca já resolveria isso sozinha com o tempo (GC), mas o
	efeito visual em si — ParticleEmitter, Trail, Highlight — não pode esperar
	o coletor de lixo: precisa sumir da tela na hora.
]]
function Personagem.limpar(personagem)
	if not personagem then
		return
	end
	local estado = estados[personagem]
	if not estado then
		return
	end
	destruirEfeito(estado)
	estados[personagem] = nil
end

return Personagem
