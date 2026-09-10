# ADR-P07 — Um programa de verdade, portátil primeiro

**Status**: Aceito · **Data**: 2026-09-10 · **Decisores**: Matheus Bonato
**Depende de**: ADR-P04 · **Relacionado**: ADR-001, ADR-003, ADR-P05

---

## Contexto

O ADR-P04 fechou a distribuição: o cliente roda o jogo no Studio dele, com a
ponte e o painel ao lado, e o produto é "entregue por instalador e mantido por
atualizador automático". Essa frase descreve o destino, não o próximo passo.

Hoje subir o produto exige, na ordem: instalar o Node, clonar o repositório,
`npm install`, copiar `.env.example` para `.env`, gerar 32 bytes aleatórios com
`openssl`, `npm run gerar`, e então dois terminais. **Nada disso é vendável**, e
mais da metade nem é entendível para quem faz live.

O dono pediu, em 2026-09-10:

> "Eu gostaria que inicialmente, pra gente ir testando, ele fosse um exe
> portable, e depois a gente transicionasse pra um aplicativo instalável."

E, olhando as duas primeiras tentativas de entregar isso:

> "Ele tá abrindo na web, quero que ele abra em formato de aplicativo."
>
> "Mas eu não quero que ele seja aberto por navegador, eu quero que ele seja um
> programa, um programa de verdade."

Essa última frase é o requisito. **A embalagem não é detalhe de entrega: é parte
do que está sendo vendido.** Quem paga por mês não abre uma aba.

---

## Decisão

**O produto é um aplicativo Windows de verdade — janela nativa, ícone próprio,
sem console e sem navegador à vista — entregue como um `.exe` portátil, sem
instalação.** O instalador continua sendo o destino (ADR-P04) e vem depois,
sobre este mesmo aplicativo.

    npm run empacotar   ->   dist/KoraStreamGames/
                               KoraStreamGames.exe   96 MB
                               LEIA-ME.txt

O cliente copia para onde quiser, dá duplo clique, e o programa abre. O primeiro
uso escreve, ao lado do exe:

    .env       config da instalação, com um BRIDGE_TOKEN sorteado na hora
    data/      o que é do streamer: presets, acervo, histórico
    game/      a fonte que o Rojo monta dentro do Studio
    kora.log   o que aconteceu na última abertura

### Como é feito, em quatro peças

1. **O painel** é construído pelo Vite, como sempre.
2. **A ponte** — dezenas de módulos ESM mais `express`, `ajv` e o
   `tiktok-live-connector` — é fundida num arquivo CommonJS pelo `rolldown`, que
   o Vite já trazia. É isso que dispensa levar `node_modules` para o cliente.
3. **O Electron** dá a janela nativa e o runtime. O processo principal
   (`app/principal.cjs`) sobe a ponte e abre a janela apontada para ela.
4. **O `electron-builder`** monta o executável portátil, com ícone, nome e
   versão gravados no binário.

Tudo MIT, gratuito e só de desenvolvimento — nada é comprado, e nada vai para a
máquina do cliente além do executável (CLAUDE.md, Custo).

### Por que Electron, depois de duas tentativas mais magras

Não foi a primeira escolha. As duas primeiras foram descartadas **pelo dono
olhando o resultado**, e ficam registradas porque o motivo vale para a próxima:

| Tentativa | O que dava | Por que não bastou |
|---|---|---|
| Node SEA (`--experimental-sea-config` + `postject`) | um exe de 94 MB que subia a ponte e abria o navegador padrão | o produto virava uma aba, com barra de endereço e `127.0.0.1:8788` em cima |
| Chromium em modo `--app` | janela sem barra, ícone próprio | continuava sendo o navegador do streamer, dependia de ele ter Chrome, e a janela preta do console continuava lá |

O que faltava nas duas era a mesma coisa: **não pareciam um programa.** O custo
de resolver isso é o Chromium embutido — e o número que decidiu foi este: o SEA
saía com 94 MB, o Electron sai com 96. **Dois megabytes.** O runtime do Node já
custava quase tudo; o resto do Chromium, comprimido, custa quase nada.

