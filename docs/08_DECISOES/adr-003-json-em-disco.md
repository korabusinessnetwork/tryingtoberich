# ADR-003 — JSON em disco atrás de camada de repositório

**Status**: Aceito · **Data**: 2026-09-01 · **Decisores**: Matheus Bonato

## Contexto
A Fase 1 é single-streamer, roda só na máquina do Matheus, com um punhado de
presets e mapas. O padrão default da Kora é Supabase com RLS. Mas o roadmap
prevê virar produto para outros streamers (Fase 3), e o padrão da casa proíbe
regra de cliente hardcodada.

## Decisão
**Arquivos JSON em `data/`, acessados exclusivamente por uma camada de
repositório em `bridge/src/repos/`.** Todo modelo persistido carrega
`streamerId`, hoje sempre `"local"`.

## Alternativas consideradas
### Supabase desde já (default da Kora)
- Prós: caminho pronto para a Fase 3, RLS, sem migração depois.
- Contras: adiciona rede ao caminho de leitura do preset, exige conta e chave
  para uma ferramenta que roda offline na máquina do dono, e resolve um problema
  (concorrência entre clientes) que a Fase 1 não tem.
- Descartado porque: custo de complexidade sem benefício na fase atual. A camada
  de repositório preserva a opção.

### SQLite local
- Prós: consultas, transações.
- Contras: nenhum dos dois é necessário para 6 slots e uma dúzia de mapas; JSON
  é inspecionável e editável à mão, o que ajuda no desenvolvimento.
- Descartado porque: complexidade sem ganho.

## Consequências
### Positivas
- Zero dependência externa, zero custo, funciona offline.
- Arquivo legível, versionável, fácil de debugar e de fazer backup.

### Negativas / trade-offs
- Sem transação. Escrita de preset precisa ser atômica: escrever em arquivo
  temporário e renomear, nunca escrever por cima direto.
- Sem concorrência. Só um painel por vez. Aceitável na Fase 1.
- A Fase 3 exige migração. **Mitigação é a razão de existir do repositório:**
  trocar JSON por banco é reescrever `bridge/src/repos/` e nada mais.

## Notas
Regra dura: `fs` não aparece em nenhum arquivo fora de `bridge/src/repos/`.
Isso é verificável e deve virar teste ou lint.
