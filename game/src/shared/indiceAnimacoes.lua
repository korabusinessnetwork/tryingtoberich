--!strict
-- GERADO por scripts/gerar-animacoes.mjs a partir da tabela de
-- docs/03_REGRAS_DE_NEGOCIO/biblioteca-animacoes.md. Não editar à mão.
--
-- Acrescentar a 21a animação: criar o ModuleScript em game/src/animacoes/,
-- acrescentar a linha na tabela do doc e rodar `npm run gerar`. Nada mais muda.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Indice = {}

Indice.metadados = {
	{ id = "sub_pulo", nome = "Pulo", direcao = "subida", pesoVisual = 1, duracaoBase = 0.4, aceitaDeltaVariavel = false, ativa = false },
	{ id = "sub_impulso", nome = "Impulso", direcao = "subida", pesoVisual = 1, duracaoBase = 0.6, aceitaDeltaVariavel = true, ativa = false },
	{ id = "sub_mola", nome = "Mola", direcao = "subida", pesoVisual = 2, duracaoBase = 0.8, aceitaDeltaVariavel = true, ativa = false },
	{ id = "sub_foguete", nome = "Foguete", direcao = "subida", pesoVisual = 2, duracaoBase = 1.2, aceitaDeltaVariavel = true, ativa = false },
	{ id = "sub_vento", nome = "Vento Ascendente", direcao = "subida", pesoVisual = 2, duracaoBase = 1.2, aceitaDeltaVariavel = true, ativa = false },
	{ id = "sub_raio", nome = "Raio Ascendente", direcao = "subida", pesoVisual = 3, duracaoBase = 1, aceitaDeltaVariavel = true, ativa = false },
	{ id = "sub_cometa", nome = "Cometa", direcao = "subida", pesoVisual = 3, duracaoBase = 1.6, aceitaDeltaVariavel = true, ativa = false },
	{ id = "sub_tornado", nome = "Tornado", direcao = "subida", pesoVisual = 3, duracaoBase = 2, aceitaDeltaVariavel = true, ativa = false },
	{ id = "sub_portal", nome = "Portal", direcao = "subida", pesoVisual = 4, duracaoBase = 2.2, aceitaDeltaVariavel = false, ativa = false },
	{ id = "sub_fenix", nome = "Ascensão da Fênix", direcao = "subida", pesoVisual = 5, duracaoBase = 3, aceitaDeltaVariavel = true, ativa = false },
	{ id = "sub_corte", nome = "Corte Ascendente", direcao = "subida", pesoVisual = 3, duracaoBase = 1, aceitaDeltaVariavel = true, ativa = false },
	{ id = "sub_shuriken", nome = "Shuriken Espiral", direcao = "subida", pesoVisual = 4, duracaoBase = 2, aceitaDeltaVariavel = true, ativa = false },
	{ id = "sub_despertar", nome = "Despertar", direcao = "subida", pesoVisual = 5, duracaoBase = 3, aceitaDeltaVariavel = true, ativa = false },
	{ id = "sub_shuriken_vento", nome = "Shuriken de Vento", direcao = "subida", pesoVisual = 4, duracaoBase = 2, aceitaDeltaVariavel = true, ativa = true },
	{ id = "sub_jato_propulsor", nome = "Jato Propulsor", direcao = "subida", pesoVisual = 3, duracaoBase = 1.8, aceitaDeltaVariavel = true, ativa = true },
	{ id = "sub_lanca_raios", nome = "Lança de Raios", direcao = "subida", pesoVisual = 4, duracaoBase = 1.2, aceitaDeltaVariavel = true, ativa = true },
	{ id = "des_tropeco", nome = "Tropeço", direcao = "descida", pesoVisual = 1, duracaoBase = 0.4, aceitaDeltaVariavel = false, ativa = false },
	{ id = "des_escorregao", nome = "Escorregão", direcao = "descida", pesoVisual = 1, duracaoBase = 0.6, aceitaDeltaVariavel = true, ativa = false },
	{ id = "des_chumbo", nome = "Peso de Chumbo", direcao = "descida", pesoVisual = 2, duracaoBase = 0.9, aceitaDeltaVariavel = true, ativa = false },
	{ id = "des_rajada", nome = "Rajada Descendente", direcao = "descida", pesoVisual = 2, duracaoBase = 1, aceitaDeltaVariavel = true, ativa = false },
	{ id = "des_ancora", nome = "Âncora", direcao = "descida", pesoVisual = 2, duracaoBase = 1.3, aceitaDeltaVariavel = true, ativa = false },
	{ id = "des_meteoro", nome = "Meteoro", direcao = "descida", pesoVisual = 3, duracaoBase = 1.6, aceitaDeltaVariavel = true, ativa = false },
	{ id = "des_raio_negro", nome = "Raio Negro", direcao = "descida", pesoVisual = 3, duracaoBase = 1, aceitaDeltaVariavel = true, ativa = false },
	{ id = "des_redemoinho", nome = "Redemoinho", direcao = "descida", pesoVisual = 3, duracaoBase = 2, aceitaDeltaVariavel = true, ativa = false },
	{ id = "des_buraco_negro", nome = "Buraco Negro", direcao = "descida", pesoVisual = 4, duracaoBase = 2.4, aceitaDeltaVariavel = true, ativa = false },
	{ id = "des_dimensional", nome = "Queda Dimensional", direcao = "descida", pesoVisual = 5, duracaoBase = 3, aceitaDeltaVariavel = true, ativa = false },
	{ id = "des_corte", nome = "Corte Descendente", direcao = "descida", pesoVisual = 3, duracaoBase = 1, aceitaDeltaVariavel = true, ativa = false },
	{ id = "des_shuriken", nome = "Shuriken Reverso", direcao = "descida", pesoVisual = 4, duracaoBase = 1.8, aceitaDeltaVariavel = true, ativa = false },
	{ id = "des_selo", nome = "Selo Amaldiçoado", direcao = "descida", pesoVisual = 5, duracaoBase = 3, aceitaDeltaVariavel = true, ativa = false },
	{ id = "des_meteoro_igneo", nome = "Meteoro Ígneo", direcao = "descida", pesoVisual = 5, duracaoBase = 2.2, aceitaDeltaVariavel = true, ativa = true },
	{ id = "des_punho_impacto", nome = "Punho de Impacto", direcao = "descida", pesoVisual = 4, duracaoBase = 1.4, aceitaDeltaVariavel = true, ativa = true },
	{ id = "des_braco_elastico", nome = "Braço Elástico", direcao = "descida", pesoVisual = 3, duracaoBase = 1.6, aceitaDeltaVariavel = true, ativa = true },
}

