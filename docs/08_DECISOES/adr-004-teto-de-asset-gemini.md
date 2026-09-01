# ADR-004 — Gemini gera layout e escolhe asset, nunca cria asset

**Status**: Aceito · **Data**: 2026-09-01 · **Decisores**: Matheus Bonato

## Contexto
O pedido original era que o Gemini criasse o mapa e o ambiente a partir de uma
descrição. No Roblox, toda imagem (textura, skybox, decal) precisa ser enviada
para a plataforma e **aprovada pela moderação** antes de virar um asset ID
utilizável. Isso leva de minutos a horas e não é automatizável de forma
confiável. Não existe caminho para injetar uma imagem gerada na hora.

Geometria é diferente: o servidor pode criar Parts em tempo de execução, com
posição, tamanho, cor e material, sem passar por moderação nenhuma.

## Decisão
Dividir a geração em duas metades:
- **O Gemini gera o que é dado:** layout (quantidade, espaçamento, variação),
  paleta em hex, densidade de props, marcos, e **escolhe** skybox e textura de um
  acervo pré-aprovado (`data/acervo.json`).
- **O acervo é construído à mão, uma vez:** 20 a 30 skyboxes e texturas subidos
  e aprovados antes, com tags temáticas.

## Alternativas consideradas
### Gemini gera imagem, upload automático via Open Cloud
- Descartado porque: a moderação não é síncrona nem garantida, e o mapa precisa
  estar pronto quando o streamer clica em gerar.

### Só assets nativos do Roblox, sem acervo
- Descartado porque: limita demais a variedade visual, que é justamente o valor
  da feature.

## Consequências
### Positivas
- Geração de mapa é instantânea e determinística no que importa.
- Variedade real de layout, paleta e ritmo, que é o que muda a sensação de mapa.
- Custo zero: cabe no tier gratuito do Gemini.

### Negativas / trade-offs
- O visual é limitado ao acervo. "Torre de cristal submarina" só existe se
  houver skybox e textura compatíveis no acervo.
- Montar o acervo inicial é trabalho manual de véspera, não automatizável.
- **Validação é obrigatória:** spec com asset fora do acervo é rejeitado. O
  Gemini vai tentar inventar id de asset, e o código precisa barrar isso.

## Notas
Ampliar o acervo é a alavanca de variedade. Cada skybox novo multiplica os mapas
possíveis. Tratar o acervo como backlog contínuo, não como entrega única.
