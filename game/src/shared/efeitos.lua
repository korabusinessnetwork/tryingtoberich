--!strict
-- Caixa de ferramentas das 32 animações.
--
-- Existe para as animações serem escritas por gente diferente sem cada uma
-- inventar o próprio jeito de criar partícula e limpar instância. Se falta
-- alguma primitiva aqui, o certo é acrescentar aqui, não improvisar no módulo
-- da animação.
--
-- Três regras que este módulo faz valer sozinho:
--  1. Toda instância com prazo é destruída, com Debris como rede de segurança.
--     Live de 2 horas com vazamento de ParticleEmitter trava o cliente. Passar
--     `duracao` nil transfere essa responsabilidade para quem chamou, e é o
--     caminho do efeito permanente do personagem — o único que dura a sessão.
--  2. Nada é criado dentro de RenderStepped. As funções daqui são chamadas uma
--     vez, no início do efeito.
--  3. `executarSeguro` embrulha em pcall: animação com erro no meio não pode
--     derrubar o resto do jogo nem deixar o personagem ancorado. Ver R11.

local Debris = game:GetService("Debris")
local TweenService = game:GetService("TweenService")

local Eventos = require(script.Parent.eventos)
local Tipos = require(script.Parent.tipos)

local Efeitos = {}

-- Teto de partículas por emissor, mesmo na intensidade 5. Acima disso o ganho
-- visual some e o custo de render aparece na live.
local PARTICULAS_MAX = 250

Efeitos.escala = Tipos.escalaDeIntensidade

--[[
	Sobra de segurança sobre a duração: o efeito some pouco depois do movimento.

	`segundos` nil significa **sem limpeza automática**: quem chamou vira dono
	da instância e destrói na mão. É o que o efeito permanente do personagem
	precisa (ADR-010) — ele dura a sessão inteira, e agendar Debris para ele
	exigiria inventar um prazo grande o bastante, que é número mágico com data
	de validade.
]]
function Efeitos.limparEm(instancia, segundos)
	if instancia and segundos ~= nil then
		Debris:AddItem(instancia, segundos)
	end
	return instancia
end

-- Folga de um segundo sobre a duração da animação, para o efeito não sumir no
-- mesmo frame em que o movimento acaba. `nil` atravessa como `nil`.
local function prazoDe(duracao)
	if duracao == nil then
		return nil
	end
	return duracao + 1
end

--[[ HumanoidRootPart, ou nil se o personagem já foi embora no meio do efeito. ]]
function Efeitos.raiz(personagem)
	if not personagem then
		return nil
	end
	return personagem:FindFirstChild("HumanoidRootPart")
end

-- Distância da raiz até o pé do boneco, e a folga que mantém efeito de chão
-- ACIMA do tampo da plataforma.
Efeitos.ALTURA_DOS_PES = 3
Efeitos.FOLGA_DO_DECK = 0.4

--[[
	Ponto de chão do personagem: o pé dele, um dedo ACIMA do tampo do disco.

	Anel, poeira e cratera nascem no pé, e o pé está em cima de uma plataforma
	sólida. Meio stud para baixo e o efeito nasce DENTRO do disco: da câmera da
	live não se vê nada, ou se vê um clarão vazando pela borda, que é pior. Toda
	animação que encosta no chão passa por aqui em vez de subtrair 3 na mão.
]]
function Efeitos.pontoDeChao(raiz)
	if not raiz then
		return nil
	end
	return raiz.Position - Vector3.new(0, Efeitos.ALTURA_DOS_PES - Efeitos.FOLGA_DO_DECK, 0)
end

