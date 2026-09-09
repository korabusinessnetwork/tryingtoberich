# ADR-015 — O HUD da live vive no overlay do OBS, alimentado pela ponte

- **Status:** aceito
- **Data:** 2026-09-03
- **Contexto:** ADR-014 (cutscene no overlay), ADR-012 (combate), ADR-007
  (seis slots), ADR-016 (só a exceção vai para o disco), 11_SEGURANCA camada 4
  (LGPD), 02_DESIGN_SYSTEM seções B e C

## Contexto

O dono mandou uma captura da live do CTFps7 e pediu: *"replica esse layout do
tiktok pra um overlay pra gente"*. O layout é cam em cima, jogo embaixo, e por
cima de tudo:

- um pote de moedas no canto superior esquerdo;
- o ranking dos três maiores doadores no canto superior direito, com medalha;
- `TOP COMBO` (ícone, nome, `x20`) e `TOP PRESENTE` (ícone, nome, `100 coins`)
  na base da cam, um em cada canto;
- uma barra `-0 VS +0` no centro da base da cam;
- a legenda dos presentes do preset no topo do jogo — positivos à esquerda,
  negativos à direita, ícone e delta;
- uma barra vertical da torre à direita do jogo, com bandeira e `984 / 10000`.

Quase nada disso cabe no HUD do Roblox:

1. **Ícone de presente da TikTok não entra no jogo.** Não há como subir um
   asset por presente do catálogo, e o catálogo muda a cada live.
2. **A metade de cima da tela é a CAM.** O jogo não desenha ali — é a captura
   da webcam, composta no OBS.
3. **Ranking por nome é dado de espectador.** Ele só pode existir em memória
   da ponte, por sessão, e some no Stop (11_SEGURANCA, camada 4). Mandá-lo ao
   Roblox seria mais uma cópia, num lugar que a ponte não controla.

E a ponte já tem tudo o que o layout mostra, ou quase: presente com nome,
moedas e rajada (`evento-presente.schema.json`), as somas do combate (ADR-012),
o preset com os slots, a posição na torre pelo `estado`.

## Decisão

**O HUD da live é uma segunda página de overlay, `/overlay/hud`, servida pela
ponte na porta do painel e alimentada pelo mesmo SSE. A ponte agrega; a página
só desenha.**

- **`dominio/hud.mjs` agrega em memória, por sessão:** total de moedas, moedas
  por doador (ranking), maior rajada (`topCombo`), maior valor unitário
  (`topPresente`) e a disputa `subida × descida` da rodada. Tudo caminho FRIO,
  chamado depois que o long-poll já respondeu. Nasce em `iniciarSessao`, morre
  em `encerrarSessao`, nunca toca disco.
- **Conta TODO presente, mapeado ou não.** O ranking é sobre quem pagou, não
  sobre o que o preset aproveitou. Presente sem nome (sanitizado até sumir)
  conta no total e não conta no ranking.
- **A disputa é da RODADA; o resto é da sessão.** Combate entra pelas duas
  somas brutas (a barra é sobre quanto cada lado brigou; o líquido já está na
  torre), presente solto entra pelo sinal do delta, empate exato entra também.
  `registrarFimDeRodada` zera a disputa e deixa o ranking.
- **O SSE ganha o evento `hud`,** publicado a cada mudança e entregue de cara
  a quem assina — o overlay abre no meio da live e precisa do ranking que já
  existe. `GET /api/hud` entrega a legenda (slots do preset ativo com nome,
  ícone e delta — os marcados para o overlay, ver a nota de 2026-09-04); a
  página busca ao abrir e quando `estado.presetId` muda (R7).
- **A barra da torre vem do `estado`** (`plataformaAtual`/`totalPlataformas`).
  O jogo já desenha o número da plataforma no topo do HUD dele; a barra do
  overlay é a vertical da referência, e `?barra=nao` a esconde para quem
  prefere só a do jogo.
- **Ícones vêm da CDN da TikTok** (`iconeUrl` do catálogo), como no painel. Sem
  ícone, a página mostra o nome do presente — nunca fica em branco.
- **As cores vêm de `data/tokens.json`,** injetadas na página por
  `repos/tokens.mjs`. O bloco `hud` dos tokens passa a ser do jogo E do
  overlay: são o mesmo HUD, visto de dois lugares.
- **Os vídeos das cutscenes saem de `/overlay/:id` para `/overlay/video/:id`.**
  Com duas páginas debaixo de `/overlay`, um id de cutscene não pode roubar o
  nome de uma página.

## Alternativas consideradas

**Desenhar tudo no HUD do Roblox.** Não alcança a cam, não tem os ícones, e
levaria o ranking por nome para fora da ponte. A referência do dono é
claramente um overlay de OBS por cima da captura.

