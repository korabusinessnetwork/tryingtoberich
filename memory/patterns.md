# Padrões — Kora Stream Games

## Padrão: caminho crítico versus caminho frio
Todo evento que chega da TikTok segue dois caminhos a partir da ponte:
- **Quente (bloqueante, alvo <50ms no Node):** normalizar evento → casar com slot
  → responder o long-poll pendente.
- **Frio (fire-and-forget):** gravar no log da sessão, atualizar contador do
  painel, calcular estatística.
Nunca mover coisa do frio para o quente. Ver `CLAUDE.md`, Princípio nº1.

## Padrão: repositório para arquivo JSON
Nenhum `fs.readFile` fora de `bridge/src/repos/`. Cada repositório expõe verbos
de domínio (`carregarPreset`, `salvarPreset`), nunca caminho de arquivo. Isso é
o que permite trocar JSON por banco na Fase 3 mexendo em um diretório só.
Ver ADR-003.

## Padrão: uma animação, um módulo
Cada uma das 20 animações é um ModuleScript isolado em `game/src/animacoes/`,
com a mesma assinatura `executar(personagem, contexto)` e a mesma ficha de
metadados. Nenhuma animação conhece a existência de outra. Adicionar a 21ª é
criar um arquivo e registrar no índice, nada mais.

## Padrão: o painel manda spec, o jogo interpreta
A ponte nunca envia comando visual detalhado para o Roblox. Ela envia
`{slotId, animacaoId, delta, intensidade}`. Toda decisão de como aquilo aparece
na tela vive no Luau. Isso mantém a ponte agnóstica de jogo e permite a Fase 2
reusar a ponte inteira em outra modalidade.

## Padrão: valor sugere, usuário decide
Onde o valor em moedas do presente aparecer, ele é ordenação, cor de destaque ou
aviso. Nunca é regra de negócio. O vínculo presente→animação é sempre escolha
explícita do streamer. Ver ADR-007.

## Padrão: nomes
- Domínio em português: `preset`, `slot`, `presente`, `animacao`, `escalada`.
- Técnico em inglês: `handleGiftEvent`, `useLongPoll`, `retryWithBackoff`.

## Padrão: o jogo é dono da posição, a ponte é dona do delta
A ponte nunca sabe em que plataforma o boneco está e nunca acumula posição. Ela
envia `delta`. O Roblox aplica sobre a `plataformaReferencia` que só ele conhece,
porque só ele vê o streamer jogando. Se a ponte precisar da posição para exibir
no painel, ela recebe do jogo via `POST /jogo/estado`. Ver R9.

## Padrão: toda tomada de controle tem watchdog
Qualquer código que ancore o personagem, desabilite input ou assuma o movimento
arma um timer independente que força a restauração. Sem exceção. Personagem
ancorado por bug é live morta. Ver ADR-005 e R11.
