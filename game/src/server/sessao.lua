--!strict
-- O orquestrador. Amarra ponte, construtor de mapa, plataformas, movimento e
-- personagem, e é o único lugar do jogo que conhece todos eles.
--
-- Os outros módulos são deliberadamente burros: `movimento` não sabe o que é
-- plataforma, `plataformas` não sabe o que é presente, `ponte` não sabe o que
-- é boneco. Toda decisão que precisa de dois deles ao mesmo tempo mora aqui.
--
-- O que passa por este arquivo e por mais nenhum:
--   * traduzir delta em plataforma de destino, sobre a REFERÊNCIA (R9)
--   * calar o detector de queda enquanto o Tween manda (F4b)
--   * suspender o efeito permanente durante o presente (ADR-010)
--   * mover o checkpoint pelo RESULTADO do combate (ADR-008 + ADR-012)

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Compartilhado = ReplicatedStorage:WaitForChild("KoraCompartilhado")
local Eventos = require(Compartilhado.eventos)
local Tipos = require(Compartilhado.tipos)

local ConstrutorMapa = require(script.Parent.construtorMapa)
local Movimento = require(script.Parent.movimento)
local Personagem = require(script.Parent.personagem)
local Plataformas = require(script.Parent.plataformas)
local Ponte = require(script.Parent.ponte)

local Sessao = {}

-- 07_APIS: o jogo reporta estado no máximo a cada 2s ou quando a referência
-- muda. Quem faz o throttle de verdade é ponte.lua; aqui é só a batida.
local INTERVALO_ESTADO = 2

local estado = {
	rodando = false,
	mapa = nil,
	construido = nil,
	look = nil,
	jogador = nil,
	batida = nil,
}

local function personagemAtual()
	local jogador = estado.jogador
	return jogador and jogador.Character or nil
end

--[[
	O estado que o jogo publica. Vai para dois destinos com o mesmo conteúdo:
	a ponte (que repassa ao painel) e os clientes (HUD, câmera e vestiário).

	`sessaoAtiva` existe para o vestiário se trancar durante a live: o ADR-011
	proíbe abri-lo com a sessão rodando, porque streamer parado num menu é a
	tela estática que o ADR-009 evita.
]]
local function montarEstado()
	return {
		plataformaReferencia = Plataformas.referencia(),
		plataformaMaxima = Plataformas.maxima(),
		quedasNaturais = Plataformas.quedas(),
		emAnimacao = Movimento.emAnimacao(personagemAtual()),
		totalPlataformas = estado.mapa and estado.mapa.totalPlataformas or 0,
		sessaoAtiva = estado.rodando,
	}
end

local function publicarEstado()
	local atual = montarEstado()
	Eventos.obter(Eventos.ESTADO):FireAllClients(atual)
	-- Fire-and-forget do lado de lá: nunca segura o jogo esperando a ponte.
	Ponte.enviarEstado(atual)
end

--[[
	Aplica um presente.

	Esta função é o caminho quente do lado do jogo, e a ordem importa:
	o destino sai da REFERÊNCIA, não de onde o boneco está no ar naquele
	instante (R9.3). O streamer pode estar no meio de um pulo, e usar a altura
	corrente faria o mesmo presente valer coisas diferentes conforme a sorte
	do instante em que chegou.
]]
local function aplicarPresente(evento)
	local personagem = personagemAtual()
	if not personagem or not estado.mapa then
		return
	end

	local origem = Plataformas.referencia()
	local destino = Tipos.limitarPlataforma(origem + evento.delta, estado.mapa.totalPlataformas)

	-- R6: delta que passaria de 0 ou do topo para no limite. Se o limite comeu
	-- o movimento inteiro, não há o que animar.
	if destino == origem then
		return
	end

	-- F4b.4: durante a animação quem manda é o Tween, e o detector de queda
	-- fica calado. Sem isso, o boneco descendo 60 plataformas por Tween dispara
	-- o respawn no meio do caminho.
	Plataformas.suspenderDetector(true)
	-- ADR-010: o efeito permanente não pode competir com o efeito que o
	-- espectador pagou.
	Personagem.suspenderEfeito(personagem, true)

	local desceu = destino < origem

	Movimento.aplicar(personagem, {
		plataformaOrigem = origem,
		plataformaDestino = destino,
		posicaoDestino = Plataformas.posicaoDePouso(destino),
		delta = evento.delta,
		animacaoId = evento.animacaoId,
		intensidade = evento.intensidade,
		efeitoCurto = evento.efeitoCurto,
		nomeDoador = evento.nomeDoador,
		presenteNome = evento.presenteNome,
		aoTerminar = function()
			Personagem.suspenderEfeito(personagem, false)
			Plataformas.suspenderDetector(false)

			-- ADR-008, emendado pelo ADR-012: descida redefine o checkpoint,
			-- mesmo sem o boneco ter encostado no destino — senão o streamer
			-- anula o presente pulando no vazio. E vale sobre o RESULTADO do
			-- combate, não sobre cada presente: uma descida derrotada não pode
			-- roubar altura que o boneco nunca perdeu. Por isso a decisão é
			-- pelo sinal do delta que de fato chegou, que já é o líquido.
			if desceu then
				Plataformas.definirReferencia(destino, "presente de descida (ADR-008)")
			end

			publicarEstado()
		end,
	})

	-- O cliente desenha o presente enquanto o servidor move. Os dois começam
	-- no mesmo instante: é o que faz a causa e o efeito parecerem uma coisa só.
	Eventos.obter(Eventos.PRESENTE):FireAllClients({
		animacaoId = evento.animacaoId,
		delta = evento.delta,
		intensidade = evento.intensidade,
		efeitoCurto = evento.efeitoCurto,
		nomeDoador = evento.nomeDoador,
		presenteNome = evento.presenteNome,
		plataformaOrigem = origem,
		plataformaDestino = destino,
		disputa = evento.disputa,
	})
