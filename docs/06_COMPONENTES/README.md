# 06 — Componentes (painel)

Um componente por arquivo, CSS separado, sem lógica de acesso a dado dentro do
componente. Toda chamada de rede passa por `panel/src/lib/api.js`.

| Componente | Papel | Estado que recebe |
|---|---|---|
| `ControleDaPartida` | Reiniciar, zerar placar e recarregar mapa, com a sessão de pé | estado do jogo |
| `ContaDaLive` | O @ do TikTok: define em qual live a sessão vai rodar | configuração |
| `NavegacaoDePaginas` | Troca entre as 3 páginas do painel, com contador de problemas | página atual |
| `BarraDeSessao` | Start/stop, estado da live e do jogo, cronômetro | estado do SSE |
| `SeletorModalidade` | Escolhe a modalidade (Fase 1: só Escalada) | lista de modalidades |
| `EditorDePlacar` | Presentes que contam vitória ou derrota, e a vida do portal | preset, catálogo |
| `EditorDePreset` | Container dos 6 slots, salva o preset | preset |
| `CartaoDeSlot` | Um slot: presente, animação, delta, intensidade | slot, catálogo, animações |
| `SeletorDePresente` | Modal com busca, ícone oficial, cor de faixa | catálogo |
| `SeletorDeAnimacao` | Modal com filtro por direção e peso visual | animações |
| `AvisoDeCurva` | Aviso não bloqueante de vínculo fora do esperado | slot |
| `SeletorDeLook` | Lista looks salvos com grade de ícones das peças | looks |
| `SeletorDeMundo` | Monta o mundo escolhendo céu, plataformas e formato, com a foto de cada peça | acervo, mapa |
| `PreviaDeMapa` | Mostra paleta, altura, densidade do spec gerado | mapa |
| `MonitorAoVivo` | Últimos eventos, latência medida, não mapeados | fluxo do SSE |
| `TestadorDePresente` | Dispara presente à mão, um ou vários juntos | preset, catálogo |
| `TestadorDeAnimacao` | Um botão por animação, dispara direto no jogo sem preset | animações, estado do jogo |
| `BotaoAbrirJogo` | Monta o jogo com a ponte já configurada e abre no Studio | — |
| `GaleriaDeSkins` | Nicks do Roblox que o vestiário veste, com miniatura antes de salvar | configuração |
| `PainelDeLogs` | O que a ponte e o painel registraram, para quando algo falha | fluxo do SSE |
| `AvisoDeVitoria` | R6 — chegou ao topo, e o botão de reiniciar a corrida | estado do SSE |
| `ResumoDaLive` | O resumo agregado de uma live (F5.5). Serve o Stop e o histórico | sessão encerrada |
| `HistoricoDeSessoes` | As lives passadas, uma linha por sessão | lista de `/api/sessoes` |
| `GerenciadorDePresets` | Criar, duplicar e apagar preset | presets |
| `PainelDeAcervo` | A galeria do acervo: foto, tags, status e assetId de cada peça, e o botão que desenha e sobe o que falta (ADR-004) | acervo |
| `PainelDeOverlay` | A URL do overlay para colar no OBS, e se as cutscenes estão no disco | `/api/overlay` |

## Regras
- `CartaoDeSlot` é o componente mais importante do produto. Ele precisa mostrar
  presente, animação, delta e intensidade **de uma olhada só**, sem abrir nada.
- Estado de carregando, erro e vazio são obrigatórios em todo componente que
  busca dado. Nada de tela em branco.
- Nenhum componente conhece caminho de arquivo nem formato de resposta cru.
- Nenhum componente monta prompt de IA. Isso vive na ponte (ver `10_PROMPTS`).
- A **conta da live** (`ContaDaLive`) mora em "Configurar" e é o primeiro bloco
  da página: é o único campo sem o qual a sessão não inicia. Antes de existir,
  o @ vivia só no `.env`, e o valor de fábrica `seu_usuario_sem_arroba` passava
  pela guarda de "não vazio" — a ponte tentava conectar numa conta inexistente e
  o erro que aparecia era do TikTok, não do produto. O `.env` continua valendo
  como semente para quem já o tinha preenchido.
