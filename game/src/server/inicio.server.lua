--!strict
-- Entrada do servidor.
--
-- A ordem aqui não é arbitrária: o vestiário sobe ANTES da sessão e
-- independente dela. Ele é a tela que o streamer usa justamente quando não há
-- live rodando (ADR-011), e amarrá-lo ao sucesso da sessão o deixaria
-- inacessível exatamente quando a sessão não sobe — que é quando ele mais
-- serve, para montar o look antes da primeira partida.
--
-- Erro de subida da sessão é quase sempre configuração, não código:
-- HttpService desligado, KoraConfig ausente, ponte fora do ar, preset sem
-- mapa. Stack trace não ajuda nisso; instrução ajuda. Por isso
-- `Sessao.iniciar` devolve erro em vez de lançar, e por isso este arquivo é
-- curto.

local Sessao = require(script.Parent.sessao)
local Vestiario = require(script.Parent.vestiario)

Vestiario.iniciar({
	-- Função, não booleano: o estado muda durante a vida do servidor, e
	-- capturar o valor agora travaria o vestiário no que era verdade na subida.
	sessaoAtiva = function()
		return Sessao.estado().sessaoAtiva
	end,
})

local ok, erro = Sessao.iniciar()

if not ok then
	warn("[Kora] a sessão não subiu.")
	warn(tostring(erro))
	warn("Confira o passo a passo em game/README.md, seção 'Antes da primeira partida'.")
	warn("O vestiário continua disponível: dá para montar o look enquanto isso.")
	return
end

print("[Kora] sessão no ar. O jogo já está em long-poll com a ponte.")

game:BindToClose(function()
	-- Fecha o long-poll e destrava o vestiário antes do lugar morrer.
	Sessao.parar()
end)
