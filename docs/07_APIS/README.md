# 07 — APIs

Três superfícies distintas. A pública é mínima de propósito.

---

## A. Superfície pública (ponte ↔ Roblox), via túnel Cloudflare

Servidor próprio, em `BRIDGE_PORT`. É a única porta que o túnel publica, e o
painel não existe nela. Ver `11_SEGURANCA`.

Autenticação: header `X-Bridge-Token` em toda requisição. Sem token, 401.
O token vive no `.env` da ponte e é colado uma vez no Roblox Studio.

### `GET /jogo/sonda`
Diagnóstico, chamado à mão. **Nunca em laço** — não encosta no caminho crítico.

Existe para uma pergunta só, aberta no ADR-002 desde o Bloco 1: o `HttpService`
do Studio alcança a ponte em `127.0.0.1`? Ver F0-7 em `09_BACKLOG` e o comando
`npm run sondar`.

Resposta (200):

```json
{ "ok": true, "porta": 8787 }
```

A porta identifica QUAL ponte respondeu — sondar a porta errada responde a
pergunta errada sem ninguém perceber.

**O `401` desta rota é informação útil, não só erro.** Para tomar 401 a
requisição precisou chegar até aqui, o que já responde a pergunta do alcance.
Por isso a sonda vive dentro de `/jogo/*`, com token e rate limit como as
demais, em vez de ser uma rota aberta.

### `GET /jogo/eventos`
Long-poll. O Roblox chama isso em laço infinito.

Query: `?desde=<cursor>` e, opcional, `&teto=<segundos>`
Comportamento: a ponte **segura a resposta aberta** até haver evento ou até o
timeout de 20 segundos, o que vier primeiro.

**`teto`** encurta a retenção só desta requisição, com clamp entre 1 segundo e o
`longpollTimeoutMs` da ponte. Valor ausente, zero, negativo ou não numérico cai
no padrão — o comportamento sem o parâmetro é exatamente o de sempre.

Quem usa é o jogo, e por um motivo específico (F0-4): se o Roblox fechar o
long-poll ocioso antes do teto da ponte, a volta morre como erro do lado do
Luau. O jogo detecta isso, passa a pedir um teto abaixo do que observou, e as
voltas ociosas voltam a terminar em `204` limpo — que é o sinal de que a ponte
está viva.

Resposta com evento (200):
```json
{
  "cursor": 412,
  "eventos": [
    {
      "id": 412,
      "animacaoId": "sub_cometa",
      "delta": 15,
      "intensidade": 3,
      "nomeDoador": "theuz",
      "presenteNome": "Galaxy",
      "emitidoEm": 1756742591123
    }
  ]
}
```

A mesma resposta pode trazer mais duas listas, no mesmo cursor:

- `anulados` — combates que se cancelaram exatamente (ADR-012). Não movem o
  boneco, mas o HUD mostra: sem nada na tela, o empate lê como travamento.
- `comandos` — ordem do STREAMER, não de espectador (ADR-013). Não tem delta e
  não casa com slot. Hoje só existe um tipo:

```json
{ "cursor": 413, "eventos": [], "comandos": [{ "id": 413, "tipo": "reiniciar", "emitidoEm": 1756742599001 }] }
```

Comando e presente compartilham o cursor de propósito: reiniciar depois de um
presente que já saiu é diferente de reiniciar antes dele, e o cursor único é o
que preserva essa ordem.

Resposta sem evento (204, timeout limpo): corpo vazio. O Roblox chama de novo
imediatamente. Isso dá cerca de 3 requisições por minuto quando a live está
parada, muito abaixo do teto de 500/min do HttpService.

### `GET /jogo/mapa`
Devolve o spec do mapa do preset ativo. O Roblox chama uma vez, na entrada.
Resposta: o objeto de mapa descrito em `04_MODELAGEM`, **mais um campo que não
existe no arquivo em disco**:

```json
"acervoResolvido": { "skybox": 18294857361, "textura": 18294857412 }
```