- A **galeria de skins** (`GaleriaDeSkins`) mora em "Jogo", perto do botão do
  Studio: é o par do vestiário, e se cura na mesma sessão em que se testa. A
  miniatura não é enfeite — o Roblox não tem "código de avatar", o nick é a
  única chave, e a busca por palavra-chave é fechada para chamada sem
  autenticação. Sem ver a imagem, o streamer salva às cegas e só descobre o que
  veio quando o boneco veste. A lista vai INTEIRA no PUT, nunca em diff: a
  ponte é dona da normalização (tira arroba, remove duplicata) e a tela não
  precisa adivinhar como ficou.
- **Escolher o mapa já manda o jogo reerguer a torre.** O jogo pede
  `/jogo/mapa` UMA vez, ao subir a sessão: gravar o preset com outro mapa
  mudava a resposta da rota e não chegava à tela, com a torre antiga de pé e
  tudo parecendo certo do lado da ponte. Salvar o preset ATIVO com outro
  `mapaId` emite `recarregar-mapa` sozinho (ADR-013); o botão em
  `ControleDaPartida` continua valendo para o caso do mapa ter sido regerado
  com o mesmo id.
- **"Gerar e subir o que falta"** (`PainelDeAcervo`) é o que tira o acervo do
  papel. Encher os doze itens na mão eram doze idas ao site do Roblox — criar a
  arte, subir, esperar, achar o número, colar — e onze ficavam para trás, com
  todo mapa saindo igual. A ponte desenha a imagem em código a partir das tags,
  sobe pelo Open Cloud e anota o assetId. A moderação continua sendo do Roblox:
  o item entra `em-moderacao`, e clicar de novo reconsulta sem subir duas vezes.
- **`SeletorDeMundo` substituiu o gerador por texto.** Descrever o ambiente e
  deixar o modelo escolher sempre foi um atalho, e o custo era não saber o que
  ia sair: todo mapa com o mesmo céu enquanto o acervo tinha um só, plataformas
  todas verdes porque o mapa só aceitava uma textura, formato errado porque a
  palavra "passarela" não chegava até a regra. Com a galeria mostrando a foto de
  cada peça, escolher olhando ganha em tudo que importa — é instantâneo, não
  gasta chamada de IA, não falha por spec inválido, e o streamer vê o que está
  montando. A rota do Gemini continua na ponte para quem quiser voltar a ela.
- **O formato é uma das escolhas da montagem.** "Escada" são degraus separados
  com vão para pular, pelo perímetro de um quadrado; "Passarela" são os MESMOS
  degraus colados um no outro, em rampa reta, sem pulo. As regras numéricas dos
  dois são opostas (ADR-009) — o mundo nasce com o formato dentro.
- **A foto de cada peça do acervo** vem da ponte (`/api/acervo/imagem/...`),
  desenhada sob demanda em 128px. Não é arquivo em disco de propósito: a imagem
  é determinística a partir do id e das tags, então gerar é mais simples que
  guardar, e não existe cache para invalidar quando as tags mudam. Sem ela,
  escolher entre `textura_pedra_musgo` e `textura_areia_compacta` era ler
  etiqueta e torcer — e como as texturas são desenhadas em código, não há nem
  arquivo para abrir e conferir.
- **A forma do degrau é da PEÇA, não do mapa.** Ela mora no acervo ao lado da
  imagem que veste: `anel`, `disco`, `hexagono`, `tabuas`, `placa` ou `bloco`,
  montadas com primitivas do Roblox — nada de mesh (que é asset para subir) nem
  de union em tempo de execução (que derrubaria o carregamento de mil degraus).
  O furo da rosquinha é **desenho, não armadilha**: uma base invisível e sólida
  o preenche, porque o que muda entre uma plataforma e outra é a foto, não a
  dificuldade. Peça que derruba o jogador faria escolher textura virar escolha
  de jogabilidade.
