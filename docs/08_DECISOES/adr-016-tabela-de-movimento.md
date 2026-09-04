# ADR-016 — Todo presente move a torre: a tabela de movimento, pré-calculada por valor

- **Status:** aceito
- **Data:** 2026-09-04
- **Contexto:** ADR-007 (seis slots), ADR-012 (combate), R3, R12, F2

## Contexto

O dono pediu, olhando o painel: *"quero que você crie uma page só pra definir a
subida ou descida por presentes, e quero que você já pré-defina com base no
valor do presente × 10 — exemplo: doou uma rosa que vale 1 moeda, sobe 10, e
faz isso pra todos"*.

Isso reabre, de propósito, a decisão do ADR-007. Lá o próprio dono descartou o
vínculo automático por faixa de valor, com um argumento que continua de pé: *o
controle do streamer é a proposta de valor, e mapa de valor que a TikTok muda
sem avisar não pode virar regra de jogo*. O que mudou entre uma coisa e outra
foi o que a live mostrou:

1. **O catálogo tem 670 presentes e o preset entende 6.** Todo o resto chegava,
   era contado como "não mapeado" e não fazia nada. Quem pagou 3.000 moedas via
   o mesmo resultado de quem não mandou nada: nenhum.
2. **Configurar 670 à mão é impossível**, e configurar 6 deixa 664 mudos.
3. O contador de não mapeado do painel media exatamente esse buraco. Ele
   existia para o streamer "ajustar depois" — e não havia ajuste que coubesse.

## Decisão

**O preset ganha uma tabela de movimento: todo presente do catálogo tem delta,
calculado por `moedas × multiplicador` e ajustável presente a presente. Os 6
slots continuam mandando no que está neles.**

- **O preset guarda a REGRA, não as 670 linhas.** O bloco `movimento` tem
  `ativo`, `multiplicador` (10 por padrão, o número que o dono pediu), a
  animação de subida, a de descida, a intensidade e a lista de `excecoes`. Só o
  que o streamer mexeu à mão vira dado.
- **A conta é fria.** O índice `presenteId → delta` é montado quando o preset ou
  o catálogo mudam; o caminho quente faz um `Map.get` e nada mais (Princípio
  nº1). Presente que o catálogo local não conhece — exclusivo da sala, lançado
  hoje — cai na regra pelo valor que vem no próprio evento.
- **O slot vence a tabela.** Presente que está num dos 6 dispara com a animação,
  o delta, a intensidade e o cooldown que o streamer escolheu. É a linha que
  separa este ADR do ADR-007: os 6 continuam sendo escolha, não conta.
- **A regra só sobe.** Descida é decisão, e decisão vira exceção. Ninguém deduz
  do preço de uma rosa que ela deveria empurrar para baixo.
- **Delta 0 vale, e quer dizer "não mexe".** É como se silencia um presente sem
  desligar a tabela; ele volta a ser contado como não mapeado, junto com todo
  presente que não custa moeda.
- **Uma animação por direção, sem cooldown.** Aqui entra o catálogo inteiro:
  animação longa por presente qualquer entupiria o canal, e cooldown por
  presente seria um mapa de timers crescendo dentro do caminho quente. Quem
  resolve a concorrência continua sendo o combate (ADR-012).
- **No combate, quem não tem slot agrupa por presente.** Agrupar todos no mesmo
  balde nulo somaria uma rosa de +10 com um foguete de -3.000 e mandaria um
  participante mentiroso.
- **A tabela é desligável.** `ativo: false` devolve o jogo ao ADR-007 puro, com
  as exceções guardadas para religar sem reconfigurar.

## Alternativas consideradas

**Guardar as 670 linhas no preset.** O que se vê é o que se salva, sem regra
escondida. Descartado: o preset engorda, cada preset novo nasce desatualizado e
— o que mata — presente que a TikTok lançar depois fica sem delta até alguém
reabrir o painel. Era a fraqueza que o ADR-007 apontou em amarrar jogo a
catálogo, e a regra + exceções é justamente o que a evita.

**Faixa de valor dispara animação, como no desenho original do ADR-007.** Cinco
faixas, cinco animações. Continua descartado, e por quem descartou: escolher a
animação é o que faz a live ser DESTE jogo. A tabela decide quanto ANDA, nunca
o que TOCA — a animação dela é uma escolha única do streamer, no topo da página.

**Intensidade pela faixa do presente.** Sai de graça (faixa é 1 a 5, intensidade
é 1 a 5) e ninguém pediu. Fica anotada: se a live mostrar que presente caro
precisa de mais tela, é uma linha.

**Deixar o não mapeado como está e só melhorar o contador.** É o que existia. O
contador já dizia o tamanho do buraco; o que faltava era o que fazer com ele.

## Consequências

- **A rodada fica muito mais rápida.** Com 10 andares por moeda, um presente de
  3.000 moedas anda 30.000 andares numa torre de 1.000. O jogo grampeia o
  destino nas pontas (R6) e nada quebra, mas a corrida acaba num presente só. A
  página avisa quantos presentes fazem isso, e o multiplicador é do streamer:
  este número é para ser mexido depois da primeira live.
- **O `slot` do evento da sessão passa a ser nulo** para quem veio da tabela, e
  o resumo por slot continua sendo sobre os 6. O schema da sessão foi afrouxado
  para isso; `presentesPorSlot` ignora o nulo em vez de criar uma chave "null".
- **O contador de não mapeado encolhe** para o que não custa moeda e para o que
  foi zerado à mão. É o que ele deveria ter sido desde sempre.
- **Nada mudou no contrato com o jogo.** Ele continua recebendo
  `{animacaoId, delta, intensidade}` e sem saber o que é presente (ADR-007).
- O cenário de fixture `05-presente-nao-mapeado` mudou de expectativa e agora
  documenta os dois lados: o presente de 3.000 anda, a curtida não.

## O que isto NÃO autoriza

Aumentar os 6 slots (R1.2 continua exigindo decisão explícita do dono). Nem
fazer o valor escolher animação, intensidade ou cutscene. A tabela responde uma
pergunta só — **quanto a torre anda** — e o resto continua sendo escolha.