--[[
	Direção do movimento do presente, unitária e em espaço LOCAL da raiz.

	A torre é uma escada em espiral quadrada (ver construtorMapa): o boneco não
	sobe reto, ele sobe PARA A FRENTE na diagonal e desce PARA TRÁS na diagonal.
	Animação que pendura efeito no eixo Y do mundo sai torta — a trilha aponta
	para o teto enquanto o corpo vai para a quina seguinte.

	O resultado vem em espaço local porque é isso que `Attachment.Position` come.
	`Efeitos.anexo(raiz, "x", eixo * -2)` põe o anexo dois studs ATRÁS do boneco
	na linha de viagem, seja ela qual for.

	`contexto.posicaoDestino` vem do movimento.lua. Sem ele — animação tocada
	fora do ciclo, ou testada na mão — sobra o eixo vertical puro, com o sinal
	do delta. Torto, mas nunca nil.
]]
function Efeitos.eixoDoMovimento(raiz, contexto)
	contexto = contexto or {}
	local delta = contexto.delta or 1
	local vertical = Vector3.new(0, delta < 0 and -1 or 1, 0)
	if not raiz then
		return vertical
	end

	local destino = contexto.posicaoDestino
	if typeof(destino) ~= "Vector3" then
		return raiz.CFrame:VectorToObjectSpace(vertical)
	end

	local bruto = destino - raiz.Position
	if bruto.Magnitude < 0.05 then
		return raiz.CFrame:VectorToObjectSpace(vertical)
	end
	return raiz.CFrame:VectorToObjectSpace(bruto.Unit)
end

function Efeitos.anexo(parte, nome, deslocamento)
	if not parte then
		return nil
	end
	local anexo = Instance.new("Attachment")
	anexo.Name = nome or "KoraAnexo"
	anexo.Position = deslocamento or Vector3.new(0, 0, 0)
	anexo.Parent = parte
	return anexo
end

--[[ Aplica os campos de `props` na instância, ignorando o que não existir. ]]
local function aplicar(instancia, props)
	if not props then
		return instancia
	end
	for chave, valor in pairs(props) do
		pcall(function()
			instancia[chave] = valor
		end)
	end
	return instancia
end

Efeitos.aplicar = aplicar

function Efeitos.sequenciaDeNumero(inicio, fim)
	return NumberSequence.new({
		NumberSequenceKeypoint.new(0, inicio),
		NumberSequenceKeypoint.new(1, fim),
	})
end

function Efeitos.sequenciaDeCor(inicio, fim)
	return ColorSequence.new(inicio, fim or inicio)
end

--[[
	ParticleEmitter já parented e com limpeza agendada.
	`intensidade` multiplica taxa e tamanho, nunca duração.
]]
function Efeitos.particula(pai, props, intensidade, duracao)
	if not pai then
		return nil
	end
	local emissor = Instance.new("ParticleEmitter")
	local fator = Efeitos.escala(intensidade)

	emissor.Rate = 40
	emissor.Lifetime = NumberRange.new(0.3, 0.7)
	emissor.Speed = NumberRange.new(4, 10)
	emissor.SpreadAngle = Vector2.new(25, 25)
	aplicar(emissor, props)

	emissor.Rate = math.min(emissor.Rate * fator, PARTICULAS_MAX)
	emissor.Size = NumberSequence.new(0.6 * fator)
	if props and props.Size then
		emissor.Size = props.Size
	end
	emissor.Parent = pai

	return Efeitos.limparEm(emissor, prazoDe(duracao))
end

function Efeitos.trilha(anexoA, anexoB, props, duracao)
	if not anexoA or not anexoB then
		return nil
	end
	local trilha = Instance.new("Trail")
	trilha.Attachment0 = anexoA
	trilha.Attachment1 = anexoB
	trilha.Lifetime = 0.4
	trilha.LightEmission = 0.5
	aplicar(trilha, props)
	trilha.Parent = anexoA.Parent
	return Efeitos.limparEm(trilha, prazoDe(duracao))
end

function Efeitos.feixe(anexoA, anexoB, props, duracao)
	if not anexoA or not anexoB then
		return nil
	end
	local feixe = Instance.new("Beam")
	feixe.Attachment0 = anexoA
	feixe.Attachment1 = anexoB
	feixe.Width0 = 0.6
	feixe.Width1 = 0.6
	feixe.LightEmission = 0.8
	feixe.FaceCamera = true
	aplicar(feixe, props)
	feixe.Parent = anexoA.Parent
	return Efeitos.limparEm(feixe, prazoDe(duracao))