`skyboxAssetId` e `plataformas.materialAssetId` guardam id de ACERVO
(`textura_rocha_vulcanica`), não assetId do Roblox — é disso que o Gemini
escolhe. Quem traduz é a ponte, porque o motor é burro de propósito (ADR-007) e
não deve conhecer a estrutura do acervo.

`null` em qualquer um dos dois quer dizer "ainda não aprovado pela moderação do
Roblox". O construtor então cai no material nativo e não monta céu — que é o
comportamento de sempre, não um erro.

O campo é acrescentado ao SERVIR, nunca gravado: o schema do mapa é
`additionalProperties: false`, e o assetId é estado do acervo, que muda quando a
moderação aprova, sem o mapa mudar em nada.

### `GET /jogo/galeria` e `GET /jogo/skin?nick=`
A lista de nicks curada no painel, e a skin de um deles para o vestiário vestir
como base. **Só leitura nesta superfície**: curar a lista é do painel, que não é
publicado pelo túnel — escrever configuração do streamer por aqui daria ao túnel
poder de mexer no que o jogo carrega.

### `GET /jogo/look`
Devolve o look do preset ativo, já resolvido, para o Roblox aplicar por
`HumanoidDescription`. Chamado na entrada e no respawn.

### `GET /jogo/catalogo-itens?busca=...`
Busca item **gratuito** do catálogo do Roblox, para o vestiário dentro do jogo.
A ponte é quem fala com a API do Roblox e cacheia. O jogo nunca chama direto.
Filtro de preço zero aplicado na origem. Ver ADR-011.

### `PUT /jogo/looks/:lookId`
O vestiário no jogo salva o look montado. Valida contra o schema antes de gravar.

> Os comandos `vitoria` e `derrota` carregam `quantidade`: um donate mandado em
> rajada vale N rodadas, cobradas uma a uma pelo jogo (ADR-007). Ordem de painel
> vale sempre 1. A resposta de `GET /jogo/mapa` traz também `portal.vida`, que
> sai do preset ativo — o jogo não conhece preset.

### `POST /jogo/estado`
O Roblox informa o estado. **O jogo é a fonte de verdade da posição, não a
ponte** (R9). Fire-and-forget, não bloqueia o jogo, chamado no máximo a cada 2s
ou quando a referência muda.
```json
{
  "plataformaReferencia": 184,
  "plataformaMaxima": 191,
  "emAnimacao": false,
  "quedasNaturais": 12,
  "totalPlataformas": 200,
  "sessaoAtiva": true,
  "vitoria": false,
  "portal": { "aberto": true, "vida": 1380, "vidaMaxima": 2000 },
  "contagem": { "resultado": "derrota", "restanteMs": 7200 }
}
```
A ponte apenas repassa isso ao painel. Ela nunca calcula nem acumula posição.

`portal` e `contagem` entraram quando o HUD saiu de dentro do jogo (ADR-015):
quem desenha a barra do portal e a contagem regressiva é o overlay do OBS, e ele
não recebe evento de Roblox — só este estado. `contagem` é ausente ou nula
quando não há rodada contando, e `restanteMs` é o tempo QUE FALTA no instante do
envio, não o instante em que acaba: o overlay tica sozinho a partir dele, e os
dois relógios não precisam concordar. O jogo empurra o estado fora do intervalo
de 2s quando uma rodada encerra e quando o portal apanha, senão a barra e a
contagem reagiriam com até dois segundos de atraso.

Este é **o mesmo objeto** que o jogo publica para os próprios clientes (evento
`ESTADO` de `game/src/shared/eventos.lua`). O schema é `additionalProperties:
false`, então campo que existe lá e falta aqui derruba o payload INTEIRO na
validação — a rota responde 204 como se estivesse tudo bem e o painel fica cego
sem nenhum erro visível. Já aconteceu com `totalPlataformas` e `sessaoAtiva`;
hoje um teste em `test/jogo.test.mjs` compara os dois lados.

`vitoria` é o R6: o boneco encostou na última plataforma. O jogo **não**
reinicia sozinho — quem decide é o streamer, e a ordem volta pelo `comandos`
do long-poll.

