--!strict
-- Contratos que o jogo recebe de fora. Nada aqui toca Roblox: são funções puras
-- de validação, para o resto do código poder assumir que o dado está são.
--
-- Regra dura: TUDO que vem da ponte é validado aqui antes de virar movimento.
-- A ponte é confiável, a rede não. Ver docs/11_SEGURANCA, camada 3.
--
-- Escrito no subconjunto Lua 5.1 de propósito (sem anotação de tipo, sem
-- `continue`, sem `+=`): assim `luac5.1 -p` consegue validar a sintaxe de todo
-- o jogo fora do Studio. Luau aceita tudo isto sem mudança.

local Tipos = {}

-- Margem do ADR-009. Espelha FATOR_SALTO_VERTICAL de bridge/src/dominio/regras.mjs.
Tipos.FATOR_SALTO_VERTICAL = 0.7
-- Teto da biblioteca de animações, e por tabela o teto do bloqueio de controle (R11).
Tipos.DURACAO_MAX = 3.5
Tipos.INTENSIDADE_MAX = 5
Tipos.PLATAFORMA_MIN = 0

--[[ Onde a corrida COMEÇA: o primeiro degrau, não o zero.

	`PLATAFORMA_MIN` é o piso do contrato — 0 quer dizer "abaixo da torre", e
	existe para o delta negativo ter onde parar. Mas ninguém joga a partir do 0:
	o boneco nasce em cima do degrau 1, e é de lá que a referência parte. ]]
Tipos.PLATAFORMA_INICIAL = 1

local function ehNumero(valor)
	return type(valor) == "number" and valor == valor and valor ~= math.huge and valor ~= -math.huge
end

local function ehInteiro(valor)
	return ehNumero(valor) and math.floor(valor) == valor
end

local function ehTextoCurto(valor, maximo)
	return type(valor) == "string" and #valor > 0 and #valor <= maximo
end

Tipos.ehNumero = ehNumero
Tipos.ehInteiro = ehInteiro

--[[
	Um evento vindo de GET /jogo/eventos.

	Repare no que NÃO existe aqui: slot, presenteId, moedas. O motor é burro de
	propósito — recebe animação e delta e executa, sem saber o que é presente
	nem quanto vale. Ver ADR-007 e memory/patterns.md.
]]
--[[
	A contagem regressiva do fim de rodada, em UM lugar só.

	O servidor soma isto para saber quando reiniciar; o cliente percorre para
	desenhar. Dois números escritos separados divergiriam, e o sintoma seria o
	pior possível: a torre reiniciando antes ou depois do "1" sumir da tela.

	Duração crescente de propósito: o "1" é o momento de tensão e precisa durar
	mais que o "3", que é só o aviso de que algo vai acontecer.
]]
--[[
	Vida do portal, quando o preset não diz outra.

	A unidade é ANDAR de empurrão para baixo, a mesma do delta: um presente de
	-20 tira 20. Com a torre de 1000 andares, 2000 é o equivalente a duas torres
	inteiras de queda — é o preço de fazer o streamer perder à força.
]]
Tipos.VIDA_PADRAO_DO_PORTAL = 2000

--[[ Espessura do degrau em studs. Espelha ESPESSURA_DISCO no construtor e
	ESPESSURA_DO_DEGRAU na ponte.

	É regra, não aparência: na passarela os degraus se encostam, e é a espessura
	que diz qual subida deixa um degrau APOIADO no anterior em vez de flutuando
	acima dele com o jogador preso na fresta. ]]
Tipos.ESPESSURA_DO_DEGRAU = 2

Tipos.CONTAGEM_DE_RODADA = {
	{ numero = 3, segundos = 2 },
	{ numero = 2, segundos = 3 },
	{ numero = 1, segundos = 5 },
}

function Tipos.duracaoDaContagem()
	local total = 0
	for _, passo in ipairs(Tipos.CONTAGEM_DE_RODADA) do
		total = total + passo.segundos
	end
	return total
end

