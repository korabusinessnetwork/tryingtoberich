--!strict
-- Entrada do servidor.
--
-- A ordem aqui não é arbitrária: o vestiário sobe ANTES da sessão e
-- independente dela. Ele é a tela que o streamer usa justamente quando não há
-- live rodando (ADR-011), e amarrá-lo ao sucesso da sessão o deixaria
-- inacessível exatamente quando a sessão não sobe — que é quando ele mais
-- serve, para montar o look antes da primeira partida.
--
-- Erro de subida da sessão é quase sempre configuração, não código:
-- HttpService desligado, KoraConfig ausente, ponte fora do ar, preset sem
-- mapa. Stack trace não ajuda nisso; instrução ajuda. Por isso
-- `Sessao.iniciar` devolve erro em vez de lançar, e por isso este arquivo é
-- curto.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Sessao = require(script.Parent.sessao)
local Vestiario = require(script.Parent.vestiario)
local Eventos = require(ReplicatedStorage:WaitForChild("KoraCompartilhado").eventos)

Vestiario.iniciar({
	-- Função, não booleano: o estado muda durante a vida do servidor, e
	-- capturar o valor agora travaria o vestiário no que era verdade na subida.
	--[[
		Tranca o vestiário quando há PLATEIA, não quando há sessão.

		O ADR-011 dizia "enquanto houver sessão rodando", mas a razão que ele dá
		é outra: "streamer parado num menu é a tela estática que o ADR-009
		evita". Sem live conectada não há ninguém para entediar — e a regra
		literal tornava o vestiário inacessível em TODO teste no Studio, que é
		justamente quando ele mais serve, para montar o look antes da estreia.
	]]
	sessaoAtiva = function()
		return Sessao.estado().aoVivo
	end,

	--[[ Look salvo passa a valer na hora.

		A sessão guarda uma cópia do look e a usa em todo respawn. Sem este
		aviso ela continuava vestindo o look de antes: o streamer tirava a aura
		no vestiário, morria, e ela voltava — com o disco certo o tempo todo. ]]
	aoSalvar = function()
		Sessao.recarregarLook()
	end,
})

--[[
	Subir a sessão é uma TENTATIVA, não um evento único.

	O Studio abre o lugar antes de o Rojo terminar de sincronizar, e a ponte pode
	subir depois do Studio. Nos dois casos a primeira tentativa falha por motivo
	que some sozinho segundos depois — e desistir de vez deixava o streamer num
	mundo vazio, tendo que parar e dar Play de novo sem saber por quê.

	Duas coisas acordam a retentativa, e as duas importam:
	  - ChildAdded em ServerStorage: é o instante EXATO em que o Rojo entrega a
	    KoraConfig. Reagir a ele faz o mapa aparecer no segundo do Connect.
	  - o relógio: cobre o que não é filho de ServerStorage — ponte fora do ar,
	    preset sem mapa — que nenhum evento do Studio sinaliza.
]]
local ServerStorage = game:GetService("ServerStorage")

local ESPERA_ENTRE_TENTATIVAS = 3
local subiu = false

local function tentar(motivo)
	if subiu then
		return
	end

	local ok, erro = Sessao.iniciar()
	if ok then
		subiu = true
		print("[Kora] sessão no ar (" .. motivo .. "). O jogo já está em long-poll com a ponte.")
		return
	end

	return erro
end

local primeiroErro = tentar("primeira tentativa")

if not subiu then
	warn("[Kora] a sessão não subiu ainda. Vou continuar tentando.")
	warn(tostring(primeiroErro))
	warn("Se faltar a KoraConfig, ela chega sozinha quando o Rojo sincronizar.")
	warn("O vestiário já está disponível: dá para montar o look enquanto isso.")

	-- O Rojo entregando a config dispara isto na hora.
	ServerStorage.ChildAdded:Connect(function()
		tentar("Rojo sincronizou")
	end)

	task.spawn(function()
		local ultimoAviso = nil
		while not subiu do
			task.wait(ESPERA_ENTRE_TENTATIVAS)
			local erro = tentar("na retentativa")
			-- Só avisa quando o MOTIVO muda: repetir a mesma linha a cada 3s
			-- enterraria o Output e escondia justamente a linha que mudou.
			if erro and erro ~= ultimoAviso then
				warn("[Kora] ainda não: " .. tostring(erro))
				ultimoAviso = erro
			end
		end
	end)
end

--[[
	O ajuste de geometria vindo do painel de afinação (ajustes.client.lua).

	Fica aqui, junto do vestiário, porque é a mesma natureza: ferramenta do
	streamer, não do espectador. E responde SEMPRE — inclusive na recusa — para
	o painel poder mostrar o motivo em vez de parecer que o botão não funcionou.
]]
Eventos.obter(Eventos.AJUSTAR_MAPA).OnServerEvent:Connect(function(jogador, ajustes)
	local ok, problemas = Sessao.ajustarGeometria(ajustes)
	Eventos.obter(Eventos.AJUSTAR_MAPA):FireClient(jogador, {
		ok = ok,
		problemas = problemas,
	})
end)

game:BindToClose(function()
	-- Fecha o long-poll e destrava o vestiário antes do lugar morrer.
	Sessao.parar()
end)
