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

--[[ Monta o céu em Lighting, ou tira o que estiver lá.

	Sempre destrói antes: sem isso, trocar de mapa empilharia um Sky por troca em
	Lighting, e o último a entrar venceria por acidente de ordem. ]]
local function aplicarCeu(url)
	local existente = Lighting:FindFirstChild(ConstrutorMapa.CEU)
	if existente then
		existente:Destroy()
	end

	if not url then
		return
	end

	local ceu = Instance.new("Sky")
	ceu.Name = ConstrutorMapa.CEU
	-- A MESMA imagem nas seis faces. Ver a nota 2 do cabeçalho.
	ceu.SkyboxUp = url
	ceu.SkyboxDn = url
	ceu.SkyboxLf = url
	ceu.SkyboxRt = url
	ceu.SkyboxFt = url
	ceu.SkyboxBk = url
	ceu.Parent = Lighting
end

local function construirPlataforma(indice, mapa, rng, pasta, urlDaTextura)
	local p = mapa.plataformas
	local y = (indice - 1) * p.espacamentoVertical

	local offsetX, offsetZ = 0, 0
	if indice > 1 then
		-- A plataforma 1 fica centrada no eixo: é onde o personagem nasce, e
		-- um spawn "solto" por sorteio tornaria a posição inicial imprevisível
		-- de mapa para mapa sem ganho nenhum.
		local angulo = rng:NextNumber(0, 2 * math.pi)
		local magnitude = rng:NextNumber(0, p.variacaoHorizontal)
		offsetX = math.cos(angulo) * magnitude
		offsetZ = math.sin(angulo) * magnitude
	end

	local raio = math.max(1, p.raioBase * (1 + rng:NextNumber(-p.variacaoRaio, p.variacaoRaio)))
	local posicao = Vector3.new(offsetX, y, offsetZ)

	local parte = Instance.new("Part")
	parte.Name = "Plataforma" .. indice
	parte.Shape = Enum.PartType.Block
	parte.Size = Vector3.new(raio * 2, ESPESSURA_DISCO, raio * 2)
	parte.CFrame = CFrame.new(posicao)
	parte.Anchored = true
	parte.CanCollide = true
	parte.TopSurface = Enum.SurfaceType.Smooth
	parte.BottomSurface = Enum.SurfaceType.Smooth
	parte.Material = materialNativo(p.materialAssetId)
	parte.Color = corDoEixo(mapa.paleta, (indice - 1) / math.max(1, mapa.totalPlataformas - 1))
	-- Combinado com o módulo de rastreio de outro agente: índice como
	-- atributo, não como IntValue filho.
	parte:SetAttribute("KoraIndice", indice)
	aplicarTextura(parte, urlDaTextura)
	parte.Parent = pasta

	return { indice = indice, parte = parte, posicao = posicao }
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
	local urlDaTextura = urlDeAsset(resolvido.textura)
	local plataformas = {}
	local plataformasPorIndice = {}

	-- Loop único, síncrono, sem wait(): 250+ Instance.new de uma vez é
	-- trabalho de servidor no carregamento do mapa, nunca por frame.
	for indice = 1, total do
		local registro = construirPlataforma(indice, mapa, rng, pasta, urlDaTextura)
		plataformas[indice] = registro
		plataformasPorIndice[indice] = registro.parte
	end

	aplicarMarcos(mapa, plataformasPorIndice)
	aplicarProps(mapa, plataformasPorIndice, total)
	aplicarCeu(urlDeAsset(resolvido.skybox))

	pasta.Parent = Workspace

	local construidoOk, problemasConstruido = Jogabilidade.verificarConstruido(mapa, plataformas)
	if not construidoOk then
		ConstrutorMapa.limpar()
		return nil, "torre construída ficou intransponível: " .. table.concat(problemasConstruido, "; ")
	end

	local primeira = plataformas[1].posicao
	local spawn = Vector3.new(primeira.X, primeira.Y + (ESPESSURA_DISCO / 2) + FOLGA_DE_SPAWN, primeira.Z)

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