Não havia alternativa mais magra ao alcance: a máquina não tem Rust (Tauri) nem
.NET (WebView2 com casca própria), e adotar um segundo ecossistema de build para
economizar 85 MB é caro no lugar errado — a manutenção.

### O que fica DENTRO do aplicativo e o que fica FORA

| Dentro (programa, não editável) | Fora, ao lado do exe (do streamer) |
|---|---|
| ponte, painel construído, runtime | `data/` inteiro |
| semente de `data/` e `game/` | `.env`, `kora.log` |
| ícone | `game/`, extraído, porque o Rojo precisa dele em disco |

A linha é "de quem é o arquivo". O que é programa é reescrito a cada abertura —
schema, catálogo de tradução, tabela de animações, fonte do jogo — porque tem de
casar com a versão instalada: é isso que faz "substitua o exe pelo novo"
funcionar sem migração. O que é do streamer nasce uma vez e nunca mais é tocado.

O painel é o único programa que **não** é extraído: é servido de dentro do
pacote, em memória, na mesma porta da `/api`. Some o CORS que o proxy do Vite
existia para resolver, e painel e ponte não têm como ficar em versões diferentes.

**A pasta do streamer nunca é o diretório temporário.** O portátil roda a partir
de uma cópia que se descompacta no `%TEMP%`, e ali `process.execPath` aponta
para o temporário — que o Windows apaga. Quem diz onde o exe realmente está é
`PORTABLE_EXECUTABLE_DIR`, e é ela que manda.

### A janela

- Sem barra de menu. "Arquivo / Editar / Ajuda" é vocabulário de navegador.
- Fundo `#111111` desde o primeiro frame, o mesmo do painel: sem isso a janela
  pisca branco antes de carregar, que é o tique que denuncia navegador.
- Só aparece quando está pronta.
- Link externo (documentação, `create.roblox.com`) abre no navegador do
  streamer, nunca dentro da janela — o produto não é um navegador ruim.
- A página roda sem Node, isolada e em sandbox (`docs/11_SEGURANCA`).
- Dois atalhos sobrevivem à falta de menu: **F5** recarrega, e
  **Ctrl+Shift+I** abre as ferramentas de desenvolvedor — é como se lê um erro
  na máquina do cliente sem pedir para ele instalar nada.
- Uma instância só. O segundo duplo clique traz a janela existente para a
  frente, em vez de morrer disputando a porta 8787.
- Fechar a janela encerra a sessão de verdade antes de sair, que é o que
  descarta o dado de espectador (F5, `docs/11_SEGURANCA`).

### Sem console, e o que entrou no lugar

Não existe janela preta. Em compensação, um erro que impede subir não teria para
onde ir — então:

- todo `console.log` da ponte vai para **`kora.log`**, ao lado do exe, truncado
  a cada abertura para não crescer sem fim;
- todo erro que impede abrir vira **caixa de diálogo**, com texto que diz o que
  fazer. Porta ocupada, que é o caso mais provável e o pior explicado pelo Node,
  tem mensagem própria.

### Roblox Studio e Rojo continuam sendo instalação separada

O aplicativo **não instala nada na máquina do cliente** — é o que separa um
portátil de um instalador. Os dois programas de terceiros de que o produto
depende têm instalador próprio e ficam documentados:

- **Roblox Studio** — create.roblox.com
- **Rojo** — `winget install Rojo.Rojo`

Onde isso está escrito: no `LEIA-ME.txt` que acompanha o exe
(`scripts/modelos/leia-me-do-portatil.txt`) e em
`docs/09_BACKLOG/instalacao-na-maquina-do-cliente.md`. O painel também avisa
sozinho: o botão "Abrir o jogo no Studio" responde com o comando do `winget`
quando não acha o Rojo (`bridge/src/roblox/estudio.mjs`).

### O ícone é desenhado por código

