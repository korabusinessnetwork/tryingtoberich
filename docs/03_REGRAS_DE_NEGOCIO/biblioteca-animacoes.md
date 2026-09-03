# Biblioteca de Animações — 32 efeitos, 6 ativos

## Como ler esta tabela
Cada animação é um **item independente e intercambiável**. Qualquer uma pode ser
vinculada a qualquer presente em qualquer slot (regra R2). Não existe tabela
fixa presente→animação.

- **Peso visual (1 a 5):** quanto de tela o efeito ocupa. Serve para o painel
  *sugerir* uma animação ao lado de um presente caro. É sugestão, não regra.
- **Duração:** tempo total do efeito. Nenhuma passa de 3,5s, senão empilha.
- **Delta variável:** se o efeito se estica visualmente conforme o delta
  (cometa mais longo para 50 plataformas do que para 5) ou é sempre igual.
- **Ativa:** se o painel oferece essa animação. `não` é **aposentada**, não
  apagada — a mesma regra do `ativo` do presente no catálogo. O módulo continua
  em `game/src/animacoes/`, o jogo continua tocando, preset salvo continua
  valendo; o que some é a opção no seletor e no testador do painel. Apagar
  quebraria preset salvo e sessão no histórico, que guardam o id.
- **Elementos:** tudo é nativo do Roblox (ParticleEmitter, Beam, Trail, Light,
  Highlight). **Nenhuma animação depende de asset com upload.** Ver ADR-004.

## As 26 primeiras estão aposentadas

Hoje só o pacote anime está ativo. As 26 do bloco original continuam no
repositório, testadas e tocáveis, com `ativa: não` — decisão do dono, não
limitação técnica. Para trazer uma de volta é uma célula na tabela abaixo e
`npm run gerar`.

Duas consequências que valem dizer em voz alta:

1. **Não sobrou peso 1 nem 2.** O pacote anime é objeto grande: os seis pesam
   entre 3 e 5. O slot do presente mais barato, que é o que chega mais vezes,
   agora recebe um efeito de peso 3 ou 4. Se isso poluir a tela na live, o
   caminho é reativar `sub_pulo` e `des_tropeco`, que existem justamente para
   esse papel.
2. **A duração mínima subiu** de 0,4s para 1,2s. É bloqueio de controle do
   streamer (R11) em todo presente, inclusive no mais barato.

## Subida (16)

| ID | Nome | Peso | Duração | Delta variável | Ativa | Elementos |
|---|---|---|---|---|---|---|
| `sub_pulo` | Pulo | 1 | 0,4s | não | não | Trail curto, poeira no pouso |
| `sub_impulso` | Impulso | 1 | 0,6s | sim | não | Trail, anel de choque no chão |
| `sub_mola` | Mola | 2 | 0,8s | sim | não | Deformação do boneco, anel elástico |
| `sub_foguete` | Foguete | 2 | 1,2s | sim | não | Cone de fogo, fumaça, luz laranja |
| `sub_vento` | Vento Ascendente | 2 | 1,2s | sim | não | Partícula em espiral, folhas |
| `sub_raio` | Raio Ascendente | 3 | 1,0s | sim | não | Beam elétrico, flash branco, tremor de câmera |
| `sub_cometa` | Cometa | 3 | 1,6s | sim | não | Trail longo, faísca, luz azul |
| `sub_tornado` | Tornado | 3 | 2,0s | sim | não | Coluna de partícula girando, arrasto |
| `sub_portal` | Portal | 4 | 2,2s | não | não | Dois anéis, distorção, boneco some e reaparece |
| `sub_fenix` | Ascensão da Fênix | 5 | 3,0s | sim | não | Asas de partícula, rastro de fogo, tela dourada, câmera afasta |
| `sub_corte` | Corte Ascendente | 3 | 1,0s | sim | não | Arco de 3 feixes, pós-imagem, flash curto |
| `sub_shuriken` | Shuriken Espiral | 4 | 2,0s | sim | não | Disco de 4 lâminas com fogo, hélice dupla, anel, fumaça, tremor |
| `sub_despertar` | Despertar | 5 | 3,0s | sim | não | Coluna de aura, cascalho subindo, 2 anéis, tela clara, câmera afasta |
| `sub_shuriken_vento` | Shuriken de Vento | 4 | 2,0s | sim | sim | Disco de 4 lâminas no ar, hélice de vento, 2 ondas, sucção, tremor |
| `sub_jato_propulsor` | Jato Propulsor | 3 | 1,8s | sim | sim | Propulsor soldado no boneco, turbina, chama em espiral, anel de chão |
| `sub_lanca_raios` | Lança de Raios | 4 | 1,2s | sim | sim | Haste com 4 arcos elétricos girando, aura violeta, clarão curto |

## Descida (16)

