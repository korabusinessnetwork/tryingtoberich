# Decisões — Kora Stream Games

> Índice rápido. O registro completo de cada decisão está em `docs/08_DECISOES/`.

| ADR | Decisão | Status | Data |
|---|---|---|---|
| ADR-001 | Roblox como motor do jogo, e não engine web | Aceito | 2026-09-01 |
| ADR-002 | Ponte por long-poll com túnel Cloudflare | Aceito | 2026-09-01 |
| ADR-003 | JSON em disco atrás de camada de repositório | Aceito | 2026-09-01 |
| ADR-004 | Gemini gera layout e escolhe asset, nunca cria asset | Aceito | 2026-09-01 |
| ADR-005 | Movimento híbrido: física para o jogador, Tween para o presente | Aceito | 2026-09-01 |
| ADR-006 | tiktok-live-connector não oficial, com risco assumido | Aceito | 2026-09-01 |
| ADR-007 | Seis slots com vínculo livre presente↔animação. Emendado em 2026-09-04: seis é o PADRÃO, o teto é 24, e cada slot decide se entra na legenda do overlay | Aceito | 2026-09-01 |
| ADR-008 | Checkpoint na última plataforma, queda natural sem punição | Aceito | 2026-09-01 |
| ADR-009 | Mapa 100% escalável sem presente (anti live robotizada) | Aceito | 2026-09-01 |
| ADR-010 | Personagem por composição gratuita, roupa paga adiada | Aceito | 2026-09-01 |
| ADR-011 | Vestiário híbrido: monta no jogo, escolhe no painel | Aceito | 2026-09-01 |
| ADR-012 | Combate de presentes: subidas e descidas se anulam, anda o líquido | Aceito | 2026-09-01 |
| ADR-013 | Ordem do painel para o jogo pelo mesmo long-poll | Aceito | 2026-09-02 |
| ADR-014 | Cutscene de fim de rodada no overlay do OBS, escolhida no preset; a pasta é a lista | Aceito | 2026-09-03 |
| ADR-015 | HUD da live no overlay do OBS, agregado em memória pela ponte. Nota de 2026-09-04: virou o ÚNICO HUD (o do jogo foi apagado), perdeu ranking e moedas por risco de restrição, e ganhou o aviso de seguidor. Nota de 2026-09-04: o layout de cada elemento virou do streamer, pelo Estúdio de Overlay | Aceito | 2026-09-03 |
| ADR-016 | Todo presente move a torre: tabela `moedas × 10` no preset, com exceções à mão; os slots vencem a tabela | Aceito | 2026-09-04 |

## Resolvidas no Bloco 2
- **Como o HUD mostra o combate (ADR-012).** Disputa contestada: o painel
  lateral mostra o líquido grande e ganha etiqueta `DISPUTA` com as duas somas,
  resultado primeiro e motivo depois, 4s em vez de 3s. Empate exato: selo
  `EMPATE` dourado espelhado nas duas laterais, com pop de escala.
  O motivo do segundo é o que não era óbvio: `COMBATE_ANULADO` chega **sem
  nenhum `PRESENTE` junto**, porque delta 0 não existe no contrato. Sem
  tratamento dedicado, a tela fica muda no exato momento em que mais gente
  mandou presente ao mesmo tempo, e isso lê como travamento.

## Resolvidas em 2026-09-04
- **O 6 deixou de ser teto (emenda ao ADR-007 e à R1.2).** A R1.2 proibia passar
  de 6 "sem decisão explícita do dono"; ela veio: *"por padrão a gente usa 6
  presentes, mas eu gostaria de colocar um botão para o usuário poder adicionar
  mais presentes e definir o que cada um deles vai fazer, e decidir se vai ir pro
  overlay ou não"*. Padrão 6, teto 24. O argumento que segurava o 6 continua de
  pé e virou a razão do PADRÃO, não da proibição: o app da TikTok só mostra seis
  desejos, e slot que o espectador não vê quase não dispara.

  Três consequências que passam a valer em todo lugar:

  - **A grade do editor é fixa em seis colunas.** Os seis primeiros nunca
    refluem — é a regra literal do `02_DESIGN_SYSTEM` seção A —, os extras caem
    em linhas abaixo. `auto-fill` ali quebra a tela principal, e só na live.
  - **Cada slot tem `mostrarNoOverlay`, e ausente quer dizer que aparece.** Sem
    isso, abrir um preset antigo e salvar sem tocar em nada apagaria a legenda
    do overlay em silêncio. O filtro existe porque a legenda é uma faixa para
    meia dúzia de ícones num palco 9:16: 24 ali cobrem o boneco. Fora da
    legenda, o presente continua valendo no jogo.
  - **A unicidade de `posicao` saiu do JSON Schema e virou regra cruzada.** O
    schema a garantia com um bloco por posição, e 24 daqueles ninguém manteria.
    Agora ela mora em `dominio/regras.mjs`, ao lado da de `presenteId`, e recusa
    com `posicao_repetida` antes do disco. Garantia que muda de lugar é garantia
    que pode sumir na mudança: quem tirar o teste da regra cruzada fica sem
    nenhuma.

  Renumerar os extras ao remover um do meio foi descartado: a `posicao` viaja
  para `sessao.eventos` e para `presentesPorSlot`, e renumerar durante a live
  reescreveria a que slot um evento já gravado se refere. Remover o slot 8 de
  [7,8,9] deixa um cartão vazio, que é R1.3 e é válido.

