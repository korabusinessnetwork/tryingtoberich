# ADR-P04 — Distribuição: o cliente roda no Roblox Studio, como o dono roda hoje

**Status**: Aceito · **Data**: 2026-09-09 · **Decisores**: Matheus Bonato
**Depende de**: ADR-P01 · **Relacionado**: ADR-002, ADR-P02, ADR-P06

---

## Contexto

O ADR-P01 manteve o Roblox como motor. O plano de produto dizia, com razão, que
**a distribuição é o produto, não o gráfico** — e descartou o Roblox por achar a
distribuição impossível ali:

> "Cada cliente precisaria do próprio place, ou de um place que você não
> controla na máquina dele. Update e licenciamento ficam frágeis, suporte fica
> caro."

O dono fechou a questão em 2026-09-09, e a resposta é a mais simples possível:

> "O usuário vai continuar rodando o game dentro do Roblox Studio e vai fazer as
> mesmas coisas que já fazemos hoje, só vai ser gourmetizado."

Ou seja: **não há desenho novo de distribuição a inventar.** O fluxo do produto
é o fluxo que já roda na máquina do dono, empacotado para instalar na máquina de
outra pessoa. O que o plano chamou de "um place que você não controla na máquina
dele" não é o problema — é a decisão.

---

## Nota de implementação (2026-09-10)

A frase "entregue por instalador e mantido por atualizador automático" saiu do
papel. O mesmo build produz as duas formas, e o ADR-P07 conta o caminho até
aqui, incluindo as duas tentativas descartadas.

Uma coisa que este ADR não previa e que só apareceu construindo: **as duas
formas não podem guardar o dado do streamer no mesmo lugar.** No portátil é a
pasta do executável; no instalador, essa pasta é somente leitura numa instalação
por máquina e é apagada pelo desinstalador em qualquer uma. Na versão instalada
o dado vai para o perfil do usuário, e quem migra do portátil não perde nada.

A licença que este ADR manda checar na ponte, e nunca no Luau que o cliente pode
editar, está construída e **desligada**: nenhuma funcionalidade consulta o
veredito ainda, porque travar depende do ADR-P06.

---

## Decisão

**O cliente roda o jogo no Roblox Studio dele, na máquina dele, com a ponte e o
painel rodando ao lado — exatamente a topologia de hoje. O produto vendido é o
software local (ponte + painel + place), entregue por instalador e mantido por
atualizador automático.**

Nada da arquitetura atual muda de forma. O que muda é quem está na cadeira.

### A topologia, que é a de hoje

    Máquina do cliente
    +-- Roblox Studio ---- HttpService (long-poll, ADR-002) --+
    +-- Ponte (Node)  <---------------------------------------+
    |     +-- tiktok-live-connector / API gerenciada  -> live da TikTok
    |     +-- licenca + telemetria (fire-and-forget)  -> Supabase (ADR-P02)
    +-- Painel (React, localhost)
    +-- OBS ---- overlay (ADR-014, ADR-015)

### O que o instalador faz, em 5 minutos

1. Instala a ponte e o painel, com runtime Node embutido — nada de "instale o
   Node antes".
2. Grava o place do Kora Stream Games em disco e cria o atalho que abre no
   Studio.
3. Pede a licença uma vez. A **ponte** valida contra o Supabase e guarda o
   `streamerId`.
4. Pede o arroba da TikTok e liga o `HttpService` no Game Settings do place.
5. Abre o painel. A partir daí é a tela que já existe.

### Onde a licença é checada

Na **ponte**, nunca no Luau. O Studio do cliente é ambiente dele: qualquer
checagem dentro do place é editável por ele em dois cliques. A ponte é o
processo que fala com a TikTok e com o Supabase, e é o único lugar onde negar
serviço significa alguma coisa. Sem licença válida a ponte não conecta na live —
e sem evento chegando, o jogo é um obby vazio.

Isso também é o que mantém o desenho longe da fronteira dos termos do Roblox
(ver ADR-P06): **o que se vende é o software local que fala com a TikTok**, não
conteúdo de dentro da plataforma.

---

## O que isso resolve, item por item

| Preocupação do plano | Como fica |
|---|---|
| "Cada cliente precisa do próprio place" | É a decisão, não o problema. Cada um roda o seu, no Studio dele |
| "Update fica frágil" | Atualizador entrega ponte, painel e place juntos. É problema padrão de app desktop, com solução padrão |
| "Licenciamento fica frágil" | A licença vive na ponte, contra o Supabase. O Luau nunca decide nada sobre pagamento |
| "Suporte fica caro" | É o risco real que sobra. Ver os trade-offs |
| Custo de infraestrutura do jogo | Zero. Roda na máquina do cliente, com a CPU dele |
| Teto de 500 req/min do `HttpService` | Por servidor, e cada cliente é o próprio servidor. Nunca compartilhado |
| Ponto único de falha | Não existe. Um cliente quebrado não derruba os outros |

### O bônus: o túnel pode sumir

O `memory/restrictions.md` registra a questão em aberto desde o Bloco 1:

