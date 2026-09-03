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
local Portal = require(script.Parent.portal)
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
	-- Última vitória PUBLICADA, para o aviso sair só na transição (R6).
	venceu = false,
	-- Placar da sessão. Some quando a sessão acaba: é da partida, não do
	-- streamer — histórico entre sessões é assunto do painel, não do jogo.
	vitorias = 0,
	derrotas = 0,
	-- Derrota é VOLTAR ao primeiro andar depois de ter saído dele. Sem esta
	-- marca, nascer na plataforma 1 já contaria derrota no primeiro frame.
	saiuDoPrimeiro = false,
	-- Rodada encerrada esperando a contagem. Guarda o RESULTADO ("vitoria" ou
	-- "derrota"), não um booleano: é ele que diz qual condição precisa continuar
	-- valendo para a contagem seguir. `false` quando não há contagem em curso.
	encerrando = false,
	-- Sobe a cada rodada encerrada E a cada cancelamento. É o que faz um
	-- `task.delay` já agendado saber que virou passado e desistir sozinho.
	geracaoDaRodada = 0,
	--[[ Rodadas DEVIDAS por donate de placar.

		Um presente de derrota mandado 6 vezes vale 6 derrotas, e o dono quis
		que elas sejam cobradas uma a uma — "fico descendo até acabar as 6" —
		e não somadas de uma vez no número. Cada uma leva sua queda e sua
		contagem, que é o espetáculo pelo qual o espectador pagou.

		`{ tipo = "derrota"|"vitoria", restantes = N }`, ou nil. ]]
	fila = nil,
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
	local total = estado.mapa and estado.mapa.totalPlataformas or 0
	return {
		plataformaReferencia = Plataformas.referencia(),
		plataformaMaxima = Plataformas.maxima(),
		quedasNaturais = Plataformas.quedas(),
		emAnimacao = Movimento.emAnimacao(personagemAtual()),
		totalPlataformas = total,
		sessaoAtiva = estado.rodando,
		-- "Ao vivo" é sessão rodando E live conectada. São coisas diferentes: no
		-- Studio a sessão roda sem live nenhuma. Ver aoVivo em inicio.server.lua.
		aoVivo = estado.rodando and Ponte.liveConectada(),
		vitorias = estado.vitorias,
		derrotas = estado.derrotas,
		-- R6: no topo. Sai por ENCOSTAR na última plataforma, como toda
		-- referência (R9.2) — chegar por altura, passando por cima no pulo,
		-- não é ter subido a torre.
		vitoria = total > 0 and Plataformas.referencia() >= total,
	}
end

--[[ Vida do portal, mandada pela ponte junto do mapa (ela sai do preset). ]]
local function vidaDoPortal()
	local configurada = estado.mapa and estado.mapa.portal and estado.mapa.portal.vida
	if type(configurada) == "number" and configurada > 0 then
		return configurada
	end
	return Tipos.VIDA_PADRAO_DO_PORTAL
end

--[[
	A beirada de COSTAS para a subida: para onde o mapa acaba.

	`Plataformas.beiradaDe` aponta para onde a torre CONTINUA, que é o certo
	para cenário que o jogador atravessa subindo. O portal quer o contrário: ele
	fica no fim do caminho, virado para o lado de fora, de frente para quem
	ainda está subindo — é dali que a derrota vem.

	Inverter só a frente basta: a plataforma é simétrica, então a meia-extensão
	medida num sentido vale no outro, e a largura de través não muda.
]]
local function beiradaDeCosta(indice)
	local beirada = Plataformas.beiradaDe(indice)
	if not beirada or typeof(beirada.frente) ~= "Vector3" then
		return beirada
	end
	return {
		frente = -beirada.frente,
		meiaExtensao = beirada.meiaExtensao,
		meiaLargura = beirada.meiaLargura,
	}
end

--[[ Manda o HUD desenhar a barra. Sem isto a disputa acontece sem ninguém ver. ]]
local function publicarPortal(quebrou)
	local instantaneo = Portal.instantaneo()
	instantaneo.quebrou = quebrou == true
	Eventos.obter(Eventos.PORTAL):FireAllClients(instantaneo)
end

