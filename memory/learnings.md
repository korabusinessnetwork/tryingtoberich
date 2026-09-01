# Aprendizados — Kora Stream Games

> Registrar aqui o que só se descobre rodando. Um aprendizado por bloco, com data.

## 2026-09-01 — Referência de mercado analisada
Vídeo de referência (live do criador SAKAY) mostra o formato já validado:
plataformas numeradas, boneco subindo de 162 para 184 em poucos segundos,
formato vertical, painel lateral de presentes com rótulos curtos (+100, WIN,
LIKE, SEGUIR, Inverte WIN) e times HERÓI × VILÃO. Os rótulos são curtos e
grandes porque a live é vista no celular. Aplicar isso ao HUD do jogo.

## 2026-09-01 — Bloco 0: o que os contratos revelaram
- **O acervo é o gargalo real do gerador de mapa, não o Gemini.** Enquanto as
  imagens não estiverem enviadas e aprovadas no Roblox, nenhum mapa pode ir ao
  ar, por mais válido que o spec seja. `npm test` reporta isso explicitamente.
- **Props precisavam sair do código.** O tipo de prop é escolha do modelo dentro
  de lista fechada, igual a skybox e textura. Virou terceira coleção do acervo.
  Ver a nota de implementação no ADR-004.
- **Privacidade cabe no schema.** `additionalProperties: false` no log de sessão
  e no evento normalizado transforma a regra de LGPD em erro de validação em vez
  de disciplina de quem escreve o código. O teste prova que `nomeDoador`,
  `userId` e `profilePictureUrl` são rejeitados no log persistido.
- **A duração da animação e o R11 são a mesma restrição.** O teto de 3,5s da
  biblioteca é o que limita o bloqueio de controle do streamer. Por isso o teto
  está no schema e não só na tabela da biblioteca.

## 2026-09-01 — Bloco 1: o que a implementação corrigiu no desenho
- **A coalescência estava modelada ao contrário.** As fixtures do Bloco 0
  tratavam a janela de 400ms como espera na entrada, o que atrasaria TODO
  presente e gastaria dois terços do orçamento de latência. O R5 sempre disse
  "enquanto uma animação está tocando". Corrigido, e virou o desenho do combate.
- **Filtrar por ip não protege o painel.** O `cloudflared` roda na mesma
  máquina, então requisição vinda do túnel chega como `127.0.0.1` e passa por
  qualquer checagem de origem local. A defesa que funciona é porta separada: o
  painel não está na porta que o túnel publica.
- **A fila de 3 do R5 descartava presente pago.** Foi isso que levou ao ADR-012.
  Regra que joga fora o que o espectador comprou não sobrevive ao primeiro
  contato com o produto.
- **O índice de animações não precisava de uma segunda verdade.** Ele é gerado
  da tabela de `biblioteca-animacoes.md` por `scripts/gerar-animacoes.mjs`, então
  doc, painel e jogo saem da mesma fonte.
- **Privacidade cabe na forma do dado.** O normalizador devolve exatamente os
  sete campos do contrato, e o teste falha se aparecer um oitavo. Descartar
  `user.id` deixou de depender de alguém lembrar.

## 2026-09-01 — Bloco 2: o que 9 agentes em paralelo ensinaram
- **Dono exclusivo por arquivo evita conflito de merge, não evita contrato
  divergente.** Nenhuma das nove entregas colidiu na escrita. Mas o HUD passou
  a escutar um RemoteEvent que a ponte nunca disparava, e a feature ficou morta
  sem erro em lugar nenhum. Paralelismo compra velocidade e cobra síntese.
- **Escrever no subconjunto Lua 5.1 comprou um gate de sintaxe.** Luau é
  superconjunto, então `luac5.1 -p` valida 39 arquivos sem abrir o Studio. Custa
  abrir mão de anotação de tipo; pagou-se sozinho já na primeira leva, e pegou
  um arquivo truncado no meio da escrita de um agente.
- **Regra que nunca foi implementada não é regra.** A parte horizontal do
  ADR-009 estava escrita desde a fundação e ninguém tinha codado. Quando
  codou, o exemplo do próprio doc a violava. Doc sem teste envelhece igual a
  código sem teste.
