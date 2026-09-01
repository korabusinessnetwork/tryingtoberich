# Validação do Bloco 3

Relatório da fase de síntese do painel. Construído por **6 agentes em
paralelo**, em duas levas, cada um dono exclusivo de um conjunto de arquivos.

Data: 2026-09-01 · 11 componentes · 190 testes

## Como o trabalho foi dividido

| Leva | Agentes | Arquivos |
|---|---|---|
| 0 | orquestrador | `lib/` (api, regras, fluxo), `styles/`, esqueleto do App, gate |
| 1 | 5 | cartão de slot + editor, barra de sessão + modalidade, seletor de presente + aviso, seletor de animação + look, gerador + prévia de mapa |
| 2 | 2 | monitor ao vivo, suíte de testes |
| 3 | orquestrador | fiação do App, síntese |

## Checagens

| # | Checagem | Resultado |
|---|---|---|
| 1 | Todo componente compila (`npm run painel:gate`) | 11/11 |
| 2 | Nenhuma cor literal em CSS | ok, com 2 exceções legítimas |
| 3 | Nenhum componente chama `fetch` ou `EventSource` | ok, virou teste |
| 4 | Nenhum componente usa diálogo nativo do navegador | **quebrado, corrigido**, virou teste |
| 5 | Toda prop que o App passa existe no componente | ok, virou teste |
| 6 | Todo componente é montado por alguém | **quebrado, corrigido**, virou teste |
| 7 | Aviso de curva num lugar só | **quebrado, corrigido**, virou teste |
| 8 | Fórmula do ADR-009 igual em painel, ponte e Luau | **quebrado, corrigido**, virou teste |
| 9 | `faixaDeMoedas` igual em painel e ponte | ok, virou teste |
| 10 | Os 8 itens do backlog com componente correspondente | 8/8 |

## Defeitos encontrados na síntese

### 1. O gate do painel não era gate
`vite build` só compila o que o `App.jsx` alcança, e o App não importava
componente nenhum enquanto os agentes escreviam. **O gate dava verde sem tocar
nos arquivos deles.** Quatro dos cinco agentes da Leva 1 descobriram isso de
forma independente e contornaram montando build próprio no scratchpad — o que
resolveu o problema deles e teria deixado o meu de pé.

`npm run painel:gate` passou a gerar a entrada na hora, importando todo
componente do diretório. É o segundo guarda vazio desta sessão; o primeiro foi
o teste de RemoteEvent no Bloco 2.

### 2. O aviso de curva existia duas vezes
O `CartaoDeSlot` desenhava o aviso inline, com classe e CSS próprios, e o
`AvisoDeCurva` ficava sem uso. Dois agentes escreveram a mesma coisa contra a
mesma spec sem saber um do outro — e foi o agente do `AvisoDeCurva` que
apontou, lendo o arquivo do colega.

Ficou o componente dedicado, que era o melhor dos dois: ele traz um rótulo só
para leitor de tela explicando por que aquele texto apareceu na tela.

### 3. Terceira cópia da fórmula do ADR-009
O alcance horizontal do pulo passou a existir em `regras.mjs` (ponte),
`jogabilidade.lua` (jogo) e `PreviaDeMapa.jsx` (painel). As duas primeiras já
tinham teste travando o número; a terceira não.

**É a mais perigosa das três**: divergir ali não quebra nada visível — o painel
só desenharia uma barra mentindo sobre um mapa que a ponte já aprovou e o jogo
já construiu. A conta subiu para `lib/regras.js` e o teste passou a comparar as
três linguagens.

### 4. Dois padrões de confirmação
O gerador de mapa usava `window.confirm`; a barra de sessão usava confirmação
em dois tempos dentro da tela. Nenhum errado sozinho, incoerentes juntos — e
`window.confirm` trava o navegador inteiro num painel que fica aberto **durante
a live**. Unificado no padrão da barra de sessão.

### 5. Regra do ADR-012 dentro de componente
O normalizador dos dois formatos de combate morava no `MonitorAoVivo`. É regra
do ADR, não desenho: o HUD do jogo faz a mesma leitura em Luau, e uma delas
divergir mostraria coisas diferentes nas duas telas para o mesmo evento.
Subiu para `lib/regras.js`, com teste. Foi o próprio agente que pediu.

## Decisões de desenho que vale registrar

- **Mediana, não média, para a latência.** Um pico isolado de 3s arrastaria a
  média em 300ms e pintaria o painel de vermelho com nove presentes dentro do
  prazo. O pico aparece na faixa de amostras ao lado, com a linha do alvo de
  600ms atravessando: degradação vira inclinação, e inclinação se lê antes de
  dígito.
- **`jogo: offline` só fica vermelho durante a sessão.** Antes do Start é
  estado de repouso, e pintar de vermelho ao abrir o painel seria alarme falso
  toda vez.
- **Start fica âmbar com cenário de fixture escolhido**, para uma rodada de
  teste não ser confundida com entrar ao vivo.
- **Seletor de modalidade com uma opção vira rótulo**, não dropdown: seletor de
  uma opção finge escolha.
- **Direção do slot usa forma, não cor.** O cartão já gasta âmbar em aviso e
  vermelho em indisponível, e forma sobrevive a daltonismo.
- **O seletor de look não tenta renderizar o boneco** (ADR-011). Duas exceções
  legítimas ao "nenhuma cor literal" — a cor do efeito permanente e a paleta do
  mapa — porque as duas são **dado escolhido pelo streamer**, não token.

## O que continua aberto

1. **Nada disto rodou num navegador.** O gate prova que os 11 componentes
   compilam e que a fiação bate; ele não prova que a tela é legível em 2
   segundos, que os 6 slots cabem lado a lado, nem que o monitor é lido de
   canto de olho. `npm run painel` e olhar é a validação que falta.
2. **Nenhum teste renderiza componente.** Testar React exigiria vitest e
   testing-library, e instalar dependência é decisão de arquitetura que não foi
   tomada. Hoje a cobertura é das funções puras, da camada de serviços e da
   estrutura — não do comportamento na tela.
3. **O painel nunca falou com a ponte de verdade.** A camada de serviços é
   testada com `fetch` substituído. Subir os dois juntos é o próximo passo.
