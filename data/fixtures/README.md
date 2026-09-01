# Fixtures de evento

Existem para uma coisa: **desenvolver e testar o sistema inteiro sem estar ao
vivo.** Sem isto, cada teste de coalescência exigiria uma live real com
espectador real mandando presente na ordem certa.

```
tiktok-cru/    payload como o conector entrega, para testar o NORMALIZADOR
cenarios/      roteiros de evento normalizado + o resultado esperado pelas regras
```

## `tiktok-cru/` — a fronteira não confiável

Estes arquivos imitam o que `tiktok-live-connector` emite no evento `gift`.
Servem só para testar `bridge/src/tiktok/`, que é o módulo que traduz isso para
`evento-presente.schema.json`.

> **Não confirmado.** A biblioteca é não oficial (ADR-006) e a forma do payload
> muda entre versões sem aviso. Estes arquivos são a forma **esperada**, não a
> verificada. Na primeira conexão real, despejar um evento cru, comparar com
> estes arquivos, corrigir o que divergir e anotar em `memory/learnings.md`.
> Enquanto isso não acontecer, um teste verde aqui prova que o normalizador é
> coerente consigo mesmo, não que ele entende a TikTok.

Repare que o payload cru tem `userId`, `uniqueId`, `nickname` e
`profilePictureUrl`. **O normalizador tem que jogar tudo isso fora**, menos o
nome de exibição, que vira `nomeDoador` efêmero. É esse descarte que o teste do
Bloco 1 precisa provar. Ver `11_SEGURANCA`, camada 4.

## `cenarios/` — o roteiro das regras

Cada cenário é uma sequência de eventos já normalizados, com o tempo relativo
em `emMs`, mais o `esperado` que as regras de `03_REGRAS_DE_NEGOCIO` mandam
produzir. Eles são a especificação executável de R4, R5 e F2:

| Cenário | Prova |
|---|---|
| `01-presente-unico` | caminho feliz de F2: casa com o slot, dispara uma vez |
| `02-combo` | R4: delta × repetições, **uma** animação, intensidade +1 |
| `03-rajada-mesmo-slot` | ADR-012: mesmo slot vira um participante com deltas somados |
| `04-combate-de-presentes` | ADR-012: subidas somam, descidas somam, o boneco anda o líquido |
| `05-presente-nao-mapeado` | F2.4: descarta, conta, e **não** para o fluxo |
| `06-combo-no-teto-de-intensidade` | R4: intensidade sobe um nível com teto em 5 |
| `07-combate-por-tempo-esgotado` | ADR-012: teto de 2s, líquido aplicado com efeito curto |

Todo cenário começa com o primeiro presente disparando **na hora**: o combate só
existe enquanto uma animação está tocando. Uma janela de espera na entrada
gastaria metade do orçamento de latência do Princípio nº1.

O preset de referência de todos eles é
`data/exemplos/preset-escalada-padrao.json`.
