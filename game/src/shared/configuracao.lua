--!strict
-- Onde a ponte está e qual token usar.
--
-- **Nenhum valor sensível mora neste arquivo.** O `11_SEGURANCA` proíbe chave,
-- token ou URL de túnel dentro de script Luau versionado, e isto aqui é
-- versionado. Os valores vivem em objetos do ServerStorage que o streamer
-- preenche uma vez no Studio, pelo painel de Propriedades.
--
-- Montar isso é o passo 1 do game/README.md.

local RunService = game:GetService("RunService")
local ServerStorage = game:GetService("ServerStorage")

local Configuracao = {}

Configuracao.PASTA = "KoraConfig"
Configuracao.URL = "UrlDaPonte"
Configuracao.TOKEN = "Token"

local INSTRUCAO = [[
Falta configurar a ponte no Studio.

No ServerStorage, crie uma Folder chamada "KoraConfig" com dois StringValue:
  UrlDaPonte  = https://seu-tunel.trycloudflare.com   (ou http://127.0.0.1:8787)
  Token       = o mesmo BRIDGE_TOKEN do .env da ponte

E ligue HttpService em Game Settings -> Security -> Allow HTTP Requests.

Nada disso vai para o git: por isso mora no ServerStorage e não em código.
]]

local function ler(pasta, nome)
	local valor = pasta:FindFirstChild(nome)
	if not valor or not valor:IsA("StringValue") then
		return nil
	end
	local texto = string.gsub(valor.Value, "^%s*(.-)%s*$", "%1")
	if texto == "" then
		return nil
	end
	return texto
end

--[[
	Devolve { url, token } ou nil mais a instrução do que falta.
	Nunca lança: quem chama decide se para o jogo ou só avisa.
]]
function Configuracao.carregar()
	if not RunService:IsServer() then
		return nil, "Configuracao só existe no servidor: o cliente nunca vê o token."
	end

	-- As três falhas abaixo davam a MESMA mensagem, e são causas diferentes:
	-- pasta ausente é place errado ou Rojo sincronizando por cima; valor
	-- ausente é a Folder criada pela metade. Dizer qual foi economiza a rodada
	-- de adivinhação que custou uma tarde.
	-- As falhas abaixo davam a MESMA mensagem e são causas diferentes: pasta
	-- ausente é place errado ou Rojo ainda não sincronizado; valor ausente é a
	-- Folder criada pela metade. Dizer qual foi economiza uma rodada inteira de
	-- adivinhação.
	local pasta = ServerStorage:FindFirstChild(Configuracao.PASTA)
	if not pasta then
		return nil, "Não achei a Folder " .. Configuracao.PASTA .. " em ServerStorage. " .. INSTRUCAO
	end

	local url = ler(pasta, Configuracao.URL)
	local token = ler(pasta, Configuracao.TOKEN)

	if not url and not token then
		return nil, "A Folder " .. Configuracao.PASTA .. " existe, mas está VAZIA. " .. INSTRUCAO
	end
	if not url then
		return nil, "Falta o StringValue " .. Configuracao.URL .. " dentro de " .. Configuracao.PASTA .. ". " .. INSTRUCAO
	end
	if not token then
		return nil, "Falta o StringValue " .. Configuracao.TOKEN .. " dentro de " .. Configuracao.PASTA .. ". " .. INSTRUCAO
	end

	-- Barra no fim quebra a montagem de caminho mais adiante, e é erro comum
	-- de quem cola URL de túnel.
	url = string.gsub(url, "/+$", "")

	return { url = url, token = token }
end

return Configuracao
