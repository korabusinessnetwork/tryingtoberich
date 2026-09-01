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

Resposta sem evento (204, timeout limpo): corpo vazio. O Roblox chama de novo
imediatamente. Isso dá cerca de 3 requisições por minuto quando a live está
parada, muito abaixo do teto de 500/min do HttpService.

### `GET /jogo/mapa`
Devolve o spec do mapa do preset ativo. O Roblox chama uma vez, na entrada.
Resposta: o objeto de mapa descrito em `04_MODELAGEM`.

### `GET /jogo/look`
Devolve o look do preset ativo, já resolvido, para o Roblox aplicar por
`HumanoidDescription`. Chamado na entrada e no respawn.

### `GET /jogo/catalogo-itens?busca=...`
Busca item **gratuito** do catálogo do Roblox, para o vestiário dentro do jogo.
A ponte é quem fala com a API do Roblox e cacheia. O jogo nunca chama direto.
Filtro de preço zero aplicado na origem. Ver ADR-011.

### `PUT /jogo/looks/:lookId`
O vestiário no jogo salva o look montado. Valida contra o schema antes de gravar.

### `POST /jogo/estado`
O Roblox informa o estado. **O jogo é a fonte de verdade da posição, não a
ponte** (R9). Fire-and-forget, não bloqueia o jogo, chamado no máximo a cada 2s
ou quando a referência muda.
```json
{
  "plataformaReferencia": 184,
  "plataformaMaxima": 191,
  "emAnimacao": false,
  "quedasNaturais": 12
}
```
A ponte apenas repassa isso ao painel. Ela nunca calcula nem acumula posição.

---

## B. Superfície local (ponte ↔ painel), só em `localhost`

Servidor próprio, em `PAINEL_PORT`. Sem autenticação de propósito: o que a
protege é o bind em `127.0.0.1` e o túnel não conhecer esta porta.

| Método | Rota | Faz |
|---|---|---|
| GET | `/api/modalidades` | Lista modalidades (Fase 1: só `escalada`) |
| GET | `/api/presets` | Lista presets |
| GET | `/api/presets/:id` | Um preset |
| PUT | `/api/presets/:id` | Salva preset (valida R1 e R2) |
| GET | `/api/catalogo` | Catálogo de presentes |
| POST | `/api/catalogo/atualizar` | Força nova coleta |
| GET | `/api/animacoes` | As 20 animações, para o seletor |
| GET | `/api/looks` | Lista looks salvos, com ícones das peças |
| GET | `/api/mapas` | Lista mapas |
| POST | `/api/mapas/gerar` | Gera mapa com Gemini (ver F4) |
| POST | `/api/sessao/start` | Conecta na live e abre a sessão |
| POST | `/api/sessao/stop` | Encerra e limpa dado de espectador |
| GET | `/api/sessao/stream` | **SSE**: evento aplicado, latência, estado |
| POST | `/api/teste/presentes` | Dispara presente à mão. **Exige sessão**: precisa do preset para casar o slot |
| POST | `/api/teste/animacao` | Dispara uma animação direto no jogo. **Não exige sessão nem preset** |
| POST | `/api/jogo/abrir-studio` | Sobe o `rojo serve` e abre o Roblox Studio na máquina do streamer |
| GET | `/api/logs` | Log recente da ponte, para o painel ter o que veio antes dele |
| GET | `/api/cenarios` | Cenários de fixture, para o modo sem live |

### Eventos do SSE
```
event: presente
data: { "slot": 3, "presenteNome": "Galaxy", "delta": 15, "latenciaMs": 620 }

event: estado
data: { "live": "conectada", "jogo": "online", "plataformaAtual": 184 }

event: naoMapeado
data: { "presenteNome": "Rose", "moedas": 1, "contagem": 7 }
```

---

### Por que `abrir-studio` só existe aqui

Ela executa processo local. Vive na superfície B, que não é publicada pelo
túnel, e **não lê nada do corpo da requisição**: o caminho do projeto e o
binário do Studio são fixos no módulo. Parâmetro vindo do navegador nessa rota
seria execução arbitrária de comando na máquina do streamer.

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