end

function Efeitos.luz(pai, props, duracao)
	if not pai then
		return nil
	end
	local luz = Instance.new("PointLight")
	luz.Brightness = 4
	luz.Range = 18
	aplicar(luz, props)
	luz.Parent = pai
	return Efeitos.limparEm(luz, prazoDe(duracao))
end

--[[ Highlight no personagem inteiro. Bom para flash e para o efeito permanente. ]]
function Efeitos.brilho(personagem, props, duracao)
	if not personagem then
		return nil
	end
	local brilho = Instance.new("Highlight")
	brilho.FillTransparency = 0.6
	brilho.OutlineTransparency = 0
	aplicar(brilho, props)
	brilho.Adornee = personagem
	brilho.Parent = personagem
	if duracao then
		Efeitos.limparEm(brilho, duracao + 0.3)
	end
	return brilho
end

--[[
	Prende uma Part solta ao personagem, para ela acompanhar o boneco sem
	disputar a posição com o Tween do movimento.

	`Massless` não é detalhe: durante o presente a raiz está ancorada e sendo
	tweenada, e peça com massa somaria peso ao personagem quando ele
	desancorasse no fim do ciclo. Ver ADR-005.

	WeldConstraint em vez de Attachment porque Attachment não carrega geometria:
	serve para partícula e trilha, não para caco sólido.
]]
function Efeitos.prenderNoPersonagem(parte, raiz)
	if not parte or not raiz then
		return nil
	end
	parte.Anchored = false
	parte.Massless = true

	local solda = Instance.new("WeldConstraint")
	solda.Part0 = raiz
	solda.Part1 = parte
	solda.Parent = parte
	return solda
end

-- ---------------------------------------------------------------------------
-- Objeto sólido — o pacote anime
--
-- As seis animações portadas do estudo em Three.js não são partícula: são
-- OBJETO. Shuriken, manopla, bocal, rocha, lança. O Three.js monta isso com
-- `Group` + `Mesh` e o Roblox não tem nenhum dos dois de graça, então o que vem
-- abaixo é o mínimo para escrever objeto sem cada módulo inventar o próprio
-- jeito de agrupar, soldar e girar.
--
-- ADR-004 continua de pé: nada aqui carrega asset. Toda peça é primitiva nativa
-- — Part, WedgePart, Cylinder, Ball. Foi o que decidiu a fidelidade do porte: o
-- original tem tubo, toro e torno (TubeGeometry, TorusGeometry, LatheGeometry),
-- e nenhum dos três existe no Roblox sem upload. Onde o original varre uma
-- curva, aqui a curva vira conta.
-- ---------------------------------------------------------------------------

--[[
	Solda uma peça numa âncora qualquer, não só no personagem.

	Mesmo motivo do `prenderNoPersonagem`: `Massless` para a peça não somar peso
	a nada, e WeldConstraint porque Attachment não carrega geometria. A diferença
	é o dono — aqui a âncora é o pivô do efeito, e é ele que manda no conjunto.

	Ordem importa: posicione a peça ANTES de soldar. A solda congela a posição
	relativa do instante em que nasce.
]]
function Efeitos.soldar(parte, ancora)
	if not parte or not ancora then
		return parte
	end
	parte.Anchored = false
	parte.Massless = true
	parte.CanCollide = false

	local solda = Instance.new("WeldConstraint")
	solda.Part0 = ancora
	solda.Part1 = parte
	solda.Parent = parte
	return parte
end