### `POST /jogo/rodada`
O fim de rodada **confirmado** (ADR-014). O jogo avisa no instante em que o
resultado é definitivo — a contagem da vitória zerou sem o streamer sair do
topo, ou o portal quebrou — e é deste aviso que o overlay do OBS toca a
cutscene. Separado do `/estado` de propósito: o estado é um instantâneo, e
"a rodada acabou" é um instante. Derivá-lo do placar disparava a cutscene no
início de uma contagem que a vitória ainda podia abandonar.
```json
{ "resultado": "vitoria", "vitorias": 3, "derrotas": 1 }
```
Fire-and-forget como o estado. Corpo fora do contrato
(`rodada-jogo.schema.json`) é descartado com aviso no log e `{ "aceito": false }`,
sempre 200 — o jogo não lê a resposta. Rodada comprada por donate de placar
avisa do mesmo jeito: a vitória vinda de presente não é cancelável, porque a
condição dela é o donate, não a posição.

---

## B. Superfície local (ponte ↔ painel), só em `localhost`

Servidor próprio, em `PAINEL_PORT`. Sem autenticação de propósito: o que a
protege é o bind em `127.0.0.1` e o túnel não conhecer esta porta.

| Método | Rota | Faz |
|---|---|---|
| GET | `/api/configuracao` | A conta da live configurada. `null` = ninguém configurou ainda |
| PUT | `/api/configuracao` | Define o @ da live. Normaliza arroba e URL colada |
| GET | `/api/modalidades` | Lista modalidades (Fase 1: só `escalada`) |
| GET | `/api/presets` | Lista presets |
| GET | `/api/presets/:id` | Um preset |
| PUT | `/api/presets/:id` | Salva preset (valida R1 e R2). **Cria também**: grava o arquivo que ainda não existe, e preenche `streamerId` quando o corpo não traz. Se for o preset ATIVO e o `mapaId` mudou, emite `recarregar-mapa` (ADR-013) — o jogo busca o mapa uma vez só. 400 `preset_invalido` (schema), `presente_repetido` (R1.4) ou `posicao_repetida` (R1.7): as duas unicidades são regra cruzada, não schema |
| DELETE | `/api/presets/:id` | Apaga preset. 409 se ele for o preset ativo de uma sessão rodando |
| GET | `/api/catalogo` | Catálogo de presentes |
| POST | `/api/catalogo/atualizar` | Traz os presentes de verdade: da SALA se houver live, do painel público da TikTok se não. Não exige sessão — montar preset é trabalho de antes da live. 502 `catalogo_indisponivel` quando a TikTok não responde, e o que está em disco continua valendo |
| GET | `/api/animacoes` | A biblioteca inteira, para o seletor. Traz também as `ativa:false` — o painel é que filtra, porque preset salvo pode referenciar uma delas e o cartão do slot precisa do nome para mostrar |
| GET | `/api/looks` | Lista looks salvos, com ícones das peças |
| GET | `/api/mapas` | Lista mapas |
| POST | `/api/mundo` | Monta o mundo com as peças escolhidas na galeria (céu, texturas, formato) e põe no ar. Sem IA. Grava sempre no mesmo mapa: montar é compor, não criar acervo. 409 `peca_nao_aprovada` quando alguma peça ainda espera a moderação |
| POST | `/api/mapas/gerar` | Gera mapa com Gemini (ver F4). `formato` escolhe a construção da torre: `disco` (degraus com vão) ou `laje` (passarela encostada), ADR-009. 400 `formato_invalido` fora desses dois |
| GET | `/api/mapas/:id/prontidao` | O mapa pode ir ao ar? (ADR-004). A resposta muda com o ACERVO, sem o mapa mudar |
| GET | `/api/acervo` | O acervo do ADR-004, com status e assetId de cada peça |
| PUT | `/api/acervo/:colecao/:id` | Anota o que a moderação do Roblox devolveu. Só `skybox` e `texturas`: props são nativos |
| GET | `/api/acervo/imagem/:colecao/:id` | A foto da peça, desenhada na hora em 128px. Determinística — mesmo id e mesmas tags, mesma imagem — então não há cache para invalidar. É a galeria do painel; o jogo carrega a textura de verdade pelo assetId |
| DELETE | `/api/mapas/:id` | Apaga um mapa gerado. 409 `mapa_em_uso` quando QUALQUER preset ainda o referencia, não só o ativo |
| POST | `/api/mapas/:id/formato` | Converte entre escada e passarela sem regerar (ADR-009). Reergue a torre quando é o mapa no ar |
| POST | `/api/acervo/publicar` | Desenha as imagens que faltam, sobe pelo Open Cloud e anota o assetId (ADR-004). Lento de propósito: espera a operação de cada item. 400 `roblox_sem_chave` sem `ROBLOX_API_KEY` no `.env` |
| POST | `/api/sessao/start` | Conecta na live e abre a sessão |
| POST | `/api/sessao/stop` | Encerra e limpa dado de espectador. **Devolve o resumo** — é ele que o painel mostra (F5.5) |
| POST | `/api/sessao/preset` | Troca o preset ativo com a sessão rodando. Vale do próximo evento em diante (R7) |
| POST | `/api/sessao/reiniciar` | R6 — volta a corrida ao pé da torre. Responde `jogoOnline`: com o Roblox fora, o comando é descartado |
| GET | `/api/sessoes` | Histórico das lives, já reduzido ao resumo. Nunca traz o detalhe por evento (F5) |
| GET | `/api/sessao/stream` | **SSE**: evento aplicado, latência, estado |
| POST | `/api/sessao/zerar-placar` | Zera vitórias e derrotas SEM mexer na corrida |
| POST | `/api/sessao/recarregar-mapa` | Reergue a torre com o mapa do preset, sem parar a sessão |
| PUT | `/api/galeria` | Cura a lista de nicks cujas skins o vestiário oferece |
| GET | `/api/skin?nick=` | Espia a skin de um nick antes de acrescentar à galeria |
| POST | `/api/teste/presentes` | Dispara presente à mão. **Exige sessão**: precisa do preset para casar o slot |
| POST | `/api/teste/animacao` | Dispara uma animação direto no jogo. **Não exige sessão nem preset** |
| POST | `/api/jogo/abrir-studio` | Monta um `.rbxlx` com `KoraConfig` e HttpService prontos e abre o Studio nele |
| GET | `/api/logs` | Log recente da ponte, para o painel ter o que veio antes dele |
| GET | `/api/cenarios` | Cenários de fixture, para o modo sem live |
| GET | `/api/cutscenes` | Os vídeos em `data/cutscenes/`, para o preset escolher (ADR-014). A pasta É a lista; o que está fora do padrão de nome volta em `ignorados` |
| GET | `/api/overlay` | As URLs dos dois overlays para colar no OBS ou no TikTok LIVE Studio (`url` das cutscenes, `urlHud` do HUD), já na forma com `.html` que o LIVE Studio aceita; os vídeos da pasta e qual está `emUso` em cada resultado do preset ativo — com `existe`, porque a cutscene falha calada |
| GET | `/api/overlay/layout` | Onde cada elemento do HUD fica na tela (ADR-015). Devolve o que o streamer moveu **mais o catálogo dos 8 elementos** — id, rótulo legível, posição padrão, tamanho e âncora. É o catálogo que permite ao painel desenhar o Estúdio sem conhecer a geometria da página: a posição padrão é o CSS do overlay, e ele mora aqui. Sem arquivo salvo, `elementos: {}` e o catálogo inteiro |
| PUT | `/api/overlay/layout` | Grava o layout. **Só a exceção vai para o disco**: elemento ausente vale a posição padrão da página, como as exceções do ADR-016. Valida contra `overlay-layout.schema.json` antes de gravar — 400 `layout_invalido` para id fora dos oito, `x`/`y` fora de 0..100, `escala` fora de 0,5..2 ou propriedade a mais. Publica o evento SSE `layout` |
| GET | `/api/hud` | A legenda do HUD da live (ADR-015): os slots do preset ativo **marcados para o overlay** (`mostrarNoOverlay !== false` — ausente conta como marcado), com nome, ícone e delta, o mais forte primeiro. Slot desmarcado some da legenda e continua valendo no jogo (R1.6). Sem preset ativo, `slots: []` — a página abre antes da sessão |

