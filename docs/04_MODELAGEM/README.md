# 04 — Modelagem

Sem banco na Fase 1. Tudo é arquivo JSON em `data/`, atrás da camada de
repositório (ADR-003). Os JSON Schemas ficam em `data/schemas/`.

```
data/
  presets/<presetId>.json
  mapas/<mapaId>.json
  looks/<lookId>.json
  acervo.json                   (à mão: o que o Gemini pode escolher, ver ADR-004)
  catalogo-presentes.json       (gerado pela coleta, não editar à mão)
  catalogo-presentes.seed.json  (semente de desenvolvimento, valores não confirmados)
  animacoes.json                (espelho do índice Luau, gerado)
  sessoes/<sessaoId>.json       (efêmero, reduzido a resumo ao fim, ver 11_SEGURANCA)
  icones/<presenteId>.png       (cache do ícone oficial do presente)
  icones-itens/<assetId>.png    (cache do ícone de peça do vestiário)
  schemas/*.schema.json
  exemplos/                     (um arquivo válido de cada modelo, só para teste)
  fixtures/                     (evento da TikTok para testar sem estar ao vivo)
```

Os quatro últimos são contratos, não dado de produção: nenhum repositório em
`bridge/src/repos/` lê `exemplos/` nem `fixtures/`. `npm test` valida cada
arquivo daqui contra o schema correspondente — schema que não valida o próprio
exemplo é schema quebrado.

## Preset

```json
{
  "presetId": "escalada-padrao",
  "streamerId": "local",
  "nome": "Escalada padrão",
  "modalidade": "escalada",
  "mapaId": "torre-vulcanica-01",
  "atualizadoEm": "2026-09-01T13:00:00Z",
  "personagem": { "lookId": "escalador-vulcanico" },
  "slots": [
    {
      "posicao": 1,
      "presenteId": "1",
      "animacaoId": "sub_pulo",
      "delta": 2,
      "intensidade": 1,
      "cooldownMs": 0
    }
  ]
}
```

Regras: `slots` tem no máximo 6 itens, `posicao` de 1 a 6 e única,
`presenteId` único dentro do preset, `delta` entre -200 e 200 e diferente de 0,
`intensidade` entre 1 e 5.

O preset apenas **referencia** um look. A composição vive em `data/looks/`,
montada pelo vestiário dentro do jogo. Ver ADR-011.

## Look (vestiário)

```json
{
  "lookId": "escalador-vulcanico",
  "streamerId": "local",
  "nome": "Escalador Vulcânico",
  "itensCatalogo": [123456, 234567],
  "coresCorpo": { "torso": "#2B1B18", "cabeca": "#C4462A" },
  "efeitoPermanente": { "tipo": "aura", "cor": "#F5A623", "intensidade": 2 },
  "roupaCustomizada": null,
  "fallbackItens": [111111],
  "atualizadoEm": "2026-09-01T13:00:00Z"
}
```

`itensCatalogo` só aceita item **gratuito** do catálogo do Roblox: filtrar por
preço zero já na busca, senão o streamer monta um look que não consegue vestir.
`roupaCustomizada` fica `null` enquanto a rota paga não for aprovada pelo dono
(ADR-010). `fallbackItens` é obrigatório: item despublicado não pode deixar o
personagem nascer sem roupa numa live.

O look é aplicado por `HumanoidDescription` no início da sessão ou no próximo
respawn de checkpoint. **Nunca no meio da jogatina.**

`streamerId` é sempre `"local"` na Fase 1. Existe para a Fase 3 não exigir
migração de todos os arquivos. Ver ADR-003.

## Mapa (spec gerado pelo Gemini)

```json
{
  "mapaId": "torre-vulcanica-01",
  "streamerId": "local",
  "nome": "Torre Vulcânica",
  "geradoPor": "gemini",
  "promptOriginal": "torre vulcânica ao entardecer, plataformas de rocha",
  "totalPlataformas": 250,
  "jumpHeight": 7.2,
  "skyboxAssetId": "skybox_entardecer_vulcanico",
  "paleta": { "primaria": "#C4462A", "secundaria": "#2B1B18", "destaque": "#F5A623" },
  "plataformas": {
    "formato": "disco",
    "raioBase": 8,
    "variacaoRaio": 0.3,
    "espacamentoVertical": 5,
    "variacaoHorizontal": 9,
    "materialAssetId": "textura_rocha_vulcanica"
  },
  "props": [
    { "tipo": "fumaca", "densidade": 0.4, "aCadaNPlataformas": 10 }
  ],
  "marcos": [
    { "plataforma": 50, "tipo": "checkpoint_visual" },
    { "plataforma": 250, "tipo": "topo" }
  ]
}
```

