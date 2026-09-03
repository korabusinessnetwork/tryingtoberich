--!strict
-- Constrói e destrói a torre de plataformas a partir do spec de mapa
-- (ADR-009, ADR-004, docs/04_MODELAGEM "Mapa (spec gerado pelo Gemini)").
--
-- Um Folder por torre, todas as plataformas Anchored (nada de física em 250
-- partes), e a jogabilidade é conferida DEPOIS de erguida a torre de
-- verdade — ver jogabilidade.lua, Jogabilidade.verificarConstruido — porque
-- é só aí que a variação aleatória de cada disco já está aplicada.
--
-- Escrito no subconjunto Lua 5.1 (sem anotação de tipo, sem `continue`, sem
-- `+=`), pelo mesmo motivo dos módulos vizinhos: `luac5.1 -p` valida a
-- sintaxe inteira sem precisar abrir o Studio.

local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Lighting = game:GetService("Lighting")

local Compartilhado = ReplicatedStorage:WaitForChild("KoraCompartilhado")
local Tipos = require(Compartilhado.tipos)

local Jogabilidade = require(script.Parent.jogabilidade)

local ConstrutorMapa = {}

-- Nome do Folder em Workspace. Público como Eventos.PASTA e
-- Configuracao.PASTA: outro módulo pode achar a torre por nome sem precisar
-- guardar a referência que `construir` devolveu.
ConstrutorMapa.PASTA = "KoraTorre"

-- Espessura do disco, em studs. Fixo, não é campo do spec: não afeta
-- jogabilidade (só a posição do centro de cada plataforma entra na conta do
-- ADR-009), só estética, e variar teria custo de teste sem ganho declarado.
--
-- Importante: a plataforma é um BLOCO (Enum.PartType.Block, o padrão), não um
-- Cylinder nativo deitado. Um Cylinder só fica circular de verdade com
-- Size.Y = Size.Z = diâmetro depois de girado — e plataformas.lua
-- (Plataformas.posicaoDePouso, de outro agente) lê Size.Y como a ESPESSURA
-- vertical da plataforma para calcular onde pousar no respawn. As duas coisas
-- não cabem na mesma peça. Aqui vence a compatibilidade: "disco" continua
-- sendo a categoria do spec (a única da Fase 1), o footprint é que é
-- quadrado — e um pouco mais generoso que o círculo que ele substitui, nunca
-- menos seguro para pousar.
local ESPESSURA_DISCO = 2



--[[
	A escada QUADRADA.

	As plataformas seguiam um ângulo sorteado por plataforma, o que não produz
	escada nenhuma: com desvio médio bem menor que o diâmetro do disco, elas se
	empilham e a torre vira uma coluna maciça. Sem vão não há salto — e o
	personagem nasce DENTRO da pilha, que o Roblox resolve empurrando para cima
	até achar espaço (foi o "spawn no andar 500").

	Agora cada degrau AVANÇA uma distância fixa pelo perímetro de um quadrado, e
	sobe um degrau. O caminho é reto na maior parte do tempo e vira 90 graus nos
	quatro cantos — dá para correr em linha reta e enxergar vários degraus à
	frente, coisa que a curva contínua não permitia.

	O tamanho do quadrado sai do resto: perímetro = degraus por volta × passo, e
	meio-lado = perímetro / 8. Com 24 degraus e passo 18 dá meio-lado 54, ou seja
	um quadrado de 108 studs de lado.

	E os degraus caem EXATAMENTE nos cantos, sempre: meio-lado = 24 × passo / 8
	= 3 × passo, então o lado mede 6 × passo e cabem 6 degraus inteiros nele,
	qualquer que seja o passo. Nenhum degrau fica atravessado numa quina, e a
	distância entre vizinhos é o passo cheio em todo o percurso.

	Se um dia os degraus por volta deixarem de ser múltiplos de 4, alguns cairão
	no meio de uma quina. A distância em linha reta ali é MENOR que o passo (é a
	corda de um ângulo reto, não o caminho), o que só encolhe o vão — a checagem
	de alcance continua válida sem caso especial.
]]
local DEGRAUS_POR_VOLTA = 24

--[[
	Onde cai um degrau, dada a distância percorrida no perímetro.

	Percorre os quatro lados na ordem, começando no canto (+meioLado, -meioLado)
	e girando. Devolve (x, z); a altura é de quem chama.
]]
local function pontoNoQuadrado(distancia, meioLado)
	local lado = 2 * meioLado
	local d = distancia % (4 * lado)

	if d < lado then
		return meioLado, -meioLado + d
	elseif d < 2 * lado then
		return meioLado - (d - lado), meioLado
	elseif d < 3 * lado then
		return -meioLado, meioLado - (d - 2 * lado)
	end
	return -meioLado + (d - 3 * lado), -meioLado
end