- **O layout do overlay virou dado do streamer (Estúdio de Overlay, ADR-015).**
  Pedido do dono: *"você poderia criar um overlay studio, pra gente conseguir
  customizar o overlay como se ele fosse um canva, mexendo e posicionando cada
  elemento na tela"*. Quatro escolhas, e as quatro têm o mesmo motivo por trás —
  ninguém pode acordar com a tela mexida sem ter pedido:

  - **O arquivo guarda só a exceção** (`data/overlay-layout.json`), como o
    ADR-016 guarda as do movimento. Elemento ausente é a posição do CSS, então
    quem nunca abriu o Estúdio tem a tela de hoje e continua acompanhando as
    melhorias da página. Gravar os oito congelaria o CSS do dia da gravação.
  - **O catálogo dos elementos mora na PONTE**, e sai na rota junto do layout: a
    posição padrão É o CSS do overlay, e o overlay é da ponte. Se ela morasse no
    painel, seriam duas cópias dos mesmos números e só uma com teste olhando —
    por isso a ponte tem um teste-espelho cruzando catálogo, `data-el` e os
    `calc(N * var(--u))` do CSS.
  - **`x` e `y` são do PALCO, não da área do jogo.** O streamer posiciona
    olhando a tela que vai ao ar, e é o ponto da tela que ele quer. A página
    desconta o topo da cam ao aplicar o `y`, então trocar o `?cam=` não arrasta
    o que foi salvo — em troca, uma cam maior pode alcançar uma caixa, e por
    isso o Estúdio sombreia a faixa da cam e avisa quem a invade.
  - **O SSE ganhou o evento `layout`**, entregue de cara a quem assina. Sem ele,
    acertar o enquadramento custaria recarregar a fonte no OBS no meio da live,
    com a tela do espectador piscando a cada tentativa.

## Resolvidas em 2026-09-09 — a camada de produto

O `docs/00_VISAO/plano-de-produto.md` entrou no repositório e abriu a série P de
ADRs. Seis decisões, cinco fechadas.

- **O motor do produto continua Roblox (ADR-P01).** O plano recomendava
  reescrever em web pela distribuição. Decisão do dono: manter. A checagem
  mostrou que os três argumentos da reescrita não se sustentavam — o principal
  deles, "cada cliente precisaria do próprio place", é verdadeiro e é
  justamente o desenho pretendido.
- **O cliente roda no Roblox Studio dele (ADR-P04).** Palavras do dono: "vai
  fazer as mesmas coisas que já fazemos hoje, só vai ser gourmetizado". O
  produto é a topologia atual empacotada com instalador, não uma arquitetura
  nova. Consequência: a licença é checada na **ponte**, nunca no Luau, que o
  cliente pode editar.
- **Supabase entra, sem revogar o ADR-003 (ADR-P02).** A divisão é por dono do
  dado: o que é da Kora (conta, licença, telemetria, log) vai para o banco; o
  que é do streamer (preset, mapa, look, estado da partida) fica em JSON na
  máquina dele. **Nenhuma chamada ao Supabase no caminho crítico do presente** —
  licença validada uma vez no start, telemetria fire-and-forget.
- **i18n é o primeiro commit da Fase 1 (ADR-P03).** O plano dizia "nasce com
  chave, nunca depois", mas o código já existe: ~570 strings em português
  cravadas em 28 componentes. O primeiro commit da fase **é** o retrofit.
- **O console v1 tem seis itens e mais nenhum (ADR-P05).** É a mitigação do
  risco 4 do próprio plano: console cresce sozinho e atrasa a receita.

### O que a checagem derrubou no plano original
Registrado porque o padrão vale para o próximo plano que chegar pronto: **três
dos cinco erros eram argumentos a favor de jogar fora o trabalho existente.**

1. "Cada cliente precisaria do próprio place" — é o desenho, não o defeito.
2. "Manter Roblox significa abrir mão da telemetria de produto" — falso, o funil
   de setup vive no painel, que é React nos dois cenários.
3. "Custo da API gerenciada define o preço mínimo" — o custo é US$ 0, e a
   cobrança é por conexão simultânea, não por assinante.
4. "Risco do TikTok mitigado pela API gerenciada" — mitiga a quebra técnica, não
   os termos. Virou o ADR-P06.
5. A aritmética da meta não fechava (US$ 3.030, não US$ 2.100).