local function montarPeca(classe, pivo, props)
	local parte = Instance.new(classe)
	parte.Anchored = true
	parte.CanCollide = false
	parte.CanQuery = false
	parte.CanTouch = false
	parte.CastShadow = false
	parte.Material = Enum.Material.SmoothPlastic
	parte.Size = Vector3.new(1, 1, 1)
	aplicar(parte, props)
	parte.Parent = pivo or workspace
	if pivo then
		Efeitos.soldar(parte, pivo)
	end
	return parte
end

--[[
	Peça de efeito, opcionalmente já pendurada num pivô.

	`pivo` nil devolve peça ancorada solta no workspace, e quem chamou cuida do
	prazo — é o caso do anel e da cratera. `pivo` presente parenteia E solda: a
	peça vira parte da montagem, segue o pivô, e morre junto com ele quando o
	Debris levar o pivô. Sem isso cada peça precisaria do próprio `limparEm`, e
	a peça esquecida é exatamente o vazamento que a regra 1 deste módulo existe
	para impedir.

	As sete propriedades de sempre vêm preenchidas. Peça de efeito com colisão
	ligada trava o boneco no meio do salto, e é erro que só aparece na live.
]]
function Efeitos.peca(pivo, props)
	return montarPeca("Part", pivo, props)
end

--[[
	WedgePart, para lâmina e ponta.

	O Roblox não tem cone nem primitiva pontuda — `Enum.PartType` só dá bloco,
	bola e cilindro —, e a saída usual (SpecialMesh com id de cone) é asset, que
	o ADR-004 proíbe. Cunha é a única ponta nativa que existe.
]]
function Efeitos.cunha(pivo, props)
	return montarPeca("WedgePart", pivo, props)
end

--[[
	Pivô invisível: o `Group` que o Roblox não tem.

	Uma Part invisível e ANCORADA com o resto soldado nela faz o mesmo papel —
	mexer no CFrame do pivô mexe na montagem inteira, e nenhuma peça filha ganha
	física. Z LOCAL do pivô é a linha de viagem quando ele nasce de um
	`CFrame.lookAt`, e Z positivo é para TRÁS: é a convenção que as seis
	animações seguem, a mesma do estudo original (nariz em +X, escape em -X).
]]
function Efeitos.pivo(cframe, prazo)
	local pivo = montarPeca("Part", nil, {
		Transparency = 1,
		Size = Vector3.new(0.2, 0.2, 0.2),
		CFrame = cframe or CFrame.new(),
	})
	return Efeitos.limparEm(pivo, prazo)
end

--[[
	CFrame que olha na linha de viagem, para pendurar pivô e onda.

	Existe para ninguém repetir o `lookAt` errado: com `eixo` quase zero — presente
	fora do ciclo, ou origem igual ao destino — `CFrame.lookAt` devolve NaN e a
	montagem inteira some da tela sem erro nenhum no output.
]]
function Efeitos.olharPara(centro, eixoMundo)
	if typeof(eixoMundo) ~= "Vector3" or eixoMundo.Magnitude < 0.001 then
		return CFrame.new(centro)
	end
	return CFrame.lookAt(centro, centro + eixoMundo.Unit)
end

