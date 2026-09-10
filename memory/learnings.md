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

---

## Rodada 4 do ciclo — o item que já estava feito (2026-09-09)

### Documento desatualizado custa decisão, não só clareza
`F0-1` estava listado como **bloqueador duro** — "nenhum mapa pode ir ao ar" —
depois de o acervo já estar inteiro, aprovado e coerente. As rodadas 1 a 3
planejaram em cima desse bloqueio, e o resumo da rodada 3 recomendou o F0-1 como
próximo item exatamente por causa dele.

A regra do `CLAUDE.md` — "se doc e código conflitarem, a documentação prevalece
**e deve ser corrigida quando estiver errada**" — tem uma segunda metade que é
fácil de esquecer. Backlog é documentação.

### A verdade estava escondida atrás de leitura manual
Descobrir custou três scripts descartáveis lendo JSON na mão, porque
`npm run validar` só olhava o mapa de EXEMPLO. Regra que fica: **se responder
"dá para ir ao ar?" exige script descartável, o comando de validação está
incompleto.** Agora ele relata o acervo e todos os mapas salvos.

### Não inventar trabalho: fui procurar buraco e não achei
Suspeitei que `mapaPodeIrAoAr` não checasse as 6 faces do skybox — seria um
BUG-001 clássico. Fui ver: **o schema já exige as seis**, e a regra já exige
`aprovado` e `assetId` não nulo. Nada a consertar. Registrar que a suspeita foi
verificada e descartada vale tanto quanto um conserto.

### Teste que lê estado compartilhado mutável é flake que eu mesmo escrevi
Meus testes novos liam `data/acervo.json` enquanto `bridge/test/painel-novo.test.mjs`
exercita — de propósito — a rota que ESCREVE nesse arquivo. Os arquivos de teste
rodam em paralelo: caiu em 1 de 3 execuções. Passaram a ler `HEAD` pelo git, que
é o alvo certo: o que se afirma é que **o acervo entregue é coerente**, não o
estado instantâneo de um arquivo que outro teste está mexendo.

Ironia útil: eu tinha acabado de afrouxar um cronômetro de teste alheio por
medir carga em vez de código, e introduzi um flake pior na mesma rodada.

### Um teste que afirma invariante não garantida é pior que nenhum
Escrevi "o assetId de um skybox com faces é o da face ft" a partir da descrição
do schema. A rota de edição do painel **não garante isso** — grava `assetId` sem
tocar em `faces`. O teste passaria hoje e quebraria no dia em que o dono usasse a
tela legitimamente. Removido, e o achado virou decisão pendente. **Antes de
afirmar um invariante, procurar quem o escreve.**

---

## Rodada 5 do ciclo — a vistoria antes do Studio (2026-09-09)

### Conferir antes de recomendar, agora como hábito
A rodada 4 aprendeu isso do jeito caro. Aqui foi o primeiro passo: antes de
propor qualquer coisa para o F0-2, verifiquei Studio instalado, Rojo instalado,
o `default.project.json` cobrindo todo o `src/`, e **o place montando de
verdade** — `rojo build` produz 62 instâncias. Não havia bloqueio.

Descobrir isso mudou a rodada inteira: em vez de construir para destravar, ela
passou a existir para **provar que já estava destravado** e deixar isso repetível.

### O script descartável denuncia comando faltando (de novo)
Escrevi três descartáveis para saber que não havia bloqueio. É exatamente o
sintoma que a rodada 4 registrou. Virou `npm run vistoria`, que responde uma
pergunta que nenhum comando respondia — **"consigo começar a sessão agora?"**.
`npm run validar` cuida de contrato e dado; a vistoria cuida de AMBIENTE.

E ela não morre com o F0-2: o ADR-P04 nomeia o suporte em máquina alheia como o
custo dominante do produto. Uma vistoria que **nomeia o que falta, com o comando
que resolve**, é a semente daquilo.

### Impedimento e aviso não são a mesma coisa, e a diferença tem que chegar no exit code
Ponte fora do ar se resolve sem sair da cadeira; Rojo faltando, não. Tratar os
dois igual faria a vistoria mandar parar quando bastava um comando — e faria
`npm run vistoria` falhar numa esteira que nunca vai ter ponte. A separação só
vale se ela chega até o código de saída, e por isso virou teste.

Eu tinha classificado a ponte como impedimento no primeiro rascunho, **contra o
que o meu próprio spec havia decidido**. A review pegou.

### Assert que persegue palavra, não comportamento — terceira vez
"A vistoria não reimplementa a busca do Studio" virou `!/LOCALAPPDATA/`, e
quebrou porque a palavra aparece numa MENSAGEM de erro — que é justamente onde
ela deve aparecer. O assert certo persegue a reconstrução do caminho
(`"Roblox", "Versions"`), não a menção.

Padrão que já custou três rodadas: **quando um teste afirma "X não acontece",
escrever o que X é em código, não a palavra que X usa.**