end

--[[
	Prepara o personagem para a sessão: look e altura de pulo.

	O look é aplicado aqui e no respawn, nunca no meio da jogatina (ADR-011):
	`ApplyDescription` reconstrói o personagem e tiraria o controle do streamer
	no meio de um pulo.
]]
local function prepararPersonagem(personagem)
	if not personagem then
		return
	end

	if estado.look then
		Personagem.aplicarLook(estado.jogador, estado.look)
	end
	if estado.mapa then
		-- ADR-009.3: a altura de pulo vem do MAPA, e o teto de espaçamento das
		-- plataformas sobe junto pela fórmula.
		Personagem.definirAlturaDePulo(personagem, estado.mapa.jumpHeight)
	end
	if estado.look and estado.look.efeitoPermanente then
		Personagem.ligarEfeitoPermanente(personagem, estado.look.efeitoPermanente)
	end

	Plataformas.acompanhar(personagem)
end

local function acompanharJogador(jogador)
	estado.jogador = jogador

	local function aoNascer(personagem)
		-- Movimento e efeito do personagem anterior não valem para o novo.
		Movimento.restaurar(personagem)
		prepararPersonagem(personagem)

		local spawn = Plataformas.posicaoDePouso(Plataformas.referencia())
		if spawn then
			local raiz = personagem:WaitForChild("HumanoidRootPart", 5)
			if raiz then
				raiz.CFrame = CFrame.new(spawn)
			end
		end
		publicarEstado()
	end

	if jogador.Character then
		task.spawn(aoNascer, jogador.Character)
	end
	jogador.CharacterAdded:Connect(aoNascer)
end

--[[
	Sobe a sessão. Devolve `nil, erro` em vez de lançar: quem chama é um Script
	de inicialização, e erro de subida tem que virar mensagem legível no output
	do Studio, não stack trace.
]]
function Sessao.iniciar()
	if estado.rodando then
		return nil, "sessão já está rodando"
	end

	Eventos.criarTodos()

	local mapa, erroMapa = Ponte.buscarMapa()
	if not mapa then
		return nil, "não consegui buscar o mapa: " .. tostring(erroMapa)
	end

	local construido, erroConstrucao = ConstrutorMapa.construir(mapa)
	if not construido then
		-- ADR-009: torre intransponível não vai ao ar. Numa live isso vira tela
		-- parada, e tela parada é o que o TikTok pune.
		return nil, "mapa rejeitado: " .. tostring(erroConstrucao)
	end

	estado.mapa = mapa
	estado.construido = construido
	estado.look = Ponte.buscarLook()
	estado.rodando = true

	Plataformas.iniciar(mapa, construido.plataformas)
	Plataformas.aoMudar(publicarEstado)

	local ok, erroPonte = Ponte.iniciar({
		aoEvento = aplicarPresente,
		aoConexao = function()
			publicarEstado()
		end,
		aoCombateAnulado = function(disputa)
			-- Não move ninguém, mas precisa aparecer: empate sem nada na tela
			-- lê como travamento no exato momento em que mais gente mandou
			-- presente ao mesmo tempo. Ver ADR-012.
			Eventos.obter(Eventos.COMBATE_ANULADO):FireAllClients(disputa)
		end,
	})
	if not ok then
		Sessao.parar()
		return nil, erroPonte
	end

	for _, jogador in ipairs(Players:GetPlayers()) do
		acompanharJogador(jogador)
	end
	Players.PlayerAdded:Connect(acompanharJogador)

	estado.batida = task.spawn(function()
		while estado.rodando do
			publicarEstado()
			task.wait(INTERVALO_ESTADO)
		end
	end)

	return true
end

function Sessao.parar()
	estado.rodando = false
	Ponte.parar()
	Plataformas.pararDeAcompanhar()

	local personagem = personagemAtual()
	if personagem then
		Movimento.restaurar(personagem)
		Personagem.limpar(personagem)
	end

	ConstrutorMapa.limpar()
	estado.mapa = nil
	estado.construido = nil
	estado.look = nil

	-- Último estado com sessaoAtiva falso: é o que destranca o vestiário.
	Eventos.obter(Eventos.ESTADO):FireAllClients(montarEstado())
end

Sessao.estado = montarEstado

return Sessao