--[[
	Giro contínuo do pivô — e, se quiser, a viagem dele junto — sem loop de render.

	O jeito óbvio seria mexer no CFrame todo frame. Está proibido (CLAUDE.md), e
	com razão: a animação roda no SERVIDOR, e CFrame de peça ancorada mexido a
	60Hz replica mal — chega tremendo no espectador, que é justamente quem pagou.

	Então o giro vira corrente de Tween, cada trecho com o ângulo ABSOLUTO
	daquele trecho como alvo. O trecho é criado no instante em que começa, e não
	tudo de uma vez com `delayTime`, porque é isso que garante que cada Tween
	parta de onde o anterior parou.

	`passos` não é enfeite: o Tween interpola rotação pelo caminho curto, então
	trecho de meia volta ou mais giraria para o lado errado e o disco pareceria
	quicar. O padrão são três trechos por volta — 120° cada — e o teto é forçado
	logo abaixo, mesmo que quem chamou peça menos.
]]
function Efeitos.girar(pivo, partida, chegada, voltas, duracao, passos)
	if not pivo or typeof(partida) ~= "CFrame" then
		return pivo
	end
	duracao = duracao or 1
	voltas = voltas or 1
	if duracao <= 0 then
		return pivo
	end

	local minimo = math.max(1, math.ceil(math.abs(voltas) * 3))
	passos = math.max(minimo, math.floor(passos or minimo))

	local trecho = duracao / passos
	local giroPorPasso = (math.pi * 2 * voltas) / passos
	local rotacao = partida - partida.Position
	local origem = partida.Position
	local avanco = (typeof(chegada) == "CFrame" and chegada.Position or origem) - origem

	for i = 1, passos do
		local alvo = CFrame.new(origem + avanco * (i / passos)) * rotacao * CFrame.Angles(0, 0, giroPorPasso * i)
		task.delay(trecho * (i - 1), function()
			-- O Debris pode ter levado o pivô no meio da corrente; tweenar peça
			-- destruída erra e o erro cai no output no meio da live.
			if pivo.Parent then
				TweenService:Create(pivo, TweenInfo.new(trecho, Enum.EasingStyle.Linear), { CFrame = alvo }):Play()
			end
		end)
	end
	return pivo
end

--[[
	Hélice de contas em volta da linha de viagem, soldada no pivô.

	É a assinatura visual dos seis efeitos: vento, chama ou arco elétrico
	enrolado na direção do movimento. No Three.js é um `TubeGeometry` varrido
	numa curva; aqui a varredura vira conta — cilindros curtos deitados na
	tangente, que num vídeo vertical comprimido leem como tubo.

	Nasce colada no objeto e se afasta para TRÁS (Z positivo do pivô), afinando.
	Como está soldada, ela gira junto quando o pivô gira: é de graça.
]]
function Efeitos.helice(pivo, opcoes)
	if not pivo then
		return {}
	end
	opcoes = opcoes or {}
	local bracos = opcoes.bracos or 3
	local contas = opcoes.contas or 4
	local comprimento = opcoes.comprimento or 6
	local raio = opcoes.raio or 1.5
	local voltas = opcoes.voltas or 1.2
	local espessura = opcoes.espessura or 0.5
	local recuo = opcoes.recuo or 0
	local afinar = opcoes.afinar
	if afinar == nil then
		afinar = 0.75
	end

	-- A fase entra no ÂNGULO e não no `t`. Somada no `t`, ela empurraria o braço
	-- para trás junto — os três braços sairiam escalonados no comprimento em vez
	-- de trançados no mesmo trecho, e a hélice viraria uma fila.
	local pontoEm = function(t, fase)
		local angulo = fase + t * voltas * math.pi * 2
		local r = raio * (1 - afinar * math.min(t, 1))
		return Vector3.new(math.cos(angulo) * r, math.sin(angulo) * r, recuo + t * comprimento)
	end

	local feitas = {}
	for braco = 1, bracos do
		local fase = (braco - 1) * (math.pi * 2 / bracos)
		for conta = 1, contas do
			local t = (conta - 0.5) / contas
			local aqui = pontoEm(t, fase)
			local adiante = pontoEm(t + 0.5 / contas, fase)
			local corda = (adiante - aqui).Magnitude

			-- Cylinder do Roblox deita no eixo X, e `lookAt` aponta o -Z. O giro
			-- de 90° em Y é o que casa os dois; sem ele a conta fica atravessada
			-- na hélice e o tubo vira colar de contas.
			local deitar = CFrame.Angles(0, math.pi / 2, 0)
			local orientar = Efeitos.olharPara(aqui, adiante - aqui) * deitar

			local conteudo = {
				Material = Enum.Material.Neon,
				Shape = Enum.PartType.Cylinder,
				Color = opcoes.cor or Color3.fromRGB(255, 255, 255),
				Transparency = opcoes.transparencia or 0.4,
				Size = Vector3.new(math.max(corda * 1.6, 0.3), espessura, espessura),
				CFrame = pivo.CFrame * orientar,
			}
			table.insert(feitas, Efeitos.peca(pivo, conteudo))
		end
	end
	return feitas