--[[
	Onde cai um degrau da PASSARELA: em linha reta, subindo.

	Uma rampa só, indo embora num eixo, sem virar em canto nenhum e sem vaivém.
	A altura vem de quem chama; aqui é só o avanço.

	A inclinação NÃO está aqui — sai da razão entre `variacaoHorizontal` (o
	avanço por degrau) e `espacamentoVertical` (a subida). Avanço igual à subida
	dá 45 graus, que é a rampa apontando para o céu; avanço maior deita a rampa.
	Deixar isso no spec é o que permite afinar a inclinação sem tocar em código.

	Os degraus se SOBREPÕEM quando o avanço é menor que o tamanho deles, e isso
	é seguro justamente aqui: a subida é igual à espessura, então um degrau
	assenta em cima do anterior sem deixar fresta. Ver a regra em `regras.mjs`.
]]
local function pontoNaPassarela(distancia)
	return distancia, 0
end

-- Altura acima do topo da plataforma 1 onde o personagem nasce. Espelha a
-- folga de Plataformas.posicaoDePouso (ALTURA_MINIMA_DE_POUSO + FOLGA_DE_POUSO
-- = 3 + 0,5 em plataformas.lua) para o primeiro spawn cair coerente com todo
-- respawn seguinte, mesmo sem personagem ainda existir para medir HipHeight.
local FOLGA_DE_SPAWN = 3.5

local COR_FALLBACK = Color3.fromRGB(150, 150, 150)

--[[
	INTEGRAÇÃO DO ACERVO (ADR-004).

	`skyboxAssetId` e `plataformas.materialAssetId` no spec são ids do ACERVO
	(`textura_rocha_vulcanica`), não assetId do Roblox. Quem traduz é a PONTE, em
	Nucleo.mapaAtivo, e o resultado chega em `mapa.acervoResolvido`:

	  { skybox = <número> ou nil, textura = <número> ou nil }

	nil quer dizer "ainda não aprovado pela moderação do Roblox". Nesse caso vale
	o que sempre valeu: `materialNativo` escolhe um Enum.Material pelas palavras
	do próprio id do acervo, e nenhum céu é montado. Aprovar um item no acervo é
	a única coisa que liga a textura e o céu de verdade — sem mudar o mapa.

	Duas armadilhas do Roblox que moram aqui:

	1. `Part` NÃO tem propriedade `Texture`. Imagem em Part é uma INSTÂNCIA
	   `Texture` filha, com Face e StudsPerTile. `Decal` também existe, mas
	   estica em vez de ladrilhar, e a torre tem centenas de discos de tamanhos
	   diferentes: esticar deformaria a imagem em cada um.

	2. Um `Sky` do Roblox pede SEIS imagens, uma por face do cubo. O acervo
	   guarda UM assetId por skybox (acervo.schema.json), então a mesma imagem
	   vai nas seis. Fica repetitivo: é limitação conhecida do modelo de dados,
	   não defeito de implementação.
]]
local MATERIAL_POR_PALAVRA_CHAVE = {
	{ palavra = "rocha", material = Enum.Material.Slate },
	{ palavra = "gelo", material = Enum.Material.Ice },
	{ palavra = "metal", material = Enum.Material.DiamondPlate },
	{ palavra = "madeira", material = Enum.Material.WoodPlanks },
	{ palavra = "pedra", material = Enum.Material.Rock },
	{ palavra = "areia", material = Enum.Material.Sand },
}

-- Quantos studs cada repetição da textura cobre. Valor fixo: com StudsPerTile
-- a imagem ladrilha no MESMO tamanho aparente em disco pequeno e grande, que é
-- o que mantém a torre coerente enquanto o raio varia plataforma a plataforma.
local STUDS_POR_LADRILHO = 8

-- Nome do Sky que este módulo cria. Público pelo mesmo motivo de PASTA: dá para
-- achar e limpar sem guardar referência.
ConstrutorMapa.CEU = "KoraCeu"

--[[ Vira "rbxassetid://N", ou nil se não houver id aprovado. `%d` de propósito:
	tostring num número grande do Lua sai em notação científica, e
	"rbxassetid://1.8294e+10" não carrega nada — falha muda, sem erro. ]]
local function urlDeAsset(assetId)
	if type(assetId) ~= "number" or assetId <= 0 then
		return nil
	end
	return "rbxassetid://" .. string.format("%d", assetId)
end

--[[ O id do acervo daquele degrau: um só, ou o da vez quando são vários.

	`materialNativo` escolhe o Enum.Material pelas palavras do id, e com blocos
	variados cada degrau tem o seu — madeira tem que soar como madeira mesmo
	quando a textura não carregou. ]]
