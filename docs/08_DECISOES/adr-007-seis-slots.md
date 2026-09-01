# ADR-007 — Seis slots com vínculo livre entre presente e animação

**Status**: Aceito · **Data**: 2026-09-01 · **Decisores**: Matheus Bonato

## Contexto
O desenho inicial proposto era automático: faixas de valor em moedas disparariam
animações de intensidade crescente, cobrindo todo o catálogo da TikTok. O dono
corrigiu: as 20 animações existem para **serem escolhidas**, e o número de
presentes ativos é limitado a 6, que é o que a TikTok exibe como desejos na live.

## Decisão
- Um preset tem **exatamente 6 slots**.
- Cada slot vincula **um presente a uma animação**, com delta e intensidade,
  tudo escolhido explicitamente pelo streamer.
- **Nenhum vínculo automático.** O valor em moedas é ordenação e aviso, jamais
  regra.
- Presente que chega e não está em nenhum slot é descartado e contabilizado.

## Alternativas consideradas
### Faixa de valor dispara animação automaticamente
- Prós: cobre o catálogo inteiro sem configuração.
- Contras: o streamer perde o controle que é a proposta de valor do produto; a
  live fica igual à de qualquer ferramenta pronta; e obriga a manter um mapa de
  valores que a TikTok muda sem avisar.
- Descartado por decisão do dono.

### Mais de 6 slots
- Descartado porque: o espectador só vê 6 desejos no app da TikTok. Slot que o
  espectador não vê é slot que quase não dispara.

## Consequências
### Positivas
- Controle total do streamer, que é a proposta de valor.
- O motor no Roblox fica burro e simples: recebe `{animacaoId, delta}` e executa.
  Não sabe o que é presente nem quanto vale.
- Mudança no catálogo da TikTok não quebra regra de jogo nenhuma.

### Negativas / trade-offs
- Exige configuração antes de cada live. Mitigado por presets salvos e reusáveis.
- Presente fora dos 6 não faz nada. Mitigado pelo contador de "não mapeado" no
  painel, que mostra o que o streamer está deixando na mesa.
- O catálogo completo continua necessário, agora como **lista de seleção**, não
  como tabela de regra. Ver `04_MODELAGEM/catalogo-presentes.md`.