end

--[[
	Anel de choque DE PÉ na linha de viagem, e não deitado no chão.

	O `anel` acima é poeira de pouso e nasce no piso. Este é a onda que sai do
	bocal e viaja junto com o objeto — o `pulseRings` do estudo. Deitar um
	Cylinder no chão para esse papel o mostraria de perfil, como um risco.
]]
function Efeitos.onda(centro, eixoMundo, cor, intensidade, duracao)
	local fator = Efeitos.escala(intensidade)
	local prazo = duracao or 0.5
	local deitar = CFrame.Angles(0, math.pi / 2, 0)
	local onda = Efeitos.peca(nil, {
		Material = Enum.Material.Neon,
		Shape = Enum.PartType.Cylinder,
		Color = cor or Color3.fromRGB(255, 255, 255),
		Transparency = 0.3,
		Size = Vector3.new(0.35, 1.5, 1.5),
		CFrame = Efeitos.olharPara(centro, eixoMundo) * deitar,
	})

	local alvo = 12 * fator
	TweenService:Create(onda, TweenInfo.new(prazo, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		Size = Vector3.new(0.35, alvo, alvo),
		Transparency = 1,
	}):Play()

	return Efeitos.limparEm(onda, prazo + 0.3)
end

--[[
	A esteira padrão do pacote anime: pluma quente, baforada branca e dois
	riscos de velocidade, todos empurrados para TRÁS na linha de viagem.

	Os seis efeitos terminam do mesmo jeito no estudo — `plume` + `streaks` +
	partícula —, e é esse rabo que dá velocidade aparente sem depender de para
	onde a câmera olha. A baforada branca não é enfeite: o mapa é gerado por IA e
	pode ter qualquer paleta, e branco fofo é o que lê nas duas.

	`peca` é o que viaja (o pivô do objeto, ou a raiz do personagem), `eixo` é a
	linha de viagem em espaço LOCAL dessa peça e `eixoMundo` a mesma linha em
	mundo — `Acceleration` de partícula é sempre em mundo.
]]
function Efeitos.esteira(peca, eixo, eixoMundo, opcoes, intensidade, duracao)
	if not peca then
		return nil
	end
	opcoes = opcoes or {}
	local fator = Efeitos.escala(intensidade)
	local quente = opcoes.corQuente or Color3.fromRGB(255, 236, 170)
	local fria = opcoes.corFria or Color3.fromRGB(255, 122, 46)
	local fumaca = opcoes.corFumaca or Color3.fromRGB(245, 245, 245)
	local largura = (opcoes.largura or 3.4) * fator
	local recuo = opcoes.recuo or 2.2
	local empurrao = opcoes.empurrao or 26

	local frente = Efeitos.anexo(peca, "EsteiraFrente", eixo * 0.5)
	local caudaA = Efeitos.anexo(peca, "EsteiraCaudaA", eixo * -recuo + Vector3.new(0.35, 0, 0))
	local caudaB = Efeitos.anexo(peca, "EsteiraCaudaB", eixo * -recuo + Vector3.new(-0.35, 0, 0))

	Efeitos.trilha(frente, caudaA, {
		Color = Efeitos.sequenciaDeCor(quente, fria),
		Transparency = Efeitos.sequenciaDeNumero(0.15, 1),
		Lifetime = opcoes.vida or 0.45,
		Width0 = largura,
		Width1 = 0.2,
	}, duracao)

	Efeitos.trilha(frente, caudaB, {
		Color = Efeitos.sequenciaDeCor(fria, quente),
		Transparency = Efeitos.sequenciaDeNumero(0.3, 1),
		Lifetime = (opcoes.vida or 0.45) * 0.8,
		Width0 = largura * 0.75,
		Width1 = 0.2,
	}, duracao)

	Efeitos.particula(frente, {
		Color = Efeitos.sequenciaDeCor(quente, fria),
		Transparency = Efeitos.sequenciaDeNumero(0.2, 1),
		Size = Efeitos.sequenciaDeNumero(1.6 * fator, 0.2),
		Lifetime = NumberRange.new(0.25, 0.5),
		Speed = NumberRange.new(3, 8),
		SpreadAngle = Vector2.new(45, 45),
		Acceleration = eixoMundo * -empurrao,
		Rate = 40,
		RotSpeed = NumberRange.new(-200, 200),
		LightEmission = 1,
	}, intensidade, duracao)

	if opcoes.semFumaca ~= true then
		Efeitos.particula(caudaA, {
			Color = Efeitos.sequenciaDeCor(fumaca),
			Transparency = Efeitos.sequenciaDeNumero(0.45, 1),
			Size = Efeitos.sequenciaDeNumero(1.6 * fator, 6 * fator),
			Lifetime = NumberRange.new(0.35, 0.75),
			Speed = NumberRange.new(2, 6),
			SpreadAngle = Vector2.new(70, 70),
			Acceleration = eixoMundo * -(empurrao * 0.5),
			Rate = 30,
			LightEmission = 0.2,
		}, intensidade, duracao)
	end

	return frente
