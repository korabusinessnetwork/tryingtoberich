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
Eventos.TREMOR = "Tremor"
Eventos.CAMERA = "Camera"
Eventos.FLASH = "Flash"

-- Cliente → servidor (só vestiário, ver ADR-011)
Eventos.VESTIARIO_BUSCAR = "VestiarioBuscar"
Eventos.VESTIARIO_EQUIPAR = "VestiarioEquipar"
Eventos.VESTIARIO_SALVAR = "VestiarioSalvar"

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
		Eventos.PRESENTE, Eventos.ESTADO, Eventos.COMBATE_ANULADO,
		Eventos.TREMOR, Eventos.CAMERA, Eventos.FLASH,
		Eventos.VESTIARIO_BUSCAR, Eventos.VESTIARIO_EQUIPAR, Eventos.VESTIARIO_SALVAR,
	}
	for _, nome in ipairs(nomes) do
		Eventos.obter(nome)
	end
end

return Eventos
