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

## Painel: o que a ponte entrega e a tela ignora (2026-09-02)
O Bloco 3 entregou um painel completo como TELA e incompleto como PRODUTO. Três
padrões apareceram juntos, e vale procurar os três de novo antes de dar bloco
por fechado:

1. **Resposta descartada.** `POST /api/sessao/stop` devolvia o resumo agregado
   da live — calculado, validado e gravado — e o `App.jsx` fazia
   `await executar(...)` sem guardar o retorno. O F5.5 mandava mostrar isso
   desde sempre.
2. **Verbo morto na camada de serviços.** `api.atualizarCatalogo()` existia em
   `lib/api.js` e nenhum componente chamava. O aviso da semente apontava o
   problema e não oferecia a saída que estava a uma linha de distância.
3. **Parâmetro nunca passado.** `api.testarAnimacao(id, intensidade)` aceitava
   intensidade e o App só mandava o id.

Um grep por verbo de `api.js` que nenhum componente usa acha a classe (2) em
segundos. A (1) e a (3) exigem ler a assinatura contra a chamada.

## Regra de negócio sem controle na tela (2026-09-02)
R6 ("chegar no topo não reinicia sozinho: o streamer decide no painel") não
existia em processo NENHUM — nem no Luau, nem na ponte, nem no painel. R7
("trocar de preset no meio da sessão é permitido") existia na ponte e o painel
proibia, desabilitando o seletor.

Ler `03_REGRAS_DE_NEGOCIO` procurando o CONTROLE de cada regra, e não a
implementação dela, achou as duas. A pergunta que funciona é "onde o streamer
clica para exercer isto?", não "isto está implementado?".

## Feature que o dono não pediu dura um dia (2026-09-03)
A animação de fim de rodada (`animacaoDeVitoria`) nasceu de um raciocínio
correto — "os dois instantes mais altos da live acontecem com o boneco
parado" — e de uma resposta errada: uma animação da biblioteca, no jogo. O
dono olhou a tela e disse que ali deveria estar a lista das **cutscenes**. A
resposta certa já existia no repositório (o overlay do OBS, com vídeo e som);
faltou perguntar "isto é o que ele quer ver?" antes de construir. Virou o
ADR-014. A lição: quando a lacuna é de espetáculo, a resposta é do overlay,
não do Luau — o Roblox não aceita vídeo, e vídeo é o que o dono chama de
cutscene. E a tela denunciou: "Vitória → Ascensão da Fênix" lia como o
presente da vitória, não como a animação dela.

## Instante não se deriva de instantâneo (2026-09-03)
O overlay tocava a cutscene comparando `vitorias`/`derrotas` com o valor
anterior. Errava nos dois sentidos: o placar sobe no INÍCIO da contagem — que a
vitória ainda pode abandonar — e a ponte reiniciada zerava o contador dela
enquanto o do jogo continuava, tocando uma vitória que ninguém teve. "A rodada
acabou" é um evento, e quem sabe dele é o jogo: `POST /jogo/rodada` no instante
certo, e o overlay ouve `rodada`. Sempre que uma tela precisar reagir a "X
aconteceu", procurar quem SABE que aconteceu antes de inferir de dois estados.
De quebra apareceu um bug escondido: a vitória comprada por donate era
cancelada pelo batimento seguinte, porque a guarda só conhecia vitória por
posição.

## O LIVE Studio recusa `127.0.0.1` na fonte "Link" (2026-09-03)
O dono colou `http://127.0.0.1:8788/overlay` no TikTok LIVE Studio e recebeu
"Digite o URL correto". A ponte estava no ar e respondia 200; o erro é do
próprio LIVE Studio, antes de qualquer requisição. A regra está em
`static/js/modal.*.js` da versão 1.35.2: uma regex sem âncora que exige
`algo.letras` (`.[a-z]{2,6}`) em algum ponto da URL — `127.0.0.1` termina
em número e `localhost` não tem ponto. Depois da regex ele faz um GET e só
recusa 404 ou erro de rede (a janela roda com `webSecurity` desligado, então
CORS não entra). Dois jeitos de passar: um host de letras que resolve para a
máquina (`127.0.0.1.nip.io`, `lvh.me`, DNS público) ou um `.html` no caminho.
Ficou o `.html`: não depende de DNS e não muda de host. As páginas respondem
nas duas formas e `/api/overlay` entrega a que funciona nos dois programas.
A lição: quando um programa de terceiros recusa a URL sem nem tentar conectar,
o erro é de FORMA, e a regra costuma estar legível no bundle instalado — foi
mais rápido ler a regex do que adivinhar o que ele queria.

