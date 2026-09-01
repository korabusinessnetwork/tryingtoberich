# 01 — Arquitetura

## Visão geral: três processos

```
┌──────────────┐      websocket não oficial      ┌────────────────────┐
│  TikTok LIVE │ ──────────────────────────────▶ │  PONTE (Node.js)   │
└──────────────┘        evento de presente        │                    │
                                                  │ tiktok-live-       │
┌──────────────┐   HTTP localhost (livre)         │ connector          │
│ PAINEL       │ ◀──────────────────────────────▶ │ Express            │
│ React + Vite │   preset, start/stop, SSE        │ repos JSON         │
│ localhost    │                                  │ cliente Gemini     │
└──────────────┘                                  └─────────┬──────────┘
                                                            │
                                            Cloudflare Tunnel (URL pública)
                                                            │
                                                            ▼
                                            ┌────────────────────────────┐
                                            │  JOGO (Roblox / Luau)      │
                                            │  HttpService long-poll     │
                                            │  20 módulos de animação    │
                                            │  construtor de mapa        │
                                            └────────────────────────────┘
```

O Roblox é sempre quem **inicia** a conexão. Essa é a restrição central de todo
o desenho: o HttpService não recebe requisição de entrada e não enxerga
`localhost`. Ver `memory/restrictions.md`.

## Processo 1 — Ponte (`bridge/`)
Node.js. Responsabilidades:
- Conectar na live via `tiktok-live-connector` e normalizar os eventos.
- Casar o presente recebido com um dos 6 slots do preset ativo.
- Manter as requisições de long-poll do Roblox abertas e respondê-las no
  instante em que um evento casado aparece.
- Servir a API local do painel (preset, catálogo, sessão, mapa).
- Chamar a API do Gemini. **Só a ponte tem a chave.**
- Persistir em JSON através da camada de repositório (ADR-003).

Estrutura:
```
bridge/src/
  tiktok/        conexão com a live, normalização de evento
  fila/          casamento evento→slot, coalescência, cooldown
  longpoll/      registro de conexões pendentes do Roblox
  repos/         ÚNICO lugar que toca disco
  gemini/        cliente e validação do spec de mapa
  roblox/        busca de item de catálogo e cache de thumbnail (ADR-011)
  http/          rotas locais (painel) e rotas públicas (jogo)
```

## Processo 2 — Painel (`panel/`)
React + Vite, roda em `localhost`. Nunca conversa com a TikTok, com o Gemini nem
com o Roblox direto. Só fala com a ponte. Responsabilidades:
- Selecionar modalidade e dar start/stop na sessão.
- Montar o preset: escolher os 6 presentes no catálogo, e para cada um escolher
  animação, delta e intensidade.
- Gerar mapa com o Gemini e pré-visualizar o spec.
- Monitorar a sessão ao vivo (últimos eventos, latência medida, altura atual).

Recebe atualização por SSE da ponte. SSE e não WebSocket porque o fluxo é
unidirecional e o SSE reconecta sozinho.

## Processo 3 — Jogo (`game/`)
Roblox / Luau, experiência privada. Responsabilidades:
- Manter o loop de long-poll contra a ponte (Script no ServerScriptService).
- Traduzir `{animacaoId, delta}` em movimento e efeito visual.
- Construir o mapa a partir do spec recebido.
- Desenhar o HUD (número da plataforma, últimos presentes, nome do doador).

Estrutura:
```
game/src/
  server/     ponte.lua (long-poll), sessao.lua (orquestra), movimento.lua
              (ADR-005), plataformas.lua (R9/R10), construtorMapa.lua e
              jogabilidade.lua (ADR-009), personagem.lua (ADR-010)
  client/     hud.lua, camera.lua, vestiario.lua
  shared/     tipos.lua, eventos.lua, configuracao.lua, efeitos.lua,
              tokens.lua e indiceAnimacoes.lua (os dois últimos GERADOS)
  animacoes/  20 ModuleScripts, um por animação
```

`game/default.project.json` mapeia isso para o Studio via Rojo. `shared/` e
`animacoes/` vão para o `ReplicatedStorage` porque o cliente também precisa
deles; `server/` fica no `ServerScriptService`, que o cliente nunca enxerga —
é por isso que o token da ponte nunca chega ao jogador. Ver `game/README.md`.

O jogo é escrito no subconjunto **Lua 5.1** de propósito: Luau é superconjunto
dele, e isso permite validar a sintaxe de todos os arquivos fora do Studio com
`npm run luau`. Sem esse gate, erro de sintaxe só aparece quando o Studio
carrega o lugar.

## O caminho crítico, passo a passo

| # | Etapa | Alvo | Observação |
|---|---|---|---|
| 1 | Espectador envia presente → evento chega no Node | 200-500ms | Fora do nosso controle |
| 2 | Normalizar e casar com slot | <5ms | Lookup em memória, sem disco |
| 3 | Responder long-poll pendente | <10ms | Conexão já está aberta |
| 4 | Rede até o servidor Roblox | 50-200ms | Via túnel Cloudflare |
| 5 | Luau dispara animação | <50ms | Módulo já carregado |
| | **Total** | **~600ms** | Teto aceitável: 1000ms |

Se a etapa 2 ou 3 passar do alvo, é bug de prioridade máxima.

## Modelo de arquitetura escolhido
Híbrido, fora dos três modelos padrão do guia da Kora: cliente de jogo externo
(que não controlamos) + serviço local sem banco + UI local. O que se mantém do
padrão é a camada de serviços isolando a persistência (ADR-003) e a proibição de
regra hardcodada.
