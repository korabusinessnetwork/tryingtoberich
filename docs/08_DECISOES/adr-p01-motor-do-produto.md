# ADR-P01 — Motor do produto: manter Roblox

**Status**: Aceito · **Data**: 2026-09-09 · **Decisores**: Matheus Bonato
**Relacionado**: ADR-001 (reafirmado), ADR-P04 (distribuição), ADR-P06 (captura)

> Primeiro ADR da série **P**, a camada de produto. A série numérica (001–016) é
> a fundação técnica e continua valendo inteira. A série P decide o que falta
> para essa fundação virar algo que outro streamer compra e usa sozinho.

---

## Contexto

O `docs/00_VISAO/plano-de-produto.md` abriu esta decisão e declarou que ela
bloqueia todo código novo. A pergunta: o produto vendido para terceiros roda em
Roblox, como hoje, ou é reescrito como jogo web servido em Browser Source do
OBS?

O plano recomendou a reescrita para web, com um argumento em três partes:

1. **Distribuição.** Em web o cliente cola uma URL no OBS; em Roblox "cada
   cliente precisaria do próprio place".
2. **Update e licenciamento remotos.** Triviais em web, "frágeis" em Roblox.
3. **Telemetria de produto.** Manter Roblox "significa abrir mão" dela.

Contra isso pesa o que já existe: 53 arquivos Luau, 16 ADRs de fundação, 451
testes verdes, e uma mecânica de escalada cuja física, câmera, humanoid e
catálogo de assets vêm de graça do Roblox. E pesa o ADR-001, que escolheu Roblox
por uma razão que não mudou: o público de TikTok reconhece o visual, e o dono já
produz nesse formato.

### O que foi verificado antes de decidir

As três partes do argumento foram checadas contra a plataforma e contra o
repositório. **Nenhuma das três sobreviveu inteira.**

| Afirmação do plano | Veredito | Realidade |
|---|---|---|
| "Cada cliente precisaria do próprio place" | Verdadeiro, e **não é problema** | Cada cliente roda mesmo o próprio place — no Roblox Studio dele, que é exatamente o que o dono já faz hoje. O plano tratou isso como defeito fatal; é a topologia que já funciona e já foi medida. Ver ADR-P04 |
| "Update e licenciamento ficam frágeis" | Meio verdadeiro | Update é problema de app desktop, com solução de app desktop: atualizador. Licenciamento **não** é frágil: ele vive na ponte, em Node, contra o Supabase — nunca no Luau, que o cliente pode editar |
| "Abrir mão da telemetria de produto" | Falso | O funil de setup e o mapa de cliques vivem no **painel**, que é React e continua sendo web nos dois cenários. Só a telemetria de dentro do jogo é limitada — e num jogo onde o streamer joga com controle normal, mapa de cliques dentro do jogo não mede nada |

A objeção séria à Opção B não é nenhuma das três. São duas outras, que o plano
não levantou: **o custo de suporte** de software instalado em máquina alheia
(ADR-P04) e **a fronteira de termos** do uso comercial da captura não oficial
(ADR-P06).

---

## Decisão

**Manter Roblox como motor do produto.** Nenhuma reescrita. A escalada que
existe hoje é a modalidade 1 do produto, e as modalidades 2 e 3 nascem em Luau
sobre o mesmo motor.

A distribuição — que o plano corretamente identificou como sendo *o produto* —
é resolvida pelo ADR-P04 empacotando a topologia atual, não trocando de engine.

---

## Alternativas consideradas

### 1. Jogo web em Browser Source do OBS (recomendação do plano)

- **Prós**: distribuição por URL, WebSocket bidirecional (~150ms contra ~600ms
  do Roblox, ver ADR-001), asset sem moderação, controle total do render, e a
  mesma stack Node que a ponte já usa.
- **Contras**: joga fora 53 arquivos Luau e o trabalho dos Blocos 0 a 3b;
  física, câmera, avatar e biblioteca de assets voltam a ser construídos do
  zero; o streamer sai do ambiente onde já produz; e o visual reconhecível pelo
  público de TikTok se perde.
- **Descartado porque**: decisão do dono, e porque as vantagens de distribuição
  que justificavam a reescrita ou não eram vantagens (o cliente rodar o próprio
  place é o desenho, não o defeito) ou não eram exclusivas da web (telemetria de
  produto está no painel). A reescrita pagaria caríssimo por um problema que o
  ADR-P04 resolve sem ela.

### 2. Roblox para o produto, web só para o overlay

Já é o desenho vigente: ADR-014 e ADR-015 põem cutscene e HUD no overlay do OBS,
que é web. Não é alternativa — é o estado atual, e continua.

---

## Consequências

### Positivas

- **Zero reescrita.** Os 451 testes e os 16 ADRs de fundação seguem válidos.
- O princípio nº 1 já foi orçado para o Roblox (ADR-001: ~600ms dentro do teto
  de 1000ms). Nenhum orçamento de latência precisa ser refeito.
- **Custo de infraestrutura de jogo: zero, permanentemente.** O jogo roda na
  máquina do cliente. Num produto multiusuário, a parte normalmente mais cara
  aqui não existe.
- Cada cliente é o próprio servidor, com o próprio teto de 500 req/min do
  `HttpService` (`memory/restrictions.md`). O limite nunca é compartilhado: ele
  escala junto com a base.
- Um cliente quebrado não derruba os outros. Não há ponto único de falha.

### Negativas / trade-offs

- **O suporte vira o custo dominante.** Software instalado em Windows alheio é
  onde o tempo vai embora. Assumido no ADR-P04, e é o que torna o item "saúde de
  conexão" do console v1 obrigatório.
- **O código Luau viaja com o produto.** Quem tem o place no Studio lê os 53
  arquivos. O fosso é a ponte e o serviço, não o segredo do Luau (ADR-P04).
- **Update não é instantâneo.** Depende do atualizador e do cliente reiniciar.
  Quando o TikTok quebrar, a correção só chega a quem atualizou.
- **Moderação de asset continua no caminho** (ADR-004). Mapa gerado por IA segue
  limitado a layout sobre acervo pré-aprovado, para todo cliente.
- **A latência ~600ms passa a ser o piso do produto**, não só das lives do dono.
  Se a Fase 0 medir acima de 1000ms de forma consistente, este ADR e o ADR-001
  reabrem juntos.
- **Telemetria de dentro do jogo é pobre.** Aceito: o que o console precisa medir
  — setup, abandono, modalidade usada, saúde de conexão, versão instalada — está
  no painel e na ponte, ambos sob controle da Kora.

---

## Condição de reabertura

Este ADR reabre se qualquer uma acontecer:

1. A Fase 0 medir latência ponta a ponta consistentemente acima de 1000ms
   (mesma condição do ADR-001).
2. O suporte de instalação passar a consumir mais tempo que o desenvolvimento —
   sinal de que a distribuição não foi resolvida de verdade.
3. O público-alvo deixar de ser "streamer que já usa o Roblox Studio". Aí a
   alternativa registrada no ADR-P04 — experiência publicada da Kora — volta à
   mesa antes da reescrita para web.

---

## Referências

- `docs/00_VISAO/plano-de-produto.md` — o plano que abriu esta decisão
- [ADR-001](./adr-001-roblox-como-motor.md) — a escolha original do motor
- [ADR-P04](./adr-p04-distribuicao-em-roblox.md) — como o cliente recebe o jogo
- [ADR-P06](./adr-p06-uso-comercial-da-captura.md) — o risco que o plano subestimou
