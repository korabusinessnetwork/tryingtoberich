# Catálogo de presentes da TikTok

## Regra número 1: não hardcodar o catálogo

O catálogo da TikTok muda sem aviso. Presente entra, sai, e valor em moedas é
alterado. Qualquer lista fixa em código nasce errada e apodrece em semanas.

**A fonte mais completa é a própria live.** Ao conectar, o
`tiktok-live-connector` expõe a lista de presentes daquela sala
(`availableGifts`), com id, nome, valor em diamantes e URL do ícone oficial —
inclusive os presentes exclusivos da sala. A ponte grava isso em
`data/catalogo-presentes.json` a cada conexão.

## Duas fontes reais, e por que a segunda existe

Montar preset é trabalho de **antes** da live. Enquanto a coleta exigia sessão
aberta, quem abria o painel pela primeira vez via os 13 presentes da semente,
com id inventado — e o R1 casa por `presenteId`. O preset montado ali estava
condenado a nunca disparar, sem nenhum erro na tela.

Por isso a coleta tem duas fontes, e as duas são reais:

| `origem` | De onde vem | Quando | O que traz |
|---|---|---|---|
| `live` | A sala, pelo conector | Sessão de pé | Lista global **mais** os presentes exclusivos da sala |
| `publico` | Painel `webcast/gift/list/` da TikTok | Sempre | Os ~670 presentes globais |
| `semente` | `catalogo-presentes.seed.json` | Nunca coletado | 13 presentes de referência, **id inventado** |

O painel público é a mesma API que o site da TikTok usa para desenhar a gaveta
de presentes. Responde **sem assinatura, sem cookie e sem `room_id`**. Fica
isolado em `bridge/src/tiktok/catalogo-publico.mjs`, como toda API pública não
contratada (ADR-011): pode mudar de forma sem aviso, e quando cair a live
continua sendo a fonte.

> A alternativa era assinar a requisição pelo Euler Stream, que responde
> `This endpoint requires a Business plan`. Pago é adiado por padrão
> (`memory/restrictions.md`), e neste caso o caminho gratuito é melhor: não
> depende de terceiro nenhum.

## Fluxo de coleta

1. Se há live de pé, lê a lista de presentes da sala. Se não, busca o painel
   público da TikTok.
2. Normaliza cada item para o formato abaixo.
3. Faz merge com o catálogo em disco: item novo entra, item existente tem valor
   e ícone atualizados, item que sumiu é marcado `ativo: false` mas **não é
   apagado** (preset antigo pode referenciar).
4. **Só a mesma origem desativa.** A sala não conhece a lista global inteira e
   a lista global não conhece os presentes da sala: deixar uma apagar a outra
   faria o catálogo encolher a cada troca de fonte. A semente é a única que
   nunca se mistura com as reais — id `sem-rose` marcado `ativo: false` sujaria
   o seletor para sempre.
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
> A semente sobrevive porque `npm test` roda sem rede; assim que o streamer
> clica em "Atualizar da TikTok" ela some do arquivo real.

## No painel
O seletor de presente mostra o catálogo com: ícone oficial, nome, valor em
moedas e cor da faixa. Tem busca por nome e ordenação por valor. Presentes com
`ativo: false` só aparecem se já estiverem em uso em algum preset, marcados como
indisponíveis.

A barra de coleta ("N presentes · atualizado em …" e o botão **Atualizar da
TikTok**) é **permanente**, logo abaixo da busca. Antes ela aparecia só junto do
aviso da semente e sumia no instante em que passava a ser útil: com o catálogo
real em disco não havia mais como pedir a lista de novo, e a TikTok acrescenta
presente o tempo todo. Com 670 presentes na lista, a busca por nome deixa de ser
conveniência e vira o jeito de usar a tela.