- O painel tem 5 páginas: **Ao vivo** (6 slots, monitor, testador), **Configurar**
  (conta, presets, modalidade, look, mapa, prévia e acervo), **Jogo** (abrir no
  Studio e testar as 20 animações), **Histórico** (lives passadas) e **Log**.
  "Ao vivo" é a de abertura, e é
  inegociável que ela carregue os 6 slots: o 02_DESIGN_SYSTEM exige os seis lado
  a lado e sempre visíveis. O que foi para "Configurar" é o que já era pré-live
  e trava com a sessão rodando, então sair da tela principal não custa nada.
  "Histórico" é a única página que olha para trás, e por isso fica longe de
  "Ao vivo": nada nela serve durante a transmissão.
- **`AvisoDeVitoria` é a única coisa que pode empurrar os 6 slots para baixo**,
  e só enquanto durar a decisão que o jogo está esperando (R6). É também o
  único aviso do painel sem tempo de tela: ele fica até o streamer reiniciar,
  porque é exatamente essa a regra — chegar no topo não recomeça sozinho.
- `ResumoDaLive` é montado por duas páginas com o mesmo objeto: pelo "Ao vivo"
  logo depois do Stop (F5.5), e pelo "Histórico" sobre uma live passada. O
  resumo é o mesmo venha ele da resposta do Stop ou do arquivo em disco, e
  duplicar o componente seria deixar as duas leituras divergirem.
- `PainelDeAcervo` fica colado na `PreviaDeMapa`: quando ela diz "ainda não
  pode ir ao ar", é ali embaixo que está o motivo e o conserto (ADR-004).
- `TestadorDeAnimacao` e `TestadorDePresente` respondem perguntas DIFERENTES e
  por isso não se fundem: o de presente testa o CAMINHO (casa com slot, entra em
  combate, sai pelo long-poll) e exige sessão; o de animação testa o DESTINO e
  não exige sessão, preset nem live. Exigir configuração antes de "essa animação
  toca?" é o que faz ninguém testar.
- `SeletorDeLook` **não** tenta renderizar o boneco montado. Prévia de corpo
  inteiro só existe no vestiário dentro do jogo. Ver ADR-011.
- `TestadorDePresente` dispara pelo **mesmo caminho** de um presente de verdade:
  casamento com slot (R1), combo (R4), combate (ADR-012), long-poll e SSE.
  Testador com atalho provaria que o atalho funciona, e é justamente a fiação
  que costuma estar errada. Dois ou mais presentes no mesmo disparo chegam no
  mesmo instante, que é como se testa o combate sem depender de dois
  espectadores clicarem juntos.
- O testador é **âmbar e diz que não é a live**, pelo mesmo motivo que o Start
  em modo fixture: teste nunca pode se parecer com produção numa tela que
  controla uma transmissão ao vivo.
- `PainelDeOverlay` existe porque a cutscene falha **calada**: sem o arquivo,
  o OBS mostra um retângulo transparente e nada reclama. A aba diz se o vídeo
  está no disco ANTES da live, que é o único momento em que dá para resolver.

- `PainelDeLogs` é a **única tela do painel feita para ler**, e não para olhar
  de canto de olho: o streamer só vem aqui depois que algo falhou, e nesse
  momento ele já parou de jogar. Por isso ela pode ter densidade de texto e
  fonte monoespaçada, ao contrário do resto.
- Ele mistura log da ponte (pelo SSE) com log do próprio painel. Os dois
  precisam existir porque a falha mais provável é a ponte cair — e aí o SSE cai
  junto, e o log dela para de chegar exatamente quando seria mais útil.
