# 06 — Componentes (painel)

Um componente por arquivo, CSS separado, sem lógica de acesso a dado dentro do
componente. Toda chamada de rede passa por `panel/src/lib/api.js`.

| Componente | Papel | Estado que recebe |
|---|---|---|
| `NavegacaoDePaginas` | Troca entre as 3 páginas do painel, com contador de problemas | página atual |
| `BarraDeSessao` | Start/stop, estado da live e do jogo, cronômetro | estado do SSE |
| `SeletorModalidade` | Escolhe a modalidade (Fase 1: só Escalada) | lista de modalidades |
| `EditorDePreset` | Container dos 6 slots, salva o preset | preset |
| `CartaoDeSlot` | Um slot: presente, animação, delta, intensidade | slot, catálogo, animações |
| `SeletorDePresente` | Modal com busca, ícone oficial, cor de faixa | catálogo |
| `SeletorDeAnimacao` | Modal com filtro por direção e peso visual | animações |
| `AvisoDeCurva` | Aviso não bloqueante de vínculo fora do esperado | slot |
| `SeletorDeLook` | Lista looks salvos com grade de ícones das peças | looks |
| `GeradorDeMapa` | Campo de descrição, botão gerar, estado de carregando | mapas |
| `PreviaDeMapa` | Mostra paleta, altura, densidade do spec gerado | mapa |
| `MonitorAoVivo` | Últimos eventos, latência medida, não mapeados | fluxo do SSE |
| `TestadorDePresente` | Dispara presente à mão, um ou vários juntos | preset, catálogo |
| `TestadorDeAnimacao` | Um botão por animação, dispara direto no jogo sem preset | animações, estado do jogo |
| `BotaoAbrirJogo` | Sobe o `rojo serve` e abre o Roblox Studio nesta máquina | — |
| `PainelDeLogs` | O que a ponte e o painel registraram, para quando algo falha | fluxo do SSE |

## Regras
- `CartaoDeSlot` é o componente mais importante do produto. Ele precisa mostrar
  presente, animação, delta e intensidade **de uma olhada só**, sem abrir nada.
- Estado de carregando, erro e vazio são obrigatórios em todo componente que
  busca dado. Nada de tela em branco.
- Nenhum componente conhece caminho de arquivo nem formato de resposta cru.
- Nenhum componente monta prompt de IA. Isso vive na ponte (ver `10_PROMPTS`).
- O painel tem 4 páginas: **Ao vivo** (6 slots, monitor, testador), **Configurar**
  (modalidade, look, mapa e prévia), **Jogo** (abrir no Studio e testar as 20
  animações) e **Log**. "Ao vivo" é a de abertura, e é
  inegociável que ela carregue os 6 slots: o 02_DESIGN_SYSTEM exige os seis lado
  a lado e sempre visíveis. O que foi para "Configurar" é o que já era pré-live
  e trava com a sessão rodando, então sair da tela principal não custa nada.
- `TestadorDeAnimacao` e `TestadorDePresente` respondem perguntas DIFERENTES e
  por isso não se fundem: o de presente testa o CAMINHO (casa com slot, entra em
  combate, sai pelo long-poll) e exige sessão; o de animação testa o DESTINO e
  não exige sessão, preset nem live. Exigir configuração antes de "essa animação
  toca?" é o que faz ninguém testar.
- `SeletorDeLook` **não** tenta renderizar o boneco montado. Prévia de corpo
  inteiro só existe no vestiário dentro do jogo. Ver ADR-011.
- `TestadorDePresente` dispara pelo **mesmo caminho** de um presente de verdade:
  casamento com slot (R1), combo (R4), combate (ADR-012), long-poll e SSE.
  Testador com atalho provaria que o atalho funciona, e é justamente a fiação
  que costuma estar errada. Dois ou mais presentes no mesmo disparo chegam no
  mesmo instante, que é como se testa o combate sem depender de dois
  espectadores clicarem juntos.
- O testador é **âmbar e diz que não é a live**, pelo mesmo motivo que o Start
  em modo fixture: teste nunca pode se parecer com produção numa tela que
  controla uma transmissão ao vivo.
- `PainelDeLogs` é a **única tela do painel feita para ler**, e não para olhar
  de canto de olho: o streamer só vem aqui depois que algo falhou, e nesse
  momento ele já parou de jogar. Por isso ela pode ter densidade de texto e
  fonte monoespaçada, ao contrário do resto.
- Ele mistura log da ponte (pelo SSE) com log do próprio painel. Os dois
  precisam existir porque a falha mais provável é a ponte cair — e aí o SSE cai
  junto, e o log dela para de chegar exatamente quando seria mais útil.
