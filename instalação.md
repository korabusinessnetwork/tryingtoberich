# Instalação — Kora Stream Games

Tudo que precisa existir na máquina para o sistema rodar, na ordem em que
instalar. Testado no Windows 11, que é onde o produto vive; as linhas de macOS e
Linux estão marcadas onde mudam.

O sistema são **três processos** (`bridge/`, `panel/`, `game/`) e cada um pede um
conjunto diferente de coisa instalada. A ponte e o painel sobem com um comando
só; o jogo depende de programa externo (Roblox Studio e Rojo).

---

## 1. Tabela do que instalar

| # | O quê | Para quê | Obrigatório? |
|---|---|---|---|
| 1 | **Node.js 22+** | ponte, painel, scripts, testes | **Sim** — nada roda sem |
| 2 | **Git** | clonar e versionar | **Sim** |
| 3 | Dependências npm | Express, Vite, React, conector da TikTok | **Sim** (`npm install`) |
| 4 | **Roblox Studio** | rodar o jogo | Sim, para jogar |
| 5 | **Rojo 7** | sincronizar `game/src` com o Studio | Sim, para jogar |
| 6 | Plugin Rojo no Studio | o lado Studio da sincronização | Sim, para jogar |
| 7 | **Parser de Lua** (`luac`) | `npm run luau`, gate de sintaxe sem abrir o Studio | Recomendado |
| 8 | Chave do **Gemini** | geração de mapa por IA | Opcional — a ponte sobe sem |
| 9 | Conta **TikTok** com LIVE | receber presente de verdade | Só na live real |
| 10 | **cloudflared** | expor a ponte na internet | **Talvez não** — ver §7 |

O que **não** precisa: banco de dados (ADR-003, é JSON em disco), servidor web,
Docker, conta em nuvem, nada de deploy. Tudo roda local.

---

## 2. Node.js 22 ou superior

É a dependência que carrega o projeto inteiro. O `package.json` declara
`"engines": { "node": ">=22" }`, e não é decoração: o projeto usa
`node --env-file`, `process.loadEnvFile()` e `node --test` com glob, que são
recursos dessas versões. Node 20 quebra na primeira linha.

```powershell
winget install OpenJS.NodeJS.LTS
```

