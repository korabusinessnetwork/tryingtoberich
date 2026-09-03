# 07 — APIs

Três superfícies distintas. A pública é mínima de propósito.

---

## A. Superfície pública (ponte ↔ Roblox), via túnel Cloudflare

Servidor próprio, em `BRIDGE_PORT`. É a única porta que o túnel publica, e o
painel não existe nela. Ver `11_SEGURANCA`.

Autenticação: header `X-Bridge-Token` em toda requisição. Sem token, 401.
O token vive no `.env` da ponte e é colado uma vez no Roblox Studio.

### `GET /jogo/eventos`
Long-poll. O Roblox chama isso em laço infinito.

Query: `?desde=<cursor>`
Comportamento: a ponte **segura a resposta aberta** até haver evento ou até o
timeout de 20 segundos, o que vier primeiro.

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
  "vitoria": false
}
```
A ponte apenas repassa isso ao painel. Ela nunca calcula nem acumula posição.

Este é **o mesmo objeto** que o jogo publica para os próprios clientes (evento
`ESTADO` de `game/src/shared/eventos.lua`). O schema é `additionalProperties:
false`, então campo que existe lá e falta aqui derruba o payload INTEIRO na
validação — a rota responde 204 como se estivesse tudo bem e o painel fica cego
sem nenhum erro visível. Já aconteceu com `totalPlataformas` e `sessaoAtiva`;
hoje um teste em `test/jogo.test.mjs` compara os dois lados.

`vitoria` é o R6: o boneco encostou na última plataforma. O jogo **não**
reinicia sozinho — quem decide é o streamer, e a ordem volta pelo `comandos`
do long-poll.

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
| PUT | `/api/presets/:id` | Salva preset (valida R1 e R2). **Cria também**: grava o arquivo que ainda não existe, e preenche `streamerId` quando o corpo não traz. Se for o preset ATIVO e o `mapaId` mudou, emite `recarregar-mapa` (ADR-013) — o jogo busca o mapa uma vez só |
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

### Eventos do SSE
```
event: presente
data: { "slot": 3, "presenteNome": "Galaxy", "delta": 15, "latenciaMs": 620 }

event: estado
data: { "live": "conectada", "jogo": "online", "plataformaAtual": 184,
        "totalPlataformas": 200, "vitoria": false }

event: naoMapeado
data: { "presenteNome": "Rose", "presenteId": "7934", "moedas": 1, "contagem": 7 }
```

`presenteId` no `naoMapeado` existe para o painel vincular o presente a um slot
em um clique, no meio da live (F2.4). Sem ele o contador só sabe lamentar.

`vitoria` e `totalPlataformas` vêm do `POST /jogo/estado` e o núcleo os guarda,
para o `GET /api/sessao` da abertura do painel contar a mesma história que o
SSE — senão quem abrisse o painel no meio de uma live veria a vitória sumir até
o próximo batimento do jogo.

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
