# Refatoração do layout do painel

**Registrado em 2026-09-10, a pedido do dono. Não executado.**

O painel cresceu bem por dentro e mal por fora. Cada aba nasceu certa, uma de
cada vez, e ninguém nunca olhou as nove juntas para perguntar se aquilo ainda é
navegável por quem não construiu o produto.

Este documento existe para que a refatoração seja feita **contra um problema
escrito**, e não contra a sensação de que "está feio". Redesenhar sem isso é
como se troca um layout ruim por outro layout ruim mais recente.

---

## O que está acontecendo hoje

**Nove abas, na ordem em que foram construídas:**

    Ao vivo · Presentes · Configurar · Jogo · Overlay · Estúdio · Histórico · Licença · Log

A ordem não é de uso, é cronológica: a Licença entrou hoje, no fim, porque foi a
última a ser construída. Nada ali agrupa por **momento**, e o produto tem três
momentos bem distintos:

| Momento | O que a pessoa está fazendo | Onde isso mora hoje |
|---|---|---|
| **Antes da live** | montar preset, escolher mundo, configurar conta, montar o overlay no OBS | Presentes, Configurar, Jogo, Overlay, Estúdio |
| **Durante a live** | dar Start, olhar se o jogo reage, corrigir presente não mapeado | Ao vivo, Log |
| **Depois da live** | ver o que aconteceu, comparar com a live anterior | Histórico |

Quem está ao vivo tem cinco abas de preparação na frente e nenhuma indicação de
que elas não servem naquele instante. E **durante a live é o único momento em
que errar custa caro**, porque a plateia está mandando presente.

**A aba "Ao vivo" carrega coisas demais.** Ela tem, empilhados: o estado da
conexão, o seletor de preset, o modo de teste, o botão de Start, o editor
inteiro dos seis slots, e ainda os presentes de placar. Numa tela de 1280 isso
não cabe: o botão que encerra a rodada fica abaixo da dobra, no momento em que
a pessoa menos pode rolar a página procurando.

**O editor de preset está em dois lugares.** Ele aparece na "Ao vivo" e a aba
"Presentes" é a tabela de movimento do ADR-016. As duas editam a mesma coisa por
caminhos diferentes, e nada na tela diz qual é qual.

**O contador do Log é o único alarme do produto**, e ele é um numerozinho ao
lado de uma aba. Quando o jogo cai no meio da live, é ali que aparece, e é o
lugar menos visível da tela.

---

## O que a refatoração precisa resolver

Em ordem de importância, e a ordem importa: as duas primeiras são as que custam
dinheiro ao streamer.

1. **Durante a live, o que interessa cabe numa tela, sem rolar.** Estado da
   conexão, o que está acontecendo agora, e o que dá para corrigir sem parar.
2. **O alarme tem que alarmar.** Jogo offline, live caída, presente chegando e
   não mapeado: isso é o que faz a live render menos, e hoje é um número
   pequeno ao lado da palavra "Log".
3. **Agrupar por momento, não por ordem de construção.** Preparar, operar,
   revisar. Uma pessoa que abre o produto pela primeira vez deve conseguir
   descobrir o que fazer primeiro sem ler documentação.
4. **Um caminho por coisa.** Se preset se edita em dois lugares, um dos dois é
   o certo e o outro precisa sumir ou virar atalho declarado.

---

## O que a refatoração NÃO pode quebrar

Escrito aqui porque é o tipo de coisa que se descobre tarde:

- **O Princípio nº 1 do `CLAUDE.md`.** Nada de layout entra no caminho do
  presente. Se o redesenho pedir cálculo por frame ou re-render a cada evento
  do SSE, o redesenho está errado, não o princípio.
- **Toda string nasce como chave de i18n** nos três idiomas (ADR-P03). Layout
  novo com texto cravado no JSX é dívida no dia seguinte.
- **Um componente por arquivo, com CSS próprio** (`CLAUDE.md`, Padrões). A
  separação existe para o white-label da Fase 3, e é justamente numa
  refatoração de layout que ela é tentadora de furar.
- **Cores e espaçamentos saem dos tokens** (`data/tokens.json`). Valor solto no
  CSS é como o design system morre.
- **Aviso nunca é só cor.** Todo estado ruim diz o que fazer, por escrito. Foi
  a regra que consertou os seis slots vermelhos da instalação limpa.
- **`panel/test/fiacao.test.mjs` conta os componentes** contra o número escrito
  em `docs/06_COMPONENTES`. Mexer na lista mexe nos dois.

---

## Antes de desenhar: medir

Este produto já foi salvo uma vez por alguém abrir a tela em vez de ler o
código, e afundado uma vez por 504 testes verdes sobre um painel quebrado
(BUG-008). Então:

1. **Rodar uma live de verdade e anotar o que foi procurado e não achado.** A
   sessão no Studio (`roteiro-da-sessao-no-studio.md`) é a oportunidade óbvia,
   e ela já está na lista do dono.
2. **Fazer o percurso de instalação limpa**, do primeiro clique até o primeiro
   presente animando. É o percurso do cliente novo, e é o único que ninguém
   aqui faz por hábito.
3. Só então desenhar.

---

## E o console do operador?

**Fora deste escopo, de propósito.** Ele nasceu hoje, com quatro telas, e o
ADR-P05 congelou a fronteira dele em seis itens. Layout de console com zero
assinante é exatamente o tipo de trabalho que o ADR-P05 adia. Reavaliar quando
existir alguém para atender por ele.
