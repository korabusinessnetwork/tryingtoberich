--!strict
-- Teste de jogabilidade do ADR-009: garante que a torre é escalável do início
-- ao topo usando só o pulo do personagem, sem presente nenhum. Ver
-- docs/08_DECISOES/adr-009-mapa-escalavel-sem-presente.md.
--
-- Duas checagens, por dois motivos diferentes:
--   - verificarSpec olha só os NÚMEROS do spec, antes de qualquer construção.
--     Pega spec absurdo cedo, sem gastar 250 partes.
--   - verificarConstruido PERCORRE as plataformas de verdade, já com a
--     variação aleatória aplicada. Ela existe além do spec porque o spec pode
--     estar dentro das faixas e o sorteio da construção ainda assim colocar
--     dois discos vizinhos longe demais um do outro (dois deslocamentos
--     horizontais independentes, cada um dentro do limite, podem somar mais
--     longe do que qualquer um sozinho). Mapa intransponível numa live vira
--     tela parada, e tela parada é o que o TikTok pune. Este teste é o ponto
--     inteiro do ADR-009.
--
-- Puro: nada aqui toca Workspace nem cria Instance, só lê posição já pronta.
-- Mesma filosofia de game/src/shared/tipos.lua, e pelo mesmo motivo:
-- `luac5.1 -p` valida a sintaxe inteira sem precisar abrir o Studio.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Compartilhado = ReplicatedStorage:WaitForChild("KoraCompartilhado")
local Tipos = require(Compartilhado.tipos)

local Jogabilidade = {}

-- Física do pulo do Roblox. Nenhuma das duas é campo do spec (só jumpHeight
-- é — ADR-009.3) nem vive em módulo compartilhado hoje, então ficam fixas
-- aqui, nos valores padrão do motor:
--   Workspace.Gravity padrão  = 196.2 studs/s^2 (o mesmo que o Humanoid usa
--     por baixo do capô para transformar JumpHeight em velocidade de
--     lançamento — ver personagem.lua, Personagem.definirAlturaDePulo)
--   Humanoid.WalkSpeed padrão = 16 studs/s
-- Se algum mapa no futuro variar velocidade de andar ou a gravidade da mesa,
-- isto tem que virar campo do spec do mesmo jeito que jumpHeight virou —
-- ver ADR-009.3.
local GRAVIDADE = 196.2
local VELOCIDADE_HORIZONTAL_PADRAO = 16

--[[
	Alcance de UM pulo de altura `jumpHeight`, já com a margem de 30% do
	ADR-009 aplicada nos dois eixos ("com a mesma margem", regra 2).

	Vertical: o próprio teto do ADR-009 — jumpHeight * FATOR_SALTO_VERTICAL.

	Horizontal: distância coberta andando em velocidade padrão durante o
	tempo de voo do pulo (subida + descida até a mesma altura de partida,
	`2 * velocidadeVertical / gravidade`). O personagem do Roblox tem
	controle total no ar por padrão — anda a WalkSpeed constante enquanto
	pulando — por isso a distância horizontal do pulo é
	`velocidade * tempoDeVoo`, independente do cálculo vertical.

	Devolve 0, 0 para jumpHeight inválido: alcance zero é o valor seguro
	quando não dá para calcular nada (nenhum salto caberia).
]]
function Jogabilidade.alcanceDoPulo(jumpHeight)
	if not Tipos.ehNumero(jumpHeight) or jumpHeight <= 0 then
		return 0, 0
	end

	local velocidadeVertical = math.sqrt(2 * GRAVIDADE * jumpHeight)
	local tempoDeVoo = (2 * velocidadeVertical) / GRAVIDADE
	local alcanceHorizontalTeorico = VELOCIDADE_HORIZONTAL_PADRAO * tempoDeVoo

	local alturaMax = jumpHeight * Tipos.FATOR_SALTO_VERTICAL
	local distanciaHorizontalMax = alcanceHorizontalTeorico * Tipos.FATOR_SALTO_VERTICAL
	return alturaMax, distanciaHorizontalMax