Fora de `/api`, na mesma porta do painel, as páginas que o OBS abre como
Browser Source: `GET /overlay` (as cutscenes, ADR-014) e `GET /overlay/hud`
(o HUD da live, ADR-015 — aceita `?cam=43` e `?esticar=nao`; `?meta=` e
`?barra=nao` saíram com o pote de moedas e com a volta da barra da torre para
dentro do jogo). Onde cada elemento é desenhado dentro dela não é parâmetro de
URL: vem do `/api/overlay/layout` e se ajusta ao vivo pelo evento SSE `layout`.
Cada uma responde também com `.html` no fim (`/overlay.html`,
`/overlay/hud.html`), e é essa a forma que `/api/overlay` entrega: a fonte
"Link" do TikTok LIVE Studio (1.35) só aceita URL em que apareça um
`algo.letras`, e `127.0.0.1` termina em número — sem a extensão, "Digite o URL
correto". Mesma página nas duas formas; o OBS aceita qualquer uma.
`GET /overlay/video/:id` serve `data/cutscenes/<id>.mp4` (ou `.webm`) por
faixa (`Range`, 206 — o Chromium do OBS exige). O id só passa se for
`identificador`: `..` e nome fora do padrão são 404 antes de tocar o disco.

### Eventos do SSE
```
event: presente
data: { "slot": 3, "presenteNome": "Galaxy", "delta": 15, "latenciaMs": 620 }

event: estado
data: { "live": "conectada", "jogo": "online", "plataformaAtual": 184,
        "totalPlataformas": 200, "vitoria": false, "vitorias": 2, "derrotas": 1,
        "presetId": "padrao", "presetAtualizadoEm": "2026-09-04T18:22:10.000Z",
        "cutscenes": { "vitoria": "vitoria", "derrota": "derrota" },
        "portal": { "aberto": true, "vida": 1380, "vidaMaxima": 2000 },
        "contagem": null }

event: rodada
data: { "resultado": "vitoria", "cutscene": "vitoria", "vitorias": 3, "derrotas": 1 }

event: hud
data: { "disputa": { "subida": 70, "descida": 58 } }

event: layout
data: { "elementos": { "portal": { "x": 4, "y": 78.5, "escala": 1.2, "visivel": true },
                       "seguidor": { "x": 40, "y": 92, "escala": 1, "visivel": false } } }

event: seguidor
data: { "nome": "kelvyn_ttv" }

event: naoMapeado
data: { "presenteNome": "Rose", "presenteId": "7934", "moedas": 1, "contagem": 7 }

event: licenca
data: { "streamerId": "local", "estado": "ativa", "plano": "mensal",
        "validaAte": "2026-10-08T00:00:00.000Z", "verificadaEm": "2026-09-10T14:02:00.000Z",
        "carenciaAte": null, "motivo": null, "versaoInstalada": "0.1.0" }
```