local function idDaTextura(plataformas, indice)
	local bruto = plataformas.materialAssetId
	if type(bruto) == "table" then
		if #bruto == 0 then
			return nil
		end
		return bruto[((indice - 1) % #bruto) + 1]
	end
	return bruto
end

local function materialNativo(materialAssetId)
	if type(materialAssetId) == "string" then
		for _, par in ipairs(MATERIAL_POR_PALAVRA_CHAVE) do
			if string.find(materialAssetId, par.palavra, 1, true) then
				return par.material
			end
		end
	end
	return Enum.Material.SmoothPlastic
end

-- `Color3.fromHex` explode em hex malformado. A cor da paleta já devia ter
-- passado pelo schema antes de chegar aqui, mas este módulo não confia:
-- um hex ruim vira cinza neutro, nunca uma torre pela metade.
local function corSegura(hex)
	local ok, cor = pcall(Color3.fromHex, hex)
	if ok then
		return cor
	end
	return COR_FALLBACK
end

local function corDoEixo(paleta, fator)
	local primaria = corSegura(paleta.primaria)
	local secundaria = corSegura(paleta.secundaria)
	return primaria:Lerp(secundaria, fator)
end

-- Hash polinomial simples (base djb2): não precisa ser criptográfico, só
-- determinístico. Mesmo mapaId sempre produz o mesmo número, em qualquer
-- máquina, porque é só soma e multiplicação de ponto flutuante padrão
-- IEEE 754 — é isso que faz duas construções do mesmo spec renderem a mesma
-- torre (exigência do enunciado: live que reconstrói diferente a cada
-- entrada é impossível de depurar).
local function sementeDeString(texto)
	local hash = 5381
	for i = 1, #texto do
		hash = (hash * 33 + string.byte(texto, i)) % 2147483647
	end
	return hash
end

-- Criadores nativos de prop (ParticleEmitter). Tipo fora desta lista é
-- ignorado por quem chama, não aqui: hardcodar "desconhecido" aqui acoplaria
-- este módulo ao tamanho do acervo, que é dado (data/acervo.json), não
-- enum de código — ver docs/04_MODELAGEM, seção Acervo.
local CRIADORES_PROPS = {}

local function novoEmissor(parte, nome)
	local emissor = Instance.new("ParticleEmitter")
	emissor.Name = nome
	emissor.Parent = parte
	return emissor
end

CRIADORES_PROPS.fumaca = function(parte, densidade)
	local emissor = novoEmissor(parte, "KoraPropFumaca")
	emissor.Color = ColorSequence.new(Color3.fromRGB(90, 90, 90))
	emissor.Size = NumberSequence.new(1, 3)
	emissor.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.5),
		NumberSequenceKeypoint.new(1, 1),
	})
	emissor.Lifetime = NumberRange.new(2, 4)
	emissor.Speed = NumberRange.new(1, 2)
	emissor.Rate = 5 + (densidade * 15)
	emissor.Acceleration = Vector3.new(0, 2, 0)
end

CRIADORES_PROPS.fagulha = function(parte, densidade)
	local emissor = novoEmissor(parte, "KoraPropFagulha")
	emissor.Color = ColorSequence.new(Color3.fromRGB(255, 140, 30))
	emissor.Size = NumberSequence.new(0.2, 0.05)
	emissor.Lifetime = NumberRange.new(0.3, 0.8)
	emissor.Speed = NumberRange.new(4, 9)
	emissor.Rate = 10 + (densidade * 30)
	emissor.Acceleration = Vector3.new(0, -15, 0)
	emissor.LightEmission = 1
end

CRIADORES_PROPS.neve = function(parte, densidade)
	local emissor = novoEmissor(parte, "KoraPropNeve")
	emissor.Color = ColorSequence.new(Color3.fromRGB(255, 255, 255))
	emissor.Size = NumberSequence.new(0.3, 0.3)
	emissor.Lifetime = NumberRange.new(3, 5)
	emissor.Speed = NumberRange.new(1, 3)
	emissor.Rate = 10 + (densidade * 40)
	emissor.Acceleration = Vector3.new(0, -4, 0)
end

CRIADORES_PROPS.folhas = function(parte, densidade)
	local emissor = novoEmissor(parte, "KoraPropFolhas")
	emissor.Color = ColorSequence.new(Color3.fromRGB(90, 140, 60))
	emissor.Size = NumberSequence.new(0.4, 0.4)
	emissor.Lifetime = NumberRange.new(2, 4)
	emissor.Speed = NumberRange.new(2, 5)
	emissor.Rate = 5 + (densidade * 20)
	emissor.Acceleration = Vector3.new(3, -2, 0)
	emissor.RotSpeed = NumberRange.new(-90, 90)
end

CRIADORES_PROPS.poeira = function(parte, densidade)
	local emissor = novoEmissor(parte, "KoraPropPoeira")
	emissor.Color = ColorSequence.new(Color3.fromRGB(200, 180, 120))
	emissor.Size = NumberSequence.new(2, 4)
	emissor.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.7),
		NumberSequenceKeypoint.new(1, 1),
	})
	emissor.Lifetime = NumberRange.new(3, 6)
	emissor.Speed = NumberRange.new(0.2, 0.5)
	emissor.Rate = 5 + (densidade * 15)
	emissor.Acceleration = Vector3.new(0, 0.2, 0)
end

