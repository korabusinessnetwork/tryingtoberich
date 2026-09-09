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

--[[ Servidor → cliente.

	PRESENTE, COMBATE_ANULADO, VITORIA, RODADA_ENCERRADA e PORTAL saíram daqui
	quando o HUD saiu do jogo (ADR-015): eles existiam só para alimentar
	`hud.client.lua`, e quem desenha essas cinco coisas hoje é o overlay do OBS,
	que não fala Roblox — ele lê o estado pela ponte. RemoteEvent que ninguém
	escuta é feature morta sem erro nenhum, e há teste cobrando os dois lados.

	ESTADO ficou: a câmera e os ajustes ao vivo continuam ouvindo. ]]
Eventos.ESTADO = "Estado"
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
	Galeria de skins: o vestiário pede a lista de nicks curada no painel, ou a
	skin de um deles para vestir como base. Cliente → servidor, e a resposta
	volta pelo mesmo remoto.
]]
Eventos.VESTIARIO_GALERIA = "VestiarioGaleria"

--[[
	Formato de cada evento, para os dois lados escreverem contra a mesma coisa.
	É o único lugar onde este contrato está escrito, e o teste que lê este
	arquivo confere só as declarações `Eventos.X = "Y"` — o bloco abaixo ninguém
	verifica por fora, então ele desatualiza calado. Quem mexer em `montarEstado`
	(game/src/server/sessao.lua) mexe aqui e em estado-jogo.schema.json: os três
	descrevem o MESMO objeto, e campo que existe num e falta no schema derruba o
	payload inteiro na entrada da ponte.

	ESTADO (servidor → cliente), no máximo a cada 2s ou quando muda
	  { plataformaReferencia, plataformaMaxima, quedasNaturais, emAnimacao,
	    totalPlataformas, sessaoAtiva, aoVivo, vitorias, derrotas, vitoria,
	    portal, contagem }
	  `sessaoAtiva` existe para o vestiário saber quando se trancar: o ADR-011
	  proíbe abri-lo com a sessão rodando, porque streamer parado num menu é a
	  tela estática que o ADR-009 evita. Sem este campo, o cliente só poderia
	  adivinhar por heurística de tempo, e adivinhar erra. `aoVivo` é outra
	  coisa: sessão rodando E live conectada — no Studio a sessão roda sem live.
	  `vitorias`, `derrotas` e `vitoria` são o placar da SESSÃO (R6).
	  `portal` é { aberto, vida, vidaMaxima } e `contagem` é
	  { resultado, restanteMs } ou nil. Os dois viajam aqui porque quem os
	  desenha hoje é o overlay do OBS (ADR-015), que não fala Roblox e só
	  conhece este payload — `restanteMs` é o tempo QUE FALTA, para os dois
	  relógios não precisarem concordar.

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
		Eventos.ESTADO, Eventos.TREMOR, Eventos.CAMERA, Eventos.FLASH,
		Eventos.VESTIARIO_BUSCAR, Eventos.VESTIARIO_EQUIPAR, Eventos.VESTIARIO_SALVAR,
		Eventos.AJUSTAR_MAPA, Eventos.VESTIARIO_GALERIA,
	}
	for _, nome in ipairs(nomes) do
		Eventos.obter(nome)
	end
end

return Eventos
