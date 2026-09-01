# Jogo (Roblox / Luau)

O que o espectador vê. Recebe `{animacaoId, delta, intensidade}` da ponte e
transforma isso em movimento e efeito. **O motor é burro de propósito**: ele não
sabe o que é presente nem quanto vale. Ver ADR-007.

Dono exclusivo deste diretório. Ver `docs/01_ARQUITETURA`.

## Colocar no Studio

O projeto usa [Rojo](https://rojo.space) para sincronizar os arquivos com o
Studio. `default.project.json` mapeia:

```
src/shared     → ReplicatedStorage.KoraCompartilhado
src/animacoes  → ReplicatedStorage.KoraAnimacoes
src/server     → ServerScriptService.KoraServidor
src/client     → StarterPlayer.StarterPlayerScripts.KoraCliente
```

```bash
rojo serve game/default.project.json
```
E no Studio: plugin Rojo → Connect.

### Antes da primeira partida

1. **Ligue o HttpService.** Game Settings → Security → Allow HTTP Requests.
   Sem isso o long-poll não sai do lugar.

2. **Configure a ponte.** No `ServerStorage`, crie uma `Folder` chamada
   `KoraConfig` com dois `StringValue`:

   | Nome | Valor |
   |---|---|
   | `UrlDaPonte` | `https://seu-tunel.trycloudflare.com` ou `http://127.0.0.1:8787` |
   | `Token` | o mesmo `BRIDGE_TOKEN` do `.env` da ponte |

   Isso **não** mora em código: o `11_SEGURANCA` proíbe token e URL de túnel
   dentro de script Luau versionado, e este diretório vai para o git.

3. **Teste se o túnel é necessário.** Se o Studio alcançar
   `http://127.0.0.1:8787`, o túnel é opcional — e some com ele a única
   exposição do sistema à internet e um terço do orçamento de latência. Ver a
   questão em aberto no ADR-002. Vale cinco minutos antes de configurar túnel.

## Estrutura

```
src/shared/     contratos que os dois lados compartilham
  tipos.lua              validação do que vem da ponte + limites do tabuleiro
  eventos.lua            os RemoteEvent servidor ↔ cliente, num lugar só
  configuracao.lua       lê URL e token do ServerStorage, nunca de código
  efeitos.lua            caixa de ferramentas das 20 animações
  tokens.lua             GERADO de data/tokens.json
  indiceAnimacoes.lua    GERADO da tabela de biblioteca-animacoes.md

src/server/     o jogo de verdade
src/client/     HUD, câmera e vestiário
src/animacoes/  20 ModuleScripts, um por animação
```

Os dois arquivos `GERADO` saem de `npm run gerar`, na raiz do repositório.
**Não edite à mão**: a fonte é o doc e o JSON, e o painel espelha os mesmos.

## Três coisas que não são negociáveis aqui

1. **Toda tomada de controle tem watchdog.** Qualquer código que ancore o
   personagem ou desabilite input arma um timer independente que força a
   restauração. Personagem ancorado por bug é live morta. Ver ADR-005 e R11.

2. **`plataformaReferencia` vem de colisão real**, nunca de altura nem de
   proximidade. É o estado crítico do jogo. Ver R9 e ADR-008.

3. **O mapa tem que ser vencível sem presente nenhum.** O construtor percorre as
   plataformas depois de construir e rejeita a torre se algum salto não couber
   no pulo. Mapa intransponível vira tela parada, e o TikTok pune isso. Ver
   ADR-009.

## Sintaxe: subconjunto Lua 5.1

O jogo é escrito sem anotação de tipo, sem `continue`, sem `+=` e sem string com
crase. Não é preferência de estilo: Luau é superconjunto de Lua 5.1, então esse
subconjunto permite validar a sintaxe de todos os arquivos **fora do Studio**:

```bash
npm run luau
```

Sem isso, erro de sintaxe só aparece quando o Studio carrega o lugar — o que
custa uma viagem ao Studio por arquivo. `--!strict` no topo é comentário e fica.

## Adicionar a 21ª animação

1. Criar o ModuleScript em `src/animacoes/`, com a ficha de metadados do
   contrato em `docs/03_REGRAS_DE_NEGOCIO/biblioteca-animacoes.md`.
2. Acrescentar a linha na tabela daquele doc.
3. `npm run gerar`.

Nada mais muda. O painel lê o índice e a animação aparece no seletor.
