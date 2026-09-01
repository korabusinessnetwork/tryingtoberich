# 10 — Prompts

## P1 — Geração de mapa (Gemini)

Chamado por `POST /api/mapas/gerar`. Executado **só no Node**.

### System
```
Você é um gerador de layout de mapa para um jogo de escalada vertical no Roblox.
Você recebe uma descrição de ambiente em português e devolve APENAS um objeto
JSON válido, sem markdown, sem crase, sem texto antes ou depois.

Você NÃO cria imagens, texturas nem skyboxes. Você ESCOLHE um item da lista de
acervo fornecida. Usar um id que não está na lista é erro.

REGRA MAIS IMPORTANTE: o mapa precisa ser escalável do início ao topo usando
apenas pulos normais do jogador, sem nenhuma ajuda externa. Se um salto for
alto demais, o mapa está errado.

Regras de faixa (obrigatórias):
- totalPlataformas: inteiro entre 100 e 400
- jumpHeight: entre 7 e 12 (altura de pulo do personagem, em studs)
- raioBase: número entre 4 e 14
- variacaoRaio: entre 0 e 0.5
- espacamentoVertical: entre 3 e (jumpHeight * 0.7), NUNCA acima disso
- variacaoHorizontal: entre 0 e (raioBase * 1.2)
- paleta: três cores em hexadecimal
- props: no máximo 3 tipos, densidade entre 0 e 1
- marcos: um checkpoint visual a cada 50 plataformas, e um marco "topo" na
  última plataforma

Coerência: a paleta e a escolha de skybox e textura devem refletir a descrição.
Um ambiente noturno não recebe paleta clara.
```

### User (montado pelo código)
```
Descrição do streamer: {DESCRICAO}

Acervo de skybox disponível:
{LISTA_SKYBOX}   // id + tags, vindo de data/acervo.json

Acervo de textura de plataforma disponível:
{LISTA_TEXTURA}

Formato de saída exato:
{SCHEMA_RESUMIDO}   // o schema de mapa de docs/04_MODELAGEM
```

### Pós-processamento obrigatório
1. Remover cerca de código se o modelo devolver mesmo assim.
2. `JSON.parse` em `try/catch`.
3. Validar contra `data/schemas/mapa.schema.json`.
4. Verificar que `skyboxAssetId` e `materialAssetId` **existem no acervo**.
5. Verificar todas as faixas numéricas.
5b. **Verificar jogabilidade:** `espacamentoVertical <= jumpHeight * 0.7`. Spec
    que violar isso é rejeitado sem negociação. Ver ADR-009.
6. Falhou: uma retentativa acrescentando ao prompt o que veio errado. Falhou de
   novo: erro claro no painel. **Nunca preencher campo faltante com chute.**

## P2 — Sugestão de preset (opcional, Fase 2)
Dado o catálogo de presentes da sala e a biblioteca de animações, sugerir 6
slots como ponto de partida. **A saída é sugestão pré-preenchida no painel, que
o streamer edita e confirma.** Nunca aplicada direto. Ver ADR-007.

## Regras gerais para prompt neste projeto
- Prompt vive neste arquivo e é referenciado pelo código, nunca escrito solto no
  meio de uma função.
- Toda saída de modelo é validada contra schema antes de tocar o disco.
- Nenhuma chamada de IA acontece no caminho crítico do evento de presente.
- Chave de API só no processo Node.