--[[
	Publica o estado para os clientes e para a ponte.

	O aviso de vitória sai daqui, e só na TRANSIÇÃO: este estado é republicado a
	cada 2s e a cada toque de plataforma, e um evento de vitória por batimento
	viraria o HUD piscando enquanto o streamer decide o que fazer.
]]
--[[ Declarações adiantadas: `encerrarRodada` cobra a fila no fim, e
	`cobrarProximaDaFila` encerra a rodada seguinte. Sem isto uma delas viraria
	busca de global e estouraria só quando a fila existisse de verdade — o
	mesmo tropeço que já aconteceu duas vezes no vestiário. ]]
local encerrarRodada
local cobrarProximaDaFila

--[[
	Cobra a próxima rodada devida por donate de placar.

	"Se a pessoa der um donate de 6 derrotas eu fico descendo até acabar as 6."
	Uma por vez, cada uma com sua queda e sua contagem: somar 6 no número de uma
	vez daria o mesmo placar e nenhum espetáculo, e quem gastou por seis quedas
	veria uma.
]]
function cobrarProximaDaFila()
	local fila = estado.fila
	if not fila or fila.restantes <= 0 then
		estado.fila = nil
		return
	end

	fila.restantes = fila.restantes - 1
	if fila.restantes <= 0 then
		estado.fila = nil
	end

	-- Derrota devida quebra o portal junto, se houver algum de pé: a rodada
	-- inteira acontece, não só o número.
	if fila.tipo == "derrota" and Portal.aberto() then
		Portal.quebrar()
		publicarPortal(true)
	end

	encerrarRodada(fila.tipo)
end

--[[
	Fecha a rodada e agenda o reinício.

	R6 dizia que chegar ao topo NÃO reinicia sozinho, e que o streamer decide no
	painel. Isso mudou por decisão do dono: numa live, tela parada esperando
	clique é o que o TikTok pune, e a contagem regressiva é justamente o momento
	de tensão que segura a audiência. O botão do painel continua existindo.

	A contagem é a mesma dos dois lados: `Tipos.CONTAGEM_DE_RODADA`. O servidor
	só soma para saber quando reiniciar; quem desenha é o cliente.
]]
function encerrarRodada(resultado)
	-- Guarda QUAL resultado, não só "está encerrando": é ele que diz qual
	-- condição precisa continuar valendo para a contagem seguir de pé.
	estado.encerrando = resultado
	estado.geracaoDaRodada = estado.geracaoDaRodada + 1
	local minhaGeracao = estado.geracaoDaRodada

	if resultado == "vitoria" then
		estado.vitorias = estado.vitorias + 1
	else
		estado.derrotas = estado.derrotas + 1
	end

	Eventos.obter(Eventos.RODADA_ENCERRADA):FireAllClients({
		resultado = resultado,
		vitorias = estado.vitorias,
		derrotas = estado.derrotas,
	})

	--[[ A animação do fim de rodada.

		Vitória e derrota não têm delta — ninguém sobe nem desce por ter chegado
		ao topo — mas são os dois instantes mais altos da live, e até aqui
		aconteciam com o boneco parado. Toca solta, sem mover e sem tomar o
		controle: a contagem regressiva já está correndo por cima.

		Qual animação é escolha do streamer, no preset. Nenhuma escolhida =
		nada toca, que é como era antes. ]]
	local animacoes = estado.mapa and estado.mapa.animacoesDeRodada
	local animacaoId = animacoes and animacoes[resultado]
	local personagem = personagemAtual()
	if personagem and type(animacaoId) == "string" then
		Movimento.tocarSolta(personagem, animacaoId, {
			plataforma = Plataformas.referencia(),
			presenteNome = resultado == "vitoria" and "VITÓRIA" or "DERROTA",
		})
	end

	task.delay(Tipos.duracaoDaContagem(), function()
		-- A sessão pode ter parado durante a contagem: reiniciar uma corrida que
		-- já não existe deixaria o boneco preso num mapa destruído.
		if not estado.rodando then
			return
		end

		-- E o streamer pode ter SAÍDO da plataforma no meio da contagem, o que
		-- cancela a rodada (ver `cancelarRodada`). A geração é o que distingue
		-- "esta contagem terminou" de "esta contagem foi abandonada" — sem ela,
		-- um cancelamento seguido de nova contagem faria a antiga reiniciar a
		-- torre por cima da nova.
		if estado.geracaoDaRodada ~= minhaGeracao then
			return
		end

		local personagem = personagemAtual()
		if personagem then
			Movimento.restaurar(personagem)
			Personagem.suspenderEfeito(personagem, false)
		end
		Plataformas.suspenderDetector(false)
		Plataformas.reiniciarCorrida("fim de rodada: " .. resultado)

		estado.saiuDoPrimeiro = false
		estado.encerrando = false

		-- Torre nova, portal novo: a vida não atravessa a rodada.
		Portal.fechar()
		publicarPortal(false)

		publicarEstado()
		cobrarProximaDaFila()
	end)