O evento `licenca` chega uma vez na abertura da conexão, com o veredito da
sessão, e de novo quando o streamer cola ou remove a chave. Ele é empurrado, e
não perguntado de tempos em tempos, porque a licença é consultada UMA vez no
arranque e vale a sessão inteira (ADR-P02, ADR-P08): nada da Kora encosta no
caminho do presente. A forma completa está em `licenca-e-telemetria.md` e no
`data/schemas/licenca.schema.json`.

`presenteId` no `naoMapeado` existe para o painel vincular o presente a um slot
em um clique, no meio da live (F2.4). Sem ele o contador só sabe lamentar.

`vitoria` e `totalPlataformas` vêm do `POST /jogo/estado` e o núcleo os guarda,
para o `GET /api/sessao` da abertura do painel contar a mesma história que o
SSE — senão quem abrisse o painel no meio de uma live veria a vitória sumir até
o próximo batimento do jogo.

`hud` é a disputa da rodada (ADR-015), publicada a cada empurrão e entregue de
cara a quem assina o fluxo. Ela é tudo que sobrou do agregado: o ranking por
doador, o pote de moedas, o maior combo e o maior presente saíram em 2026-09-04
para a live não correr risco de restrição — e com eles o único acúmulo de
nickname da ponte.

`layout` é o que o Estúdio de Overlay salvou (ADR-015), publicado a cada PUT e
**entregue de cara a quem assina o fluxo**, como o `estado` e o `hud`. É ele que
permite arrumar a tela sem recarregar a fonte no OBS no meio da live — o
streamer arrasta a caixa no painel, salva, e a página que já está no ar se
ajusta. Traz só o que foi movido: elemento ausente volta para a posição do CSS
da página, e é assim que "voltar ao padrão" também vale ao vivo.

