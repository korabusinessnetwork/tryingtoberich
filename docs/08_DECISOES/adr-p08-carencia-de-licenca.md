# ADR-P08 — Carência de 14 dias para licença ativa não reconfirmada

**Status**: Aceito · **Data**: 2026-09-10 · **Decisores**: Matheus Bonato
**Depende de**: ADR-P02 · **Complementa**: ADR-003

---

## Contexto

O ADR-P02 pôs a licença no Supabase e escreveu a regra que a governa:

> **Nenhuma chamada ao Supabase entra no caminho crítico do evento de presente.**
> Licença é validada no start da sessão, uma vez, e fica em memória.

O `licenca.schema.json` levou a regra até a consequência: o arquivo em disco é
ESPELHO, e existe para o produto continuar funcionando quando a Kora está fora
do ar. Ficou faltando o número — **por quanto tempo** o espelho sozinho segura o
produto de pé.

O caso concreto é banal e caro: o streamer pagou, chega o dia da live, e a
internet dele está fora — ou o Supabase está fora, ou o projeto do tier gratuito
pausou por inatividade. Sem carência, ele abre o produto e não tem produto. A
live não acontece, e o motivo é um problema que não é dele.

O caso oposto também é real: carência longa demais transforma "ficar offline" na
forma mais barata de usar o produto sem pagar.

---

## Decisão

**Licença que já foi confirmada `ativa` continua valendo por 14 dias contados da
última confirmação bem-sucedida. Passado o prazo, o veredito vira
`carencia_esgotada`.**

Três recortes, e cada um resolve um caso diferente:

| Situação no espelho | Kora fora do ar | Veredito |
|---|---|---|
| `ativa`, dentro dos 14 dias | — | `indeterminada` · `kora_indisponivel` · **libera** |
| `ativa`, passados os 14 dias | — | `indeterminada` · `carencia_esgotada` · **trava** |
| `expirada` ou `cancelada` | — | o espelho, intacto · **trava** |
| sem espelho, com chave | — | `indeterminada` · `kora_indisponivel` · **libera** |
| sem chave | — | `sem_licenca` · `sem_chave` · **libera** |

**Carência é só para quem já foi confirmado ativo.** Licença que a Kora já
recusou uma vez não ganha sobrevida por a Kora estar fora do ar depois: não
poder repetir o "não" não transforma o "não" em "sim".

**A carência conta de `verificadaEm`, nunca de "agora".** O espelho guarda
`carenciaAte` calculado na hora da confirmação boa. Recalcular a cada arranque
renovaria o prazo toda vez que a ponte subisse, e ele nunca esgotaria.

Esse é o bug óbvio deste desenho, e **ele existiu**: a primeira versão perguntava
por `espelho.estado === "ativa"`, o que só é verdade na PRIMEIRA subida offline —
da segunda em diante o espelho já diz `indeterminada`, porque foi a carência que
o escreveu. O prazo valia um arranque e sumia. O teste `a carência NÃO renova a
cada arranque` (`bridge/test/licenca.test.mjs`), que sobe a ponte cinco vezes ao
longo de vinte dias, é o que pegou isso, e é o que impede a volta: quem carrega a
memória do prazo é o campo `carenciaAte`, e é por ele que se pergunta.

---

## Por que 14

O número tem um piso e um teto, e os dois são concretos.

**O piso são 7 dias, e ele é problema NOSSO.** O tier gratuito do Supabase pausa
o projeto depois de uma semana de inatividade (ADR-P02). Uma carência de 7 dias
faria uma pausa nossa virar live cancelada do cliente: o produto puniria o
streamer por uma economia da Kora. Qualquer prazo tem que passar de 7 com folga.

**O teto é meio ciclo de cobrança.** A assinatura é mensal. Carência maior que
15 dias deixa quem cancelou rodando a maior parte de um mês que não pagou, e
premia ficar offline de propósito.

Entre 7 e 15, **14 cobre o evento que a carência existe para cobrir**: a semana
sem internet — mudança de casa, viagem, provedor caído — com margem para ela
virar duas. E é a única escolha nessa faixa que não exige explicar por que não
é a semana redonda.

---

## Alternativas consideradas

### 1. Sem carência — licença vale só online
- **Prós**: nada para implementar; a Kora sempre sabe quem está usando.
- **Descartado porque**: transforma toda queda de rede em live cancelada de
  quem pagou, e o produto que roda na máquina do cliente (ADR-P04) passaria a
  depender da Kora estar de pé — o oposto do que o ADR-P02 prometeu.

### 2. Carência infinita — o espelho `ativa` vale para sempre
- **Prós**: o cliente nunca fica sem produto.
- **Descartado porque**: uma licença cancelada que nunca mais consegue ser
  reconfirmada roda para sempre. E o caminho para isso é trivial: bloquear o
  domínio do Supabase no arquivo `hosts`.

### 3. Prazo configurável no `.env`
- **Prós**: flexível.
- **Descartado porque**: é a regra de negócio da Kora morando na máquina do
  cliente, onde ele a edita. Fica no código, e é o `carenciaDias` injetável só
  para o teste poder simular o fim do prazo sem esperar duas semanas.

### 4. Contar carência a partir de `validaAte`, e não de `verificadaEm`
- **Prós**: parece mais justo — o prazo começaria quando a assinatura acabasse.
- **Descartado porque**: `validaAte` é nulo em `indeterminada` por contrato, e
  uma licença renovada mensalmente tem `validaAte` sempre no futuro. A carência
  nunca começaria a contar.

---

## Consequências

### Positivas
- O streamer sem internet no dia da live continua tendo produto.
- Uma queda do Supabase — ou a pausa do tier gratuito — deixa de ser incidente
  de cliente e vira linha no log local.
- O prazo é testável sem esperar: `decidirLicenca` recebe `agora` e
  `carenciaDias`, e os dois casos (dentro e fora) são teste puro.

### Negativas / trade-offs
- **Licença cancelada roda por até 14 dias se o cliente ficar offline.** É o
  preço, e é pequeno: quem cancelou já parou de pagar e vai parar de usar.
- O veredito `indeterminada` dentro da carência não mostra `validaAte` ao
  streamer (o schema o proíbe ali). O painel mostra o motivo em vez da data — o
  que é mais honesto: a data que teríamos é a de ontem.
- **Nada disto está exercido em produção.** O ADR-P06 está Proposto e bloqueia
  vender; até a primeira venda, todo veredito real é `sem_licenca` ou
  `indeterminada`. Este ADR é a decisão tomada antes de doer, não depois.

---

## Referências
- [ADR-P02](./adr-p02-supabase-fonte-da-verdade.md) — a decisão que este completa
- [ADR-P04](./adr-p04-distribuicao-em-roblox.md) — o produto roda na máquina do cliente
- `data/schemas/licenca.schema.json` — o contrato, escrito antes deste ADR
- `bridge/src/dominio/licenca.mjs` — a regra, em função pura
- `docs/07_APIS/licenca-e-telemetria.md` — as rotas que o painel consome
