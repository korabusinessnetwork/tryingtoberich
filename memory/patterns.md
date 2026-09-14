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

## Padrão: o agente também é revisado
Quem escreveu o código não é bom revisor do próprio código, e isso vale para
agente igual vale para pessoa. O projeto roda com `security-guidance` (Anthropic,
escopo de usuário) ativo: ele revisa a mudança que o agente acabou de fazer no
edit, no fim do turno e no commit. O `VibeSec-Skill` entra como contexto de
código seguro do agente, em `.claude/skills/vibesec`.

Nada disso toca o caminho crítico do presente: é revisão de quem escreve, não
de quem roda. Ver ADR-014 e `docs/11_SEGURANCA`, camada 6.

Toda skill de terceiro passa pelo `skillspector scan --no-llm` antes de entrar,
e o score dele não reprova sozinho: as duas primeiras varreduras deram
`CRITICAL` por casarem com os exemplos de ataque da própria documentação. Lê-se
o achado, e falso positivo revisado vai para um baseline versionado ao lado da
skill, com o motivo dentro.

Limite que a ferramenta não cobre: isolamento entre tenants. O `streamerId` já
existe em todo modelo persistido (ADR-003) e a Fase 3 é multi-tenant. Esse teste
é manual e obrigatório.

## Padrão: id que vem de rota nunca vira caminho direto
Todo id que chega pela URL passa por `exigirIdentificador` antes de virar nome
de arquivo, e o `caminhoDeDados` recusa qualquer caminho que saia de `data/`.
São duas travas de propósito: a primeira dá mensagem legível, a segunda segura
a rota nova que esquecer de validar. O Express decodifica `%2F` DEPOIS de casar
a rota, então `:id` alcança `../../`. Ver 11_SEGURANCA, camada 3.

## Padrão: resposta de API externa é entrada, não verdade
As APIs web do Roblox e o catálogo da TikTok não são contratados (ADR-011 e
ADR-006). Id que vem de lá e entra em URL é conferido como inteiro; URL que vem
de lá e vira requisição é conferida por `hostname` exato, nunca por
`startsWith`. O mesmo vale para cabeçalho de requisição: `Range` é interpretado
por função pura, e o que não faz sentido vira 416.

## Padrão: nada em memória cresce sem teto
Cache, fila de espera e contador por ip têm limite e descarte, sempre. `Map`
alimentado por quem chama de fora é vazamento com outro nome, e TTL que vence o
valor sem remover a chave não resolve. Ver `bridge/src/cacheComTeto.mjs`.

## Padrão: correção de segurança nasce com teste que falha antes
Todo conserto dos dez achados de 2026-09-14 entrou com teste, e cada teste foi
rodado com a correção REVERTIDA para provar que ele falha sem ela. O primeiro
teste do rate limit passava nos dois casos — o vazamento não era observável de
fora — e por isso o guarda passou a expor `janelasAbertas`. Teste que passa sem
a correção não é teste, é decoração.