`scripts/gerar-icone.mjs` escreve o `.ico` inteiro à mão — PNG por PNG, sete
tamanhos — com as cores de faixa do `data/tokens.json`. São três degraus
subindo, que é o que o jogo faz.

Gerado, e não desenhado num editor, por dois motivos: no dia em que a paleta
mudar, o ícone muda junto; e um `.ico` binário versionado é um arquivo que
ninguém consegue revisar num diff. Sem dependência: o `deflate` vem do
`node:zlib` e o resto é cabeçalho.

---

## Consequências

### Boas

- Instalar deixou de ser sete passos e virou "copiar um arquivo".
- Não há Node, npm nem `git` na máquina do cliente, e nada é escrito fora da
  pasta: registro, `Program Files`, `AppData` — nada. Desinstalar é apagar.
- Backup do cliente = copiar `data/`.
- O `BRIDGE_TOKEN` é sorteado por instalação. Um token embutido no programa
  seria o mesmo em todo cliente, e ele é a única coisa entre a porta pública do
  jogo e quem passar por ela (`docs/11_SEGURANCA`).
- **Painel e ponte viram um processo só**, o que fecha a última pergunta em
  aberto do ADR-P04.
- O portátil é a base do instalador: o mesmo `electron-builder` troca o alvo
  `portable` por `nsis` e sai um instalador, sem reescrever nada.

### Ruins, e assumidas

- **96 MB.** O Chromium e o Node inteiros vão junto. É o preço de não pedir
  instalação prévia nem depender do navegador do cliente — e são só 2 MB a mais
  que o executável sem janela.
- **A primeira abertura é mais lenta.** O portátil se descompacta antes de
  rodar; as seguintes reaproveitam.
- **O SmartScreen avisa na primeira execução.** Executável sem assinatura
  digital toma a tela azul do "O Windows protegeu o computador". Um certificado
  de assinatura de código custa **US$ 200 a 400 por ano** — investimento, e o
  projeto é bootstrap gratuito (CLAUDE.md, Custo). **Adiado por padrão**:
  enquanto o cliente for o dono e os primeiros testadores, o `LEIA-ME.txt`
  explica o aviso e o caminho ("Mais informações" → "Executar assim mesmo").
  Reavaliar quando começar a vender para desconhecido: aí o aviso deixa de ser
  inconveniência e vira perda de venda.
- **O `LEIA-ME.txt` está em português.** O ADR-P03 traduziu o painel para
  pt/es/en, mas o console do operador é PT sempre. Vender para streamer de
  língua inglesa exige a versão EN deste arquivo — item aberto, não bloqueante
  enquanto os testadores forem daqui.
- **Só Windows, por ora.** O `npm run empacotar` gera para a plataforma em que
  roda. Como o Roblox Studio é Windows e macOS, o pacote de macOS é possível e
  ninguém pediu.
- **Uma dependência de peso a mais.** O Electron precisa acompanhar atualização
  de segurança do Chromium. Não é código nosso e não entra no caminho crítico do
  presente, mas passa a existir.

---

## Alternativas descartadas

**Instalador MSI/NSIS agora.** É o destino (ADR-P04), mas pede decisões — pasta
de instalação, atualizador, desinstalação — que ficam melhores depois de o
produto ter rodado na máquina de alguém que não é o dono. E o caminho até lá
ficou barato: é trocar o alvo no `electron-builder`.

**Tauri.** Daria o mesmo aplicativo em ~10 MB, usando o WebView2 que já vem no
Windows. Exige a toolchain de Rust na máquina de build — um segundo ecossistema
inteiro para manter, por causa de 85 MB que o cliente baixa uma vez.

**WebView2 com casca própria em C#.** Mesma ideia, mesmo problema: exige o SDK
do .NET e transforma o projeto em dois idiomas de build.

**`pkg` ou `nexe`.** Resolviam o empacotamento, nunca a janela. E ficaram para
trás quando o Node adotou SEA oficialmente.