**Uma ferramenta de terceiros (TikFinity, StreamElements).** É o que o CTFps7
usa. Custa assinatura ou tem marca d'água, e principalmente: ela não sabe da
torre, dos slots nem da disputa — os widgets que fazem o layout ser DESTE jogo
teriam que vir da ponte de qualquer jeito. Regra de custo do CLAUDE.md.

**Calcular os agregados na página, a partir dos eventos `presente`.** A página
abriria vazia no meio da live, perderia tudo a cada reconexão do EventSource,
e o `presente` do SSE só traz o que foi despachado — o não mapeado, que conta
no ranking, vem por outro evento. Quem tem o dado inteiro é a ponte.

**Guardar o ranking no arquivo da sessão, para o histórico.** Não. É nickname
ao lado de valor, persistido: exatamente o que a camada 4 proíbe. O resumo
gravado continua agregado e sem pessoa.

## Consequências

- Uma rota nova na porta do painel (`/api/hud`), que nunca sai da máquina.
  Nada na superfície pública mudou.
- O `estado` não mudou. O evento `hud` é separado, e quem não o conhece ignora.
- O agregado é publicado inteiro a cada presente. É pequeno (três nomes e
  meia dúzia de números); se a live crescer a ponto de pesar, o passo seguinte
  é throttle na publicação, não mudar o formato.
- A página é ajustada pela URL (`?cam` e `?esticar`; `?meta` e `?barra` saíram
  com o pote e com a barra da torre) e não
  pelo painel: a proporção da cam é da CENA, não do preset, e mora junto dela.
- A página não confia na proporção da janela. A fonte "Link" do TikTok LIVE
  Studio renderiza em 16:9 e o item é esticado para a cena 9:16 — na primeira
  captura do dono o pote saiu 3× mais alto que largo. A página monta um palco
  9:16 pela altura da janela e, se a janela for mais larga, pré-estica em X
  na mesma razão, para o estique da fonte devolver a proporção. Em fonte 9:16
  o fator é 1 e nada muda. Ver 02_DESIGN_SYSTEM, seção C.
- Nada crítico nos 15% inferiores da tela (02_DESIGN_SYSTEM, seção B): a barra
  da torre para em 20% do fundo e a legenda fica no topo do jogo.

## Nota de 2026-09-04 — o overlay virou o ÚNICO HUD, e perdeu os doadores

Três mudanças pedidas pelo dono depois de ver o overlay em cima da live.

### O HUD de dentro do jogo foi apagado
`game/src/client/hud.client.lua` não existe mais. Dois HUDs desenhavam as
mesmas coisas — o número da plataforma, o placar — e batiam um no outro na
tela, sem jeito de alinhar: um vive dentro da captura do Roblox e o outro por
cima dela. O que o jogo mostrava mudou de casa:

| Era do jogo | Agora |
|---|---|
| número da plataforma | barra da torre — que DEPOIS voltou para o jogo, ver abaixo |
| placar V/D | canto superior esquerdo da área do jogo |
| barra do portal | rodapé à esquerda, vinda do `estado` |
| contagem regressiva | centro, vinda do `estado` |
| presente que chegou | meio à esquerda, pelo SSE `presente` |
| selo de vitória | o resultado no centro, junto da contagem |

Para isso, `POST /jogo/estado` ganhou `portal` e `contagem`, e o jogo passou a
empurrar o estado fora do intervalo de 2s quando uma rodada encerra e quando o
portal apanha. Cinco RemoteEvents que só alimentavam o HUD — `PRESENTE`,
`COMBATE_ANULADO`, `VITORIA`, `RODADA_ENCERRADA` e `PORTAL` — saíram do
contrato: RemoteEvent que ninguém escuta é feature morta sem erro nenhum, e há
teste cobrando os dois lados de cada um.

### Nada de doador, nada de moeda
Ranking dos três maiores, pote de moedas, `TOP COMBO` e `TOP PRESENTE` foram
removidos. A razão é do dono e é de negócio: exibir quem pagou e quanto pode
render restrição na live. Ficou o que fala do PRESENTE — a legenda com o que
cada um faz com a torre — e a disputa da rodada.

O efeito colateral é bom: `dominio/hud.mjs` era o único lugar da ponte que
ACUMULAVA nickname de espectador. Não é mais (11_SEGURANCA, camada 4).

### Aviso de seguidor
`WebcastEvent.FOLLOW` entrou no adaptador da TikTok e vira o evento SSE
`seguidor`, que o overlay mostra no canto inferior direito: *"fulano se tornou
um vilão"*. Não é presente: não tem moeda, não casa com slot, não move a torre,
não entra na sessão e não toca disco. O nome é sanitizado como o do doador,
aparece por seis segundos e some. Se a versão da lib não expuser o evento, a
live sobe do mesmo jeito — perder o aviso não pode impedir a sessão de começar.