macOS: `brew install node` · Linux: use o [nodesource](https://github.com/nodesource/distributions) ou `nvm`.

**Feche e reabra o terminal** depois de instalar, senão o `PATH` da sessão atual
não enxerga o `node`. Confira:

```powershell
node -v
npm -v
```

> Nesta máquina hoje: Node v24.18.0, npm 12.0.1. Está acima do mínimo.

## 3. Git

```powershell
winget install Git.Git
```

```powershell
git --version
```

## 4. Dependências do projeto

Um `npm install` na raiz resolve os três lugares — a raiz e os dois *workspaces*
(`bridge/` e `panel/`) são instalados juntos. Não rode `npm install` dentro de
`bridge/` ou `panel/`.

```powershell
git clone <url-do-repo> kora-stream-games
cd kora-stream-games
npm install
```

O que entra por aí:

| Pacote | Onde | Papel |
|---|---|---|
| `express` ^5.2.1 | ponte | os dois servidores HTTP |
| `tiktok-live-connector` ^2.4.4 | ponte | captura do evento de presente (ADR-006) |
| `ajv` ^8.20.0 + `ajv-formats` ^3.0.1 | ponte e raiz | validação contra os JSON Schemas |
| `react` ^19.2 + `react-dom` | painel | interface |
| `vite` ^8.2.2 + `@vitejs/plugin-react` | painel | servidor de desenvolvimento e build |

`game/` não tem `package.json` e não instala nada: é Luau puro, e quem monta a
árvore é o Rojo.

## 5. O arquivo `.env`

A ponte **não sobe** sem ele — ela é iniciada com `--env-file=.env` e morre na
ausência do arquivo. Copie o modelo:

```powershell
Copy-Item .env.example .env
```

Git Bash / macOS / Linux: `cp .env.example .env`

Gere o token, que precisa de **no mínimo 32 caracteres** (a ponte recusa subir
com menos, e diz por quê):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Ou, se tiver OpenSSL: `openssl rand -hex 32`

Cole o resultado em `BRIDGE_TOKEN`. As variáveis, uma a uma:

| Variável | Preencher com | Obrigatória |
|---|---|---|
| `BRIDGE_TOKEN` | os 64 caracteres gerados acima | **Sim** |
| `TIKTOK_USERNAME` | seu usuário, **sem** o `@` | Só na live real |
| `BRIDGE_PORT` | `8787` — a porta do jogo, a única que o túnel publica | Sim (tem padrão) |
| `PAINEL_PORT` | `8788` — a porta do painel, nunca sai da máquina | Sim (tem padrão) |
| `BRIDGE_HOST` | `127.0.0.1`. **Nunca `0.0.0.0`** — a ponte recusa subir | Sim (tem padrão) |
| `GEMINI_API_KEY` | a chave do §8, ou vazio | Não |
| `ROBLOX_API_KEY` | a chave do §8.1, ou vazio | Não |
| `ROBLOX_CREATOR_ID` | o número do seu perfil do Roblox | Não |
| `LONGPOLL_TIMEOUT_MS` | `20000` | Sim (tem padrão) |
| `COMBATE_MAX_MS` | `2000` (ADR-012) | Sim (tem padrão) |
| `VITE_BRIDGE_URL` | **deixe comentado.** Preencher quebra tudo por CORS | Não |

As duas portas separadas não são capricho: o túnel alcança só a do jogo, então
`/api/*` do painel fica inalcançável de fora **por construção**. Ver
`docs/11_SEGURANCA`. O `.env` está no `.gitignore` e nunca vai para o git.

Neste ponto a ponte e o painel já sobem. `npm start` e o produto está no ar,
menos o jogo.

---

## 6. O jogo — Roblox Studio e Rojo

### 6.1 Roblox Studio

Baixe em [create.roblox.com](https://create.roblox.com/) e instale (precisa de
conta Roblox, gratuita). A ponte localiza o executável sozinha em
`%LOCALAPPDATA%\Roblox\Versions\...\RobloxStudioBeta.exe`, que é o caminho
padrão da instalação — não mexa nele.

### 6.2 Rojo

O Rojo é o que leva os 40 arquivos `.lua` de `game/src` para dentro do Studio.

```powershell
winget install Rojo.Rojo
```

macOS/Linux: `cargo install rojo` ou os binários em [rojo.space](https://rojo.space).

**Abra um terminal novo depois** — o botão do painel procura o `rojo` no `PATH`,
e o terminal velho não tem. Confira:

```powershell
rojo --version
```

> Nesta máquina hoje: Rojo 7.7.0.

### 6.3 Plugin do Rojo dentro do Studio

O Rojo tem dois lados: a linha de comando (acima) e um plugin dentro do Studio.
Sem o plugin, o Studio não conecta em nada.

```powershell
rojo plugin install
```

Isso escreve o plugin na pasta de plugins do Studio. Se o Studio estiver aberto,
feche e abra de novo.

### 6.4 Colocar o jogo no Studio

**O caminho curto**, e o recomendado: com o sistema no ar, abra o painel, vá na
página **Jogo** e clique em **Abrir o jogo no Studio**. Ele monta um `.rbxlx`
com o `KoraConfig` e o `HttpService` já configurados, sobe o `rojo serve` e abre
o Studio. Sobra dar Play.

**À mão**, se preferir:

```powershell
rojo serve game/default.project.json
```

E no Studio: plugin Rojo → Connect. Mais dois passos manuais, que o botão do
painel faz por você:

1. **Ligue o HttpService**: Game Settings → Security → Allow HTTP Requests.
   Sem isso o long-poll não sai do lugar.
2. **Crie a configuração da ponte**: no `ServerStorage`, uma `Folder` chamada
   `KoraConfig` com dois `StringValue`:

   | Nome | Valor |
   |---|---|
   | `UrlDaPonte` | `http://127.0.0.1:8787` (ou a URL do túnel) |
   | `Token` | o mesmo `BRIDGE_TOKEN` do `.env` |

   Isso **não** mora em código: `docs/11_SEGURANCA` proíbe token e URL de túnel
   dentro de script Luau versionado, e `game/` vai para o git.

### 6.5 Parser de Lua — o gate de sintaxe

`npm run luau` valida a sintaxe dos 40 arquivos Luau **sem abrir o Studio**.
Sem ele, cada erro de sintaxe custa uma viagem ao Studio. Precisa de um `luac`
qualquer no `PATH`:

```powershell
winget install DEVCOM.Lua
```

macOS: `brew install lua` · Linux: `apt-get install lua5.1`

O gate aceita `luac5.1`, `luac-5.1`, `luac53`, `luac54` ou `luac` — qualquer um
serve, porque toda sintaxe exclusiva de Luau (anotação de tipo, `continue`,
`+=`, crase) é recusada por todos eles, que é justamente o ponto.

```powershell
npm run luau
```

> Nesta máquina hoje: Lua 5.4.6, e o gate passa nos 40 arquivos.

---

## 7. Túnel — provavelmente você não precisa

O `docs/08_DECISOES/adr-002` prevê Cloudflare Tunnel para o Roblox alcançar a
ponte. **Mas há uma questão em aberto no próprio ADR**: aquilo vale para servidor
Roblox publicado, que roda em datacenter. O **Studio roda na sua máquina**, e
ninguém verificou ainda se o HttpService dele alcança `127.0.0.1`.

**Teste antes de instalar qualquer coisa.** Cinco minutos: suba a ponte, e num
Script do `ServerScriptService` peça
`HttpService:GetAsync("http://127.0.0.1:8787/saude")` com o header do token.
Se responder, o túnel é dispensável — e some com ele a única exposição do sistema
à internet e um terço do orçamento de latência do Princípio nº1.

Se **não** responder, aí sim:

```powershell
winget install Cloudflare.cloudflared
```

E use um **túnel nomeado**, não o rápido: no modo gratuito o túnel rápido troca
de URL a cada reinício, o que obrigaria a reeditar o Studio antes de cada live.
O nomeado dá URL fixa e também é gratuito.

> **Regra dura:** o túnel aponta para `BRIDGE_PORT` (8787) e só para ela. Se
> apontar para a porta do painel, as rotas `/api/*` vazam para a internet sem
> autenticação. É o pior cenário possível neste projeto.

---

## 8. Chave do Gemini (opcional)

Só serve para gerar mapa por IA. Sem ela a ponte sobe normal e avisa
`(sem GEMINI_API_KEY: a geração de mapa fica indisponível)`.

1. Pegue uma chave gratuita em <https://aistudio.google.com/apikey>
2. Cole em `GEMINI_API_KEY=` no `.env`
3. Teste:

```powershell
npm run gemini
```

O diagnóstico separa os três modos de falhar que o painel confunde num
`gemini_indisponivel` só: chave ausente, chave inválida e modelo aposentado. Ele
**lista** os modelos que a sua chave alcança e confirma se o configurado
(`gemini-3.5-flash-lite`, em `bridge/src/gemini/cliente.mjs`) está lá. A chave
nunca é impressa.

A chave vive **só no processo Node**. O painel nunca a vê — o bundle do Vite é
público por definição.

## 8.1. Chave do Roblox, para encher o acervo (opcional, gratuita)

Sem ela dá para jogar e gerar mapa. O que ela destrava é o **acervo**: os céus e
as texturas que o gerador pode escolher (ADR-004). Com um céu aprovado, todo
mapa gerado sai com o mesmo céu — não porque o modelo repita, mas porque não
existe outro.

**Não gasta Robux.** Upload de imagem pelo Open Cloud é gratuito.

1. Abra <https://create.roblox.com/dashboard/credentials> e clique em
   **Create API Key**
2. Dê um nome qualquer (ex.: `kora-acervo`)
3. Em **Access Permissions**, adicione a API System **Assets** e marque
   `read` e `write`
4. Em **Accepted IP Addresses**, ponha `0.0.0.0/0` — a ponte roda na sua
   máquina, sem IP fixo
5. Salve e **copie a chave agora**: ela não aparece de novo
6. Cole em `ROBLOX_API_KEY=` no `.env`
7. Em `ROBLOX_CREATOR_ID=`, ponha o número do seu perfil — está na URL:
   `roblox.com/users/`**`SEU_NUMERO`**`/profile`

Depois disso, no painel: **Configurar → Acervo → "Gerar e subir o que falta"**.
A ponte desenha as imagens que faltam, sobe e anota o assetId. A moderação é do
Roblox e é assíncrona: os itens entram como `em-moderacao` e viram `aprovado`
quando eles aprovarem — clicar no botão de novo só reconsulta, não sobe nada
duas vezes.

---

## 9. Verificar que ficou tudo em pé

Rode na ordem. Cada um é independente e diz o que está faltando.

```powershell
node -v
npm test
npm run validar
npm run luau
npm run painel:gate
rojo --version
```

Saída esperada, resumida: Node v22+; `npm test` com 279 testes verdes;
`Todos os contratos válidos.`; `40 arquivos .lua com sintaxe válida.`;
`painel: 23 componentes compilam, mais o App.`; `Rojo 7.7.0`.

E então, o comando do dia a dia:

```powershell
npm start
```

Ele gera os artefatos, sobe a ponte, **espera** a porta abrir e só então chama o
Vite — nessa ordem, porque o painel encaminha `/api` para a ponte e subir os dois
em paralelo serve uma tela que dá 502 até a ponte acordar. Saída esperada:

```
[kora] gerando artefatos...
[kora] subindo a ponte...
Jogo   http://127.0.0.1:8787/jogo/*   exige X-Bridge-Token
Painel http://127.0.0.1:8788/api/*    nunca sai da máquina
[kora] ponte no ar. Subindo o painel...
```

O painel abre em <http://127.0.0.1:5173>.

### Atalho na área de trabalho (Windows)

```powershell
npm run atalho
```

Duplo clique = sistema no ar com o navegador já aberto. É o mesmo `npm start`
com `--abrir`. Para remover: `node scripts/criar-atalho.mjs --remover`.

---

## 10. Todos os comandos

| Comando | O que faz |
|---|---|
| `npm install` | instala a raiz e os dois workspaces |
| `npm start` | **sobe a ponte E o painel**, na ordem certa |
| `npm run atalho` | cria o atalho na área de trabalho (Windows) |
| `npm test` | a suíte inteira (279 testes) |
| `npm run validar` | relatório do estado dos contratos e do acervo |
| `npm run luau` | gate de sintaxe do jogo, sem abrir o Studio |
| `npm run gerar` | gera o índice de animações e os tokens visuais |
| `npm run painel:gate` | gate estrutural do painel: compila os componentes |
| `npm run gemini` | diagnóstico da conexão com o Gemini |
| `npm run ponte` | só a ponte |
| `npm run painel` | só o painel, em <http://127.0.0.1:5173> |
| `npm run build:painel` | build de produção do painel |
| `npm run semear` | instala o preset de exemplo em `data/presets/` |
| `rojo serve game/default.project.json` | serve o jogo para o plugin do Studio |
| `rojo build game/default.project.json --output teste.rbxlx` | confere que a árvore monta |
| `rojo plugin install` | instala o plugin do Rojo no Studio |

**Desenvolver sem live e sem Roblox** — a ponte inteira tocando uma fixture em
loop:

```powershell
npm run semear
npm run ponte -- --cenario=04-combate-de-presentes --preset=escalada-padrao
```

Cenários disponíveis em `data/fixtures/cenarios/`: `01-presente-unico`,
`02-combo`, `03-rajada-mesmo-slot`, `04-combate-de-presentes`,
`05-presente-nao-mapeado`, `06-combo-no-teto-de-intensidade`,
`07-combate-por-tempo-esgotado`.

---

## 11. Portas usadas

| Porta | Quem | Exposta? |
|---|---|---|
| `8787` | ponte — rotas `/jogo/*` | **é a única que o túnel publica** |
| `8788` | ponte — rotas `/api/*` do painel | nunca sai da máquina |
| `5173` | Vite, o painel no navegador | local |
| `34872` | `rojo serve`, para o plugin do Studio | local |

---

## 12. Quando der errado

**"Falta o .env na raiz"** — você pulou o §5. `Copy-Item .env.example .env` e
preencha o `BRIDGE_TOKEN`.

**"BRIDGE_TOKEN precisa de no mínimo 32 caracteres"** — o valor do
`.env.example` é um texto de exemplo, não um token. Gere o de verdade.

**"A porta do jogo (127.0.0.1:8787) já está ocupada"** — quase sempre é sobra de
um `npm start` que não desligou limpo:

```powershell
netstat -ano | findstr :8787
taskkill /PID <pid> /T /F
```

**"O Rojo não está instalado"**, com o Rojo instalado — é o terminal velho, que
não tem o Rojo no `PATH`. Feche e abra outro.

**"Parser de Lua não encontrado"** — §6.5. O gate não roda, mas nada mais quebra.

**Painel abre e toda chamada falha** — quase certamente `VITE_BRIDGE_URL` está
preenchida no `.env`. Comente a linha. O Vite encaminha `/api` para a ponte
sozinho; preencher aquilo faz o navegador ver duas origens e bloquear tudo por
CORS antes de qualquer requisição sair.

**O jogo não recebe evento** — na ordem: HttpService ligado em Game Settings →
Security; `KoraConfig` no `ServerStorage` com os dois `StringValue`; `Token`
idêntico ao `BRIDGE_TOKEN` do `.env`; ponte no ar.

**A live não conecta** — o `tiktok-live-connector` delega a assinatura da
conexão a um serviço de terceiro (EulerStream), usado hoje sem chave, na
modalidade anônima, que tem limite de uso. Isso nunca foi exercitado numa live
real ainda (ver `memory/learnings.md`); se esbarrar em limite, a biblioteca
aceita uma `signApiKey`, que o projeto não configura hoje.

---

## 13. Duas coisas que a instalação não resolve

1. **Nenhum mapa pode ir ao ar** enquanto as imagens do acervo não forem
   enviadas e aprovadas no Roblox. É moderação da plataforma, não código.
   `npm run validar` mostra o que falta. Ver ADR-004.
2. **A captura de presente da TikTok usa biblioteca não oficial** (ADR-006). Uso
   pessoal e não comercial na Fase 1. Antes de virar produto para terceiros,
   isso é bloqueante e precisa ser resolvido pela via oficial.
