# ADR-011 — Vestiário híbrido: monta no jogo, escolhe no painel

**Status**: Aceito · **Data**: 2026-09-01 · **Decisores**: Matheus Bonato
**Estende**: ADR-010

## Contexto
O ADR-010 definiu o personagem como composição gratuita, mas guardava os itens
como uma lista de IDs escrita à mão no preset. Isso funciona e é horrível de usar:
ninguém escolhe roupa lendo número.

O obstáculo para um vestiário visual no painel é a **prévia**. Mostrar o ícone de
cada peça é trivial: o Roblox expõe thumbnail por asset. Mostrar o **boneco
montado** com uma combinação arbitrária não é: o Roblox renderiza avatar de
usuário existente, não uma combinação hipotética. Fazer isso no navegador exigiria
renderizar avatar por conta própria, que é um projeto do tamanho deste.

Dentro do jogo, esse problema não existe. O boneco está ali, com a iluminação e a
câmera reais, e a prévia é o próprio jogo.

## Decisão
**Dividir o vestiário em dois lugares, cada um fazendo o que é barato nele.**

1. **Montagem no jogo.** GUI de vestiário dentro da experiência do Roblox. Busca
   itens gratuitos do catálogo, equipa, vê na hora no próprio boneco, ajusta cor
   de corpo e efeito permanente. Salva como **look nomeado**.
2. **Seleção no painel.** O painel lista os looks salvos, mostra a grade de ícones
   das peças de cada um, e o preset referencia um `lookId`. Sem prévia de corpo
   inteiro no painel, que é justamente a parte cara.

O `personagem` do preset deixa de carregar a composição e passa a referenciar:

```json
"personagem": { "lookId": "escalador-vulcanico" }
```

O look vive em `data/looks/<lookId>.json` com a composição completa.

## Alternativas consideradas
### Vestiário só no painel, com prévia de corpo inteiro
- Descartado porque: exigiria renderizar avatar Roblox fora do Roblox. Custo
  desproporcional para a fase.

### Vestiário só no painel, sem prévia
- Descartado porque: escolher roupa por ícone solto, sem ver o conjunto montado,
  produz combinação ruim. A prévia é a feature.

### Vestiário só no jogo
- Prós: mais simples, um lugar só.
- Contras: para trocar o look de um preset o streamer teria que entrar no jogo.
  O painel é onde o preset é montado; o look precisa estar lá.
- Descartado por decisão do dono.

## Consequências
### Positivas
- Prévia perfeita, custo zero, sem renderizador próprio.
- Look vira dado reutilizável entre presets, como o mapa já é.
- A busca no catálogo alimenta o vestiário sozinha. Nada de catar ID na mão.

### Negativas / trade-offs
- **O vestiário não pode ficar acessível durante a sessão ao vivo.** Streamer
  parado num menu é exatamente a tela estática que o ADR-009 existe para evitar.
  A GUI do vestiário fica bloqueada enquanto houver **live conectada**.

  > **Correção de 2026-09-02.** A regra dizia "enquanto houver sessão rodando",
  > e o código a implementou ao pé da letra. O efeito foi tornar o vestiário
  > inacessível em TODO teste no Studio — onde a sessão roda e live não existe —
  > que é justamente quando ele mais serve, para montar o look antes da estreia.
  > A razão da regra é não entediar a PLATEIA; sem plateia ela não se aplica.
  > O jogo passou a saber da live pela resposta de `POST /jogo/estado`, que já
  > era chamada a cada ~2s e antes devolvia 204 vazio.
- Trocar de look **não** aplica no meio da partida. Aplica no início da sessão ou
  no próximo respawn de checkpoint, para não interromper a jogatina.
- A busca no catálogo do Roblox usa API web, não Open Cloud. É pública mas não é
  contratada, tem limite de taxa e pode mudar. **Isolar em um módulo só**, do
  mesmo jeito que o conector da TikTok (ADR-006). Se cair, o vestiário para, o
  jogo não.
- Só itens gratuitos entram na busca. Filtrar por preço zero na origem, senão o
  streamer monta um look que não consegue vestir.
- O fallback do ADR-010 continua valendo: item despublicado não pode deixar o
  personagem nascer sem roupa numa live.
