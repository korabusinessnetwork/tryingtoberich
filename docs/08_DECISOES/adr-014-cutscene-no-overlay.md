# ADR-014 — Cutscene de fim de rodada no overlay do OBS, escolhida no preset

- **Status:** aceito
- **Data:** 2026-09-03
- **Contexto:** ADR-007 (presentes de placar), ADR-013 (comando pelo long-poll),
  ADR-003 (acesso a disco pelo repositório)

## Contexto

Vitória e derrota são os dois instantes mais altos da live, e o boneco os
atravessava parado. A primeira resposta foi uma **animação da biblioteca**,
escolhida no preset (`animacaoDeVitoria`/`animacaoDeDerrota`) e tocada solta
sobre o personagem no fim da rodada. Durou um dia: o dono olhou o editor e
disse que ali deveria estar a lista das **cutscenes**, não das animações — e
que precisava escolher quais presentes dão vitória ou derrota.

Ele tem razão por três motivos:

1. **O Roblox não aceita vídeo.** O upload pelo Open Cloud responde
   `PERMISSION_DENIED`, e `VideoFrame` é recurso restrito mesmo com conta
   verificada. O espetáculo que o dono chama de cutscene é um vídeo com som,
   tela cheia — e isso só existe fora do jogo, no overlay do OBS, que já
   estava escrito e já tocava `vitoria.mp4`/`derrota.mp4`.
2. **Animação de presente é feita para MOVER.** O contrato dela é delta e
   intensidade. Tocá-la sem delta era um caso especial no caminho do
   movimento (`Movimento.tocarSolta` existia só para isso), e o Princípio nº1
   proíbe caso especial justamente ali.
3. **Duas coisas no mesmo instante disputam atenção.** A animação no jogo e a
   cutscene por cima tocariam juntas, e a cutscene cobre a outra.

E a tela lia errado: a seção "Presentes de placar" abria com "Vitória →
Ascensão da Fênix", que parece o presente da vitória e era a animação.

## Decisão

**O fim de rodada é uma CUTSCENE: um arquivo de vídeo em `data/cutscenes/`,
tocado pelo overlay do OBS. Qual vídeo toca em cada resultado é escolha do
streamer, no preset — `cutsceneDeVitoria` e `cutsceneDeDerrota`, o nome do
arquivo sem extensão. Nula = nada toca, e o placar só muda.**

- **A pasta é a lista.** Não há cadastro: pôr um `.mp4` ou `.webm` em
  `data/cutscenes/` basta para ele aparecer no painel. O nome precisa passar no
  `identificador` de `comuns.schema.json` — minúsculas, números e hífen —
  porque vira pedaço de URL (`/overlay/video/:id`) e campo de preset. Fora do padrão
  não é erro: volta como `ignorados`, e o painel diz por quê.
- **A escolha viaja pelo `estado`; o gatilho é o AVISO do jogo.** O núcleo
  publica `cutscenes: { vitoria, derrota }` no `estado`, e o overlay aponta os
  dois `<video>` para `/overlay/video/:id` quando a escolha muda — antes de a rodada
  acabar, para o vídeo já estar carregado. Quem toca é o evento `rodada`,
  republicado de `POST /jogo/rodada`: o jogo avisa **no instante em que o
  resultado é definitivo** — a contagem da vitória zerou sem o streamer sair
  do topo, ou o portal quebrou. Pedido do dono, textual: *"a cutscene só deve
  acontecer caso aconteça a vitória mesmo, quando o cronômetro finalizar, ou
  quando a parede do nether quebrar"*. O fluxo SSE manda um `estado` assim que
  a conexão abre, para o overlay não depender do próximo batimento do jogo.
- **O jogo não toca nada; só avisa.** A animação de fim de rodada foi removida
  (`Movimento.tocarSolta`, `animacoesDeRodada` no `/jogo/mapa`). Não fica em
  paralelo: o preset teria dois campos para o mesmo instante, e a tela teria
  que explicar a diferença.
- **Vitória comprada por donate não é cancelável.** `encerrarRodada` sabe
  quando a rodada veio da fila de placar (`encerramentoForcado`), e a guarda
  que cancela a contagem quando o streamer sai do topo não se aplica a ela: a
  condição dessa vitória é o donate, não a posição. Sem isso o batimento
  seguinte cancelava a contagem em dois segundos e a cutscene nunca tocava.