## Resolvida em 2026-09-10 — como o produto chega na máquina do cliente

- **Portátil primeiro, instalador depois (ADR-P07).** Pedido do dono: "eu
  gostaria que inicialmente, pra gente ir testando, ele fosse um exe portable, e
  depois a gente transicionasse pra um aplicativo instalável". `npm run
  empacotar` produz um `KoraStreamGames.exe` de 94 MB, sem Node e sem terminal
  na máquina do cliente. O instalador do ADR-P04 continua sendo o destino e vai
  empacotar ESTE exe.
  - Feito com o que o Node já traz: `rolldown` funde a ponte num arquivo,
    `node --experimental-sea-config` monta o blob, `postject` cola no `node.exe`.
    As duas ferramentas são MIT e só de desenvolvimento — custo zero.
  - A linha do que fica dentro e do que fica fora é **de quem é o arquivo**.
    Programa (schema, i18n, `game/`, tabela de animações) é reescrito a cada
    arranque para casar com a versão do exe; o que é do streamer (`data/`,
    `.env`) nasce uma vez e nunca mais é tocado. É isso que faz "substitua o exe
    pelo novo" funcionar sem migração.
  - **Painel e ponte viram um processo só** no pacote — o painel construído é
    servido de dentro do exe, na mesma porta da `/api`. Some o CORS e some a
    chance de painel e ponte ficarem em versões diferentes. No repositório nada
    muda: continua Vite em `:5173` encaminhando `/api`.
  - **Assinatura de código adiada.** US$ 200 a 400/ano; o SmartScreen avisa na
    primeira execução e o `LEIA-ME.txt` explica o caminho. Reavaliar quando o
    cliente deixar de ser conhecido. O que deu para fazer de graça foi remover a
    assinatura da Node.js Foundation do binário: assinatura CORROMPIDA é lida
    por antivírus como adulteração, sem assinatura é só o aviso.

## Decisões pendentes

- **ADR-P06: aceitar ou não o risco de uso comercial da captura não oficial.**
  Está escrito, Proposto, aguardando o dono. É o único da série P sem decisão, e
  é o que pode encerrar o produto no mês 3. O ADR-006 já avisava disso em
  2026-09-01. **Ler antes de vender qualquer coisa.**
- **O que fazer com o Estúdio de Overlay não commitado.** Está na árvore, os
  testes passam com ele, e ele não é bloqueador da Fase 0. Terminar e commitar,
  ou guardar num branch — mas decidir antes de rodar no Studio, para não
  confundir bug da escalada com bug de meia feature.
- ~~**Onde a ponte roda na Fase 1**~~ — resolvido em duas partes: ADR-P04 (na
  máquina do cliente) e ADR-P07 (painel e ponte são um processo só no pacote,
  dois no repositório).
- **O túnel é mesmo necessário?** O jogo roda no Roblox Studio, na mesma máquina
  que a ponte. A restrição de `localhost` que justifica o ADR-002 nunca foi
  testada no Studio. Cinco minutos de teste decidem se o túnel some, junto com a
  única exposição do sistema à internet e um terço do orçamento de latência.

- **Roupa clássica própria (80 Robux por upload).** Adiada por padrão pela regra
  de custo. O campo `roupaCustomizada` já existe no schema. Decisão do dono.
- Formato de captura na live: janela do Roblox recortada no TikTok Studio,
  igual ao fluxo atual do Matheus. Confirmar se o overlay de ranking existente
  convive na mesma cena do OBS.
- Se o painel e a ponte viram um processo só ou continuam separados na Fase 2.

## Decisão pendente aberta em 2026-09-09 (rodada 4)

- **O painel pode dessincronizar `assetId` de `faces.ft` num skybox.**
  `anotarItemDoAcervo` grava `assetId` e **não toca em `faces`**. O schema
  documenta, em texto, que num céu de seis faces o `assetId` "é o da face `ft`,
  que serve de miniatura na galeria e de imagem única para o jogo que só sabe
  pintar uma" — mas nada faz valer.

  Consequência se acontecer: a galeria mostra uma miniatura e o jogo pinta a
  face frontal com outra imagem. Silencioso, e só visível ao vivo.

  Não foi consertado na rodada 4 de propósito: é mudança de comportamento na
  camada de escrita, e a rodada era de verificação (F0-1). **Não está
  acontecendo hoje** — os 10 skybox têm `assetId` igual a `faces.ft`.

  As três saídas, para decidir numa rodada própria:
  1. `anotarItemDoAcervo` passa a atualizar `faces.ft` junto — mas aí editar o
     número pela tela muda uma das seis imagens, o que pode surpreender.
  2. O painel recusa editar `assetId` de item que tem `faces`, e manda editar as
     faces. Mais honesto, e exige tela para as seis.
  3. O `assetId` vira derivado de `faces.ft` quando `faces` existe, e some do
     formulário. Mais simples de garantir, e muda o schema.
