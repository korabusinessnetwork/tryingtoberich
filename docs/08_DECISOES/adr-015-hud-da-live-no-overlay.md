# ADR-015 — O HUD da live vive no overlay do OBS, alimentado pela ponte

- **Status:** aceito
- **Data:** 2026-09-03
- **Contexto:** ADR-014 (cutscene no overlay), ADR-012 (combate), ADR-007
  (seis slots), 11_SEGURANCA camada 4 (LGPD), 02_DESIGN_SYSTEM seção B

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
o preset com os seis slots, a posição na torre pelo `estado`.

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
  ícone e delta); a página busca ao abrir e quando `estado.presetId` muda (R7).
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
- A página é ajustada pela URL (`?cam`, `?meta`, `?barra`, `?esticar`) e não
  pelo painel: a proporção da cam é da CENA, não do preset, e mora junto dela.
- A página não confia na proporção da janela. A fonte "Link" do TikTok LIVE
  Studio renderiza em 16:9 e o item é esticado para a cena 9:16 — na primeira
  captura do dono o pote saiu 3× mais alto que largo. A página monta um palco
  9:16 pela altura da janela e, se a janela for mais larga, pré-estica em X
  na mesma razão, para o estique da fonte devolver a proporção. Em fonte 9:16
  o fator é 1 e nada muda. Ver 02_DESIGN_SYSTEM, seção C.
- Nada crítico nos 15% inferiores da tela (02_DESIGN_SYSTEM, seção B): a barra
  da torre para em 20% do fundo e a legenda fica no topo do jogo.

## O que isto NÃO autoriza

O overlay não vira painel de controle nem segunda tela do jogo. Ele mostra o
que a ponte já sabe; não recebe clique, não manda comando, não decide nada.
Presente que precisa de espetáculo continua sendo animação no jogo, com delta.
