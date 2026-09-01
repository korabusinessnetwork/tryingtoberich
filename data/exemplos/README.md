# Exemplos de contrato

Um arquivo válido de cada modelo de `docs/04_MODELAGEM`. Servem para três coisas:

1. **Provar os schemas.** `npm test` valida cada arquivo daqui contra o schema
   correspondente. Schema que não valida o próprio exemplo é schema quebrado.
2. **Desenvolver sem live e sem Roblox.** O painel e a ponte podem carregar
   estes arquivos antes de existir uma sessão real.
3. **Mostrar a forma.** É mais rápido ler um exemplo válido do que reconstruir
   o objeto a partir do schema.

## Isto não é dado de produção

Nada aqui é carregado pelo app. Os repositórios (`bridge/src/repos/`) leem
`data/presets/`, `data/mapas/` e `data/looks/`, nunca `data/exemplos/`.

- Os `presenteId` começam com `sem-` porque vêm da semente de desenvolvimento,
  não da live. Ver `catalogo-presentes.seed.json`.
- Os asset id do Roblox em `look-*.json` são **números de espaço reservado**.
  Look de verdade nasce no vestiário dentro do jogo (ADR-011), que preenche
  esses campos com item gratuito real do catálogo.
- `mapa-torre-vulcanica-01.json` referencia itens do acervo que ainda estão
  `pendente-upload`. Ele é válido como spec e **não pode ir ao ar** enquanto o
  acervo não for enviado e aprovado. `npm test` verifica exatamente isso.