--[[
	Campos que Tipos.validarMapa (game/src/shared/tipos.lua) não confere —
	ele só cuida de totalPlataformas, jumpHeight, plataformas.espacamentoVertical
	e plataformas.raioBase, porque é o suficiente para o contrato genérico da
	ponte. Este módulo lê paleta, mapaId e mais dois campos de plataformas
	direto, então guarda aqui só o mínimo para nunca estourar um erro cru de
	"index nil" no meio da construção — não é uma reimplementação do schema
	completo (data/schemas/mapa.schema.json já é essa fonte de verdade).
]]
local function validarCamposEssenciais(mapa)
	if type(mapa.mapaId) ~= "string" or #mapa.mapaId == 0 then
		return "mapaId inválido: obrigatório para a semente determinística"
	end
	if type(mapa.paleta) ~= "table"
		or type(mapa.paleta.primaria) ~= "string"
		or type(mapa.paleta.secundaria) ~= "string"
		or type(mapa.paleta.destaque) ~= "string"
	then
		return "paleta incompleta"
	end
	local p = mapa.plataformas
	if not Tipos.ehNumero(p.variacaoRaio) or p.variacaoRaio < 0 then
		return "variacaoRaio inválido"
	end
	if not Tipos.ehNumero(p.variacaoHorizontal) or p.variacaoHorizontal < 0 then
		return "variacaoHorizontal inválido"
	end
	return nil
end

--[[ A imagem do acervo na face de CIMA da plataforma.

	Só a face de cima: é a única que o jogador vê num disco visto de perto, e
	seis Texture por plataforma seriam 1500 instâncias a mais numa torre de 250 —
	para mostrar cinco faces que a câmera de escalada nunca enquadra. ]]
local function aplicarTextura(parte, url)
	if not url then
		return
	end

	local textura = Instance.new("Texture")
	textura.Texture = url
	textura.Face = Enum.NormalId.Top
	textura.StudsPerTileU = STUDS_POR_LADRILHO
	textura.StudsPerTileV = STUDS_POR_LADRILHO
	textura.Parent = parte
end

--[[
	O número do degrau, FLUTUANDO acima dele.

	Antes era uma `SurfaceGui` deitada na face de cima. Funcionava e lia mal:
	visto de cima o número aparece de esguelha, some sob o boneco, e com a
	rosquinha ou as tábuas ele cai em cima da emenda entre os pedaços. Pior — a
	textura da peça é o assunto da plataforma, e o número pintado por cima
	disputava com ela.

	`BillboardGui` resolve os três: fica no ar acima do degrau, sempre virado
	para a câmera venha ela de onde vier, e não encosta na arte.

	A última recebe "FINAL" em vez do número: quem está subindo precisa
	reconhecer o fim de longe, e "1000" não se distingue de "999" de relance.
]]
--[[ Até onde o número é desenhado, e o tamanho dele.

	`ALCANCE` é render por proximidade: acima disso a `BillboardGui` não desenha
	nada. Numa torre de mil degraus isso é a diferença entre desenhar uma dúzia
	de números e desenhar a torre inteira em cima da tela.

	O tamanho vai em STUDS, e é o detalhe que mais importa aqui. Em pixels
	(`fromOffset`) a placa tem tamanho fixo na TELA: o degrau lá longe fica
	minúsculo e o número dele continua enorme, e a torre vira uma parede de
	números empilhados. Em studs ele encolhe junto com o mundo, como tudo o
	mais. ]]
local ALCANCE_DO_NUMERO = 110
local LARGURA_DO_NUMERO = 4
local ALTURA_DA_PLACA = 2
local ALTURA_DO_NUMERO = 3.2

local function escreverNumero(parte, indice, total, paleta)
	local ehFinal = indice >= total

	local placa = Instance.new("BillboardGui")
	placa.Name = "NumeroDaPlataforma"
	placa.Adornee = parte
	-- Escala = studs. Ver a nota acima: em pixels o número não encolhe.
	placa.Size = UDim2.fromScale(LARGURA_DO_NUMERO, ALTURA_DA_PLACA)
	placa.StudsOffsetWorldSpace = Vector3.new(0, ALTURA_DO_NUMERO, 0)
	placa.MaxDistance = ALCANCE_DO_NUMERO
	-- Sempre visível: sem isto o número some atrás do próprio degrau quando a
	-- câmera fica abaixo dele, que é metade do tempo numa torre.
	placa.AlwaysOnTop = true
	placa.LightInfluence = 0
	placa.Parent = parte

	local rotulo = Instance.new("TextLabel")
	rotulo.Name = "Texto"
	rotulo.BackgroundTransparency = 1
	rotulo.Size = UDim2.fromScale(1, 1)
	rotulo.Font = Enum.Font.GothamBlack
	rotulo.TextScaled = true
	rotulo.Text = ehFinal and "FINAL" or tostring(indice)
	rotulo.TextColor3 = ehFinal and corSegura(paleta.destaque) or Color3.new(1, 1, 1)
	rotulo.TextStrokeColor3 = Color3.new(0, 0, 0)
	rotulo.TextStrokeTransparency = 0.15
	rotulo.Parent = placa
end

--[[ Monta o céu em Lighting, ou tira o que estiver lá.

	Sempre destrói antes: sem isso, trocar de mapa empilharia um Sky por troca em
	Lighting, e o último a entrar venceria por acidente de ordem. ]]
