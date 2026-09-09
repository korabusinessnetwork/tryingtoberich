--!strict
--[[
	O portal do primeiro andar.

	Antes desta mudança, voltar ao pé da torre depois de ter saído era derrota
	na hora: contagem regressiva e reinício, sem ninguém poder fazer nada. Isso
	é o fim de uma disputa, não uma disputa — o momento mais dramático da live
	acontecia sozinho, com a plateia assistindo.

	Agora o chão tem um portal, e ele muda quem decide:

	  - ele se ergue quando o streamer volta ao andar 1 depois de ter saído;
	  - só presente NEGATIVO o machuca, e o dano é o tamanho do empurrão
	    (`|delta|`, em andares): quem quer a derrota tem que pagar por ela;
	  - enquanto ele estiver de pé dá para escapar subindo — mas o portal NÃO
	    fecha junto. Ele fica lá embaixo apanhando, e pode quebrar com o
	    streamer no andar 300;
	  - quebrou, é derrota.

	O presente de placar `derrota` (ADR-007) é o atalho pago: quebra o portal
	inteiro de uma vez, sem gastar a vida dele.

	Este módulo não conhece rodada nem placar. Ele ergue, apanha e avisa; quem
	decide o que fazer com "quebrou" é a `sessao`.
]]

local Debris = game:GetService("Debris")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Tipos = require(Compartilhado.tipos)

local Portal = {}

Portal.NOME = "KoraPortal"

--[[ O portal do TOPO, puro cenário.

	Nome próprio porque ele não participa de nada: não apanha, não quebra, não
	conta derrota. Existe para o último degrau ser reconhecível de longe — o
	número diz "FINAL", e o portal diz a mesma coisa para quem está subindo e
	ainda não consegue ler o texto. ]]
Portal.NOME_DO_FINAL = "KoraPortalFinal"

--[[ Medidas do portal do Nether, em studs. Alto e estreito de propósito: é
	uma moldura de pé no chão, e o streamer tem que conseguir reconhecê-la de
	longe num vídeo vertical.

	E generosas: no enquadramento da escalada, com a câmera olhando a torre de
	cima, a moldura pequena virava detalhe de cenário — e ela é o ALVO da rodada,
	a coisa que a plateia está pagando para quebrar.

	A LARGURA é um teto, não uma promessa: quando a plataforma é mais estreita
	que a moldura inteira, ela encolhe até caber (nunca abaixo do mínimo). Sem
	isso, no mapa de disco — 15 studs de lado — os dois pilares nasciam fora da
	plataforma, pendurados no vão. Quem carrega o tamanho é a ALTURA, que não
	depende do chão e é o que se lê num vídeo vertical. ]]
local LARGURA_INTERNA = 14
local LARGURA_INTERNA_MINIMA = 6
local ALTURA_INTERNA = 21
local ESPESSURA_DA_MOLDURA = 3
local PROFUNDIDADE = 2.5

--[[ Quanto a moldura para ANTES da borda da plataforma. O avanço mira o limite
	da parte, e o portal tem espessura própria: sem descontar as duas coisas ele
	nasceria com metade do corpo no ar. ]]
local RECUO_DA_BEIRADA = 1

local COR_DA_MOLDURA = Color3.fromRGB(22, 18, 28)
local COR_DO_VAZIO = Color3.fromRGB(126, 44, 214)

--[[ Estado do portal. Módulo e não objeto porque só existe um, e a `sessao`
	precisa perguntar por ele de vários lugares sem carregar a referência. ]]
local estado = {
	parte = nil,
	vazio = nil,
	vida = 0,
	vidaMaxima = 0,
	aberto = false,
	--[[ Os tijolos da moldura que ainda estão de pé, na ORDEM em que vão cair.

		A moldura é montada em pedaços justamente para poder quebrar: cada golpe
		derruba a fatia de tijolos que a vida perdida representa, e o portal vai
		ficando esburacado até não sobrar nada. Antes ela era quatro blocos
		inteiros e a única pista de dano era o vazio esmaecendo — o espectador
		pagava para quebrar uma coisa que não se quebrava. ]]
	tijolos = {},
	centro = nil,
}

local function destruirModelo()
	local existente = Workspace:FindFirstChild(Portal.NOME)
	if existente then
		existente:Destroy()
	end
	estado.parte = nil
	estado.vazio = nil
	estado.tijolos = {}
	estado.centro = nil
end

