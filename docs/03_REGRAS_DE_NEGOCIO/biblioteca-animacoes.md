# Biblioteca de Animações — 20 efeitos

## Como ler esta tabela
Cada animação é um **item independente e intercambiável**. Qualquer uma pode ser
vinculada a qualquer presente em qualquer slot (regra R2). Não existe tabela
fixa presente→animação.

- **Peso visual (1 a 5):** quanto de tela o efeito ocupa. Serve para o painel
  *sugerir* uma animação ao lado de um presente caro. É sugestão, não regra.
- **Duração:** tempo total do efeito. Nenhuma passa de 3,5s, senão empilha.
- **Delta variável:** se o efeito se estica visualmente conforme o delta
  (cometa mais longo para 50 plataformas do que para 5) ou é sempre igual.
- **Elementos:** tudo é nativo do Roblox (ParticleEmitter, Beam, Trail, Light,
  Highlight). **Nenhuma animação depende de asset com upload.** Ver ADR-004.

## Subida (10)

| ID | Nome | Peso | Duração | Delta variável | Elementos |
|---|---|---|---|---|---|
| `sub_pulo` | Pulo | 1 | 0,4s | não | Trail curto, poeira no pouso |
| `sub_impulso` | Impulso | 1 | 0,6s | sim | Trail, anel de choque no chão |
| `sub_mola` | Mola | 2 | 0,8s | sim | Deformação do boneco, anel elástico |
| `sub_foguete` | Foguete | 2 | 1,2s | sim | Cone de fogo, fumaça, luz laranja |
| `sub_vento` | Vento Ascendente | 2 | 1,2s | sim | Partícula em espiral, folhas |
| `sub_raio` | Raio Ascendente | 3 | 1,0s | sim | Beam elétrico, flash branco, tremor de câmera |
| `sub_cometa` | Cometa | 3 | 1,6s | sim | Trail longo, faísca, luz azul |
| `sub_tornado` | Tornado | 3 | 2,0s | sim | Coluna de partícula girando, arrasto |
| `sub_portal` | Portal | 4 | 2,2s | não | Dois anéis, distorção, boneco some e reaparece |
| `sub_fenix` | Ascensão da Fênix | 5 | 3,0s | sim | Asas de partícula, rastro de fogo, tela dourada, câmera afasta |

## Descida (10)

| ID | Nome | Peso | Duração | Delta variável | Elementos |
|---|---|---|---|---|---|
| `des_tropeco` | Tropeço | 1 | 0,4s | não | Rotação curta, poeira |
| `des_escorregao` | Escorregão | 1 | 0,6s | sim | Trail de fricção, faísca no chão |
| `des_chumbo` | Peso de Chumbo | 2 | 0,9s | sim | Boneco achata, onda de impacto |
| `des_rajada` | Rajada Descendente | 2 | 1,0s | sim | Partícula vertical para baixo, tremor |
| `des_ancora` | Âncora | 2 | 1,3s | sim | Corrente (Beam segmentado), som de metal |
| `des_meteoro` | Meteoro | 3 | 1,6s | sim | Rocha em chamas, cratera, luz vermelha |
| `des_raio_negro` | Raio Negro | 3 | 1,0s | sim | Beam roxo escuro, flash invertido |
| `des_redemoinho` | Redemoinho | 3 | 2,0s | sim | Espiral invertida, arrasto para baixo |
| `des_buraco_negro` | Buraco Negro | 4 | 2,4s | sim | Esfera escura, partícula sugada, distorção |
| `des_dimensional` | Queda Dimensional | 5 | 3,0s | sim | Fenda no espaço, fragmento de tela, câmera gira |

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
    --              nomeDoador, presenteNome }
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

## Adicionar a 21ª animação
1. Criar o ModuleScript em `game/src/animacoes/`.
2. Registrar o id em `game/src/shared/indiceAnimacoes.lua`.
3. Adicionar a linha nesta tabela.
Nada mais muda. O painel lê o índice e a animação aparece no seletor.