---

## Rodada 6 do ciclo — o painel aberto no navegador (2026-09-09)

### Testar a própria recomendação antes de segui-la
O ledger da rodada 5 recomendava PARAR o ciclo: tudo que sobrava seria da sessão
no Studio. Estava errado por omissão — **F0-3 é bloqueador da Fase 0 e precisa
de navegador, não do Studio.** Conferir a recomendação custou uma consulta ao
backlog e destravou a rodada que achou o BUG-008.

### Análise estática deu 504 testes verdes sobre uma tela quebrada
O retrofit de i18n da rodada 1 trocou 627 strings em 31 arquivos, com 25 dos 31
auditores mortos no limite de sessão. O que garantiu o resultado foi teste
estático. **Abrir o painel uma vez achou um bug que 504 testes não viam**, e ele
estava no arquivo que eu escrevi à mão, não nos 31 das agentes. Ver BUG-008.

Regra: **retrofit em massa validado só por análise estática não está validado.**
Uma renderização vale as três levas de auditoria.

### Quase reportei dois bugs que não existiam
O leitor de acessibilidade do navegador achatava `<strong>` aninhado e truncava
texto longo, e eu li `"In , the same unit"` e `"breaks the po."` como
placeholders vazios. O DOM real trazia `"In floors of push, the same unit…"`,
correto. **Conferir no DOM antes de acusar** — a ferramenta de leitura é uma
fonte, não a verdade.

### Nem todo defeito na tela é do que você acabou de mexer
A página Configurar tinha 54px de rolagem horizontal. Parecia tradução longa
demais. Medindo em português: **o mesmo excesso** — era uma lista de ids de
textura separados por vírgula sem espaço, que o navegador trata como palavra só.
Defeito pré-existente, consertado com duas linhas de CSS. Confirmar no idioma
original antes de culpar a tradução.

---

## Continuação da rodada 6 — a instabilidade tinha nome (2026-09-09)

### Eu não conseguia LER o relatório de falha
Três rodadas reportando "a suíte falhou e não consegui identificar" tinham uma
causa boba: meu `grep '^✖ '` nunca casava, porque `ℹ` e `✖` são multibyte e eu
ancorava errado. O comando que funciona:

```bash
npm test > saida.log 2>&1
sed -n '/failing tests:/,$p' saida.log | grep -E "^✖|^test at|AssertionError"
```

**Antes de declarar um defeito irrastreável, conferir se a ferramenta de leitura
funciona.** Perdi umas 15 execuções de suíte por causa disso.

### O flake era um teste sensível a tempo, e uma cascata escondia qual
`bridge/test/ponta-a-ponta.test.mjs` rodava o laço do jogo numa janela de 2600ms
contra um `combateMaxMs` de 2000ms — 600ms de margem. Sob carga o laço ficava
faminto, o segundo evento chegava depois da janela, e o teste falhava **com o
comportamento certo**.

Pior: `encerrarSessao()` mora no fim do teste, então um assert que falha antes
dele deixa a sessão aberta, e o teste seguinte morre com `sessao_em_andamento`.
**Um defeito virava três, e a causa se perdia no meio dos outros dois.**

O `afterEach` que fecha a sessão foi verificado quebrando um assert de
propósito: 1 falha com a rede, 3 sem ela.

Regra: **teste que abre estado global fecha no `afterEach`, não no fim do
corpo.** O fim do corpo só roda quando tudo deu certo — que é exatamente quando
não precisa.

### Convenção existe para ser seguida, mesmo quando o dado vem de fora
As chaves de erro nasceram `panel.error.sem_conta_da_live`, copiando o código da
ponte. O schema recusou: o ADR-P03 exige slug alfanumérico. A tentação era
afrouxar o schema; o certo foi converter (`semContaDaLive`) num `emSlug` que os
dois lados — painel e teste de contrato — importam do mesmo lugar.

---

## A maratona — a metade do F0-6 que não precisa do Studio (2026-09-09)

### A fatia da ponte no orçamento de latência: medida
Primeira medição real do projeto contra o Princípio nº 1. Com o jogo simulado
(long-poll + estado a cada 2s) e presente entrando sem parar:

| Carga | Mediana | p95 | Máxima |
|---|---|---|---|
| 24 presentes/min | 1 ms | 8 ms | 18 ms |
| 120 presentes/min | 1 ms | 2 ms | 4 ms |

**A ponte gasta 1 a 18ms de um orçamento de 1000ms.** O que sobra é do Roblox e
da rede até o Studio — o que o F0-8 ainda precisa medir. Sem 429, sem erro de
rede, sem estado recusado, pico de 70 req/min contra o teto de 300.

Memória: +2 MB em 2 minutos sob carga alta, com queda em outra corrida. Não há
vazamento aparente no long-poll.

