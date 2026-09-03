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
}

local function destruirModelo()
	local existente = Workspace:FindFirstChild(Portal.NOME)
	if existente then
		existente:Destroy()
	end
	estado.parte = nil
	estado.vazio = nil
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
local function montarPortal(nome, posicaoDaBase, beirada)
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

	-- Moldura: dois pilares e duas travessas, como a obsidiana do Minecraft.
	bloco(modelo, "PilarEsquerdo",
		Vector3.new(ESPESSURA_DA_MOLDURA, ALTURA_INTERNA, PROFUNDIDADE),
		Vector3.new(-meiaLargura, ALTURA_INTERNA * 0.5, 0),
		base, COR_DA_MOLDURA, Enum.Material.Slate)

	bloco(modelo, "PilarDireito",
		Vector3.new(ESPESSURA_DA_MOLDURA, ALTURA_INTERNA, PROFUNDIDADE),
		Vector3.new(meiaLargura, ALTURA_INTERNA * 0.5, 0),
		base, COR_DA_MOLDURA, Enum.Material.Slate)

	local larguraTotal = larguraInterna + ESPESSURA_DA_MOLDURA * 2
	bloco(modelo, "TravessaBaixo",
		Vector3.new(larguraTotal, ESPESSURA_DA_MOLDURA, PROFUNDIDADE),
		Vector3.new(0, -ESPESSURA_DA_MOLDURA * 0.5, 0),
		base, COR_DA_MOLDURA, Enum.Material.Slate)

	bloco(modelo, "TravessaCima",
		Vector3.new(larguraTotal, ESPESSURA_DA_MOLDURA, PROFUNDIDADE),
		Vector3.new(0, ALTURA_INTERNA + ESPESSURA_DA_MOLDURA * 0.5, 0),
		base, COR_DA_MOLDURA, Enum.Material.Slate)

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

	local modelo, vazio = montarPortal(Portal.NOME, posicaoDaBase, beirada)

	estado.parte = modelo
	estado.vazio = vazio
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
	local vazio = estado.vazio
	if vazio and estado.vidaMaxima > 0 then
		local restante = estado.vida / estado.vidaMaxima
		vazio.Transparency = 0.25 + (1 - restante) * 0.5
		vazio.Color = COR_DO_VAZIO:Lerp(Color3.fromRGB(255, 60, 60), 1 - restante)
	end

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
