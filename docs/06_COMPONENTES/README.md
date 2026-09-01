# 06 — Componentes (painel)

Um componente por arquivo, CSS separado, sem lógica de acesso a dado dentro do
componente. Toda chamada de rede passa por `panel/src/lib/api.js`.

| Componente | Papel | Estado que recebe |
|---|---|---|
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

## Regras
- `CartaoDeSlot` é o componente mais importante do produto. Ele precisa mostrar
  presente, animação, delta e intensidade **de uma olhada só**, sem abrir nada.
- Estado de carregando, erro e vazio são obrigatórios em todo componente que
  busca dado. Nada de tela em branco.
- Nenhum componente conhece caminho de arquivo nem formato de resposta cru.
- Nenhum componente monta prompt de IA. Isso vive na ponte (ver `10_PROMPTS`).
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
