# ADR-007 — Seis slots com vínculo livre entre presente e animação

**Status**: Aceito · **Data**: 2026-09-01 · **Decisores**: Matheus Bonato

## Contexto
O desenho inicial proposto era automático: faixas de valor em moedas disparariam
animações de intensidade crescente, cobrindo todo o catálogo da TikTok. O dono
corrigiu: as 20 animações existem para **serem escolhidas**, e o número de
presentes ativos é limitado a 6, que é o que a TikTok exibe como desejos na live.

## Decisão
- Um preset tem **exatamente 6 slots**. *(Emendado em 2026-09-04: seis por
  padrão, até 24. Ver o acréscimo no fim desta lista.)*
- Cada slot vincula **um presente a uma animação**, com delta e intensidade,
  tudo escolhido explicitamente pelo streamer.
- **Nenhum vínculo automático.** O valor em moedas é ordenação e aviso, jamais
  regra.
- Presente que chega e não está em nenhum slot é descartado e contabilizado.

  > **Acréscimo de 2026-09-02 — presentes de placar.** Existe uma segunda lista
  > no preset, `placar`, que vincula presente a **vitória ou derrota** em vez de
  > animação. Ela é SEPARADA dos 6 de propósito: presente de vitória não pode
  > custar um slot de subida, senão as duas coisas competem pelo mesmo espaço e
  > o streamer escolhe entre animar e pontuar. Os 6 slots continuam sendo só
  > presente→animação, e o "exatamente 6" acima continua valendo para eles.
  >
  > Um presente não pode estar nas duas listas: seria ambíguo, e a R1.4 recusa o
  > preset antes de salvar. O efeito viaja pelo canal de COMANDO do ADR-013 —
  > não tem delta e não casa com slot — e encerra a rodada pelo mesmo caminho de
  > chegar ao topo.
  >
  > O que toca quando a rodada acaba é a **cutscene** do overlay do OBS,
  > escolhida no mesmo editor, por resultado. Ver ADR-014.

  > **Acréscimo de 2026-09-04 — a tabela de movimento (ADR-016).** "Presente que
  > chega e não está em nenhum slot é descartado" deixou de valer sozinho: o
  > preset ganhou uma tabela que dá delta a TODO presente do catálogo, calculado
  > por `moedas × multiplicador`. O que este ADR decidiu continua de pé onde
  > importa — **os 6 slots são escolha explícita e vencem a tabela**, com
  > animação, delta, intensidade e cooldown próprios. A tabela responde uma
  > pergunta só, "quanto a torre anda", e nunca escolhe animação. Descartado
  > continua sendo só o presente que não move nada. Ver ADR-016 e R12.

  > **Acréscimo de 2026-09-04 — seis por padrão, até 24.** O dono pediu: *"por
  > padrão a gente usa 6 presentes, mas eu gostaria de colocar um botão para o
  > usuário poder adicionar mais presentes e definir o que cada um deles vai
  > fazer, e decidir se vai ir pro overlay ou não"*. O "exatamente 6" desta
  > decisão vira **seis por padrão, até 24**, e a alternativa "Mais de 6 slots"
  > abaixo deixa de estar descartada.
  >
  > O argumento que a descartava continua inteiro — o espectador só vê seis
  > desejos no app da TikTok — e é por isso que 6 segue sendo o que o painel
  > abre, e que os seis primeiros mantêm a linha única e sempre visível do
  > `02_DESIGN_SYSTEM`. Ele só parou de ser proibição: quem quer o sétimo é o
  > streamer, presente a presente, e ele sabe que aquele não estará nos desejos.
  >
  > Cada slot ganhou **`mostrarNoOverlay`**, que diz se ele entra na legenda do
  > overlay (ADR-015). Ausente quer dizer que entra, senão todo preset já salvo
  > sumiria da legenda ao ser regravado. O campo existe por causa da forma da
  > tela e não por gosto: a legenda foi desenhada para poucos itens num palco
  > 9:16, positivos à esquerda e negativos à direita, e 24 presentes ali
  > estouram a faixa e cobrem o boneco. Com o filtro, o streamer cresce o preset
  > sem redesenhar o overlay. Fora da legenda o presente continua valendo no
  > jogo — muda a tela, não a mecânica.
  >
  > A unicidade de `posicao` saiu do JSON Schema e virou regra cruzada em
  > `dominio/regras.mjs`, ao lado da de `presenteId`: o schema a garantia com um
  > bloco por posição, e vinte e quatro daqueles seriam ilegíveis. Ver R1.

## Alternativas consideradas
### Faixa de valor dispara animação automaticamente
- Prós: cobre o catálogo inteiro sem configuração.
- Contras: o streamer perde o controle que é a proposta de valor do produto; a
  live fica igual à de qualquer ferramenta pronta; e obriga a manter um mapa de
  valores que a TikTok muda sem avisar.
