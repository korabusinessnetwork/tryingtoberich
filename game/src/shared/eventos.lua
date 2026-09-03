--!strict
-- Contrato de comunicação servidor ↔ cliente dentro do jogo.
--
-- Existe para os módulos do servidor e do cliente serem escritos em paralelo
-- sem combinarem nome de RemoteEvent no corredor. Quem cria os objetos é este
-- módulo, sob demanda, e ninguém mais.
--
-- Regra: o cliente NUNCA manda comando de jogo para o servidor. Os únicos
-- eventos no sentido cliente → servidor são os do vestiário, que é uma tela de
-- configuração e não parte da partida.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Eventos = {}

Eventos.PASTA = "KoraEventos"

-- Servidor → cliente
Eventos.PRESENTE = "Presente"
Eventos.ESTADO = "Estado"
Eventos.COMBATE_ANULADO = "CombateAnulado"
Eventos.VITORIA = "Vitoria"
Eventos.TREMOR = "Tremor"
Eventos.CAMERA = "Camera"
Eventos.FLASH = "Flash"

-- Cliente → servidor (só vestiário, ver ADR-011)
Eventos.VESTIARIO_BUSCAR = "VestiarioBuscar"
Eventos.VESTIARIO_EQUIPAR = "VestiarioEquipar"
Eventos.VESTIARIO_SALVAR = "VestiarioSalvar"

--[[
	Ajuste de geometria ao vivo, para achar o formato da torre sem o ciclo
	"muda o prompt -> regera -> reabre o Studio -> Play", que custa minutos por
	tentativa. Cliente manda os números, o servidor reconstrói e responde o que
	deu. Ferramenta de AFINAÇÃO: nunca toca no mapa em disco.
]]
Eventos.AJUSTAR_MAPA = "AjustarMapa"

--[[
	Fim de rodada: chegou ao topo (vitória) ou voltou ao primeiro andar depois
	de ter saído dele (derrota). Leva o placar acumulado e dispara a contagem
	regressiva antes do reinício automático.
]]
Eventos.RODADA_ENCERRADA = "RodadaEncerrada"

--[[
	O portal do primeiro andar: abriu, apanhou, quebrou.

	Sem isto o HUD não teria como mostrar a barra de vida, e uma disputa que o
	espectador não vê acontecer não é disputa — é o boneco parado no chão. Leva
	`vida` e `vidaMaxima` a cada golpe, e `quebrou` no último.
]]
Eventos.PORTAL = "Portal"

--[[
	Galeria de skins: o vestiário pede a lista de nicks curada no painel, ou a
	skin de um deles para vestir como base. Cliente → servidor, e a resposta
	volta pelo mesmo remoto.
]]
Eventos.VESTIARIO_GALERIA = "VestiarioGaleria"

--[[
	Formato de cada evento, para os dois lados escreverem contra a mesma coisa:

	PRESENTE (servidor → cliente), a cada disparo aplicado
	  { animacaoId, delta, intensidade, efeitoCurto, nomeDoador, presenteNome,
	    plataformaOrigem, plataformaDestino, disputa }
	  `disputa` é nil quando o presente disparou sozinho, e uma tabela
	  { participantes, somaSubida, somaDescida, liquido, contestado } quando o
	  disparo é resultado de um combate (ADR-012).

	ESTADO (servidor → cliente), no máximo a cada 2s ou quando muda
	  { plataformaReferencia, plataformaMaxima, emAnimacao, totalPlataformas,
	    sessaoAtiva }
	  `sessaoAtiva` existe para o vestiário saber quando se trancar: o ADR-011
	  proíbe abri-lo com a sessão rodando, porque streamer parado num menu é a
	  tela estática que o ADR-009 evita. Sem este campo, o cliente só poderia
	  adivinhar por heurística de tempo, e adivinhar erra.

	COMBATE_ANULADO (servidor → cliente)
	  { somaSubida, somaDescida, participantes }
	  Líquido zero: ninguém anda. Sem isto na tela, empate parece travamento.

	VITORIA (servidor → cliente)
	  { plataforma, totalPlataformas, reiniciou }
	  R6: chegou ao topo. `reiniciou` verdadeiro é o outro lado do mesmo
	  evento — a corrida voltou ao pé da torre por ordem do painel — e existe
	  para o HUD tirar o aviso da tela pelo mesmo caminho que o pôs, em vez de
	  adivinhar por tempo. O jogo NÃO reinicia sozinho: quem decide é o
	  streamer, e a ordem chega pelo long-poll (ADR-013).

	TREMOR (servidor → cliente)
	  { intensidade, duracao }

	CAMERA (servidor → cliente)
	  { afastar, duracao } — afasta em animação de peso visual 4 ou 5.

	FLASH (servidor → cliente)
	  { cor, duracao, opacidade }
	  Clarão de tela inteira. Existe porque efeito de TELA não é efeito de
	  mundo: nenhum Highlight ou PointLight cobre a tela, e a Fênix (peso 5)
	  pede "tela dourada". É o único jeito de uma animação alcançar o pixel
	  que não tem geometria atrás.
]]

local function garantirPasta()
	local pasta = ReplicatedStorage:FindFirstChild(Eventos.PASTA)
	if not pasta then
		pasta = Instance.new("Folder")
		pasta.Name = Eventos.PASTA
		pasta.Parent = ReplicatedStorage
	end
	return pasta
end

--[[
	Devolve o RemoteEvent com este nome, criando se ainda não existir.

	O servidor chama isto na subida e cria todos. O cliente chama e espera:
	`WaitForChild` sem timeout trava o cliente para sempre se o servidor falhar,
	então há um teto e um erro claro.
]]
function Eventos.obter(nome)
	local pasta = garantirPasta()

	if game:GetService("RunService"):IsServer() then
		local existente = pasta:FindFirstChild(nome)
		if existente then
			return existente
		end
		local remoto = Instance.new("RemoteEvent")
		remoto.Name = nome
		remoto.Parent = pasta
		return remoto
	end

	local remoto = pasta:WaitForChild(nome, 15)
	if not remoto then
		error("RemoteEvent '" .. nome .. "' não apareceu. O servidor subiu?")
	end
	return remoto
end

--[[ Cria todos de uma vez. O servidor chama antes de qualquer cliente entrar. ]]
function Eventos.criarTodos()
	local nomes = {
		Eventos.PRESENTE, Eventos.ESTADO, Eventos.COMBATE_ANULADO, Eventos.VITORIA,
		Eventos.TREMOR, Eventos.CAMERA, Eventos.FLASH,
		Eventos.VESTIARIO_BUSCAR, Eventos.VESTIARIO_EQUIPAR, Eventos.VESTIARIO_SALVAR,
		Eventos.AJUSTAR_MAPA, Eventos.RODADA_ENCERRADA, Eventos.VESTIARIO_GALERIA,
		Eventos.PORTAL,
	}
	for _, nome in ipairs(nomes) do
		Eventos.obter(nome)
	end
end

return Eventos