| ID | Nome | Peso | Duração | Delta variável | Ativa | Elementos |
|---|---|---|---|---|---|---|
| `des_tropeco` | Tropeço | 1 | 0,4s | não | não | Rotação curta, poeira |
| `des_escorregao` | Escorregão | 1 | 0,6s | sim | não | Trail de fricção, faísca no chão |
| `des_chumbo` | Peso de Chumbo | 2 | 0,9s | sim | não | Boneco achata, onda de impacto |
| `des_rajada` | Rajada Descendente | 2 | 1,0s | sim | não | Partícula vertical para baixo, tremor |
| `des_ancora` | Âncora | 2 | 1,3s | sim | não | Corrente (Beam segmentado), som de metal |
| `des_meteoro` | Meteoro | 3 | 1,6s | sim | não | Rocha em chamas, cratera, luz vermelha |
| `des_raio_negro` | Raio Negro | 3 | 1,0s | sim | não | Beam roxo escuro, flash invertido |
| `des_redemoinho` | Redemoinho | 3 | 2,0s | sim | não | Espiral invertida, arrasto para baixo |
| `des_buraco_negro` | Buraco Negro | 4 | 2,4s | sim | não | Esfera escura, partícula sugada, distorção |
| `des_dimensional` | Queda Dimensional | 5 | 3,0s | sim | não | Fenda no espaço, fragmento de tela, câmera gira |
| `des_corte` | Corte Descendente | 3 | 1,0s | sim | não | Linha reta carmesim, trilha escura, brasas |
| `des_shuriken` | Shuriken Reverso | 4 | 1,8s | sim | não | Disco vindo de cima com fogo, hélice invertida, baforão, anel |
| `des_selo` | Selo Amaldiçoado | 5 | 3,0s | sim | não | Círculo de selo, 4 correntes, tela escura, câmera afasta |
| `des_meteoro_igneo` | Meteoro Ígneo | 5 | 2,2s | sim | sim | Rocha com veias de lava descendo junto, chama em espiral, cratera, clarão |
| `des_punho_impacto` | Punho de Impacto | 4 | 1,4s | sim | sim | Manopla blindada que soca de cima, 2 anéis de choque, esteira quente, tremor |
| `des_braco_elastico` | Braço Elástico | 3 | 1,6s | sim | sim | Braço de 10 segmentos esticando para baixo, palma aberta, vapor, onda no ombro |

## Ficha de metadados (contrato do módulo Luau)

Todo módulo em `game/src/animacoes/` exporta a mesma forma:

```lua
return {
  id = "sub_cometa",
  nome = "Cometa",
  direcao = "subida",        -- "subida" | "descida" (informativo, não decide)
  pesoVisual = 3,
  duracaoBase = 1.6,
  aceitaDeltaVariavel = true,
  executar = function(personagem, contexto)
    -- contexto = { delta, intensidade, plataformaOrigem, plataformaDestino,
    --              nomeDoador, presenteNome, posicaoOrigem, posicaoDestino }
    -- Deve retornar imediatamente. Efeito roda em task.spawn.
  end,
}
```

Regras de implementação:
- `executar` **nunca** bloqueia. O movimento roda em `TweenService`, o efeito em
  `task.spawn`.
- Nenhuma animação cria instância dentro de `RenderStepped`.
- Toda instância criada é destruída no fim, com `Debris:AddItem` como rede de
  segurança.
- `intensidade` multiplica: escala do efeito, número de partículas e volume.
  Nunca multiplica a duração acima de 3,5s.

## A torre é uma escada, não um poste

A torre é uma **espiral quadrada** (ver `construtorMapa`): o boneco não sobe
reto, ele sobe **para a frente na diagonal**, rumo à quina seguinte, e desce
**para trás na diagonal**. Duas consequências valem para toda animação nova:

1. **Nada se pendura no eixo Y do mundo.** Rastro, feixe e coluna deitam na
   linha de viagem, com `Efeitos.eixoDoMovimento(raiz, contexto)` — que devolve
   a direção do movimento em espaço local da raiz, pronta para virar
   `Attachment.Position`. Efeito vertical num pulo diagonal aponta para o teto
   enquanto o corpo sai para o lado. É por isso que `contexto` carrega
   `posicaoDestino`: sem ela a animação não teria como saber a direção.
2. **Nada nasce por baixo da plataforma.** O boneco está em cima de um disco
   sólido, e anel, poeira e cratera nascidos abaixo do pé ficam DENTRO do disco
   — da câmera da live não se vê nada. Efeito de chão usa
   `Efeitos.pontoDeChao(raiz)`, que é o pé com folga por cima do tampo.

## Escala: o efeito tem que ler num celular

A live é vista em vídeo vertical comprimido, com comentário e HUD por cima. O
padrão do mercado é um objeto **grande**, que ocupa boa parte da tela, com fogo
e baforada branca junto — não partícula fina. O pacote anime segue isso: o
disco do `sub_shuriken` tem ~9 studs contra os ~5 do boneco.

O teto é o HUD: acima de ~10 studs o efeito cobre o número da plataforma, que é
o maior elemento da tela (ver `02_DESIGN_SYSTEM`).

