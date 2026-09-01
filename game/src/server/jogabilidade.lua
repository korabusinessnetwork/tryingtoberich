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
	Raio do disco a partir da parte construída. O construtor cria Block com
	Size = (raio*2, espessura, raio*2), então metade da largura é o raio.
	Cai em 0 quando a parte não veio: sem raio conhecido, a conta do vão fica
	conservadora (vão maior) em vez de otimista, que é o lado seguro de errar.
]]
function Jogabilidade.raioDe(entrada)
	local parte = entrada and entrada.parte
	if not parte or typeof(parte) ~= "Instance" then
		return 0
	end
	local ok, largura = pcall(function()
		return parte.Size.X
	end)
	if not ok or not Tipos.ehNumero(largura) then
		return 0
	end
	return largura / 2
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

	if not Tipos.ehNumero(p.variacaoHorizontal) or p.variacaoHorizontal < 0 then
		table.insert(problemas, "variacaoHorizontal inválido")
	elseif p.variacaoHorizontal > distanciaHorizontalMax then
		table.insert(problemas, string.format(
			"variacaoHorizontal %.2f passa do alcance horizontal do pulo (%.2f, jumpHeight %.2f)",
			p.variacaoHorizontal, distanciaHorizontalMax, mapa.jumpHeight
		))
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