### A barra da torre voltou para dentro do jogo
Ela foi para o overlay junto com o resto e voltou no mesmo dia, por decisão do
dono: *"o bar que conta os blocos subidos tu tem que por dentro do jogo pra ela
contabilizar"*. O motivo é de contagem, não de gosto. No overlay a barra só anda
quando um estado chega da ponte, e o estado sai no máximo a cada 2s
(`THROTTLE_ESTADO`): o streamer sobe três degraus no parkour e a barra fica
parada, até pular três de uma vez. Dentro do jogo ela ouve o mesmo
`Eventos.ESTADO` que o servidor publica a CADA toque de plataforma, e o número
anda no degrau — que é o que faz o espectador entender que a escalada conta.

Mora em `game/src/client/torre.client.lua`, e é o único HUD que sobrou no jogo.
O `?barra=nao` do overlay saiu junto.

### E o layout deixou de depender do `?cam=`
Nada mais é desenhado sobre a cam. A proporção dela muda de cena para cena, e um
`?cam=` errado punha o `TOP COMBO` e a barra `VS` em cima do rosto do streamer —
foi o que aconteceu com `cam=43` numa cena de ~33%. Com tudo na área do jogo,
errar o parâmetro desloca o conjunto e nunca cobre a pessoa. O `?meta=` saiu
junto com o pote.

## Nota de 2026-09-04 — a legenda deixou de ser "os seis"

`GET /api/hud` entregava os slots do preset ativo, e "os slots" queria dizer
seis: era o teto do contrato. O preset passou a poder ter até 24 (ADR-007, R1),
e a rota passa a entregar **só os slots marcados para o overlay** —
`mostrarNoOverlay !== false`, com o ausente valendo como marcado, para que
nenhum preset já salvo perca a legenda ao ser regravado.

O filtro não é conveniência de tela, é o que torna o crescimento possível. A
legenda é uma faixa no topo da área do jogo, num palco 9:16, com positivos à
esquerda e negativos à direita: ela foi desenhada para meia dúzia de ícones.
Vinte e quatro ali não encolhem, transbordam — descem por cima do boneco, que é
justamente o que o espectador precisa ver. Com a marcação por slot, o streamer
cadastra o presente número 15 sem que ninguém redesenhe o overlay, e escolhe
quais deles a plateia lê na tela.

O presente fora da legenda **continua inteiro no jogo**: casa com o slot, toca a
animação, entra no combate e move a torre. Some da tela, não da mecânica. Quem
faz o filtro é `legendaDoPreset` em `dominio/hud.mjs`, e a ordenação por `|delta|`
não mudou — filtrar antes de ordenar não reordena o que sobra.

## Nota de 2026-09-04 — o layout do overlay virou coisa do streamer (Estúdio de Overlay)

Pedido do dono, depois de ver o overlay em cima da live e só conseguir mover a
fonte inteira dentro da cena: *"você poderia criar um overlay studio, pra gente
conseguir customizar o overlay como se ele fosse um canva, mexendo e
posicionando cada elemento na tela"*.

Até aqui o layout do overlay era CSS. Mudar onde o placar fica era editar
`bridge/src/http/overlay-hud.mjs` — e cada cena de cada streamer quer o seu
canto livre, porque o que sobra de espaço na tela depende da webcam, da moldura
e do que o TikTok sobrepõe.

### O arquivo guarda só a exceção
`data/overlay-layout.json`, atrás de `repos/overlay.mjs` (ADR-003), no formato de
`overlay-layout.schema.json`: `streamerId`, `atualizadoEm` e um mapa `elementos`
com no máximo os oito ids que a página desenha — `placar`, `vs`,
`legendaSubida`, `legendaDescida`, `portal`, `presente`, `centro` e `seguidor`.

**Elemento ausente quer dizer "onde a página já o desenha".** É a mesma escolha
do ADR-016: a regra mora no código, o disco guarda só o que o streamer mexeu.
Arquivo ausente devolve layout vazio e nunca erro, então quem nunca abriu o
Estúdio vê a tela de hoje inteira — e continua vendo se o CSS da página evoluir,
o que um arquivo com os oito elementos congelados não permitiria.

### As coordenadas são do PALCO, e o `y` é convertido pelo cam real
`x` e `y` são porcentagem do palco 9:16 inteiro — o retângulo que vai ao ar —,
medidos do canto superior esquerdo do elemento; `escala` vai de 0,5 a 2 e
`visivel` esconde sem apagar o ajuste.