--[[ Uma peça da moldura. `deslocamento` é em coordenadas DA MOLDURA, não do
	mundo: o portal fica de través no caminho, e somar offset nos eixos do mundo
	devolveria cada peça ao alinhamento antigo assim que ele girasse. ]]
local function bloco(pai, nome, tamanho, deslocamento, base, cor, material)
	local parte = Instance.new("Part")
	parte.Name = nome
	parte.Anchored = true
	parte.CanCollide = false
	parte.Size = tamanho
	parte.CFrame = base * CFrame.new(deslocamento)
	parte.Color = cor
	parte.Material = material
	parte.TopSurface = Enum.SurfaceType.Smooth
	parte.BottomSurface = Enum.SurfaceType.Smooth
	parte.Parent = pai
	return parte
end

--[[ Quantos tijolos cabem num lado da moldura, e de que tamanho.

	A conta é sempre a mesma: divide o comprimento pela espessura da moldura e
	arredonda, para o tijolo sair aproximadamente cúbico. Mínimo de 3 porque
	dois pedaços não leem como "se quebrando", leem como "faltou uma peça". ]]
local function quantosTijolos(comprimento)
	return math.max(3, math.floor(comprimento / ESPESSURA_DA_MOLDURA + 0.5))
end

--[[ Uma parede da moldura, fatiada em tijolos ao longo de `eixo`.

	`eixo` é unitário em coordenadas DA MOLDURA — Vector3.new(0,1,0) para os
	pilares, (1,0,0) para as travessas.

	`coletor` é a lista que recebe os tijolos, ou nil. O portal do TOPO monta a
	mesma geometria e passa nil: ele é cenário, não apanha e não pode entrar na
	contagem de quem quebra. ]]
local function parede(modelo, nome, tamanho, centro, base, eixo, coletor)
	local comprimento = math.abs(tamanho:Dot(eixo))
	local quantidade = quantosTijolos(comprimento)
	local passo = comprimento / quantidade
	-- O tijolo é a parede inteira menos o eixo fatiado, mais a fatia no eixo.
	local corte = tamanho - eixo * comprimento + eixo * passo
	local partida = centro - eixo * (comprimento * 0.5) + eixo * (passo * 0.5)

	for i = 1, quantidade do
		local tijolo = bloco(modelo, nome .. i, corte, partida + eixo * (passo * (i - 1)),
			base, COR_DA_MOLDURA, Enum.Material.Slate)
		if coletor then
			table.insert(coletor, tijolo)
		end
	end
end

--[[ Um tijolo se soltando: voa para fora, gira, some.

	Sem velocidade ele só cairia reto, que na tela lê como bug de física em vez
	de estrago. Para FORA do portal e para cima, com giro, é o que se reconhece
	como pedaço arrancado. ]]
local function estilhacar(tijolo)
	if not tijolo or not tijolo.Parent then
		return
	end
	local centro = estado.centro or tijolo.Position
	local paraFora = tijolo.Position - centro
	if paraFora.Magnitude < 0.1 then
		paraFora = Vector3.new(0, 1, 0)
	end
	paraFora = paraFora.Unit

	tijolo.Anchored = false
	tijolo.CanCollide = false
	tijolo.Massless = true
	tijolo.AssemblyLinearVelocity = paraFora * 22 + Vector3.new(0, 14, 0)
	tijolo.AssemblyAngularVelocity = Vector3.new(
		math.random(-9, 9), math.random(-9, 9), math.random(-9, 9))

	TweenService:Create(tijolo, TweenInfo.new(1.6), { Transparency = 1 }):Play()
	Debris:AddItem(tijolo, 2)
end

--[[ Racha um tijolo: fendas finas na face, brasa acesa dentro delas.

	Antes de cair, o pedaço tem que dar sinal de que está cedendo. Sem isso o
	portal fica inteiro, inteiro, inteiro e de repente perde um bloco — o dano
	acontece em degraus visíveis demais, e entre um golpe e outro nada muda na
	tela para quem está pagando por eles.

	Fenda é peça fina e escura atravessada na face, com uma veia Neon vermelha
	por dentro: obsidiana rachando com o Nether aparecendo por trás. Sem textura
	de propósito — imagem precisaria passar pela moderação do Roblox (ADR-004), e
	isto é geometria, que sobe junto com o jogo. ]]
local FENDAS_POR_TIJOLO = 2
local COR_DA_BRASA = Color3.fromRGB(255, 96, 40)

