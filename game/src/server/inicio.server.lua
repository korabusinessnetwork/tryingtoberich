--!strict
-- Entrada do servidor. Só sobe a sessão e reporta o que deu errado de um jeito
-- que o streamer entenda no output do Studio.
--
-- Erro de subida aqui é quase sempre configuração, não código: HttpService
-- desligado, KoraConfig ausente, ponte fora do ar, preset sem mapa. Stack trace
-- não ajuda nisso; instrução ajuda. Por isso `Sessao.iniciar` devolve erro em
-- vez de lançar, e por isso este arquivo é curto.

local Sessao = require(script.Parent.sessao)

local ok, erro = Sessao.iniciar()

if not ok then
	warn("[Kora] a sessão não subiu.")
	warn(tostring(erro))
	warn("Confira o passo a passo em game/README.md, seção 'Antes da primeira partida'.")
	return
end

print("[Kora] sessão no ar. O jogo já está em long-poll com a ponte.")

game:BindToClose(function()
	-- Fecha o long-poll e destrava o vestiário antes do lugar morrer.
	Sessao.parar()
end)
