# 02 — Design System

Duas superfícies visuais com regras opostas. Não misturar.

## A. Painel (segunda tela, desktop, durante a live)

Princípio: **densidade e leitura de canto de olho.** O streamer está jogando e
falando. Ele olha o painel por 2 segundos por vez.

- Tema escuro fixo. Fundo próximo de `#111`, superfície `#1B1B1B`.
- Estado sempre visível e colorido: live conectada, jogo online, sessão rodando.
  Verde, âmbar e vermelho, com texto junto, nunca cor sozinha.
- Os 6 slots ficam lado a lado, sempre visíveis, sem scroll. É a tela principal.
- Alvo de toque e clique com no mínimo 40px. O streamer clica com pressa.
- Nada de animação decorativa. Transição só onde comunica mudança de estado.
- Toda cor de marca vem de variável CSS, nunca literal no componente. Isso é o
  que permite white-label na Fase 3 sem reescrever componente.
- CSS em arquivo separado do JSX (ver `CLAUDE.md`).

## B. HUD do jogo (dentro da live, formato vertical, visto no celular)

Princípio: **legível num vídeo vertical comprimido, em tela de 6 polegadas.**
A referência analisada mostra o padrão que funciona: rótulos curtíssimos e
números enormes.

- Número da plataforma: o maior elemento da tela, com contorno grosso e sombra.
  Precisa ler sobre qualquer fundo de mapa.
- Rótulo de presente com no máximo 8 caracteres. Referência usa `+100`, `WIN`,
  `LIKE`, `SEGUIR`. Seguir isso.
- Nome do doador aparece por 3 segundos e some. Nunca acumula lista.
- HUD ocupa as laterais, não o centro. O centro é onde o boneco fica e onde o
  TikTok põe o comentário.
- Considerar que o TikTok corta as bordas e sobrepõe interface própria na base.
  Nada crítico nos 15% inferiores da tela.
- Contraste sempre com contorno escuro no texto claro. Mapa gerado por IA pode
  ter qualquer paleta de fundo, então o HUD não pode depender do fundo.

## Tokens compartilhados
Faixa de presente (só exibição, ver R3): I cinza, II azul, III roxo, IV laranja,
V dourado. Os mesmos hex no painel e no HUD, definidos uma vez em
`panel/src/styles/tokens.css` e espelhados em `game/src/shared/tokens.lua`.
