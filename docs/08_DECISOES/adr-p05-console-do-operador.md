# ADR-P05 — Console do operador: a fronteira do v1, congelada

**Status**: Aceito · **Data**: 2026-09-09 · **Decisores**: Matheus Bonato
**Depende de**: ADR-P02

---

## Contexto

O dono pediu um console central onde visualiza, edita e verifica tudo. O plano
de produto detalhou o pedido e, na mesma página, escreveu o risco:

> "É a parte do sistema que mais cresce sozinha. Se o v1 da seção 5.2 virar v2
> durante a Fase 1, o lançamento atrasa e a receita atrasa junto."

Um console é infinito por natureza: toda pergunta boa que se faz sobre o negócio
vira uma tela. E cada tela dessas parece barata sozinha. O risco não é construir
o console errado — é construir o console certo cedo demais, com zero assinante
para olhar.

Este ADR existe para transformar essa regra em fronteira escrita, verificável
por qualquer um que abra um pull request na Fase 1.

---

## Decisão

**O console v1 tem exatamente seis itens. A regra de entrada é uma só: um item
entra no v1 se, sem ele, for impossível operar o negócio ou atender um cliente.
Qualquer outra justificativa é v2.**

### Console v1 — bloqueante para a Fase 1

1. **Lista de assinantes** com busca por usuário da TikTok, e-mail ou licença.
2. **Ficha individual**: status da licença, plano, data de início, última
   conexão, modalidades usadas, idioma do perfil (ADR-P03) e **versão instalada**
   (exigida pelo ADR-P04).
3. **Edição de plano individual**, com a ação escrita na API do Lemon Squeezy e
   registrada em log.
4. **Faturamento**: MRR, vendas do mês, cancelamentos — alimentado por webhook
   do Lemon Squeezy, que é a fonte da verdade do dinheiro (ADR-P02).
5. **Logs de evento e de ação administrativa**: quem fez o quê e quando,
   imutável.
6. **Saúde de conexão**: quantos clientes conectados agora, quantas quedas nas
   últimas 24h.

O item 6 não é luxo, e vale dizer por quê: **ele é o alarme de quando o TikTok
quebra o acesso**, que é o risco número 1 do produto (ADR-006, ADR-P06). Sem
ele, a Kora descobre a quebra pelo primeiro cliente irritado que escrever.

### Console v2 — Fase 2, e só depois de ter volume

- Desempenho individual por assinante: lives rodadas, tempo em live, presentes
  disparados por modalidade.
- Ranking de modalidade mais e menos acessada.
- Mapeamento de cliques e funil de setup: onde o usuário abandona a instalação.
- Retenção por coorte.

O motivo do adiamento é honesto e não é preguiça: **heatmap de clique com zero
assinante não mostra nada.** Construir isso antes da primeira venda atrasa a
receita em semanas para produzir um gráfico de uma pessoa só — que é o próprio
dono.

### Fora do escopo do console, nas duas versões

- **Edição do jogo ou das animações pelo console.** Isso é painel do cliente, e
  misturar as duas superfícies é como o console vira um segundo produto.
- **Suporte por ticket dentro do console.** E-mail resolve até uns 200
  assinantes. Depois disso, revisita.

### Idioma

**Português apenas, e nunca traduz** (ADR-P03). O console tem um usuário, e ele
é brasileiro. Cada string traduzida ali é trabalho gasto em plateia de uma
pessoa.

---

## Como a fronteira é defendida na prática

Escrever a regra não basta; ela precisa doer na hora de cruzar. A regra
operacional para a Fase 1:

> Item novo proposto para o console durante a Fase 1 só entra se quem propõe
> escrever **qual operação fica impossível sem ele**. "Seria bom ver" e "já que
> estou aqui" são recusa automática, e o item vai para o v2 no backlog.

---

## Alternativas consideradas

### 1. Console completo já na Fase 1
- **Prós**: uma construção só, sem retrabalho de tela.
- **Descartado porque**: é literalmente o risco 4 do plano. Atrasa a receita
  para construir análise sobre dado que não existe.

### 2. Nenhum console na Fase 1, só consultas manuais no Supabase
- **Prós**: mais rápido ainda até a primeira venda.
- **Descartado porque**: os itens 3 e 5 (edição de plano e log administrativo
  imutável) não sobrevivem a `UPDATE` escrito à mão no painel do Supabase. E
  atender cliente lendo SQL não escala nem para dez.

---

## Consequências

### Positivas
- A Fase 1 tem escopo de console fechado e defensável, e o lançamento tem data.
- Os seis itens são exatamente o que o ADR-P02 já precisa gravar. Nenhuma tabela
  existe só para o console.

### Negativas / trade-offs
- **O dono vai querer o v2 antes da hora.** É o ponto do ADR: a vontade é
  legítima, o custo é o lançamento.
- O v1 não responde "por que esse cliente cancelou". Aceito para a Fase 1: com
  poucos assinantes, a resposta é perguntar a ele por e-mail.
- Console é superfície nova a manter. Mitigação: PT apenas, sem i18n, sem
  responsividade além do desktop, sem tema. É ferramenta interna.

---

## Referências
- [ADR-P02](./adr-p02-supabase-fonte-da-verdade.md) — de onde vem tudo que o console mostra
- [ADR-P03](./adr-p03-i18n-por-chave.md) — por que o console não traduz
- [ADR-P04](./adr-p04-distribuicao-em-roblox.md) — por que "versão instalada" é campo do v1
- `docs/00_VISAO/plano-de-produto.md`, seções 5 e 7 — o pedido e o risco