> "'Não alcança `localhost`' NÃO está verificado para o Roblox Studio. Vale para
> servidor publicado, que roda em datacenter. O Studio roda na mesma máquina que
> a ponte. Se alcançar, o túnel do ADR-002 vira opcional."

Com o produto inteiro apostado no Studio, essa questão de cinco minutos deixa de
ser curiosidade e vira **tarefa de Fase 0 com prioridade**. Se o Studio alcança
`127.0.0.1`, o produto perde de uma vez: a dependência do Cloudflare Tunnel, o
passo mais frágil do instalador, a única exposição do sistema à internet e um
terço do orçamento de latência. Para todo cliente, de graça.

---

## Alternativas consideradas

### 1. Uma experiência publicada da Kora, com servidor reservado por streamer

`TeleportService:ReserveServer()` daria um servidor isolado por cliente, de
graça, e publicar o place propagaria update na hora, sem ação de ninguém.

- **Prós**: update instantâneo, nenhum instalador, o Luau fica no servidor e o
  cliente não o vê, e o cliente nem precisa de Studio.
- **Contras**: o servidor roda em datacenter da Roblox, e daí a ponte **precisa**
  ser alcançável pela internet — ou hospedada pela Kora, com custo, ou por um
  túnel na casa de cada cliente. A latência sobe. E vender assinatura que ligue
  qualquer coisa dentro de uma experiência publicada esbarra nos termos do
  Roblox, que proíbem usar serviço de fora para vender recurso de dentro.
- **Descartado porque**: decisão do dono, e porque troca uma topologia que já
  funciona e já foi medida por outra que reintroduz custo de hospedagem e uma
  fronteira jurídica. Fica registrado como o caminho natural da Fase 3, se um
  dia o público deixar de ser "streamer que já usa Studio".

### 2. Place publicado pelo próprio cliente, na conta dele

- **Descartado porque**: exige que cada cliente publique, configure
  `HttpService` e mantenha a própria versão. Todo o custo do Studio, sem o
  benefício de rodar local.

---

## Consequências

### Positivas

- **Nenhuma reescrita, nem de arquitetura.** O produto é o sistema de hoje com
  instalador e licença por cima. É o caminho mais curto até a primeira venda.
- Custo de infraestrutura de jogo, permanente: zero.
- A latência do produto é a menor possível — tudo na mesma máquina — e pode
  ficar menor ainda se o túnel cair.
- O cliente-alvo já tem Studio aberto. É streamer de Roblox: abrir um place e
  apertar Play é o que ele faz todo dia.
- Sem ponto único de falha, e sem a Kora responsável por uma experiência
  compartilhada por todos os clientes.

### Negativas / trade-offs

- **O suporte é o custo real, e ele não foi eliminado — foi assumido.** Windows
  alheio, antivírus, firewall, versão de Studio, `HttpService` desligado. É onde
  o tempo vai embora, e é o motivo de "saúde de conexão" no console v1
  (ADR-P05) não ser luxo.
- **O código Luau vai junto.** Quem tem o place no Studio lê e copia os 53
  arquivos. Não há como impedir, e não adianta fingir que há: **o fosso do
  produto é a ponte, a conexão com a TikTok, o catálogo de modalidades e a
  manutenção quando o TikTok quebrar** — não o segredo do Luau. Precificar e
  comunicar como serviço, nunca como código.
- **Update não é instantâneo.** Depende de o atualizador rodar e de o cliente
  reiniciar. Quando o TikTok quebrar, a correção só chega a quem atualizou — e é
  por isso que a telemetria precisa saber qual versão cada cliente roda.
- **Depende de o Roblox Studio continuar permitindo isto.** É o mesmo tipo de
  dependência de plataforma do ADR-006, com a diferença de que aqui não há
  violação de termo: rodar um place próprio no Studio é o uso normal da
  ferramenta.
- **O persona "streamer sem conhecimento técnico" da `identity.md` fica sob
  pressão.** Instalar, ligar `HttpService` e abrir o Studio é mais que colar uma
  URL no OBS. O instalador precisa levar isso a sério, ou o gate de 10 vendas
  vira gate de 10 tickets de suporte.

---

## Tarefas que este ADR cria

- **Fase 0:** testar se o `HttpService` do Studio alcança `127.0.0.1`. Cinco
  minutos, e muda o instalador inteiro.
- **Fase 1:** instalador Windows com runtime embutido, atualizador, e o passo do
  `HttpService` automatizado ou muito bem documentado.
- **Fase 1:** a telemetria do ADR-P02 precisa reportar a **versão** que cada
  cliente roda. Sem isso não dá para saber quem já recebeu uma correção.

---

## Referências

- [ADR-P01](./adr-p01-motor-do-produto.md) — a decisão que este executa
- [ADR-002](./adr-002-ponte-long-poll.md) — o long-poll, e a questão do `localhost`
- [ADR-P06](./adr-p06-uso-comercial-da-captura.md) — a fronteira de termos que sobra
- `memory/restrictions.md` — a questão do `127.0.0.1`, aberta desde o Bloco 1