function Tipos.validarEvento(bruto)
	if type(bruto) ~= "table" then
		return nil, "evento não é tabela"
	end
	if not ehInteiro(bruto.id) or bruto.id < 0 then
		return nil, "id inválido"
	end
	if not ehTextoCurto(bruto.animacaoId, 48) then
		return nil, "animacaoId inválido"
	end
	if not ehInteiro(bruto.delta) or bruto.delta == 0 then
		return nil, "delta tem que ser inteiro e diferente de zero"
	end
	if not ehInteiro(bruto.intensidade) or bruto.intensidade < 1 or bruto.intensidade > Tipos.INTENSIDADE_MAX then
		return nil, "intensidade fora de 1 a 5"
	end

	local nomeDoador = nil
	if type(bruto.nomeDoador) == "string" and #bruto.nomeDoador > 0 then
		-- A ponte já sanitiza, mas o corte de tamanho é repetido aqui de
		-- propósito: o que entra na tela do jogo não depende de o outro lado
		-- ter feito a parte dele.
		nomeDoador = string.sub(bruto.nomeDoador, 1, 24)
	end

	return {
		id = bruto.id,
		animacaoId = bruto.animacaoId,
		delta = bruto.delta,
		intensidade = bruto.intensidade,
		efeitoCurto = bruto.efeitoCurto == true,
		nomeDoador = nomeDoador,
		presenteNome = type(bruto.presenteNome) == "string" and string.sub(bruto.presenteNome, 1, 60) or nil,
		emitidoEm = ehNumero(bruto.emitidoEm) and bruto.emitidoEm or 0,
	}
end

--[[
	O spec de mapa de GET /jogo/mapa.

	A checagem de jogabilidade do ADR-009 é refeita aqui mesmo a ponte já tendo
	feito: um mapa intransponível numa live é tela parada, e tela parada é o que
	o TikTok pune. Custa um `if` e evita a pior falha do produto.
]]
function Tipos.validarMapa(spec)
	if type(spec) ~= "table" then
		return nil, "mapa não é tabela"
	end
	if not ehInteiro(spec.totalPlataformas) or spec.totalPlataformas < 1 then
		return nil, "totalPlataformas inválido"
	end
	if not ehNumero(spec.jumpHeight) or spec.jumpHeight <= 0 then
		return nil, "jumpHeight inválido"
	end
	if type(spec.plataformas) ~= "table" then
		return nil, "bloco plataformas ausente"
	end

	local p = spec.plataformas
	if not ehNumero(p.espacamentoVertical) or p.espacamentoVertical <= 0 then
		return nil, "espacamentoVertical inválido"
	end
	if not ehNumero(p.raioBase) or p.raioBase <= 0 then
		return nil, "raioBase inválido"
	end

	local teto = spec.jumpHeight * Tipos.FATOR_SALTO_VERTICAL
	if p.espacamentoVertical > teto then
		return nil, string.format(
			"mapa intransponível: espacamentoVertical %.2f passa do teto %.2f (jumpHeight %.2f x %.2f)",
			p.espacamentoVertical, teto, spec.jumpHeight, Tipos.FATOR_SALTO_VERTICAL
		)
	end

	return spec
end

--[[
	O look de GET /jogo/look.

	`fallbackItens` é obrigatório e não vazio: item despublicado não pode deixar
	o personagem nascer sem roupa numa live. Ver ADR-010.
]]
function Tipos.validarLook(look)
	if type(look) ~= "table" then
		return nil, "look não é tabela"
	end
	if type(look.itensCatalogo) ~= "table" then
		return nil, "itensCatalogo ausente"
	end
	if type(look.fallbackItens) ~= "table" or #look.fallbackItens == 0 then
		return nil, "fallbackItens é obrigatório e não pode ser vazio"
	end
	return look
end

--[[
	R6 — limites do tabuleiro. Delta negativo que passaria de 0 para o boneco
	em 0; delta positivo não passa do tamanho do mapa.
]]
function Tipos.limitarPlataforma(destino, totalPlataformas)
	if destino < Tipos.PLATAFORMA_MIN then
		return Tipos.PLATAFORMA_MIN
	end
	if destino > totalPlataformas then
		return totalPlataformas
	end
	return destino
end

--[[
	Escala aplicada por intensidade. Multiplica tamanho, número de partícula e
	volume — NUNCA duração. Ver biblioteca-animacoes.md.
]]
function Tipos.escalaDeIntensidade(intensidade)
	local i = math.max(1, math.min(intensidade or 1, Tipos.INTENSIDADE_MAX))
	return 0.6 + (i * 0.2)
end

return Tipos