### Quase reportei "a ponte atrasa presente em 100 segundos"
A primeira corrida a 120/min mediu **p95 de 101 SEGUNDOS**. Era a régua suja: o
script entrava com `cursor = 0` numa ponte que já tinha rodado antes, e colhia
eventos guardados da corrida anterior. Como `emitidoEm` é marcado no DESPACHO, a
idade deles entrava na conta.

Sessão limpa no começo, e o número virou 1ms. **Antes de acusar o sistema,
perguntar se a medição está medindo o que diz medir.** Terceira vez nesta
sessão que essa pergunta salva um relatório errado.

### Entregar menos eventos que presentes é o desenho
"67 de 228 chegaram" parecia perda. É o combate do ADR-012: presente que chega
com o boneco ocupado não vira animação própria, entra na briga, e o conjunto sai
como UM evento. **O número certo de eventos não é o número de presentes, é o
número de janelas de animação.** A heurística que chamava isso de problema saiu.

### Ferramenta de diagnóstico não pode sujar o que diagnostica
A maratona abria sessão e não apagava o arquivo — e `data/sessoes/` é o
histórico de lives que o painel mostra ao dono. Pior: o `afterEach` que eu criei
na correção do flake **também** gravava, porque `encerrarSessao` persiste.

E ao medir, apareceu um vazamento anterior a mim: `painel-novo.test.mjs` abria
uma sessão de verdade e a deixava lá. **Um arquivo por `npm test`**, com cerca
de 200 acumulados. Os três consertados; medido em duas suítes seguidas: zero.

---

## O número que julgava o portão da Fase 0 estava errado (2026-09-09)

### `totalPresentes` nunca contou presentes
Ele conta **animações despachadas**. `registrarDisparo` só é chamado quando um
evento sai para o jogo — então presente que perde combate (ADR-012), que cai em
cooldown ou que coalesce com outro **não entrava na conta**.

A maratona já tinha medido a escala sem que eu percebesse o significado: 228
presentes chegando viraram 66 eventos. **Subcontagem de 3,5x.**

### Por que isso era grave, e não só impreciso
O plano de produto tem um portão só, e ele decide se o projeto continua:

> "Os presentes aumentam de forma visível nas lives com o jogo. Se não
> aumentarem, o produto não tem argumento. Para e reavalia."

O dono ia julgar isso pelo resumo da sessão — e o número lá **erra mais
justamente quando o jogo funciona melhor**. Momento de hype é quando mais
presente chega junto, e é quando mais coalesce. A live em que a plateia mais
mandou seria a que mostraria o menor número.

Verificado ponta a ponta com o cenário de rajada: **8 presentes recebidos, 5
animações tocadas**.

### A lição, que é maior que este campo
**Métrica que decide alguma coisa precisa ser lida uma vez em voz alta, com a
pergunta que ela responde do lado.** "totalPresentes" parecia óbvio. Só ao
escrever "os presentes aumentaram?" ao lado dele é que a diferença apareceu — e
ela estava no código desde o Bloco 1.

Ninguém errou ao escrever `totalPresentes`: ele conta o que diz, para quem sabe
que "presente" ali significa "disparo". O erro seria de leitura, no dia mais
caro. Agora o schema diz em texto o que cada um é, e um teste garante que diz.

### O número certo tem que estar na tela CERTA
Consertar `presentesRecebidos` no resumo pós-live não bastava. O portão é
**comparativo** — cinco lives lado a lado — e a tela onde isso acontece é o
**Histórico**, que continuava mostrando `totalPresentes` sob o rótulo
"{n} presentes". Métrica consertada na fonte e errada na tela de decisão é
métrica ainda errada.

Medido ao verificar: uma rajada de **18 presentes** aparece como **2
animações**. Nove vezes de diferença, na linha que decide o projeto.

### E o portão tem duas medidas, não uma
"Os presentes aumentam nas lives COM o jogo" exige um **antes**. O antes é uma
live sem o jogo — e ela não precisa do Studio: a ponte conecta na live e conta
mesmo sem Roblox do outro lado. Verificado. Estava faltando no roteiro, o que
deixaria o portão sem base de comparação justamente no dia de julgá-lo.

### O mesmo engano estava no gráfico, e ali ele REORDENAVA
`presentesPorSlot` também contava despacho. E o painel desenha isso como
**barra comparativa**, que o streamer usa para decidir quais presentes ficam nos
6 slots.

A distorção não era uniforme: presente popular chega em rajada, coalesce mais no
combate (ADR-012), e a barra dele encolhe **mais que a dos outros**. O gráfico
chegava a inverter a ordem — dez presentes num slot podiam aparecer como uma
barra menor que três em outro. A decisão errada colada nisso: **tirar dos slots
justamente o presente que a plateia mais manda.**

Contar no casamento, e não no despacho, custou um callback (`aoCasar`) e umas 15
linhas. O que custou de verdade foi perguntar de novo: **"que decisão alguém
toma olhando este número?"** — e não só "o que este número é".