--[[
	Monta o céu: seis faces distintas quando existem, uma imagem só quando não.

	Céu de verdade tem HORIZONTE, e horizonte só existe com faces separadas —
	uma imagem única nas seis põe a mesma linha no teto e no chão da caixa, e o
	céu vira um cubo visível. Por muito tempo o acervo só guardava uma imagem
	por céu, e as peças eram desenhadas sem horizonte justamente por causa
	disso.

	`faces` é `{ ft, bk, lf, rt, up, dn }` com um assetId em cada. Sem ela, cai
	no comportamento antigo, que continua valendo para as peças de imagem única.
]]
local function aplicarCeu(url, faces)
	local existente = Lighting:FindFirstChild(ConstrutorMapa.CEU)
	if existente then
		existente:Destroy()
	end

	if not url and type(faces) ~= "table" then
		return
	end

	local ceu = Instance.new("Sky")
	ceu.Name = ConstrutorMapa.CEU

	local function faceOu(nome)
		if type(faces) == "table" and Tipos.ehInteiro(faces[nome]) then
			return urlDeAsset(faces[nome])
		end
		return url
	end

	ceu.SkyboxFt = faceOu("ft")
	ceu.SkyboxBk = faceOu("bk")
	ceu.SkyboxLf = faceOu("lf")
	ceu.SkyboxRt = faceOu("rt")
	ceu.SkyboxUp = faceOu("up")
	ceu.SkyboxDn = faceOu("dn")
	ceu.Parent = Lighting
end

--[[
	As FORMAS do degrau, montadas com primitivas do Roblox.

	Uma rosquinha redonda com furo no meio não é a mesma coisa que um quadrado
	com a foto de uma rosquinha — e é essa diferença que faz a peça temática
	valer. Nada de mesh e nada de union em tempo de execução: mesh é asset que
	precisa subir, e union de mil degraus derrubaria o carregamento.

	Cada função devolve `partes, pouso`:
	  `partes` são todos os Parts que o jogador pode pisar — o rastreio liga
	    `Touched` em cada um, senão só um pedaço do anel contaria como chão;
	  `pouso` é o deslocamento do CENTRO até um lugar onde dá para ficar de pé.
	    No anel o centro é o furo, e pousar ali é cair.
]]
local SEGMENTOS_DO_ANEL = 16
local FURO_DO_ANEL = 0.42       -- fração do raio: 0,42 deixa a pista larga
local LADOS_DO_HEXAGONO = 6
local TABUAS = 5
local FRESTA_DA_TABUA = 0.12

local function novoPedaco(nome, tamanho, cframe)
	local parte = Instance.new("Part")
	parte.Name = nome
	parte.Shape = Enum.PartType.Block
	parte.Size = tamanho
	parte.CFrame = cframe
	parte.Anchored = true
	parte.CanCollide = true
	parte.TopSurface = Enum.SurfaceType.Smooth
	parte.BottomSurface = Enum.SurfaceType.Smooth
	return parte
end