local function rachar(tijolo)
	if not tijolo or not tijolo.Parent or tijolo:GetAttribute("KoraRachado") then
		return
	end
	tijolo:SetAttribute("KoraRachado", true)

	local lado = math.min(tijolo.Size.X, tijolo.Size.Y)
	for i = 1, FENDAS_POR_TIJOLO do
		local comprimento = lado * (0.55 + math.random() * 0.35)
		local fenda = Instance.new("Part")
		fenda.Name = "Fenda" .. i
		fenda.Anchored = true
		fenda.CanCollide = false
		fenda.CanQuery = false
		fenda.CanTouch = false
		fenda.CastShadow = false
		fenda.Material = Enum.Material.Neon
		fenda.Color = COR_DA_BRASA
		-- Fina nos dois eixos da face e um dedo mais funda que a peça, para a
		-- veia aparecer dos dois lados sem z-fighting com a superfície.
		fenda.Size = Vector3.new(comprimento, lado * 0.06, tijolo.Size.Z * 1.04)
		fenda.CFrame = tijolo.CFrame
			* CFrame.new((math.random() - 0.5) * lado * 0.4, (math.random() - 0.5) * lado * 0.4, 0)
			* CFrame.Angles(0, 0, math.rad(math.random(-70, 70)))
		fenda.Parent = tijolo

		local solda = Instance.new("WeldConstraint")
		solda.Part0 = tijolo
		solda.Part1 = fenda
		solda.Parent = fenda
	end
end

--[[ Derruba os tijolos que a vida perdida já não sustenta.

	`restante` de 1 a 0. Os tijolos caem na ordem em que foram embaralhados no
	`abrir`, para o buraco aparecer espalhado em vez de comer a moldura de baixo
	para cima como uma barra de progresso deitada. ]]
