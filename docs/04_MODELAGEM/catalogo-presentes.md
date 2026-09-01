# Catálogo de presentes da TikTok

## Regra número 1: não hardcodar o catálogo

O catálogo da TikTok muda sem aviso. Presente entra, sai, e valor em moedas é
alterado. Qualquer lista fixa em código nasce errada e apodrece em semanas.

**A fonte de verdade é a própria live.** Ao conectar, o `tiktok-live-connector`
expõe a lista de presentes disponíveis daquela sala (`availableGifts`), com id,
nome, valor em diamantes e URL do ícone oficial. A ponte grava isso em
`data/catalogo-presentes.json` a cada conexão.

## Fluxo de coleta

1. Ponte conecta na live.
2. Lê a lista de presentes disponíveis da sala.
3. Normaliza cada item para o formato abaixo.
4. Faz merge com o catálogo em disco: item novo entra, item existente tem valor
   e ícone atualizados, item que sumiu é marcado `ativo: false` mas **não é
   apagado** (preset antigo pode referenciar).
5. Notifica o painel por SSE.

## Formato normalizado

```json
{
  "presenteId": "5655",
  "nome": "Galaxy",
  "moedas": 1000,
  "faixa": 4,
  "iconeUrl": "https://.../galaxy.png",
  "iconeLocal": "data/icones/5655.png",
  "combavel": true,
  "ativo": true,
  "vistoEm": "2026-09-01T20:00:00Z"
}
```

- `faixa` é derivada de `moedas` no momento da normalização (I a V, ver R3).
  É campo de **exibição**. Nenhuma regra de jogo lê esse campo.
- `iconeLocal` é o ícone oficial baixado uma vez e cacheado. O Matheus já usa as
  artes oficiais no overlay de ranking; manter o mesmo padrão aqui.
- `combavel` indica se o presente pode vir com `repeatCount` maior que 1 (ver R4).

## Semente para desenvolvimento

Para desenvolver sem estar ao vivo, existe `data/catalogo-presentes.seed.json`
com um punhado de presentes conhecidos. **Os valores da semente são referência e
devem ser tratados como não confirmados** até a primeira coleta real
sobrescrevê-los.

Presentes que já aparecem na configuração de desejos do Matheus hoje e servem
de semente: Rose, Tiny Diny, Doughnut, Sunglasses, Galaxy, TikTok, Finger Heart,
Perfume, Hand Hearts, Corgi, Fireworks, Lion, TikTok Universe.

> A coleta real preenche `moedas` e `iconeUrl`. Não chutar valor no código.

## No painel
O seletor de presente mostra o catálogo com: ícone oficial, nome, valor em
moedas e cor da faixa. Tem busca por nome e ordenação por valor. Presentes com
`ativo: false` só aparecem se já estiverem em uso em algum preset, marcados como
indisponíveis.