Indice.porId = {}
for _, meta in ipairs(Indice.metadados) do
	Indice.porId[meta.id] = meta
end

local cache = {}

--[[
	Carrega o ModuleScript da animação, uma vez, e confere que os metadados dele
	batem com esta tabela. Módulo dizendo uma duração e o índice dizendo outra é
	bug silencioso: o servidor libera o controle na hora errada.
]]
function Indice.obter(id)
	if cache[id] then
		return cache[id]
	end

	local meta = Indice.porId[id]
	if not meta then
		return nil, "animação desconhecida: " .. tostring(id)
	end

	local pasta = ReplicatedStorage:FindFirstChild("KoraAnimacoes")
	if not pasta then
		return nil, "pasta KoraAnimacoes não existe"
	end

	local modulo = pasta:FindFirstChild(id)
	if not modulo then
		return nil, "módulo da animação não encontrado: " .. id
	end

	local ok, animacao = pcall(require, modulo)
	if not ok or type(animacao) ~= "table" or type(animacao.executar) ~= "function" then
		return nil, "módulo inválido: " .. id
	end

	if animacao.duracaoBase ~= meta.duracaoBase or animacao.direcao ~= meta.direcao then
		warn(string.format(
			"[Kora] %s discorda do índice (duração %s vs %s, direção %s vs %s). Vale o índice.",
			id, tostring(animacao.duracaoBase), tostring(meta.duracaoBase),
			tostring(animacao.direcao), meta.direcao
		))
	end

	cache[id] = animacao
	return animacao
end

--[[ Duração em segundos, sempre do índice. É ela que arma o watchdog do R11. ]]
function Indice.duracao(id)
	local meta = Indice.porId[id]
	return meta and meta.duracaoBase or 0
end

--[[ Peso visual 4 ou 5 é o gatilho de afastar a câmera. Ver docs/09_BACKLOG. ]]
function Indice.pesoVisual(id)
	local meta = Indice.porId[id]
	return meta and meta.pesoVisual or 1
end

return Indice