## O pacote anime: seis efeitos portados do estudo em Three.js

Seis das 32 são porte de um estudo feito no navegador (`anime-effects.js`, seis
objetos procedurais em Three.js). São o único grupo da biblioteca que é
**objeto** e não partícula. O id vem na SEGUNDA coluna de propósito: o contador
de `test/jogo.test.mjs` soma toda linha que abre com id em crase, e uma segunda
tabela com o id na frente entraria na conta como se fosse mais biblioteca.

| Objeto | Módulo | Direção |
|---|---|---|
| Disco de 4 lâminas com correntes de vento | `sub_shuriken_vento` | subida |
| Propulsor com ogiva, turbina e bocal | `sub_jato_propulsor` | subida |
| Haste com 4 arcos elétricos girando | `sub_lanca_raios` | subida |
| Manopla blindada com canhão de antebraço | `des_punho_impacto` | descida |
| Braço de borracha esticando, palma aberta | `des_braco_elastico` | descida |
| Rocha com veias de lava | `des_meteoro_igneo` | descida |

### O que o porte teve que resolver

**Não existe malha.** O original usa `TubeGeometry`, `TorusGeometry` e
`LatheGeometry`, e nenhum dos três tem equivalente nativo no Roblox. Trazer a
malha exigiria upload, que o ADR-004 proíbe. As trocas, todas em
`shared/efeitos.lua`:

| Three.js | Aqui | Por quê |
|---|---|---|
| `TubeGeometry` numa curva | `Efeitos.helice` — cilindros curtos deitados na tangente | Varredura vira conta. Comprimido num vídeo vertical, lê como tubo |
| `TorusGeometry` | Cylinder chato | De perfil os dois leem igual |
| `LatheGeometry` (bocal, cano) | 3 discos de raio crescente | O sanfonado é o que lê, não o perfil exato |
| `ConeGeometry` | WedgePart, ou discos afinando | Cone não é primitiva do Roblox, e a saída usual é asset |
| `IcosahedronGeometry` | Ball com lascas grudadas | Facetamento exige malha |
| `THREE.Group` | `Efeitos.pivo` + `Efeitos.soldar` | Part invisível ancorada com o resto soldado nela |

**Não existe loop de render.** O original roda `update(t)` a cada frame. Aqui a
animação executa no SERVIDOR, e CFrame de peça ancorada mexido a 60Hz replica mal
— chega tremendo justamente no espectador que pagou. Duas saídas:

- Giro de peça vira `Efeitos.girar`: corrente de Tween com ângulo absoluto, no
  máximo 120° por trecho (acima de meia volta o Tween pega o caminho curto e o
  objeto quica). Uma a duas voltas e meia na ficha inteira, não mais.
- Velocidade aparente fica com **partícula**, que é simulada no cliente e sai
  lisa. É a mesma conclusão a que o `sub_shuriken` já tinha chegado.

**O eixo é a escada, não o +X.** O estudo pendura tudo em +X — nariz na frente,
escape atrás. Aqui o eixo é `Efeitos.eixoDoMovimento`, e o pivô nasce de
`Efeitos.olharPara`: **Z local do pivô é a linha de viagem, e Z positivo é para
trás**. Toda peça dos seis módulos é posicionada nessa convenção.

**Objeto parado × objeto que viaja.** O movimento do boneco é Tween Quad
(`movimento.lua`), e nada que acompanhe em Linear fica junto dele o percurso
inteiro. Cada módulo escolheu uma das três saídas, e a escolha está no cabeçalho
de cada um:

1. **Parado** (`sub_shuriken_vento`, `sub_lanca_raios`): o objeto fica no ponto
   de partida e o boneco sai por ele. Lê igual em delta de 3 ou de 50.
2. **Soldado na raiz** (`sub_jato_propulsor`): segue o Tween com exatidão, e em
   troca não pode girar — o CFrame é o da raiz, e disputar isso é o que o ADR-005
   proíbe.
3. **Percurso próprio** (`des_meteoro_igneo`, e o soco curto do
   `des_punho_impacto`): só quando o percurso foi desenhado para casar com a
   curva do boneco. A rocha sai 20 studs atrás para alcançá-lo no primeiro terço.

**A direção não está no código.** Os seis módulos são direção-neutra: montam
atrás e agem para a frente na linha de viagem, e `eixoDoMovimento` resolve o
resto. `des_punho_impacto` e `des_braco_elastico` viraram descida por leitura
visual, não por limitação — e porque a biblioteca é servida em metades iguais
(ver o teste da rota `/api/animacoes`).

## Adicionar a 33ª animação
1. Criar o ModuleScript em `game/src/animacoes/`.
2. Registrar o id em `game/src/shared/indiceAnimacoes.lua`.
3. Adicionar a linha nesta tabela.
Nada mais muda. O painel lê o índice e a animação aparece no seletor.