## O dono reabriu o ADR-007, e a resposta certa foi emendar, não substituir (2026-09-04)
O pedido — "uma página só pra definir subida ou descida por presente,
pré-definida com valor × 10" — é literalmente a alternativa que o ADR-007
descartou ("faixa de valor dispara animação automaticamente"). A tentação era
tratar como contradição e perguntar. Mas os dois argumentos daquele ADR
continuavam de pé e não colidiam com o pedido: *escolher a animação* é a
proposta de valor, e *catálogo que muda sozinho* não pode virar tabela morta. O
que mudou foi o buraco que a live mostrou: 6 presentes configurados e 664
mudos, com o contador de "não mapeado" medindo um problema que não tinha
conserto possível.

A saída foi separar as duas perguntas que o ADR-007 tratava como uma:

- **o que TOCA** continua sendo escolha, um presente por slot (ADR-007 intacto);
- **quanto ANDA** virou conta, com a mão do streamer como exceção (ADR-016).

E guardar a REGRA no preset em vez das 670 linhas resolveu de graça a objeção
do catálogo: presente novo da TikTok nasce com delta sem ninguém abrir o painel.

A lição: quando o dono pede o que um ADR descartou, ler os ARGUMENTOS do ADR
antes de discutir a decisão. Duas vezes em dois dias eles apontaram o desenho
certo em vez de bloquear o pedido.

## Consequência que só aparece quando se faz a conta (2026-09-04)
Com 10 andares por moeda numa torre de 1000, **541 dos 670 presentes do
catálogo varrem a torre inteira sozinhos** — qualquer um de 100 moedas ou mais.
Não quebra nada (o jogo grampeia nas pontas), mas acaba a corrida num presente.
Isso não aparece lendo a regra; apareceu ao rodar `resumoDaTabela` sobre o
catálogo real. Virou linha na tela, antes da live: toda regra nova que
multiplica valor por alguma coisa merece uma passada sobre o dado REAL, e o
resultado dessa passada merece ficar visível para quem configura.

---

## Rodada 1 do ciclo de produto — i18n (2026-09-09)

### Retrofit de string sobrevive ao detector ingênuo, e é aí que ele engana
Três buracos apareceram, e todos passariam despercebidos se o teste fosse só
"procure texto entre tags":

1. **Rótulo passado como PROP.** Os 8 itens do menu principal moram em
   `App.jsx` como `rotulo: "Ao vivo"`. Não é texto entre tags, nenhum detector
   olhava, e nenhuma agente era dona daquele arquivo. **O menu inteiro teria
   ido a produção em português.** `rotulo:` e `titulo:` são a convenção do
   projeto para "isto aparece na tela" e agora têm teste próprio.
2. **O `>` de `=>` lido como fim de tag.** `(preenchido, indice) => (` fazia o
   nome do parâmetro ser acusado de texto de tela. Resolvido com lookbehind.
3. **Locale cravado.** Traduzir a frase e deixar `toLocaleString("pt-BR")` é o
   erro que ATRAVESSA o retrofit inteiro: o painel fica em inglês e mostra
   "1.372", que um americano lê como um vírgula três. Eram 10 pontos no painel
   e um no Luau. **A tradução do número é parte da tradução.**

### Um teste que mente atrapalha mais do que ajuda
A primeira versão do detector de chave morta exigia `t("chave")` literal, e
acusou **38 chaves mortas que estavam vivíssimas** — o painel guarda chave em
tabela de lookup (`{ id: "aprovado", chave: "…statusApproved" }`) e em helper
de plural. Exigir a chamada literal **punia justamente o código bem escrito.**
No outro sentido, o mesmo detector lia `"hud.client.lua"` — nome de arquivo —
como chave inexistente. Regra que ficou: chave citada como literal em qualquer
lugar conta como usada, e o que tem cara de caminho não é chave.

### Namespace pré-atribuído é o que faz fan-out de texto funcionar
35 agentes em paralelo produziram **627 chaves com zero conflito de
nomenclatura**. O que garantiu isso foi cada agente receber o namespace pronto
(`panel.liveMonitor`, `game.wardrobe`) em vez de inventar o próprio. E nenhuma
agente escreveu no catálogo: cada uma DEVOLVEU as chaves, e o merge foi central.
Trinta e cinco agentes escrevendo no mesmo JSON teriam se sobrescrito.