- Descartado por decisão do dono.

### Mais de 6 slots
- Descartado porque: o espectador só vê 6 desejos no app da TikTok. Slot que o
  espectador não vê é slot que quase não dispara.
- **Reaberto em 2026-09-04, por decisão do dono.** O argumento acima não caiu:
  ele virou a razão de 6 ser o **padrão**, e de os seis primeiros terem uma
  linha só na tela. O que mudou é quem decide — o streamer, clicando em
  "Acrescentar presente" até 24, ciente de que o sétimo em diante não aparece
  nos desejos e vai depender de ele narrar. Ver o acréscimo na Decisão.

## Consequências
### Positivas
- Controle total do streamer, que é a proposta de valor.
- O motor no Roblox fica burro e simples: recebe `{animacaoId, delta}` e executa.
  Não sabe o que é presente nem quanto vale.
- Mudança no catálogo da TikTok não quebra regra de jogo nenhuma.

### Negativas / trade-offs
- Exige configuração antes de cada live. Mitigado por presets salvos e reusáveis.
- Presente fora dos 6 não faz nada. Mitigado pelo contador de "não mapeado" no
  painel, que mostra o que o streamer está deixando na mesa.
- O catálogo completo continua necessário, agora como **lista de seleção**, não
  como tabela de regra. Ver `04_MODELAGEM/catalogo-presentes.md`.


## Nota de implementação — 2026-09-02: o portal, e a rodada devida

Duas mudanças pedidas pelo dono, que se encaixam:

### A derrota deixou de ser automática
Voltar ao pé da torre depois de ter saído chamava `encerrarRodada("derrota")`
direto: contagem regressiva e reinício, com a plateia assistindo. Isso é o FIM
de uma disputa, não uma disputa — o momento mais dramático da live acontecia
sozinho.

Agora o chão ganha um **portal**, no estilo do portal do Nether:

- ergue-se quando o streamer volta ao andar 1 depois de ter saído;
- **só presente negativo o machuca**, e o dano é o tamanho do empurrão
  (`|delta|`, em andares) — quem quer a derrota paga por ela, na moeda do jogo;
- **não fecha quando o streamer escapa** subindo: fica lá embaixo apanhando, e
  pode quebrar com o boneco no andar 300;
- quebrou, é derrota.

O presente de placar `derrota` é o **atalho pago**: quebra o portal inteiro de
uma vez, sem gastar a vida dele.

**A moldura se quebra junto (2026-09-04).** Ela é montada em tijolos, e cada
golpe derruba a fatia que a vida perdida já não sustenta — os pedaços voam para
fora, giram e somem. Antes eram quatro blocos inteiros e a única pista de dano
era o vazio esmaecendo: o espectador pagava para quebrar uma coisa que não se
quebrava. Pedido do dono.

Consequência no código: a derrota deixou de ser cancelável. `aindaNaPlataformaDoFim`
cancelava a contagem quando o streamer saía do andar 1, porque derrota era uma
POSIÇÃO. Hoje ela vem de um portal quebrado, e isso não desacontece. A vitória
continua cancelável — ela ainda é posição.

### Um donate pode valer N rodadas, cobradas uma a uma
A rajada (R4) era jogada fora no caminho do placar: mandar o presente uma vez ou
seis fazia o mesmo. Agora `quantidade` viaja no comando, e o jogo põe as
rodadas numa **fila**, cobrando uma por vez — cada uma com sua queda e sua
contagem. O dono foi explícito: *"fico descendo até acabar as 6"*. Somar +6 no
número daria o mesmo placar e nenhum espetáculo, e é o espetáculo que o
espectador comprou.

Fila nova substitui a antiga em vez de somar: uma vitória mandada no meio de
seis derrotas é uma virada, não um acréscimo à punição. O botão de reiniciar do
painel limpa a fila — é o streamer limpando a mesa.

### A armadilha do campo novo
`quantidade` passa por quatro mãos e **três têm lista fechada de campos**:
`despachante` → `registro.#responder` → `ponte.lua` → `sessao.lua`. Um elo que a
esqueça não dá erro de contrato nem de tipo: seis derrotas simplesmente chegam
como uma. Duas dessas listas já engoliram campo antes — o `ponte.lua` filtrava
comando por nome e matava três botões do painel em silêncio. Há teste amarrando
os quatro elos.

### Onde mora a vida do portal
No **preset** (`portal.vida`), porque é regra de partida. Mas o jogo não conhece
preset — ele busca mapa e look. A ponte injeta o número na resposta de
`/jogo/mapa`, pelo mesmo caminho que `acervoResolvido` já usava: o disco continua
guardando só o spec. Trocar a vida no painel vale a partir do próximo
`recarregar-mapa`, que é o mesmo instante em que a torre se reergue.