local function desmoronar(restante)
	restante = math.clamp(restante, 0, 1)

	local alvo = math.max(0, math.ceil(#estado.tijolos * restante))
	while #estado.tijolos > alvo do
		estilhacar(table.remove(estado.tijolos))
	end

	--[[ E o que ficou de pé racha, na mesma proporção do estrago.

		As fendas vão do FIM da lista para o começo: o fim é justamente quem cai
		no próximo golpe, então o tijolo racha e depois se solta — a ordem que se
		espera de uma coisa quebrando. ]]
	local rachados = math.floor(#estado.tijolos * (1 - restante) + 0.5)
	for i = #estado.tijolos, math.max(1, #estado.tijolos - rachados + 1), -1 do
		rachar(estado.tijolos[i])
	end
end


--[[
	Ergue o portal em cima de uma posição — normalmente o topo da plataforma 1.

	`beirada` é opcional e diz onde a plataforma acaba — { frente, meiaExtensao,
	meiaLargura }, como `Plataformas.beiradaDe` entrega. Com ela o portal sai do
	MEIO da plataforma e vai para a borda voltada ao fim do mapa, atravessado no
	caminho: quem sobe passa por dentro dele. No meio ele nascia em volta do
	próprio boneco — é exatamente ali que o respawn acontece — e ainda ficava de
	perfil para a câmera. Sem `beirada` vale o comportamento antigo: centrado e
	alinhado aos eixos do mundo.

	`CanCollide` fica falso em tudo: o portal é cenário e alvo, nunca obstáculo.
	Um portal sólido no pé da torre empurraria o boneco no respawn, que é
	exatamente onde ele nasce.
]]
--[[ Monta a moldura e devolve `modelo, vazio`. Serve aos dois portais.

	O do chão APANHA e quebra; o do topo é só cenário. A geometria é a mesma, e
	duplicá-la faria os dois divergirem no primeiro ajuste de tamanho. ]]
local function montarPortal(nome, posicaoDaBase, beirada, coletor)
	local modelo = Instance.new("Model")
	modelo.Name = nome

	--[[ Onde a moldura fica e para onde ela olha.

		Sem beirada válida sobra a posição crua, alinhada aos eixos. Com ela o
		centro anda até a borda da plataforma e `lookAt` põe o portal de través:
		a profundidade passa a correr no sentido da caminhada, que é o que faz o
		streamer atravessá-lo subindo em vez de raspar nele de lado. ]]
	local base = CFrame.new(posicaoDaBase)
	local temBeirada = (type(beirada) == "table")
	local frente = temBeirada and beirada.frente or nil
	if typeof(frente) == "Vector3" then
		local plana = Vector3.new(frente.X, 0, frente.Z)
		if plana.Magnitude > 1e-3 then
			local direcao = plana.Unit
			local meiaExtensao = 0
			if type(beirada.meiaExtensao) == "number" then
				meiaExtensao = beirada.meiaExtensao
			end
			-- Plataforma curta simplesmente avança menos; nunca sai para o vão.
			local avanco = math.max(0, meiaExtensao - PROFUNDIDADE * 0.5 - RECUO_DA_BEIRADA)
			local centro = posicaoDaBase + direcao * avanco
			base = CFrame.lookAt(centro, centro + direcao)
		end
	end

	--[[ A moldura cabe na plataforma ou encolhe até caber.

		`meiaLargura` é do centro à borda de través; o dobro é a plataforma
		inteira, e o que sobra depois dos dois pilares é o vão do portal. Só
		encolhe: plataforma larga não estica a moldura além do teto, senão a
		laje (2,2x mais larga que funda) faria um portal desproporcional. ]]
	local larguraInterna = LARGURA_INTERNA
	if temBeirada and type(beirada.meiaLargura) == "number" and beirada.meiaLargura > 0 then
		local cabe = beirada.meiaLargura * 2 - ESPESSURA_DA_MOLDURA * 2
		larguraInterna = math.max(LARGURA_INTERNA_MINIMA, math.min(LARGURA_INTERNA, cabe))
	end

	local meiaLargura = (larguraInterna + ESPESSURA_DA_MOLDURA) * 0.5

	--[[ Moldura: dois pilares e duas travessas, como a obsidiana do Minecraft —
		e cada um deles fatiado em tijolos, para o portal poder se quebrar
		pedaço a pedaço conforme apanha. Ver `parede` e `desmoronar`. ]]
	local VERTICAL = Vector3.new(0, 1, 0)
	local HORIZONTAL = Vector3.new(1, 0, 0)

	parede(modelo, "PilarEsquerdo",
		Vector3.new(ESPESSURA_DA_MOLDURA, ALTURA_INTERNA, PROFUNDIDADE),
		Vector3.new(-meiaLargura, ALTURA_INTERNA * 0.5, 0),
		base, VERTICAL, coletor)

	parede(modelo, "PilarDireito",
		Vector3.new(ESPESSURA_DA_MOLDURA, ALTURA_INTERNA, PROFUNDIDADE),
		Vector3.new(meiaLargura, ALTURA_INTERNA * 0.5, 0),
		base, VERTICAL, coletor)

	local larguraTotal = larguraInterna + ESPESSURA_DA_MOLDURA * 2
	parede(modelo, "TravessaBaixo",
		Vector3.new(larguraTotal, ESPESSURA_DA_MOLDURA, PROFUNDIDADE),
		Vector3.new(0, -ESPESSURA_DA_MOLDURA * 0.5, 0),
		base, HORIZONTAL, coletor)

	parede(modelo, "TravessaCima",
		Vector3.new(larguraTotal, ESPESSURA_DA_MOLDURA, PROFUNDIDADE),
		Vector3.new(0, ALTURA_INTERNA + ESPESSURA_DA_MOLDURA * 0.5, 0),
		base, HORIZONTAL, coletor)

	-- O vazio roxo. Neon emite luz própria, sem depender de Lighting — é o que
	-- faz o portal ser visível de longe mesmo num mapa de céu escuro.
	local vazio = bloco(modelo, "Vazio",
		Vector3.new(larguraInterna, ALTURA_INTERNA, PROFUNDIDADE * 0.4),
		Vector3.new(0, ALTURA_INTERNA * 0.5, 0),
		base, COR_DO_VAZIO, Enum.Material.Neon)
	vazio.Transparency = 0.25

	local luz = Instance.new("PointLight")
	luz.Color = COR_DO_VAZIO
	luz.Range = 40
	luz.Brightness = 3
	luz.Parent = vazio

	-- Partícula subindo dentro do vazio: é o que o olho reconhece como portal
	-- do Nether antes de ler qualquer número na tela.
	local fumaca = Instance.new("ParticleEmitter")
	fumaca.Color = ColorSequence.new(COR_DO_VAZIO)
	fumaca.Size = NumberSequence.new(2)
	fumaca.Transparency = NumberSequence.new(0.55)
	fumaca.Lifetime = NumberRange.new(1.2, 2)
	fumaca.Rate = 38
	fumaca.Speed = NumberRange.new(1.5, 3)
	fumaca.SpreadAngle = Vector2.new(12, 12)
	fumaca.LightEmission = 0.8
	fumaca.Parent = vazio

	modelo.PrimaryPart = vazio
	modelo.Parent = Workspace
	return modelo, vazio
end

--[[
	Ergue o portal do primeiro degrau: o que apanha e, quebrando, dá a derrota.
]]
function Portal.abrir(posicaoDaBase, vidaMaxima, beirada)
	destruirModelo()

	local vida = vidaMaxima
	if type(vida) ~= "number" or vida <= 0 then
		vida = Tipos.VIDA_PADRAO_DO_PORTAL
	end

	local modelo, vazio = montarPortal(Portal.NOME, posicaoDaBase, beirada, estado.tijolos)

	--[[ Embaralha a ordem de queda.

		Na ordem de construção o portal se desfaria de baixo para cima, pilar por
		pilar, que lê como barra de progresso deitada e não como coisa quebrando.
		Espalhado, cada golpe abre um buraco onde calhar — e é isso que faz a
		moldura parecer que está cedendo. ]]
	for i = #estado.tijolos, 2, -1 do
		local j = math.random(i)
		estado.tijolos[i], estado.tijolos[j] = estado.tijolos[j], estado.tijolos[i]
	end

	estado.parte = modelo
	estado.vazio = vazio
	-- O centro serve ao estilhaço: é dele que sai a direção do "para fora".
	estado.centro = vazio.Position
	estado.vida = vida
	estado.vidaMaxima = vida
	estado.aberto = true

	return { vida = estado.vida, vidaMaxima = estado.vidaMaxima }
end

function Portal.aberto()
	return estado.aberto
end

function Portal.instantaneo()
	return {
		aberto = estado.aberto,
		vida = estado.vida,
		vidaMaxima = estado.vidaMaxima,
	}
end

--[[
	Aplica dano. Devolve `quebrou, instantaneo` — quem decide o que fazer com
	"quebrou" é a sessão, não este módulo.

	Dano não positivo é ignorado em silêncio: presente de SUBIDA chega aqui pelo
	mesmo caminho, e curar o portal com presente bom seria um jeito estranho de
	o streamer se defender que ninguém pediu.
]]
function Portal.danificar(dano)
	if not estado.aberto then
		return false, Portal.instantaneo()
	end
	if type(dano) ~= "number" or dano <= 0 then
		return false, Portal.instantaneo()
	end

	estado.vida = math.max(0, estado.vida - dano)

	-- O vazio esmaece conforme apanha: a barra do HUD diz o número, e a cor
	-- diz de longe que está por um fio.
	local restante = 0
	if estado.vidaMaxima > 0 then
		restante = estado.vida / estado.vidaMaxima
	end

	local vazio = estado.vazio
	if vazio then
		vazio.Transparency = 0.25 + (1 - restante) * 0.5
		vazio.Color = COR_DO_VAZIO:Lerp(Color3.fromRGB(255, 60, 60), 1 - restante)
	end

	-- E a moldura cede junto: a fatia de tijolos que a vida perdida já não
	-- sustenta cai fora, a cada golpe.
	desmoronar(restante)

	if estado.vida <= 0 then
		return true, Portal.instantaneo()
	end
	return false, Portal.instantaneo()
end

--[[ O atalho que o donate de derrota compra: quebra sem gastar a vida. ]]
function Portal.quebrar()
	if not estado.aberto then
		return false
	end
	estado.vida = 0
	-- O atalho pago derruba a moldura inteira de uma vez. Sem isto o donate de
	-- derrota daria a rodada com o portal ainda de pé na tela.
	desmoronar(0)
	return true
end

--[[
	Ergue o portal do último degrau. Só estética.

	Não guarda estado nenhum: quem o derruba é a limpeza da torre, junto com o
	resto do cenário. Erguer duas vezes destrói o anterior, então recarregar
	mapa não empilha portais.
]]
function Portal.decorarFinal(posicaoDaBase, beirada)
	local existente = Workspace:FindFirstChild(Portal.NOME_DO_FINAL)
	if existente then
		existente:Destroy()
	end
	if typeof(posicaoDaBase) ~= "Vector3" then
		return false
	end

	montarPortal(Portal.NOME_DO_FINAL, posicaoDaBase, beirada)
	return true
end

--[[ Tira o portal do TOPO. Ele é cenário: sai com a torre, não com a rodada. ]]
function Portal.limparFinal()
	local existente = Workspace:FindFirstChild(Portal.NOME_DO_FINAL)
	if existente then
		existente:Destroy()
	end
end

--[[ Tira o portal do mundo. Chamado no reinício da rodada e no fim da sessão. ]]
function Portal.fechar()
	destruirModelo()
	estado.aberto = false
	estado.vida = 0
	estado.vidaMaxima = 0
end

return Portal
