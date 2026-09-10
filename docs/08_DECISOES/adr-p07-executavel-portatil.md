# ADR-P07 — Portátil primeiro, instalador depois

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

Ao mesmo tempo, um instalador de verdade — MSI ou NSIS, escrita no registro,
Adicionar/Remover Programas, atualizador — é trabalho que só compensa depois que
o produto estiver de pé na máquina de alguém. E, pedido pelo dono em 2026-09-10:

> "Eu gostaria que inicialmente, pra gente ir testando, ele fosse um exe
> portable, e depois a gente transicionasse pra um aplicativo instalável."

---

## Decisão

**O primeiro pacote é um executável portátil: um `.exe` só, sem instalação, sem
Node na máquina e sem terminal. Ele é a MESMA ponte e o MESMO painel — o que
muda é a embalagem, não o produto.** O instalador continua sendo o destino
(ADR-P04) e vem depois, sobre este mesmo executável.

    npm run empacotar   ->   dist/KoraStreamGames/
                               KoraStreamGames.exe   94 MB
                               LEIA-ME.txt

O cliente copia a pasta para onde quiser, dá duplo clique, e o painel abre no
navegador. O primeiro arranque escreve, ao lado do exe:

    .env      config da instalação, com um BRIDGE_TOKEN sorteado na hora
    data/     o que é do streamer: presets, acervo, histórico
    game/     a fonte que o Rojo monta dentro do Studio

### Como é feito, com o que o Node já traz

1. **Um arquivo só.** A ponte são dezenas de módulos ESM mais `express`, `ajv` e
   o `tiktok-live-connector`; o executável só aceita um arquivo CommonJS. O
   `rolldown` funde tudo (`scripts/empacotar.mjs`).
2. **O blob.** `node --experimental-sea-config` junta esse arquivo com os
   anexos — o painel construído e a semente de `data/` e `game/`.
3. **A cola.** O `postject` grava o blob dentro de uma cópia do `node.exe`.

`rolldown` e `postject` são MIT e só de desenvolvimento: não vão para a máquina
do cliente e não custam nada (CLAUDE.md, Custo). O `rolldown` já estava em
`node_modules` — é o empacotador que o Vite usa por dentro.

### O que fica DENTRO do exe e o que fica FORA

| Dentro (programa) | Fora, ao lado do exe (do streamer) |
|---|---|
| ponte, painel construído, runtime do Node | `data/` inteiro |
| semente de `data/` e `game/` | `.env` |
| — | `game/`, extraído, porque o Rojo precisa dele em disco |

A linha é "de quem é o arquivo". O que é programa é reescrito a cada arranque —
schema, catálogo de tradução, tabela de animações, fonte do jogo — porque tem de
casar com a versão do exe: é isso que faz "substitua o exe pelo novo" funcionar
sem migração. O que é do streamer nasce uma vez e nunca mais é tocado.

O painel é o único programa que **não** é extraído: ele é servido de dentro do
exe, na mesma porta da `/api`. Extrair criaria uma cópia editável que envelhece
sozinha; servindo de dentro, painel e ponte não têm como dessincronizar — e de
quebra some o CORS, porque painel e API passam a ser a mesma origem.

### Roblox Studio e Rojo continuam sendo instalação separada

O executável **não instala nada na máquina do cliente** — é o que separa um
portátil de um instalador. Os dois programas de terceiros de que o produto
depende têm instalador próprio e ficam documentados:

- **Roblox Studio** — create.roblox.com
- **Rojo** — `winget install Rojo.Rojo`

Onde isso está escrito: no `LEIA-ME.txt` que acompanha o exe
(`scripts/modelos/leia-me-do-portatil.txt`) e em
`docs/09_BACKLOG/instalacao-na-maquina-do-cliente.md`. O painel também avisa
sozinho: o botão "Abrir o jogo no Studio" responde com o comando do `winget`
quando não acha o Rojo (`bridge/src/roblox/estudio.mjs`).

---

## Consequências

### Boas

- Instalar deixou de ser sete passos e virou "copiar uma pasta".
- Não há Node, npm nem `git` na máquina do cliente, e nada é escrito fora da
  pasta: no registro, no `Program Files`, no `AppData`, nada. Desinstalar é
  apagar a pasta.
- Backup do cliente = copiar `data/`.
- O `BRIDGE_TOKEN` é sorteado por instalação. Um token embutido no executável
  seria o mesmo em todo cliente, e ele é a única coisa entre a porta pública do
  jogo e quem passar por ela (`docs/11_SEGURANCA`).
- O portátil é a base do instalador: o MSI vai empacotar este exe, não outro.

### Ruins, e assumidas

- **94 MB.** O runtime do Node inteiro vai junto. É o preço de não pedir
  instalação prévia, e é uma vez só.
- **O SmartScreen avisa na primeira execução.** Executável sem assinatura digital
  toma a tela azul do "O Windows protegeu o computador". Um certificado de
  assinatura de código custa **US$ 200 a 400 por ano** — investimento, e o
  projeto é bootstrap gratuito (CLAUDE.md, Custo). **Adiado por padrão**: enquanto
  o cliente for o dono e os primeiros testadores, o `LEIA-ME.txt` explica o
  aviso e o caminho ("Mais informações" → "Executar assim mesmo"). Reavaliar
  quando começar a vender para desconhecido: aí o aviso deixa de ser
  inconveniência e vira perda de venda.
  - O que **foi** feito de graça: a assinatura da Node.js Foundation é removida
    do binário antes da colagem. Assinatura corrompida é lida por antivírus como
    binário adulterado; sem assinatura é só o aviso normal.
- **O `LEIA-ME.txt` está em português.** O ADR-P03 traduziu o painel para pt/es/
  en, mas o console do operador é PT sempre. Vender para streamer de língua
  inglesa exige a versão EN deste arquivo — item aberto, não bloqueante enquanto
  os testadores forem daqui.
- **Só Windows, por ora.** O `npm run empacotar` gera para a plataforma em que
  roda. Como o Roblox Studio é Windows e macOS, o portátil de macOS é possível e
  ninguém pediu.

---

## Alternativas descartadas

**Instalador MSI/NSIS agora.** É o destino (ADR-P04), mas custa semanas e pede
decisões — pasta de instalação, atualizador, desinstalação — que ficam melhores
depois de o produto ter rodado na máquina de alguém que não é o dono.

**`pkg` ou `nexe`.** Fazem a mesma coisa que o SEA e ficaram para trás quando o
Node adotou SEA oficialmente. Dependência a mais para resolver o que já vem na
caixa.

**Pasta com `node.exe` e um `.bat`.** Gratuito e trivial, mas a coisa que o
cliente clica passa a ser um arquivo de texto que abre um terminal preto. O
produto é vendido; a porta de entrada precisa ser um exe.

**Electron.** Resolveria a janela, mas troca 94 MB por 200 MB e traz um Chromium
inteiro para exibir uma tela que o navegador do cliente já exibe.