end

--[[
	Abandona a contagem quando o streamer sai da plataforma que a disparou.

	A contagem é um momento de tensão, e tensão sobre algo que já não é verdade
	é ruído: chegar ao topo e cair de volta no meio dos 10 segundos não é uma
	vitória esperando confirmação, é uma corrida que continua.

	Só bumps a geração e limpa o estado — o `task.delay` já agendado confere a
	geração e desiste sozinho, o que evita ter que cancelar timer no Roblox.
]]
local function cancelarRodada()
	local resultado = estado.encerrando
	estado.encerrando = false
	estado.geracaoDaRodada = estado.geracaoDaRodada + 1

	-- O placar NÃO volta atrás: o ponto foi feito no instante em que o streamer
	-- tocou a plataforma, e desfazê-lo faria o número piscar na tela por um
	-- passo em falso.
	Eventos.obter(Eventos.RODADA_ENCERRADA):FireAllClients({
		resultado = "cancelado",
		anterior = resultado,
		vitorias = estado.vitorias,
		derrotas = estado.derrotas,
	})
end

--[[
	A condição que disparou a rodada ainda vale?

	Só a VITÓRIA se desfaz. Ela é uma posição — estar no topo — e cair de lá no
	meio da contagem quer dizer que a corrida continua.

	A derrota deixou de ser posição. Ela vem de um portal QUEBRADO, e isso não
	desacontece: sair do primeiro andar depois que o portal foi ao chão não
	devolve a rodada. Antes, quando derrota era "estar no andar 1", cancelar
	fazia sentido; hoje seria apagar um estrago que a plateia pagou para ver.
]]
local function aindaNaPlataformaDoFim(atual)
	if estado.encerrando == "vitoria" then
		return atual.vitoria == true
	end
	return estado.encerrando == "derrota"
end