--[[ Monta a forma e devolve `partes, pouso`. `raio` é meia-largura do degrau. ]]
local function montarForma(forma, raio, posicao)
	local partes = {}

	if forma == "disco" then
		local parte = novoPedaco("Disco", Vector3.new(ESPESSURA_DISCO, raio * 2, raio * 2), CFrame.new(posicao))
		parte.Shape = Enum.PartType.Cylinder
		-- O Cylinder do Roblox nasce deitado no eixo X. Girar 90 graus em Z põe
		-- a face circular para cima, que é onde se pisa.
		parte.CFrame = CFrame.new(posicao) * CFrame.Angles(0, 0, math.rad(90))
		table.insert(partes, parte)
		return partes, Vector3.new(0, 0, 0)
	end

	if forma == "anel" then
		--[[ Rosquinha: N pedaços em círculo, com furo no meio — e chão embaixo.

			O furo é o desenho, não uma armadilha. Decisão do dono: "o que muda
			é a foto". Uma peça que derruba o jogador mudaria a JOGABILIDADE, e
			aí escolher a textura deixaria de ser escolha estética — a rosquinha
			viraria a plataforma difícil, e ninguém a usaria por isso.

			A base é invisível e sólida, do tamanho do degrau inteiro. O jogador
			vê o furo e pisa no chão, e o respawn volta ao centro como em
			qualquer outra forma. ]]
		local base = novoPedaco("AnelBase", Vector3.new(raio * 2, ESPESSURA_DISCO, raio * 2), CFrame.new(posicao))
		base.Transparency = 1
		-- Sem sombra: uma peça invisível projetando sombra denunciaria o truque,
		-- e o furo apareceria escuro por baixo.
		base.CastShadow = false
		table.insert(partes, base)

		local raioMedio = raio * (1 + FURO_DO_ANEL) * 0.5
		local largura = raio * (1 - FURO_DO_ANEL)
		local corda = 2 * math.pi * raioMedio / SEGMENTOS_DO_ANEL

		for i = 1, SEGMENTOS_DO_ANEL do
			local angulo = (i - 1) * (2 * math.pi / SEGMENTOS_DO_ANEL)
			local deslocamento = Vector3.new(math.cos(angulo) * raioMedio, 0, math.sin(angulo) * raioMedio)
			-- Corda com folga: sem ela sobra vão entre um segmento e o outro.
			local pedaco = novoPedaco(
				"Anel" .. i,
				Vector3.new(largura, ESPESSURA_DISCO, corda * 1.15),
				CFrame.new(posicao + deslocamento) * CFrame.Angles(0, -angulo, 0)
			)
			table.insert(partes, pedaco)
		end
		-- Pouso no CENTRO como qualquer outra forma: a base invisível é chão.
		return partes, Vector3.new(0, 0, 0)
	end

	if forma == "hexagono" then
		-- Três blocos girados de 60 graus dão um hexágono cheio, sem furo e sem
		-- as 6 emendas que 6 triângulos deixariam.
		for i = 1, 3 do
			local angulo = (i - 1) * math.rad(60)
			table.insert(partes, novoPedaco(
				"Hex" .. i,
				Vector3.new(raio * 2, ESPESSURA_DISCO, raio * 1.16),
				CFrame.new(posicao) * CFrame.Angles(0, angulo, 0)
			))
		end
		return partes, Vector3.new(0, 0, 0)
	end

	if forma == "tabuas" then
		-- Réguas paralelas com fresta: a fresta de verdade lê melhor que a
		-- desenhada, e é o que o pacote pede para a madeira.
		local largura = (raio * 2) / TABUAS
		for i = 1, TABUAS do
			local deslocamento = Vector3.new(-raio + largura * (i - 0.5), 0, 0)
			table.insert(partes, novoPedaco(
				"Tabua" .. i,
				Vector3.new(largura - FRESTA_DA_TABUA, ESPESSURA_DISCO, raio * 2),
				CFrame.new(posicao + deslocamento)
			))
		end
		return partes, Vector3.new(0, 0, 0)
	end

	-- "placa" é o bloco chapado; "bloco" é o padrão de sempre.
	local altura = (forma == "placa") and (ESPESSURA_DISCO * 0.5) or ESPESSURA_DISCO
	table.insert(partes, novoPedaco("Degrau", Vector3.new(raio * 2, altura, raio * 2), CFrame.new(posicao)))
	return partes, Vector3.new(0, 0, 0)
end