Os elementos vivem dentro de `.jogo`, que começa em `var(--cam)`, então a página
desconta o topo da cam ao aplicar o `y`. É por isso que trocar o `?cam=` **não
arrasta o layout salvo**: a caixa fica no ponto da TELA em que o streamer a
largou, que é o ponto que ele viu no Estúdio. O preço é o inverso, e é
declarado: uma cam maior pode alcançar uma caixa que estava logo abaixo da
antiga. Por isso o Estúdio sombreia a faixa da cam e avisa quem a invade — sobre
a cam não se desenha nada continua valendo (02_DESIGN_SYSTEM, seção C).

### O catálogo dos elementos mora na PONTE
`dominio/overlay-layout.mjs` guarda os oito, com id, rótulo legível, posição
padrão, tamanho e âncora, e `GET /api/overlay/layout` os entrega junto do layout
salvo. **O painel não escreve nenhum número de geometria do overlay** — ele
desenha o que a rota devolve. A razão é que a posição padrão é o CSS da página,
e a página é da ponte: catálogo no painel seria a geometria do overlay morando
onde ninguém a vê mudar.

Catálogo e CSS continuam sendo duas escritas dos mesmos números, e é o risco
real desta nota. O antídoto é um teste-espelho na ponte, que cruza os ids do
catálogo com os `data-el` do HTML e os `x`/`y` com os `calc(N * var(--u))` do
CSS. Divergir tem que quebrar o gate, não a live.

### O SSE ganhou o evento `layout`
Publicado ao salvar e entregue de cara a quem assina, como o `hud` e o `estado`.
Sem ele, ajustar a tela custaria recarregar a fonte no OBS no meio da
transmissão — e recarregar a fonte é a tela do espectador piscando a cada
tentativa, que é exatamente o momento em que o streamer está tentando acertar o
enquadramento. Com ele, arrastar no painel e salvar move a caixa na tela que já
está no ar. Voltar ao padrão vale ao vivo pelo mesmo caminho: a página limpa o
inline antes de aplicar, então elemento que saiu do arquivo volta ao CSS sem
ninguém recarregar nada.

### Alternativas consideradas

**Arrastar dentro do próprio overlay.** É o gesto óbvio: a página já está na
tela. Descartado por três motivos, e o terceiro decide — a Browser Source do OBS
não entrega ponteiro por padrão; o streamer estaria editando exatamente o que
está no ar, com o erro visível para a plateia; e é o que a seção final deste ADR
proíbe desde o primeiro dia. O overlay desenha, o painel comanda.

**Gravar os oito elementos sempre, com o padrão preenchido.** "O que se vê é o
que se salva" é mais fácil de ler no disco. Descartado: o arquivo congelaria o
CSS do dia em que foi gravado, e todo ajuste futuro na página passaria por cima
de quem nunca pediu nada — o oposto da promessa desta nota.

**Deixar o layout no `?parametro=` da URL, como o `?cam=`.** Já existe o
precedente. Descartado: `?cam=` é UM número da cena, e isto são oito caixas com
quatro campos cada. URL de fonte não se edita durante a live, e um ajuste fino
é dezenas de idas e voltas.

### Consequências

- **Nada disso encosta no caminho crítico.** Salvar layout é clique no painel,
  caminho frio; o `aoEventoDaLive` não sabe que este arquivo existe.
- **Mover um elemento pode trocar a âncora dele.** `legendaDescida`, `portal` e
  `seguidor` nascem colados à direita ou à base; ao receberem `x`/`y` passam a
  ser ancorados pela esquerda e pelo topo, e dão um pulo no primeiro arrastar,
  do tamanho da diferença entre a largura real do conteúdo e a do catálogo.
  Documentado no 02_DESIGN_SYSTEM e visível na hora, no próprio Estúdio.
- **O que o SSE serve é a memória; o que o GET lê é o disco.** Editar
  `data/overlay-layout.json` à mão com a ponte de pé deixa os dois divergentes
  até o próximo PUT. Aceito: editar o arquivo à mão não é o fluxo, e o Estúdio
  é.
- O `estado` não mudou, o `hud` não mudou, e quem não conhece o evento `layout`
  o ignora — como já acontece com os outros.

## O que isto NÃO autoriza

O overlay não vira painel de controle nem segunda tela do jogo. Ele mostra o
que a ponte já sabe; não recebe clique, não manda comando, não decide nada.
Presente que precisa de espetáculo continua sendo animação no jogo, com delta.

O Estúdio de Overlay não abre exceção a isso. Quem edita o layout é o PAINEL; a
página do overlay recebe o resultado pelo SSE e desenha, como faz com tudo o
mais. Se a tentação um dia for deixar o streamer arrastar a caixa na própria
fonte do OBS, a resposta está escrita aqui desde o primeiro dia: o overlay não
recebe clique.
