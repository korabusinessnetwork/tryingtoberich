--!strict
local Compartilhado = game:GetService("ReplicatedStorage"):WaitForChild("KoraCompartilhado")
local Efeitos = require(Compartilhado.efeitos)

-- Menor animação da biblioteca: sobe e já pousa. O trail é só um risco rápido;
-- a poeira é o que vende o pouso, por isso ela espera um instante em vez de
-- nascer junto com o trail (ver Elementos: "poeira NO POUSO", não na subida).
local DURACAO_BASE = 0.4

return {
	id = "sub_pulo",
	nome = "Pulo",
	direcao = "subida",
	pesoVisual = 1,
	duracaoBase = DURACAO_BASE,
	aceitaDeltaVariavel = false,
	executar = function(personagem, contexto)
		Efeitos.executarSeguro(function()
			local raiz = Efeitos.raiz(personagem)
			if not raiz then
				return
			end

			local topo = Efeitos.anexo(raiz, "PuloTopo", Vector3.new(0, 0.9, 0))
			local base = Efeitos.anexo(raiz, "PuloBase", Vector3.new(0, -0.9, 0))
			Efeitos.trilha(topo, base, {
				Color = Efeitos.sequenciaDeCor(Color3.fromRGB(235, 245, 255)),
				Transparency = Efeitos.sequenciaDeNumero(0.2, 1),
				Lifetime = 0.15,
				Width0 = 1.4 * Efeitos.escala(contexto.intensidade),
				Width1 = 0.2,
			}, DURACAO_BASE)

			task.wait(DURACAO_BASE * 0.6)

			-- ~3 studs abaixo da raiz cobre o pé do rig R6.
			local pes = Efeitos.anexo(raiz, "PuloPes", Vector3.new(0, -3, 0))
			local poeira = Efeitos.particula(pes, {
				Color = Efeitos.sequenciaDeCor(Color3.fromRGB(200, 180, 150)),
				Lifetime = NumberRange.new(0.25, 0.45),
				Speed = NumberRange.new(3, 7),
				SpreadAngle = Vector2.new(180, 35),
				Rate = 0, -- estouro único via Emit, não jato contínuo
			}, contexto.intensidade, DURACAO_BASE)
			if poeira then
				poeira.Enabled = false
				poeira:Emit(math.floor(9 * Efeitos.escala(contexto.intensidade)))
			end
		end)
	end,
}