### O limite de sessão derrubou 25 auditores, e a suíte cobriu o buraco
Dos 31 verificadores do painel, 25 morreram no limite de uso. Os arquivos já
estavam prontos; faltou a segunda opinião. O que sobrou de erro foi pequeno —
1 chave órfã, 4 mortas, 5 strings cravadas em 31 arquivos — e **quem achou foi
o teste, não o auditor**. Vale como calibragem: com contrato verificável
escrito ANTES, o auditor por arquivo é reforço, não a rede.

### Testes antigos que casam com texto literal quebram em retrofit
Dois testes do painel falharam sem que nada estivesse errado: um cobrava
`slot ${posicao}` na fonte do modal, outro cravava "28 componentes". Os dois
estavam certos no dia em que foram escritos. **Teste que casa com string de
código é dívida com juros na primeira mudança transversal.**

---

## Rodada 2 do ciclo — a sonda do F0-7 (2026-09-09)

### Instrumento antes de medição, quando a medição tem modos de falha parecidos
F0-7 era "cinco minutos": trocar a URL no Studio e ver se funciona. Mas
"não funcionou" tinha **quatro causas indistinguíveis** — `HttpService`
desligado, ponte fora do ar, token errado, e Studio realmente bloqueado. Só a
última responde a pergunta. Um teste de cinco minutos com quatro modos de falha
parecidos não custa cinco minutos: custa uma tarde e devolve a resposta errada.

### O 401 é resultado POSITIVO
O achado que organiza a sonda inteira: **para tomar 401, o pacote precisou
chegar na ponte.** Um instrumento que trate 401 como falha responde "não" a uma
pergunta cuja resposta foi "sim" — e tratar 401 como falha é exatamente o que
alguém escreve sem pensar. Isso também justificou manter a sonda DENTRO de
`/jogo/*`, com token: uma rota aberta responderia igual e abriria superfície de
graça. É por estar protegida que ela responde melhor.

### O modo de falha mais caro estava fora do Studio
Testar contra uma ponte que não está no ar responde "não" a uma pergunta que nem
chegou a ser feita. Por isso `npm run sondar` confere a ponte **deste lado
primeiro**, e só então imprime o Luau — com a porta real, nunca chutada. Sondar
a porta errada responde a pergunta errada e ninguém percebe.

### Gate que não cobre tudo é gate que engana
`npm run luau` varria só `game/src`. A sonda mora em `game/` porque não é parte
do place — e ficaria **fora do gate**, que é justamente o lugar onde um erro de
sintaxe custa a viagem ao Studio que o gate existe para evitar. Passou a varrer
`game/` inteiro: 54 → 55 arquivos.

### Não fingir que rodei
A medição exige Studio, e eu não tenho Studio. Isso ficou escrito no topo do
spec, no commit e no ledger. **Rodada que entrega o instrumento e deixa a
medição explicitamente pendente é resultado correto**, não entrega pela metade —
o que seria errado é o relatório sugerir que a pergunta do ADR-002 foi
respondida.

---

## Rodada 3 do ciclo — o teto do long-poll (2026-09-09)

### O item estava escrito como medição, e era um bug
F0-4 dizia "confirmar o teto de 20s". Ler o laço antes de escrever o spec mostrou
que o número importava menos que o que acontecia ao errá-lo: backoff de até 30
segundos numa live quieta. **Consertar não dependia de saber o número** — e o
número passou a aparecer sozinho, num aviso durante live normal.

Vale como padrão: **antes de agendar uma medição, ler o que o sistema faz quando
a medição dá o resultado ruim.** Se ele quebra feio, o conserto vem primeiro e a
medição fica barata.

### Duração classifica o que o código de retorno não classifica
Conexão ociosa fechada pelo peer e erro de rede chegam iguais no `pcall`. O que
os separa é **quanto tempo passou**: erro real volta em milissegundos, conexão
que estava esperando morre depois de segundos. Ver BUG-007.

### Todo conserto tem um custo — vale procurá-lo antes da review terminar
Classificar corte como "não é erro" apagava a única forma de o jogo saber que a
ponte caiu: um túnel pendurado ficaria lido como teto do Roblox para sempre, com
o painel dizendo "Jogo online" com a live morta. A review encontrou isso e fechou
com um discriminador de quatro linhas: **depois** de já ter negociado teto menor,
durar muito além do pedido é a ponte não honrando, e volta a ser erro.

Eu tinha escrito essa perda no spec como "limitação aceita". Aceitar foi a
resposta errada — era barato fechar.
