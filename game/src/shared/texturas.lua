--!strict
-- O catálogo de texturas de efeito, e o encaixe que faltava nas 32 animações.
--
-- POR QUE ELE EXISTE. As animações já fazem geometria, hélice, onda, tremor e
-- esteira. O que nenhuma delas tem é TEXTURA: as 32 usam partícula, feixe e
-- trilha no visual padrão do Roblox, que é um borrão redondo e liso. É essa a
-- diferença que sobra entre "efeito de engine" e "impacto de anime": faísca com
-- forma, chama com desenho, corte com fio, anel com borda. Geometria a gente já
-- tem de sobra; sprite a gente não tem nenhuma.
--
-- POR QUE O CATÁLOGO, E NÃO O ID SOLTO NO MÓDULO. Textura no Roblox é asset com
-- upload e moderação (ADR-004), e o mesmo `rbxassetid` é usado por várias
-- animações. Espalhar o número por 32 arquivos significa que trocar uma sprite
-- reprovada é caçar o número em 32 lugares, e que ninguém sabe quais existem.
-- Aqui é um lugar só, com nome de domínio, e o módulo pede `Texturas.faisca`.
--
-- POR QUE TUDO ESTÁ VAZIO. Ainda não existe nenhuma. String vazia é o valor
-- que o Roblox entende como "sem textura", então o jogo roda exatamente como
-- roda hoje. **Não é pendência esquecida, é o estado inicial correto**: o dia em
-- que a primeira sprite for aprovada, ela entra aqui e aparece em toda animação
-- que a pede, sem tocar em nenhum módulo de animação.
--
-- COMO PREENCHER, quando houver:
--   1. Gerar a imagem, 512x512, fundo PRETO e forma clara. O Roblox multiplica
--      a cor da partícula pela textura, então preto vira transparente no modo
--      aditivo e a cor de cada animação continua mandando. Sprite colorida
--      brigaria com a paleta de cada efeito.
--   2. Subir pelo acervo e esperar a moderação (ADR-004).
--   3. Colar o id aqui, no formato `rbxassetid://123456789`.
--
-- O que NÃO fazer: id de asset de terceiro. O upload passa pela moderação do
-- Roblox, e conteúdo de propriedade alheia derruba a conta que o produto
-- inteiro depende. Estilo de anime é livre; personagem de anime não é.

local Texturas = {}

--[[
	Os nomes são de DOMÍNIO, não de arquivo.

	`faisca` é o que uma animação pede quando quer faísca, e qual imagem serve a
	isso é decisão de quem cura o acervo, não de quem escreve o efeito. Foi assim
	que o `indiceAnimacoes` e os tokens já funcionam neste projeto.
]]
local CATALOGO = {
	-- Partícula
	faisca = "", -- ponto com cauda, para brasa, energia e estilhaço
	chama = "", -- língua de fogo vertical
	fumaca = "", -- baforada macia, bordas irregulares
	brilho = "", -- halo redondo suave, para núcleo e clarão
	estilhaco = "", -- lasca angular, para pedra e gelo
	folha = "", -- pétala ou folha, para vento e natureza

	-- Feixe e trilha
	raio = "", -- risco elétrico irregular
	corte = "", -- fio de lâmina, claro no meio e fino nas pontas
	rastro = "", -- faixa que afina, para esteira e trilha de velocidade
	corrente = "", -- elos, para âncora e prisão

	-- Superfície de onda e anel
	anel = "", -- aro fino de choque
	onda = "", -- frente de onda com gradiente
	selo = "", -- círculo mágico com marcas, para selo e portal
}

--[[
	O id da textura, ou string vazia.

	Nunca devolve `nil`: `nil` numa propriedade `Texture` do Roblox é erro em
	tempo de execução, e erro dentro de animação é o `executarSeguro` engolindo
	o efeito inteiro. String vazia é o "sem textura" que a engine entende.

	Nome desconhecido também devolve vazio, de propósito. Uma animação nova
	pedindo `Texturas.de("explosao")` antes de a sprite existir tem que rodar
	sem textura, não quebrar.
]]
function Texturas.de(nome)
	local id = CATALOGO[nome]
	if type(id) == "string" then
		return id
	end
	return ""
end

--[[ Verdadeiro quando a sprite já existe. Útil para o efeito decidir entre
	dois desenhos: com sprite, uma partícula grande basta; sem ela, o jeito de
	dar forma é somar camadas. ]]
function Texturas.existe(nome)
	return Texturas.de(nome) ~= ""
end

--[[ Os nomes que o catálogo conhece, para a vistoria e para o teste. ]]
function Texturas.nomes()
	local nomes = {}
	for nome in pairs(CATALOGO) do
		table.insert(nomes, nome)
	end
	table.sort(nomes)
	return nomes
end

--[[ Quantas já foram preenchidas. É o número que diz se vale a pena revisitar
	as animações que somam camadas por falta de sprite. ]]
function Texturas.quantasExistem()
	local quantas = 0
	for _, id in pairs(CATALOGO) do
		if id ~= "" then
			quantas = quantas + 1
		end
	end
	return quantas
end

return Texturas