end

--[[
	Meia-extensão horizontal do degrau, no sentido que interessa para o vão.

	O número certo é o RAIO com que o construtor montou a peça, e por isso ele
	vem pronto em `entrada.raio`. Deduzir do `Size` do primeiro pedaço só
	funcionava enquanto todo degrau era um bloco só: com as formas do acervo o
	primeiro pedaço deixou de representar o degrau inteiro.

	  disco    -> é um Cylinder, e o Cylinder do Roblox nasce DEITADO no eixo X:
	              Size.X é a espessura (2), não o diâmetro. Medido assim, um
	              disco de raio 7,5 valia 1.
	  tábuas   -> o primeiro pedaço é UMA tábua, um quinto do degrau.
	  hexágono -> o primeiro pedaço é um dos três blocos cruzados, mais estreito
	              que a peça montada.

	O estrago era mudo no código e barulhento na tela: o vão saía inflado, a
	torre inteira era reprovada como intransponível e a sessão não subia. E ela
	era perfeitamente jogável — todas as formas ocupam a MESMA pegada de raio
	`raio`. É isso que faz a forma ser escolha estética e não de dificuldade,
	a mesma decisão que pôs chão invisível embaixo da rosquinha.

	O `Size` fica de reserva, para entrada montada à mão que não traz o raio: a
	MENOR das duas dimensões, que erra para menos e deixa a conta conservadora.
]]
function Jogabilidade.raioDe(entrada)
	if type(entrada) == "table" and Tipos.ehNumero(entrada.raio) and entrada.raio > 0 then
		return entrada.raio
	end

	local parte = type(entrada) == "table" and entrada.parte or nil
	if not parte or typeof(parte) ~= "Instance" then
		return 0
	end
	local ok, largura, fundo = pcall(function()
		return parte.Size.X, parte.Size.Z
	end)
	if not ok or not Tipos.ehNumero(largura) or not Tipos.ehNumero(fundo) then
		return 0
	end
	return math.min(largura, fundo) / 2
end