- **Guarda que não morde é pior que não ter guarda.** Dois testes meus
  passaram vazios por regex preso à forma da chamada. Desde então, todo teste
  de varredura ganha um segundo teste ao lado provando que ele acusa.
- **Instruir o agente a reportar em vez de contornar em silêncio funcionou.**
  As três lacunas do compartilhado (efeito permanente, tokens do painel, flash
  de tela) vieram documentadas no relatório, com o contorno marcado no código.
  Nenhuma teria aparecido se a instrução fosse só "resolva".
- **Ler o módulo do colega antes de escrever evitou dois bugs.** O construtor
  de mapa usou Part tipo Block porque leu que `plataformas.lua` interpreta
  `Size.Y` como espessura; as animações usaram Attachment e WeldConstraint
  porque leram que `movimento.lua` ancora a raiz durante o Tween.

## 2026-09-01 — Bloco 3: o mesmo padrão, de novo
Quinze agentes em paralelo ao todo, entre os blocos 2 e 3. Os achados se
repetiram com uma constância que vale registrar como regra, não como anedota:

- **Todo guarda que eu escrevi sem verificar acabou vazio.** O gate do painel
  compilava só o que o App alcançava; o teste de RemoteEvent do Bloco 2 casava
  por padrão de chamada que o código real não usa. Nos dois casos o verde era
  falso. Desde então todo teste de varredura ganha um segundo teste ao lado
  provando que ele acusa, e isso já pegou os dois.
- **Paralelismo não gera conflito de escrita, gera duplicação silenciosa.** No
  Bloco 2 foi o `prenderNoPersonagem` em dois módulos; no Bloco 3 foi o aviso
  de curva escrito duas vezes e a fórmula do ADR-009 numa terceira cópia. Dono
  exclusivo por arquivo resolve merge, não resolve contrato.
- **A duplicação mais perigosa é a que não quebra nada.** A cópia da fórmula no
  painel só desenharia uma barra mentindo sobre um mapa que a ponte já aprovou.
  Nada falharia. As duplicações que quebram se resolvem sozinhas.
- **Instruir o agente a reportar em vez de contornar continua sendo o que
  funciona.** Todas as lacunas do compartilhado — efeito permanente, tokens do
  painel, flash da Fênix, e agora os helpers do painel — vieram documentadas no
  relatório em vez de escondidas no código.
- **Agente lendo o arquivo do colega achou o que eu não teria achado.** O
  construtor de mapa escolheu Block em vez de Cylinder por causa de como o
  rastreio lê `Size.Y`; o agente do aviso de curva viu a duplicação no cartão
  de slot. Nenhum dos dois estava na tarefa deles.

## Conferido no Bloco 1, falta confirmar ao vivo
As fixtures de `data/fixtures/tiktok-cru/` foram reescritas contra a forma real
do `tiktok-live-connector` 2.4.4 (`WebcastGiftMessage` de `tiktok-live-proto/v3`):
`giftId`, `repeatCount`, `repeatEnd` **numérico** (0/1, não booleano como eu
tinha suposto), `groupId`, `user.nickname` e
`gift.{name,diamondCount,combo,image.urlList}`.

Falta confirmar numa live real que os campos vêm de fato preenchidos: o tipo diz
o que existe, não o que a TikTok manda. Na primeira conexão, despejar um evento
cru e comparar.

## Antes do Bloco 1: não confirmado
A forma do payload cru em `data/fixtures/tiktok-cru/` é a **esperada** do
`tiktok-live-connector`, não a verificada. A biblioteca é não oficial (ADR-006)
e muda entre versões. Até conferir, um teste verde do normalizador prova que ele
é coerente consigo mesmo, não que ele entende a TikTok. Na primeira conexão:
despejar um evento cru, comparar, corrigir a fixture e anotar aqui.

## Pendente de medição (preencher na primeira live de teste)
- Latência real TikTok → ponte (estimativa inicial: 200 a 500ms, fora do nosso
  controle).
- Latência real ponte → Roblox com long-poll (estimativa: 100 a 300ms).
- Taxa de reconexão do tiktok-live-connector numa live de 2 horas.
- Se o Roblox derruba a conexão de long-poll antes dos 20s configurados.