`espacamentoVertical` **nunca** pode passar de `jumpHeight * 0,7`. Essa é a
condição que garante que o mapa é escalável só com habilidade, sem presente
nenhum. Spec que violar é rejeitado. Ver ADR-009.

`skyboxAssetId` e `materialAssetId` **só podem** referenciar itens do acervo
pré-aprovado em `data/acervo.json`. O Gemini escolhe do acervo, não inventa.
Ver ADR-004. Um spec com asset fora do acervo é rejeitado na validação.

## Acervo

O inventário fechado do qual o Gemini **escolhe** ao gerar um mapa. Ele nunca
inventa id e nunca cria asset. Ver ADR-004.

```json
{
  "skybox":   [ { "id": "skybox_entardecer_vulcanico", "nome": "Entardecer vulcânico",
                  "tags": ["vulcanico", "entardecer", "quente"],
                  "assetId": null, "status": "pendente-upload" } ],
  "texturas": [ { "id": "textura_rocha_vulcanica", "nome": "Rocha vulcânica",
                  "tags": ["rocha", "vulcanico", "escuro"],
                  "assetId": null, "status": "pendente-upload" } ],
  "props":    [ { "id": "fumaca", "nome": "Fumaça",
                  "tags": ["vulcanico", "tempestade", "denso"],
                  "descricao": "ParticleEmitter de fumaça subindo devagar." } ]
}
```

`skybox` e `texturas` são imagens: passam por moderação do Roblox, então
carregam `status` (`pendente-upload`, `em-moderacao`, `aprovado`, `rejeitado`) e
`assetId`, que só é preenchido quando a imagem é aprovada. **Só item aprovado
entra no prompt e só item aprovado pode ser referenciado por mapa que vai ao
ar.** `npm test` verifica isso e hoje reporta o acervo inteiro como pendente,
porque montá-lo é trabalho manual de véspera.

`props` são efeitos **nativos** (ParticleEmitter, Beam, Trail): não passam por
moderação e por isso não têm `assetId` nem `status`. Eles ficam no acervo pelo
mesmo motivo que skybox e textura: o tipo de prop que um mapa pode pedir é
escolha do Gemini dentro de uma lista fechada, e lista fechada é dado, não
`enum` no código. Ver a nota de implementação no ADR-004.

As `tags` são o que casa a descrição do streamer com o item. Ampliar o acervo é
a alavanca de variedade do projeto: cada skybox novo multiplica os mapas
possíveis.

## Catálogo de presentes
Ver `catalogo-presentes.md` neste diretório.

## Animação (espelho)
`data/animacoes.json` é gerado a partir do índice Luau e consumido pelo painel
para montar o seletor. Nunca editado à mão.

```json
{ "id": "sub_cometa", "nome": "Cometa", "direcao": "subida",
  "pesoVisual": 3, "duracaoBase": 1.6, "aceitaDeltaVariavel": true }
```

## Sessão (efêmero)

```json
{
  "sessaoId": "2026-09-01T20-00-00",
  "streamerId": "local",
  "presetId": "escalada-padrao",
  "mapaId": "torre-vulcanica-01",
  "iniciadaEm": "2026-09-01T20:00:00Z",
  "encerradaEm": null,
  "plataformaReferencia": 184,
  "plataformaMaxima": 191,
  "quedasNaturais": 12,
  "eventos": [
    { "em": "2026-09-01T20:03:11Z", "slot": 3, "presenteId": "5655",
      "repeticoes": 1, "delta": 15, "animacaoId": "sub_cometa", "latenciaMs": 620 }
  ]
}
```

O log de evento **não guarda nickname nem id do espectador**. Ver `11_SEGURANCA`.

`plataformaReferencia` é reportada pelo jogo, nunca calculada pela ponte. Ver R9.