- **Os presentes continuam na lista `placar`** (ADR-007). O editor agrupa POR
  RESULTADO: cada um mostra a sua cutscene e os seus presentes, porque é a
  mesma pergunta — "o que acontece quando o streamer vence?" — vista de dois
  lados. Trocar um presente de lado é tirar de um e pôr no outro.

## Alternativas consideradas

**Manter as duas: animação no jogo e cutscene no OBS.** Dois campos no preset
para o mesmo instante, dois seletores na tela, e a pergunta "por que a Fênix
não apareceu?" respondida com "porque o vídeo estava por cima". O dono pediu
um só, e é o que cobre a tela.

**Cutscene por convenção fixa, sem escolha.** Era assim: `vitoria.mp4` e
`derrota.mp4`, nomes cravados no código. Funciona para um preset. Com dois — um
de aniversário, um normal — trocar de preset exigiria renomear arquivos, e o
painel não tinha como dizer que a lista existia.

**Tocar o vídeo dentro do jogo como sprite.** Converter o mp4 em centenas de
imagens e animá-las num `ImageLabel`. Perde qualidade, perde áudio, e pesa no
exato momento em que a torre se reergue. Ver o comentário em `overlay.mjs`.

**Cutscene como campo da configuração, não do preset.** Simples, mas errado
de lugar: cutscene é regra de partida, como o portal e os presentes de placar,
e muda com o preset. Configuração é instalação (conta, chaves).

**Disparar pelo placar, comparando `vitorias`/`derrotas` com o anterior.** Foi
a primeira versão, e errava nos dois sentidos. O placar sobe no INÍCIO da
contagem (o ponto é feito no toque, e não volta atrás no cancelamento), então
a cutscene tocava para uma vitória que o streamer ainda podia abandonar. E a
ponte reiniciada zerava o contador dela enquanto o do jogo continuava: o
primeiro estado depois disso tocava uma vitória que ninguém teve. Instante não
se deriva de dois instantâneos — quem sabe que a rodada acabou é o jogo, e ele
avisa.

## Consequências

- `preset.schema.json` troca `animacaoDeVitoria`/`animacaoDeDerrota` por
  `cutsceneDeVitoria`/`cutsceneDeDerrota`. Preset gravado com os campos velhos
  é recusado por `additionalProperties: false` no próximo salvar — os dois
  presets versionados foram atualizados, e o campo existiu por um dia.
- `/api/cutscenes` lista a pasta; `/api/overlay` cruza a escolha do preset
  ativo com o que há nela (`emUso`), para "escolhi e o arquivo sumiu" aparecer
  antes da live.
- `/overlay/video/:id` serve qualquer arquivo da pasta cujo nome passe no
  padrão (era `/overlay/:id`; mudou com a segunda página, ADR-015).
  `..` e nome fora do padrão nunca chegam ao disco: 404 antes do `stat`.
- `POST /jogo/rodada` é uma rota nova na superfície pública, a que atravessa o
  túnel. Exige o token como todo `/jogo/*`, valida contra
  `rodada-jogo.schema.json`, e corpo inválido é descartado com aviso — nunca
  chega ao overlay.
- Sem preset ativo, `cutscenes` vem nulo e o overlay fica mudo. É o que era
  antes com a pasta vazia.
- A derrota avisa no quebrar do portal, antes da contagem; a vitória avisa
  quando a contagem zera. A cutscene de derrota cobre a contagem; a de vitória
  cobre a torre se reerguendo. É a ordem que o dono descreveu.
- A falha continua **calada** no OBS — não há como o overlay avisar de dentro
  do OBS. O que mudou é que ela deixou de ser invisível antes da live: o
  editor marca a escolhida que "não está na pasta", e a aba Overlay também.

## O que isto NÃO autoriza

Cutscene não é uma segunda biblioteca de animações. Ela toca em dois
instantes, vitória e derrota, e só. Presente que precisa de espetáculo
continua sendo animação no jogo, com delta — o overlay não vira canal de
efeito por presente, que teria que disputar a tela com a captura o tempo
todo.
