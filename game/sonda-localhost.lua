-- SONDA F0-7 — o Studio alcança a ponte em 127.0.0.1?
--
-- COMO USAR: cole este arquivo inteiro na BARRA DE COMANDOS do Roblox Studio
-- (View -> Command Bar) e aperte Enter. Leia o Output. Leva uns 10 segundos.
--
-- Antes: rode `npm run sondar` no projeto. Ele confere a ponte daqui e imprime
-- esta sonda já com a porta certa.
--
-- A pergunta está aberta no ADR-002 desde o Bloco 1, e o ADR-P04 depende dela:
-- se o Studio alcança 127.0.0.1, o Cloudflare Tunnel deixa de ser obrigatório —
-- e com ele some a única exposição do sistema à internet, o passo mais frágil
-- do instalador, e cerca de um terço do orçamento de latência.
--
-- ESTE ARQUIVO NÃO É PARTE DO JOGO. Ele não vai para o place, não é ModuleScript
-- e não é carregado por nada. É ferramenta de diagnóstico, rodada à mão.
--
-- Escrito no subconjunto Lua 5.1, como todo Luau do projeto: o gate
-- `npm run luau` valida com um parser 5.1 (ver scripts/verificar-luau.mjs).

local HttpService = game:GetService("HttpService")
local ServerStorage = game:GetService("ServerStorage")

-- A porta padrão da ponte (BRIDGE_PORT no .env). `npm run sondar` reescreve
-- esta linha com a porta real antes de você colar.
local PORTA = 8787

local CANDIDATOS = {
	"http://127.0.0.1:" .. PORTA,
	"http://localhost:" .. PORTA,
}

--[[
	O token, se o streamer já configurou o place (ver shared/configuracao.lua).

	A sonda funciona SEM ele. É importante saber disso: um 401 responde a
	pergunta do mesmo jeito, porque para tomar 401 o pacote precisou chegar na
	ponte. O token só existe aqui para o caso feliz sair 200 e não 401.
]]
local function tokenConfigurado()
	local pasta = ServerStorage:FindFirstChild("KoraConfig")
	if not pasta then
		return nil
	end
	local valor = pasta:FindFirstChild("Token")
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
	Classifica o resultado numa das causas que se parecem.

	Este é o coração da sonda. Sem separar as quatro, "não funcionou" pode ser
	HttpService desligado, ponte fora do ar, token errado ou o Studio realmente
	bloqueado — e só a última responde F0-7. Uma tarde já foi embora assim.
]]
local function classificar(ok, resposta)
	if not ok then
		local erro = tostring(resposta)

		-- O Roblox diz isso quando Game Settings -> Security -> Allow HTTP
		-- Requests está desligado. Não é resposta para F0-7: é passo esquecido.
		if string.find(erro, "not enabled", 1, true) or string.find(erro, "Http requests", 1, true) then
			return "CONFIG", "HttpService DESLIGADO. Game Settings -> Security -> Allow HTTP Requests.", erro
		end

		-- Conexão recusada: alguém respondeu "não tem ninguém nessa porta".
		-- Isso é ALCANCE FUNCIONANDO com a ponte fora do ar.
		if string.find(erro, "ConnectFail", 1, true) or string.find(erro, "refused", 1, true) then
			return "PONTE", "A ponte não está no ar nessa porta (conexão recusada).", erro
		end

		if string.find(erro, "Timedout", 1, true) or string.find(erro, "timeout", 1, true) then
			return "BLOQUEADO", "Tempo esgotado sem resposta — o pacote não chegou.", erro
		end

		if string.find(erro, "DnsResolve", 1, true) or string.find(erro, "Unknown host", 1, true) then
			return "BLOQUEADO", "O nome não resolveu (típico de localhost em IPv6).", erro
		end

		return "BLOQUEADO", "Falhou sem causa reconhecida.", erro
	end

	local codigo = resposta.StatusCode

	if codigo == 200 then
		return "ALCANCA", "200 OK — alcançou a ponte E o token está certo.", resposta.Body
	end

	-- O achado que evita a conclusão errada.
	if codigo == 401 then
		return "ALCANCA", "401 — token errado ou ausente, MAS O PACOTE CHEGOU. Isso é sucesso para F0-7.", resposta.Body
	end

	if codigo == 429 then
		return "ALCANCA", "429 — rate limit da ponte respondeu. Chegou.", resposta.Body
	end

	if codigo == 404 then
		return "PONTE", "404 — respondeu algo, mas não é a ponte (ou é versão sem /jogo/sonda).", resposta.Body
	end

	return "ALCANCA", "HTTP " .. tostring(codigo) .. " — respondeu, logo alcançou.", resposta.Body
end

local function sondar(base, token)
	local cabecalhos = {}
	if token then
		cabecalhos["X-Bridge-Token"] = token
	end

	local ok, resposta = pcall(function()
		return HttpService:RequestAsync({
			Url = base .. "/jogo/sonda",
			Method = "GET",
			Headers = cabecalhos,
		})
	end)

	return classificar(ok, resposta)
end

print("")
print("================ SONDA F0-7 ================")

local token = tokenConfigurado()
if token then
	print("Token do KoraConfig: encontrado (não será impresso).")
else
	print("Token do KoraConfig: AUSENTE — tudo bem. Um 401 responde a pergunta igual.")
end
print("")

local alcancou = false
local houveConfig = false

for _, base in ipairs(CANDIDATOS) do
	local veredito, explicacao, detalhe = sondar(base, token)

	print(base)
	print("   " .. veredito .. ": " .. explicacao)
	if detalhe and detalhe ~= "" then
		print("   detalhe: " .. string.sub(tostring(detalhe), 1, 200))
	end
	print("")

	if veredito == "ALCANCA" then
		alcancou = true
	elseif veredito == "CONFIG" then
		houveConfig = true
	end
end

print("-------------------- RESPOSTA --------------------")
if alcancou then
	print("SIM. O Studio alcança a ponte em localhost.")
	print("O Cloudflare Tunnel pode sair do caminho (reabre o ADR-002).")
elseif houveConfig then
	print("INCONCLUSIVO. Ligue o HttpService e rode de novo.")
	print("Game Settings -> Security -> Allow HTTP Requests.")
else
	print("INCONCLUSIVO OU NAO. Confira se a ponte está no ar (npm run ponte)")
	print("e rode de novo. Se a ponte estava no ar, a resposta é NAO:")
	print("o túnel continua obrigatório.")
end
print("")
print("Registre o resultado em memory/learnings.md e em docs/09_BACKLOG/fase-0-fixes-minimos.md.")
print("==================================================")