--[[
	Só os números do spec, na faixa que o ADR-009 exige. Não é substituto de
	Tipos.validarMapa (game/src/shared/tipos.lua): aquele valida o contrato
	genérico vindo da ponte. Este valida especificamente jogabilidade e cobre
	também a regra horizontal (ADR-009.2), que Tipos.validarMapa ainda não
	confere — só a vertical.
]]
function Jogabilidade.verificarSpec(mapa)
	if type(mapa) ~= "table" then
		return false, { "mapa não é tabela" }
	end
	if not Tipos.ehNumero(mapa.jumpHeight) or mapa.jumpHeight <= 0 then
		return false, { "jumpHeight inválido" }
	end
	if type(mapa.plataformas) ~= "table" then
		return false, { "bloco plataformas ausente" }
	end

	local p = mapa.plataformas
	local alturaMax, distanciaHorizontalMax = Jogabilidade.alcanceDoPulo(mapa.jumpHeight)
	local problemas = {}

	if not Tipos.ehNumero(p.espacamentoVertical) or p.espacamentoVertical <= 0 then
		table.insert(problemas, "espacamentoVertical inválido")
	elseif p.espacamentoVertical > alturaMax then
		table.insert(problemas, string.format(
			"espacamentoVertical %.2f passa do alcance vertical do pulo (%.2f, jumpHeight %.2f)",
			p.espacamentoVertical, alturaMax, mapa.jumpHeight
		))
	end

	--[[
		O que o jogador atravessa é o VÃO entre as bordas, não a distância entre
		os centros — exatamente como `verificarConstruido` mede logo abaixo.

		Esta checagem comparava `variacaoHorizontal` (centro a centro) direto com
		o alcance, ignorando os dois raios. As duas funções deste MESMO arquivo
		discordavam entre si: a de baixo aprovava a torre construída e a de cima
		reprovava o spec que a gerou. Na prática travava o mapa em passos bem
		menores do que o pulo do Roblox alcança.
	]]
	if not Tipos.ehNumero(p.variacaoHorizontal) or p.variacaoHorizontal < 0 then
		table.insert(problemas, "variacaoHorizontal inválido")
	elseif Tipos.ehNumero(p.raioBase) then
		-- Dois piores casos OPOSTOS: o vão maior vem dos discos MENORES, e a
		-- sobreposição vem dos MAIORES. variacaoRaio sorteia para os dois lados
		-- na construção, então o spec tem que cobrir as duas pontas.
		local variacao = Tipos.ehNumero(p.variacaoRaio) and p.variacaoRaio or 0
		local raioMaximo = p.raioBase * (1 + variacao)
		local raioMinimo = p.raioBase * (1 - variacao)
		local vao = p.variacaoHorizontal - (2 * raioMinimo)

		--[[ Dois formatos, duas regras OPOSTAS. Tem que ser a MESMA bifurcação
			de `regras.mjs` na ponte: as duas já discordaram antes, e o efeito
			foi a torre construída ser reprovada com o spec aprovado.

			disco: existe vão, e ele não pode passar do alcance do pulo.
			laje:  NÃO pode existir vão — as lajes se encostam e o jogador sobe
			       quase andando. Aqui "plataformas se cobrem" é o objetivo,
			       não o defeito. ]]
		local formato = p.formato or "disco"

		if formato == "laje" then
			--[[ A laje TILA: fundo exatamente igual ao passo.

				Pedir só "sem vão" deixava passar a torre que enterra: fundo 24
				com passo 20 sobrepõe 4 studs, e nessa faixa a folga vertical é
				`espacamentoVertical - espessura` = 1 stud. O boneco de 5 studs
				fica DENTRO da laje de cima e a física o expulsa.

				Sobreposição e vão são o mesmo eixo: só um valor serve nos dois
				sentidos. Por isso `variacaoRaio` também tem que ser zero —
				sorteando o fundo, uma ponta abre buraco e a outra enterra. ]]
			if variacao ~= 0 then
				table.insert(problemas, string.format(
					"variacaoRaio %.2f no formato laje: tem que ser 0, senão uma ponta abre buraco e a outra enterra",
					variacao
				))
			end

			--[[ Sem BURACO. Sobreposição, sim — e é ela que dá a inclinação.

				Avançar menos que o tamanho do degrau levanta a rampa, e é
				seguro porque a subida é igual à espessura: cada degrau assenta
				no anterior sem fresta. Avançar MAIS abre buraco. ]]
			local tamanho = 2 * p.raioBase
			if p.variacaoHorizontal > tamanho + 0.01 then
				table.insert(problemas, string.format(
					"avanço de %.2f com degrau de %.2f: abre buraco de %.2f no caminho",
					p.variacaoHorizontal, tamanho, p.variacaoHorizontal - tamanho
				))
			end
			if p.variacaoHorizontal <= 0 then
				table.insert(problemas, "avanço zero na passarela: os degraus ficariam empilhados no mesmo lugar")
			end

			--[[ SEM PULO: o degrau apoia no anterior, não flutua acima dele.

				Subida maior que a espessura deixa o degrau seguinte solto no ar,
				com uma fresta por baixo — foi assim que a primeira versão
				prendeu o boneco. Igual à espessura, um degrau encosta no outro e
				o Roblox sobe andando. ]]
			if Tipos.ehNumero(p.espacamentoVertical) and p.espacamentoVertical > Tipos.ESPESSURA_DO_DEGRAU then
				table.insert(problemas, string.format(
					"subida de %.2f na passarela: o máximo é %.2f, a espessura do degrau — acima disso o jogador teria que pular",
					p.espacamentoVertical, Tipos.ESPESSURA_DO_DEGRAU
				))
			end
		else
			if Tipos.ehNumero(p.espacamentoVertical) and p.espacamentoVertical < 3 then
				table.insert(problemas, string.format(
					"subida de %.2f no formato disco: o mínimo é 3, senão não é escada de pular, é rampa",
					p.espacamentoVertical
				))
			end

			if vao > distanciaHorizontalMax then
				table.insert(problemas, string.format(
					"vão de %.2f entre as bordas passa do alcance horizontal do pulo (%.2f, jumpHeight %.2f, passo %.2f, raio mínimo %.2f)",
					vao, distanciaHorizontalMax, mapa.jumpHeight, p.variacaoHorizontal, raioMinimo
				))
			end

			-- E o passo tem que superar o raio, senão cada disco cobre o
			-- anterior inteiro: a torre vira coluna maciça e o personagem
			-- nasce dentro dela.
			if raioMaximo >= p.variacaoHorizontal then
				table.insert(problemas, string.format(
					"plataformas se cobrem: raio máximo %.2f é maior que o passo %.2f, e a torre viraria coluna",
					raioMaximo, p.variacaoHorizontal
				))
			end
		end
	end

	return #problemas == 0, problemas