local function construirPlataforma(indice, mapa, rng, pasta, urls, estilos, meioLado)
	local p = mapa.plataformas
	local y = (indice - 1) * p.espacamentoVertical

	-- Todos no perímetro, inclusive o primeiro. Antes ele ficava no eixo "para o
	-- spawn ser previsível", mas o canto inicial é igualmente previsível — e
	-- manter o degrau 1 fora do percurso faria o salto 1->2 ser o único
	-- diferente de todos os outros.
	local avanco = (indice - 1) * p.variacaoHorizontal
	local offsetX, offsetZ = pontoNoQuadrado(avanco, meioLado)

	local raio = math.max(1, p.raioBase * (1 + rng:NextNumber(-p.variacaoRaio, p.variacaoRaio)))

	-- A passarela tem caminho próprio: vaivém subindo no lugar, sem caracol.
	if p.formato == "laje" then
		offsetX, offsetZ = pontoNaPassarela(avanco)
	end

	local posicao = Vector3.new(offsetX, y, offsetZ)

	--[[ Uma textura por degrau, revezando, e a FORMA que ela pede.

		`urls` e `estilos` andam juntos e na mesma ordem. Com uma textura só,
		todo degrau recebe a mesma e nada muda em relação a antes. ]]
	local vez = ((indice - 1) % #urls) + 1
	local urlDaTextura = urls[vez]
	local estilo = estilos[vez] or {}

	local partes, pouso = montarForma(estilo.forma or "bloco", raio, posicao)

	--[[ Com VÁRIAS texturas, o degrau NÃO é tingido.

		A cor da paleta multiplica a textura, e é ela que dá o gradiente da
		torre quando existe uma textura só. Com blocos variados isso destrói o
		efeito inteiro: dez texturas diferentes, todas puxadas para o mesmo
		verde, viram dez tons do mesmo bloco. Quem carrega a variedade passa a
		ser a textura, então a cor sai da frente. ]]
	local cor = Color3.new(1, 1, 1)
	if #urls <= 1 then
		cor = corDoEixo(mapa.paleta, (indice - 1) / math.max(1, mapa.totalPlataformas - 1))
	end

	local material = materialNativo(idDaTextura(p, indice))
	if type(estilo.material) == "string" then
		local ok, escolhido = pcall(function()
			return Enum.Material[estilo.material]
		end)
		if ok and escolhido then
			material = escolhido
		end
	end

	for i, pedaco in ipairs(partes) do
		pedaco.Name = "Plataforma" .. indice .. (i > 1 and ("_" .. i) or "")
		pedaco.Color = cor
		pedaco.Material = material
		if type(estilo.transparencia) == "number" then
			pedaco.Transparency = math.clamp(estilo.transparencia, 0, 0.6)
		end
		-- Combinado com o módulo de rastreio: índice como atributo, não como
		-- IntValue filho. Vai em TODOS os pedaços: o jogador pisa em qualquer um.
		pedaco:SetAttribute("KoraIndice", indice)
		aplicarTextura(pedaco, urlDaTextura)
		pedaco.Parent = pasta
	end

	local parte = partes[1]
	escreverNumero(parte, indice, mapa.totalPlataformas, mapa.paleta)

	--[[ `raio` vai junto, e não é enfeite: é a PEGADA do degrau, o número que a
		checagem de jogabilidade usa para medir o vão. Enquanto todo degrau era um
		bloco só, dava para deduzi-lo do `Size`; com as formas do acervo o primeiro
		pedaço é uma tábua, ou um Cylinder deitado, e a dedução passou a devolver
		raio 1 para um disco de 7,5. Ver Jogabilidade.raioDe. ]]
	return { indice = indice, parte = parte, partes = partes, pouso = pouso, posicao = posicao, raio = raio }
end

--[[ Marco = plataforma visualmente distinta, legível de longe num vídeo
	vertical: cor de destaque, Neon (emite luz própria sem depender de
	Lighting) e maior que as vizinhas. "topo" se destaca mais que
	"checkpoint_visual" para ficar claro qual é qual num relance. ]]
local function aplicarMarco(parte, tipo, paleta)
	parte.Color = corSegura(paleta.destaque)
	parte.Material = Enum.Material.Neon

	local escala = (tipo == "topo") and 1.5 or 1.25
	parte.Size = Vector3.new(parte.Size.X * escala, parte.Size.Y, parte.Size.Z * escala)

	local luz = Instance.new("PointLight")
	luz.Color = corSegura(paleta.destaque)
	luz.Range = (tipo == "topo") and 30 or 20
	luz.Brightness = 2
	luz.Parent = parte
end

local function aplicarMarcos(mapa, plataformasPorIndice)
	for _, marco in ipairs(mapa.marcos or {}) do
		if type(marco) == "table" and (marco.tipo == "checkpoint_visual" or marco.tipo == "topo") then
			local parte = plataformasPorIndice[marco.plataforma]
			if parte then
				aplicarMarco(parte, marco.tipo, mapa.paleta)
			end
		end
	end
end

local function aplicarProps(mapa, plataformasPorIndice, total)
	for _, propCfg in ipairs(mapa.props or {}) do
		local criador = type(propCfg) == "table" and CRIADORES_PROPS[propCfg.tipo] or nil
		local passo = propCfg and propCfg.aCadaNPlataformas
		if criador and Tipos.ehInteiro(passo) and passo > 0 then
			local densidade = Tipos.ehNumero(propCfg.densidade) and propCfg.densidade or 0.5
			densidade = math.max(0, math.min(1, densidade))
			for indice = passo, total, passo do
				local parte = plataformasPorIndice[indice]
				if parte then
					criador(parte, densidade)
				end
			end
		end
		-- tipo fora do acervo conhecido (ou config malformada): ignora e
		-- segue — um prop novo no acervo não pode derrubar mapa antigo, e
		-- vice-versa.
	end
end

--[[
	Faz o trabalho de verdade, sempre chamada dentro de pcall por
	ConstrutorMapa.construir. `mapa` já passou por Tipos.validarMapa,
	validarCamposEssenciais e Jogabilidade.verificarSpec quando chega aqui.
]]
local function construirTudo(mapa)
	ConstrutorMapa.limpar()

	local pasta = Instance.new("Folder")
	pasta.Name = ConstrutorMapa.PASTA

	local rng = Random.new(sementeDeString(mapa.mapaId))
	local total = mapa.totalPlataformas

	-- Resolvido UMA vez, não por plataforma: são 250 iterações, e o assetId é o
	-- mesmo em todas. `or {}` porque uma ponte antiga não manda o campo.
	local resolvido = mapa.acervoResolvido or {}

	--[[ A lista de texturas, sempre como lista.

		A ponte manda `texturas` (a lista revezada) e `textura` (a primeira, para
		quem só sabe pintar uma). Cair na segunda mantém mapa antigo funcionando
		sem nenhuma migração. Nenhuma das duas: uma entrada vazia, e
		`aplicarTextura` já ignora url nula — a torre sai com material nativo,
		que é o que sempre aconteceu com acervo pendente. ]]
	local urls = {}
	if type(resolvido.texturas) == "table" then
		for _, assetId in ipairs(resolvido.texturas) do
			table.insert(urls, urlDeAsset(assetId))
		end
	end
	if #urls == 0 then
		urls = { urlDeAsset(resolvido.textura) }
	end

	--[[ O estilo de cada textura, na mesma ordem. Sem ele, tudo vira bloco —
		que é como era antes de a forma existir. ]]
	local estilos = {}
	if type(resolvido.estilos) == "table" then
		estilos = resolvido.estilos
	end

	-- Meio-lado do quadrado, DERIVADO do passo: perímetro = degraus por volta ×
	-- passo, e o quadrado tem 8 meio-lados de perímetro. Assim mexer só na
	-- distância entre degraus já redimensiona a torre inteira, coerente.
	local meioLado = (DEGRAUS_POR_VOLTA * mapa.plataformas.variacaoHorizontal) / 8
	local plataformas = {}
	local plataformasPorIndice = {}

	-- Loop único, síncrono, sem wait(): 250+ Instance.new de uma vez é
	-- trabalho de servidor no carregamento do mapa, nunca por frame.
	for indice = 1, total do
		local registro = construirPlataforma(indice, mapa, rng, pasta, urls, estilos, meioLado)
		plataformas[indice] = registro
		plataformasPorIndice[indice] = registro.parte
	end

	aplicarMarcos(mapa, plataformasPorIndice)
	aplicarProps(mapa, plataformasPorIndice, total)
	aplicarCeu(urlDeAsset(resolvido.skybox), resolvido.skyboxFaces)

	pasta.Parent = Workspace

	local construidoOk, problemasConstruido = Jogabilidade.verificarConstruido(mapa, plataformas)
	if not construidoOk then
		ConstrutorMapa.limpar()
		return nil, "torre construída ficou intransponível: " .. table.concat(problemasConstruido, "; ")
	end

	--[[ O spawn recua para a faixa EXPOSTA do primeiro degrau.

		Quando os degraus se sobrepõem, o primeiro fica enterrado embaixo dos
		seguintes e o centro dele não é chão — é teto. Nascer ali põe o boneco
		dentro da geometria, e o Roblox o empurra para fora. Com degraus que
		apenas se encostam, o recuo é zero e nada muda. ]]
	local primeira = plataformas[1].posicao
	local recuo = 0
	local bloco = mapa.plataformas
	if bloco.formato == "laje" then
		recuo = math.max(0, (2 * bloco.raioBase - bloco.variacaoHorizontal) / 2)
	end
	-- E a FORMA também desloca: no anel o centro é o furo, e nascer ali é cair
	-- antes de dar o primeiro passo.
	local daForma = plataformas[1].pouso
	if typeof(daForma) ~= "Vector3" then
		daForma = Vector3.new(0, 0, 0)
	end

	local spawn = Vector3.new(
		primeira.X - recuo + daForma.X,
		primeira.Y + (ESPESSURA_DISCO / 2) + FOLGA_DE_SPAWN,
		primeira.Z + daForma.Z
	)

	return {
		pasta = pasta,
		plataformas = plataformas,
		spawn = spawn,
	}, nil
end

--[[ Destrói a torre anterior, se existir. Procura pelo nome em Workspace em
	vez de guardar estado de módulo: assim funciona mesmo chamada antes de
	qualquer `construir`, ou depois de um `construir` que falhou no meio. ]]
function ConstrutorMapa.limpar()
	local existente = Workspace:FindFirstChild(ConstrutorMapa.PASTA)
	if existente then
		existente:Destroy()
	end

	-- O céu vive em Lighting, fora da pasta da torre, então Destroy() na pasta
	-- não o alcança. Sem esta parte, o céu do mapa anterior ficaria sobre a
	-- torre nova — e sobre a torre NENHUMA, depois de uma sessão encerrada.
	local ceu = Lighting:FindFirstChild(ConstrutorMapa.CEU)
	if ceu then
		ceu:Destroy()
	end
end

--[[
	ConstrutorMapa.construir(mapa) -> resultado, erro

	Ordem de validação, do mais barato ao mais caro: contrato genérico
	(Tipos.validarMapa) -> campos que este módulo usa direto
	(validarCamposEssenciais) -> jogabilidade do SPEC (Jogabilidade.verificarSpec,
	cobre a regra horizontal que Tipos.validarMapa não cobre) -> só então
	gasta 250+ Instance.new. Depois de construída, Jogabilidade.verificarConstruido
	roda sobre a torre de verdade (a variação aleatória já aplicada) e é o que
	decide se ela fica de pé ou é destruída. Rejeita, nunca corrige — ADR-009.
]]
function ConstrutorMapa.construir(mapa)
	local specValidado, erro = Tipos.validarMapa(mapa)
	if not specValidado then
		return nil, erro
	end

	erro = validarCamposEssenciais(specValidado)
	if erro then
		return nil, erro
	end

	local specOk, problemasSpec = Jogabilidade.verificarSpec(specValidado)
	if not specOk then
		return nil, "spec reprovado na checagem de jogabilidade: " .. table.concat(problemasSpec, "; ")
	end

	-- pcall em volta da construção inteira: um erro cru no meio de 250
	-- iterações (campo faltando que os três filtros acima não pegaram) não
	-- pode nem propagar sem contexto, nem deixar uma torre pela metade em
	-- Workspace.
	local ok, resultado, erroConstrucao = pcall(construirTudo, specValidado)
	if not ok then
		ConstrutorMapa.limpar()
		return nil, "falha inesperada ao construir a torre: " .. tostring(resultado)
	end
	if not resultado then
		return nil, erroConstrucao
	end
	return resultado, nil
end

return ConstrutorMapa
