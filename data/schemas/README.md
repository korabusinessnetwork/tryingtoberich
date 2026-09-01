# JSON Schemas

Nenhuma escrita em `data/` acontece sem validar contra um destes. Dialeto
2020-12. Os `$ref` entre arquivos são relativos ao `$id`, então os schemas só
resolvem se forem registrados juntos — ver `criarValidador()` em
`scripts/validar-contratos.mjs`.

| Schema | Valida | Escrito por |
|---|---|---|
| `comuns` | tipos reusados. Não valida arquivo sozinho | — |
| `preset` | `data/presets/<presetId>.json` | painel |
| `mapa` | `data/mapas/<mapaId>.json` | Gemini, via ponte |
| `look` | `data/looks/<lookId>.json` | vestiário dentro do jogo |
| `acervo` | `data/acervo.json` | à mão |
| `catalogo-presentes` | `catalogo-presentes.json` e `.seed.json` | coleta da live |
| `animacoes` | `data/animacoes.json` | gerado do índice Luau |
| `sessao` | `data/sessoes/<sessaoId>.json` | ponte |
| `evento-presente` | evento normalizado que sai do conector da TikTok | ponte |
| `evento-jogo` | resposta de `GET /jogo/eventos` | ponte |
| `estado-jogo` | corpo de `POST /jogo/estado` | jogo |

## O que o schema não consegue prender

Três regras são cruzadas entre campos e não existem em JSON Schema. Elas moram
em `scripts/validar-contratos.mjs`, em função pura e testada:

1. **R1.4** — um mesmo `presenteId` em dois slots do preset.
2. **ADR-009** — `espacamentoVertical <= jumpHeight × 0,7`, que é o que garante
   mapa vencível sem presente nenhum.
3. **ADR-004** — `skyboxAssetId`, `materialAssetId` e `props[].tipo` têm que
   existir em `data/acervo.json`, e estar aprovados para o mapa ir ao ar.

O resto está no schema de propósito, inclusive as regras de privacidade:
`additionalProperties: false` no log de sessão e no evento normalizado é o que
impede alguém acrescentar nickname ou id de espectador sem passar por revisão.