end

--[[
	O teste que é o ponto inteiro do ADR-009. `plataformas` é a lista real,
	cada item { indice, parte, posicao (Vector3) }, no formato que
	construtorMapa.lua entrega e plataformas.lua consome. Mede o salto de
	verdade entre vizinhas — já com o deslocamento aleatório da construção
	somado — e rejeita se algum passar do alcance do pulo.

	Ordena por `indice` antes de percorrer: este teste decide se uma live é
	jogável ou não, e não devia confiar na ordem de tabela que quem chamou
	entregou por acidente.
]]
function Jogabilidade.verificarConstruido(mapa, plataformas)
	if type(mapa) ~= "table" or not Tipos.ehNumero(mapa.jumpHeight) then
		return false, { "mapa sem jumpHeight válido" }
	end
	if type(plataformas) ~= "table" or #plataformas < 2 then
		return false, { "menos de 2 plataformas: nada para percorrer" }
	end

	local ordenadas = {}
	for i = 1, #plataformas do
		ordenadas[i] = plataformas[i]
	end
	table.sort(ordenadas, function(a, b)
		return a.indice < b.indice
	end)

	local alturaMax, distanciaHorizontalMax = Jogabilidade.alcanceDoPulo(mapa.jumpHeight)
	local problemas = {}

	for i = 2, #ordenadas do
		local anterior = ordenadas[i - 1]
		local atual = ordenadas[i]

		local deltaVertical = atual.posicao.Y - anterior.posicao.Y
		-- Horizontal no plano XZ: Y já é a subida, não entra nesta conta.
		local dx = atual.posicao.X - anterior.posicao.X
		local dz = atual.posicao.Z - anterior.posicao.Z
		local entreCentros = math.sqrt(dx * dx + dz * dz)

		-- O que o streamer atravessa é o VÃO entre as bordas, não a distância
		-- entre os centros. Os discos são largos: dois deles com centros a 9
		-- studs e raio 8 cada se sobrepõem, e aí não há salto horizontal
		-- nenhum — anda até a borda e pula reto. Medir centro a centro
		-- reprovaria mapa trivialmente jogável.
		local vao = entreCentros - Jogabilidade.raioDe(anterior) - Jogabilidade.raioDe(atual)

		if deltaVertical > alturaMax then
			table.insert(problemas, string.format(
				"plataforma %s -> %s intransponível: subida %.2f passa do alcance %.2f",
				tostring(anterior.indice), tostring(atual.indice), deltaVertical, alturaMax
			))
		end
		if vao > distanciaHorizontalMax then
			table.insert(problemas, string.format(
				"plataforma %s -> %s intransponível: vão de %.2f entre as bordas passa do alcance %.2f",
				tostring(anterior.indice), tostring(atual.indice), vao, distanciaHorizontalMax
			))
		end
	end

	return #problemas == 0, problemas
end

return Jogabilidade