end

--[[ Anel de choque no chão. Usado por várias animações de impulso e impacto. ]]
function Efeitos.anel(posicao, cor, intensidade, duracao)
	local fator = Efeitos.escala(intensidade)
	local anel = Instance.new("Part")
	anel.Anchored = true
	anel.CanCollide = false
	anel.CanQuery = false
	anel.CanTouch = false
	anel.Material = Enum.Material.Neon
	anel.Shape = Enum.PartType.Cylinder
	anel.Color = cor or Color3.fromRGB(255, 255, 255)
	anel.Size = Vector3.new(0.3, 1, 1)
	anel.CFrame = CFrame.new(posicao) * CFrame.Angles(0, 0, math.rad(90))
	anel.Parent = workspace

	local alvo = 14 * fator
	TweenService:Create(anel, TweenInfo.new(duracao or 0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		Size = Vector3.new(0.3, alvo, alvo),
		Transparency = 1,
	}):Play()

	return Efeitos.limparEm(anel, (duracao or 0.5) + 0.3)
end

--[[
	Tremor de câmera e afastamento são do cliente: o servidor só avisa.
	Ver eventos.lua para o formato.
]]
function Efeitos.tremor(intensidade, duracao)
	local remoto = Eventos.obter(Eventos.TREMOR)
	remoto:FireAllClients({ intensidade = intensidade or 1, duracao = duracao or 0.3 })
end

--[[
	Clarão de tela inteira. Efeito de TELA, não de mundo: Highlight e PointLight
	iluminam geometria, e a "tela dourada" que a Fênix pede precisa cobrir
	também o pixel que não tem nada atrás. Só o cliente consegue, então o
	servidor avisa.
]]
function Efeitos.flash(cor, duracao, opacidade)
	local remoto = Eventos.obter(Eventos.FLASH)
	remoto:FireAllClients({
		cor = cor or Color3.fromRGB(255, 255, 255),
		duracao = duracao or 0.4,
		opacidade = opacidade or 0.55,
	})
end

function Efeitos.afastarCamera(duracao)
	local remoto = Eventos.obter(Eventos.CAMERA)
	remoto:FireAllClients({ afastar = true, duracao = duracao or 1 })
end

--[[
	Roda o corpo do efeito fora da thread de quem chamou, dentro de pcall.
	`executar` NUNCA bloqueia: é isto que garante isso.
]]
function Efeitos.executarSeguro(corpo)
	task.spawn(function()
		local ok, erro = pcall(corpo)
		if not ok then
			warn("[Kora] efeito falhou: " .. tostring(erro))
		end
	end)
end

return Efeitos