`presetId` e `presetAtualizadoEm` andam juntos no `estado`: o overlay do HUD
compara o **par** para decidir se relê a legenda em `/api/hud`. Só o id não
basta — mexer nos slots do preset que já está no ar não troca o id, e a legenda
ficava anunciando o presente que o streamer acabou de tirar da live. O carimbo é
reescrito a cada salvar, então é ele que pega a mudança POR DENTRO do preset.
Campo que o overlay lê não é sobra: tirar um dos dois quebra a releitura.

`seguidor` é o follow novo, que o overlay mostra no canto e esquece. Só o nome,
sanitizado como o do doador, e nunca em disco (11_SEGURANCA, camada 4).

`cutscenes` no `estado` é para o overlay do OBS **preparar** os vídeos (ADR-014);
o fluxo manda um `estado` assim que a conexão abre, para ele saber qual carregar
antes de a rodada acabar. Quem **toca** é o evento `rodada`, republicado do
`POST /jogo/rodada` com o id da cutscene já resolvido pelo preset ativo — nunca
a comparação de `vitorias`/`derrotas`, que sobe no início da contagem e voltava
a zero a cada reinício da ponte.

---

### Por que `abrir-studio` só existe aqui

Ela executa processo local **e grava o `BRIDGE_TOKEN` num arquivo**. Vive na
superfície B, que não é publicada pelo túnel, e **não lê nada do corpo da
requisição**: o projeto e o binário são fixos no módulo, e a URL e o token vêm
da config da ponte. Parâmetro vindo do navegador nessa rota seria execução
arbitrária de comando na máquina do streamer.

O `.rbxlx` gerado nasce na pasta temporária do sistema, nunca no repositório —
os `$path` do projeto Rojo são absolutizados justamente para isso, e há teste
amarrando essa propriedade.

## C. Superfície externa (ponte → Roblox web API)

Busca de item de catálogo e thumbnail de asset. **Não é Open Cloud, é API web
pública.** Tem limite de taxa e pode mudar sem aviso. Isolar em
`bridge/src/roblox/`, do mesmo jeito que o conector da TikTok. Se cair, o
vestiário para de buscar item novo; nada mais é afetado.

- Ícone de peça é cacheado em `data/icones-itens/`. Baixa uma vez por asset.
- Só item de preço zero entra no resultado.

## D. Superfície externa (ponte → Gemini)

Chamada **só** pelo processo Node. Chave em `GEMINI_API_KEY` no `.env`.
Nunca no painel, nunca no Roblox.

- Entrada: descrição em texto livre do streamer + acervo disponível.
- Saída esperada: JSON puro, validado contra `data/schemas/mapa.schema.json`.
- Falha de validação: uma retentativa, depois erro claro no painel. **Nunca**
  aceitar spec parcial ou preencher campo faltante com chute.
- Prompt completo em `10_PROMPTS`.

---

## Contrato de erro (todas as superfícies)
```json
{ "erro": "codigo_curto", "mensagem": "Explicação em português para o streamer." }
```
Nada de stack trace na resposta. Detalhe vai para o log local.