local function publicarEstado()
	local atual = montarEstado()

	-- Saiu do pé da torre: a partir daqui, voltar ao primeiro andar é derrota.
	if atual.plataformaReferencia > 1 then
		estado.saiuDoPrimeiro = true
	end

	if estado.encerrando then
		if not aindaNaPlataformaDoFim(atual) then
			cancelarRodada()
		end
	else
		if atual.vitoria then
			encerrarRodada("vitoria")
		elseif estado.saiuDoPrimeiro and atual.plataformaReferencia <= 1 and not Portal.aberto() then
			--[[ Voltar ao pé da torre não é mais derrota: é o portal se erguendo.

				Antes esta linha chamava `encerrarRodada("derrota")` direto, e o
				momento mais dramático da live acontecia sozinho, com a plateia
				assistindo. Agora a derrota tem que ser COMPRADA: só presente
				negativo machuca o portal, e enquanto ele estiver de pé dá para
				escapar subindo.

				Ele NÃO fecha quando o streamer escapa (decisão do dono): fica lá
				embaixo apanhando, e pode quebrar com o boneco no andar 300. ]]
			local base = Plataformas.topoDe(1)
			if base then
				Portal.abrir(base, vidaDoPortal(), beiradaDeCosta(1))
				publicarPortal(false)
			end
		end
	end

	if atual.vitoria ~= estado.venceu then
		estado.venceu = atual.vitoria
		Eventos.obter(Eventos.VITORIA):FireAllClients({
			plataforma = atual.plataformaReferencia,
			totalPlataformas = atual.totalPlataformas,
			-- Sair da vitória só acontece por reinício: a referência não desce
			-- sozinha, e presente de descida depois do topo é queda de novo ao
			-- jogo, não fim do aviso.
			reiniciou = not atual.vitoria,
		})
	end

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

	--[[ Presente NEGATIVO machuca o portal, se houver um de pé.

		O dano é o tamanho do empurrão em andares — o mesmo `delta` que move o
		boneco. Quem quer a derrota paga por ela, e paga na moeda do jogo: um
		presente que te joga 20 andares para baixo tira 20 do portal.

		Acontece ANTES do limite de plataforma: no pé da torre o delta seria
		comido por `limitarPlataforma` e a função sairia cedo, sem machucar
		nada — que é exatamente onde o portal está. E acontece MESMO com o
		streamer lá em cima, porque o portal não fecha quando ele escapa. ]]
	if evento.delta < 0 and Portal.aberto() then
		local quebrou = Portal.danificar(-evento.delta)
		publicarPortal(quebrou)
		if quebrou and not estado.encerrando then
			encerrarRodada("derrota")
		end
	end

	local origem = Plataformas.referencia()
	local destino = Tipos.limitarPlataforma(origem + evento.delta, estado.mapa.totalPlataformas)

	--[[ O piso do movimento é o PÉ da torre, não o zero do contrato.

		`limitarPlataforma` para em `PLATAFORMA_MIN` = 0, que é o piso do
		CONTRATO: existe para o delta negativo ter onde parar. Só que plataforma
		0 não existe no mundo — `posicaoDePouso(0)` devolve nil, e `CFrame.new(nil)`
		no Luau é a ORIGEM DO MUNDO. Um combate de frente com líquido negativo
		grande arremessava o boneco para (0,0,0), longe da torre.

		Era exatamente o "sai das plataformas quando um bate de frente com o
		outro": não era o combate, era o destino não existir. ]]
	local pe = Plataformas.primeira()
	if destino < pe then
		destino = pe
	end

	-- R6: delta que passaria do pé ou do topo para no limite. Se o limite comeu
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

	--[[ Quem suspende TEM que restaurar, inclusive quando o movimento recusa.

		O detector de queda e o efeito permanente são suspensos logo acima, e a
		restauração morava só no `aoTerminar`. Só que `Movimento.aplicar`
		devolve `false` em vários casos — destino sem posição no mundo,
		personagem sem raiz, personagem já removido — e nesses o `aoTerminar`
		nunca roda.

		O resultado era o pior possível e demorava a aparecer: o detector ficava
		suspenso PARA SEMPRE, e a partir dali nenhuma queda devolvia o boneco ao
		checkpoint. Ele caía da torre e continuava caindo. Da tela lia-se como
		"o combate jogou ele para fora das plataformas", porque era num combate
		que o destino saía da faixa. ]]
	local moveu = Movimento.aplicar(personagem, {
		plataformaOrigem = origem,
		plataformaDestino = destino,
		posicaoDestino = Plataformas.posicaoDePouso(destino),
		-- ADR-005, passo 3: pela escada, não pela reta. A torre é uma espiral
		-- quadrada e a reta de +100 plataformas atravessa o miolo dela — o
		-- boneco chegava ao destino sem ter passado por degrau nenhum.
		caminho = Plataformas.caminhoEntre(origem, destino),
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

	--[[ Movimento recusado devolve o controle NA HORA.

		Sem isto o detector de queda fica suspenso para sempre e o boneco cai da
		torre sem nunca voltar ao checkpoint. Ver o comentário acima. ]]
	if not moveu then
		Personagem.suspenderEfeito(personagem, false)
		Plataformas.suspenderDetector(false)
		warn(string.format(
			"[Kora] presente não moveu o boneco (%s -> %s); detector devolvido",
			tostring(origem), tostring(destino)
		))
		return
	end

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
	--[[ SEMPRE chamado, inclusive sem efeito nenhum.

		A guarda era `if estado.look.efeitoPermanente then`, e por isso salvar um
		look SEM efeito não tirava o efeito: a função que destrói o anterior
		simplesmente não era chamada. A aura sobrevivia ao respawn, ao troca de
		look e a tudo — "não consigo tirar".

		`ligarEfeitoPermanente(nil)` é o caso previsto: destrói o que havia e não
		liga nada. Ver o comentário dela em personagem.lua. ]]
	Personagem.ligarEfeitoPermanente(personagem, estado.look and estado.look.efeitoPermanente or nil)

	Plataformas.acompanhar(personagem)
end

--[[
	Religa o rastreio na torre NOVA. Chamado por todo caminho que reconstrói a
	torre com a sessão de pé.

	As conexões de `Touched` apontam para Parts, e uma torre reconstruída tem
	Parts novos: sem religar, o boneco pisa em plataformas que ninguém está
	escutando. `Plataformas.iniciar` sabe se religar sozinho, mas só enquanto
	ainda conhece o personagem — e o `pararDeAcompanhar()` que vem logo antes
	dele apaga exatamente isso. O resultado era o rastreio DESLIGADO depois de
	trocar de mundo pelo painel:

	  sem `Touched`   -> a referência não anda. O contador congela e as
	                     plataformas lá em cima não entram na conta.
	  sem `Heartbeat` -> `passo` não roda. O detector de queda morre junto, e
	                     o checkpoint deixa de existir.

	Os dois sintomas, uma linha faltando. Subir a sessão do zero nunca passou
	por aqui — lá o personagem chega DEPOIS do mapa, e `prepararPersonagem`
	religa por conta própria. Por isso só quebrava quando se trocava de mundo.
]]
local function religarRastreio()
	local personagem = personagemAtual()
	if personagem then
		Plataformas.acompanhar(personagem)
	end
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
	--[[ UMA vez por sessão, e só aqui.

		`aoMudar` empilha ouvintes, e reconstruir a torre não os apaga —
		`Plataformas.iniciar` zera a corrida, não a lista de quem escuta.
		Registrar de novo a cada troca de mundo fazia `publicarEstado` rodar
		duas, três, dez vezes por mudança, publicando o mesmo estado repetido
		para a ponte e para todos os clientes. ]]
	Plataformas.aoMudar(publicarEstado)

	local ok, erroPonte = Ponte.iniciar({
		aoEvento = aplicarPresente,
		aoConexao = function()
			publicarEstado()
		end,
		aoComando = function(tipo, quantidade)
			--[[ Zerar o placar, sem mexer na corrida.

				Separado do reiniciar de propósito: reiniciar é "a corrida
				recomeça, o placar continua", zerar é o contrário. O caso comum
				é justamente reiniciar sem perder o histórico da live. ]]
			if tipo == "zerar-placar" then
				estado.vitorias = 0
				estado.derrotas = 0
				publicarEstado()
				return
			end

			--[[ Trocar de mapa com a sessão de pé.

				O mapa é buscado UMA vez, no início da sessão — trocar no painel
				não chegava ao jogo, e a torre antiga continuava lá. Agora o
				painel manda este comando e a torre é reconstruída do spec novo,
				sem precisar parar e recomeçar a sessão. ]]
			if tipo == "recarregar-mapa" then
				local novoMapa, erroMapa = Ponte.buscarMapa()
				if not novoMapa then
					warn("[Kora] não consegui recarregar o mapa: " .. tostring(erroMapa))
					return
				end

				local novoConstruido, erroNovo = ConstrutorMapa.construir(novoMapa)
				if not novoConstruido then
					-- Mantém a torre antiga: derrubar a que funciona por causa de
					-- um spec ruim deixaria a live sem mapa nenhum.
					warn("[Kora] mapa novo rejeitado, mantendo o atual: " .. tostring(erroNovo))
					return
				end

				Plataformas.pararDeAcompanhar()
				estado.mapa = novoMapa
				estado.construido = novoConstruido
				Plataformas.iniciar(novoMapa, novoConstruido.plataformas)
				religarRastreio()

				local personagemAtualizado = personagemAtual()
				if personagemAtualizado and personagemAtualizado.PrimaryPart then
					personagemAtualizado:PivotTo(CFrame.new(novoConstruido.spawn))
				end

				estado.saiuDoPrimeiro = false
				-- A torre antiga não existe mais, e o portal ficava no pé dela.
				Portal.fechar()
				publicarPortal(false)
				print("[Kora] mapa recarregado: " .. tostring(novoMapa.nome))
				publicarEstado()
				return
			end

			--[[ Presente vinculado ao placar (ADR-007, lista separada).

				Encerra a rodada do mesmo jeito que chegar ao topo ou cair no
				primeiro andar: conta ponto e dispara a contagem. Passa pelo
				MESMO caminho de propósito — um segundo jeito de encerrar rodada
				divergiria do primeiro na primeira mudança. ]]
			if tipo == "vitoria" or tipo == "derrota" then
				--[[ Um donate pode valer N rodadas (R4, `quantidade`).

					Entram numa FILA e são cobradas uma a uma, cada uma com sua
					queda e sua contagem. Somar as seis no número de uma vez
					daria o mesmo placar e nenhum espetáculo — e é o espetáculo
					que o espectador comprou.

					Fila nova substitui a antiga em vez de somar: uma vitória
					mandada no meio de seis derrotas é uma virada, não um
					acréscimo à punição. ]]
				local devidas = 1
				if type(quantidade) == "number" and quantidade > 1 then
					devidas = math.floor(quantidade)
				end
				estado.fila = { tipo = tipo, restantes = devidas }

				if not estado.encerrando then
					cobrarProximaDaFila()
				end
				return
			end

			if tipo ~= "reiniciar" then
				return
			end

			-- Devolve o controle antes de teleportar: reiniciar no meio de uma
			-- animação deixaria a raiz ancorada no pé da torre, e o watchdog
			-- do R11 só a soltaria um segundo depois — com o boneco preso e o
			-- streamer achando que o botão travou o jogo.
			local personagem = personagemAtual()
			if personagem then
				Movimento.restaurar(personagem)
				Personagem.suspenderEfeito(personagem, false)
			end
			Plataformas.suspenderDetector(false)

			Plataformas.reiniciarCorrida("reinício pelo painel (R6)")

			-- Corrida nova não herda portal nem dívida: o botão do painel é o
			-- streamer limpando a mesa, e uma fila de seis derrotas
			-- sobrevivendo a ele tornaria o botão inútil na hora em que ele
			-- mais serve.
			estado.fila = nil
			Portal.fechar()
			publicarPortal(false)

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

--[[
	Reconstrói a torre com a geometria trocada, sem tocar no mapa em disco.

	É ferramenta de AFINAÇÃO, e existe porque achar o formato certo da torre
	pelo caminho longo — mudar o prompt, regerar com o Gemini, remontar o place,
	abrir o Studio, dar Play — custa minutos por tentativa e some com a vontade
	de experimentar. Aqui é um clique.

	Nunca persiste: quando os números ficarem bons, eles vão para o prompt e o
	mapa nasce assim. O que muda aqui morre quando o servidor cai, de propósito
	— mapa de verdade é gerado e validado, não editado à mão no Studio.

	Devolve (ok, problemas). Rejeita pelas MESMAS regras do mapa gerado: um
	ajuste que produz torre intransponível não vale mais que um spec ruim.
]]
function Sessao.ajustarGeometria(ajustes)
	if not estado.mapa then
		return false, { "não há mapa carregado para ajustar" }
	end
	if type(ajustes) ~= "table" then
		return false, { "ajustes inválidos" }
	end

	-- Cópia: o mapa original fica intacto para um ajuste ruim não deixar a
	-- sessão sem nada a que voltar.
	local novo = {}
	for chave, valor in pairs(estado.mapa) do
		novo[chave] = valor
	end
	novo.plataformas = {}
	for chave, valor in pairs(estado.mapa.plataformas) do
		novo.plataformas[chave] = valor
	end

	for _, campo in ipairs({ "raioBase", "variacaoRaio", "espacamentoVertical", "variacaoHorizontal" }) do
		if Tipos.ehNumero(ajustes[campo]) then
			novo.plataformas[campo] = ajustes[campo]
		end
	end
	if Tipos.ehNumero(ajustes.jumpHeight) then
		novo.jumpHeight = ajustes.jumpHeight
	end
	if Tipos.ehInteiro(ajustes.totalPlataformas) and ajustes.totalPlataformas > 1 then
		novo.totalPlataformas = ajustes.totalPlataformas
		-- O marco de topo tem que acompanhar, senão o próprio contrato reprova.
		for _, marco in ipairs(novo.marcos or {}) do
			if marco.tipo == "topo" then
				marco.plataforma = novo.totalPlataformas
			end
		end
	end

	local construido, erro = ConstrutorMapa.construir(novo)
	if not construido then
		return false, { tostring(erro) }
	end

	Plataformas.pararDeAcompanhar()
	estado.mapa = novo
	estado.construido = construido
	Plataformas.iniciar(novo, construido.plataformas)
	religarRastreio()

	local personagem = personagemAtual()
	if personagem and personagem.PrimaryPart then
		personagem:PivotTo(CFrame.new(construido.spawn))
	end

	--[[ A referência começa em 1, e não em 0.

		Ela só andava por TOQUE (R9.2), e o boneco nasce já apoiado no degrau 1 —
		sem transição de contato, o `Touched` pode nunca disparar. O contador
		ficava em "0 / 5000" com o jogador parado em cima da primeira
		plataforma.

		Pior que o contador: `posicaoDePouso(0)` não existe, então TODO respawn
		saía sem posição e o boneco ficava onde o Roblox o largasse — fora da
		torre. Um empate: sem tocar não há referência, e sem referência não há
		para onde voltar.

		Isto não afrouxa o R9.2. A regra continua sendo "a última que ENCOSTOU";
		o que muda é o ponto de partida, que é conhecido — acabamos de pousar o
		boneco ali nesta mesma linha. ]]
	Plataformas.definirReferencia(Tipos.PLATAFORMA_INICIAL, "início da sessão: o boneco nasce no primeiro degrau")

	--[[ Portal no topo, só estética.

		O último degrau já diz "FINAL" escrito em cima, mas texto só se lê de
		perto. O portal se reconhece de longe, e é ele que diz "é ali" para quem
		está subindo. Não apanha, não quebra e não conta nada — o portal que
		importa é o do chão. ]]
	--[[ O do topo também olha para fora.

		Lá em cima não há "próximo degrau" — `beiradaDe` cai no padrão +Z, que é
		arbitrário. De costas para o último passo dado, ele fica de frente para
		quem chega, que é o único ponto de vista que importa no fim. ]]
	Portal.decorarFinal(
		Plataformas.topoDe(novo.totalPlataformas),
		beiradaDeCosta(novo.totalPlataformas)
	)

	return true, nil
end

--[[
	Relê o look do disco e veste na hora. Chamado quando o vestiário salva.

	`estado.look` era lido uma vez, no início da sessão, e nunca mais. Salvar no
	vestiário gravava em disco e o respawn seguinte vestia o look de ANTES: o
	streamer tirava a aura, morria, e ela voltava. Do lado do disco estava tudo
	certo o tempo todo — era a sessão segurando uma cópia velha.

	Relê da ponte em vez de confiar no que o cliente mandou: quem valida é o
	servidor, e o disco é a fonte.
]]
function Sessao.recarregarLook()
	if not estado.rodando then
		return false
	end

	local novo = Ponte.buscarLook()
	if not novo then
		return false
	end

	estado.look = novo
	local personagem = personagemAtual()
	if personagem then
		Personagem.aplicarLook(estado.jogador, novo)
		Personagem.ligarEfeitoPermanente(personagem, novo.efeitoPermanente)
	end
	return true
end

function Sessao.parar()
	estado.rodando = false
	estado.venceu = false
	Ponte.parar()
	Plataformas.pararDeAcompanhar()

	local personagem = personagemAtual()
	if personagem then
		Movimento.restaurar(personagem)
		Personagem.limpar(personagem)
	end

	ConstrutorMapa.limpar()
	Portal.fechar()
	Portal.limparFinal()
	estado.fila = nil
	estado.mapa = nil
	estado.construido = nil
	estado.look = nil

	-- Último estado com sessaoAtiva falso: é o que destranca o vestiário.
	Eventos.obter(Eventos.ESTADO):FireAllClients(montarEstado())
end

Sessao.estado = montarEstado

return Sessao
