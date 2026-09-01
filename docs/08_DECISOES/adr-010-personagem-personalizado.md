# ADR-010 — Personagem personalizado por composição gratuita

**Status**: Aceito · **Data**: 2026-09-01 · **Decisores**: Matheus Bonato

## Contexto
O pedido original inclui "skin personalizada". No Roblox existem três caminhos, e
eles têm custo e latência muito diferentes.

Contexto de custo verificado em 2026-09-01: desde 14/07/2026 o upload de peça
clássica (camisa, calça, camiseta) custa **80 Robux por submissão**, cobrados na
hora do envio, aprovado ou não. Mais 10 Robux de adiantamento se for colocar à
venda. O upload exige verificação de identidade na conta. Vender exige
assinatura Plus ou Premium, mas **apenas vestir não exige**. Roupa 3D em camadas
e acessório UGC custam mais e não entram em consideração nesta fase.

Somado a isso: toda peça enviada passa por moderação, que pode levar horas. Isso
é a mesma restrição do ADR-004.

Contexto de produto: a live é vertical, vista no celular. A estampa da camisa
ocupa poucos pixels. O que realmente cria identidade visual nessa tela é o
**efeito em volta do personagem**, não a textura dele.

## Decisão
**Compor o personagem por código com `HumanoidDescription`**, usando itens
gratuitos do catálogo do Roblox mais cor de corpo, e investir a identidade visual
na camada de efeito, que é nativa e gratuita.

O personagem vira um bloco do preset, versionado como dado:

```json
"personagem": {
  "nome": "Escalador Vulcânico",
  "itensCatalogo": [123456, 234567],
  "coresCorpo": { "torso": "#2B1B18", "cabeca": "#C4462A" },
  "efeitoPermanente": { "tipo": "aura", "cor": "#F5A623", "intensidade": 2 },
  "roupaCustomizada": null
}
```

`roupaCustomizada` aceita um asset ID de camisa ou calça própria quando o dono
decidir pagar o upload. O campo existe desde já para não exigir migração depois.

## Alternativas consideradas
### Roupa clássica própria (80 Robux por upload)
- Prós: identidade única de verdade, reutilizável para sempre.
- Contras: custo por tentativa, verificação de identidade, espera de moderação, e
  o resultado quase não se lê no vídeo vertical.
- **Adiado, não descartado.** Segue a regra de custo do `CLAUDE.md`: implementação
  paga é adiada por padrão, o dono decide. O campo no schema já está pronto.

### Roupa 3D em camadas ou acessório UGC
- Descartado nesta fase: custo bem maior por submissão, sem retorno visual
  proporcional numa live vertical.

### Usar simplesmente o avatar atual da conta do streamer
- Prós: custo zero, zero trabalho.
- Contras: o personagem não muda entre mapas nem entre lives, e nada disso é
  controlável por código.
- Descartado porque: perde a capacidade de trocar o visual por preset, que é
  metade do valor da feature.

## Consequências
### Positivas
- Custo zero, aplicação instantânea, sem fila de moderação.
- O visual do personagem vira **dado**, versionado junto com o preset e o mapa.
  Trocar de tema é trocar de preset.
- A camada de efeito é o que aparece de verdade na tela, e é ilimitada e gratuita.

### Negativas / trade-offs
- Limitado ao que existe de graça no catálogo do Roblox. Não é uma skin autoral.
- Os IDs de item do catálogo podem ser despublicados. Guardar sempre um conjunto
  de fallback, senão o personagem nasce pelado numa live.
- A rota paga continua disponível e custa 80 Robux por tentativa. Errar o arquivo
  custa de novo.

## Ligação com as animações
`efeitoPermanente` é o visual constante do personagem. Ele é **suspenso** durante
uma animação de presente e volta ao fim, para não competir com o efeito que o
espectador pagou. Isso vale para as 20 animações, sem exceção.
