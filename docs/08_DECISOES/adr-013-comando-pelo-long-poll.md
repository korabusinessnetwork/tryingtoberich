# ADR-013 — Ordem do painel para o jogo pelo mesmo long-poll

- **Status:** aceito
- **Data:** 2026-09-02
- **Contexto:** R6 (vitória e reinício), ADR-002 (long-poll), ADR-007 (o motor
  é burro de propósito)

## Contexto

O R6 diz que chegar ao topo **não reinicia sozinho**: o streamer decide no
painel. Isso exige algo que o sistema não tinha — um caminho do painel para o
jogo que não seja um presente.

Tudo que a ponte mandava para o Roblox até aqui era `{animacaoId, delta,
intensidade}`: um efeito visual e um deslocamento. "Reiniciar a corrida" não é
nada disso. Não tem delta, não casa com slot, não veio de espectador nenhum, e
não deve tocar animação.

O sentido também é o incomum: o HttpService do Roblox **não recebe chamada de
fora** (ADR-002). Quem inicia toda conexão é sempre o jogo. Não existe "a ponte
avisa o Roblox"; existe o Roblox perguntando e a ponte respondendo.

## Decisão

**O comando viaja como uma terceira lista no envelope do long-poll que já
existe, com o mesmo cursor.**

```json
{
  "cursor": 413,
  "eventos": [],
  "anulados": [],
  "comandos": [{ "id": 413, "tipo": "reiniciar", "emitidoEm": 1756742599001 }]
}
```

O id sai do **mesmo contador** dos presentes, emitido pelo despachante — o dono
do cursor.

## Alternativas consideradas

**Um segundo long-poll, só para comando.** Dobraria as conexões abertas por
servidor do Roblox e o consumo do teto de ~500 requisições/minuto do
HttpService, para transportar um evento que acontece uma vez por live. E teria
o pior efeito de todos: dois cursores independentes, sem nenhuma ordem
garantida entre eles.

**Reusar a lista `eventos` com um `animacaoId` especial.** Foi tentador e é
errado: o jogo valida todo item de `eventos` como presente (`Tipos.validarEvento`
exige animacaoId, delta e intensidade), e delta 0 é proibido no contrato de
propósito. Um "presente que não move o boneco" seria um caso especial dentro do
caminho quente — exatamente onde o Princípio nº1 proíbe casos especiais.

**Um endpoint `POST /jogo/reiniciar` na ponte.** Impossível: a ponte não
alcança o Roblox. Inverte o sentido do ADR-002.

## Consequências

- Um tipo de comando novo é uma linha no enum do schema e um `if` no
  `aoComando` de `sessao.lua`. O envelope não muda de forma.
- **A ordem entre comando e presente é preservada de graça**, porque é um
  cursor só. Reiniciar depois de um presente que já saiu é diferente de
  reiniciar antes dele.
- Comando com o jogo offline é **descartado**, como presente é (F7). A ponte
  responde `jogoOnline` para o painel poder dizer isso ao streamer, em vez de
  ele clicar de novo achando que travou.
- Tipo de comando desconhecido é ignorado em silêncio no Luau: uma ponte mais
  nova falando com um jogo mais velho não pode derrubar o laço de long-poll.
- O comando **não ocupa** o canal de animação (`ocupadoAte`) nem cooldown de
  slot. O presente que chegar no instante seguinte continua saindo na hora.

## O que isto NÃO autoriza

Comando não é uma porta para o painel dirigir o jogo. O motor continua burro
(ADR-007): ele recebe animação e delta, e agora uma ordem de reinício. Toda
regra nova que puder ser expressa como delta deve continuar sendo um presente,
e não um comando novo.
