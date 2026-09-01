# Validação do Bloco 2

Relatório da fase de síntese. O Bloco 2 foi construído por **9 agentes em
paralelo**, em três levas, cada um dono exclusivo de um conjunto de arquivos.
Este documento é o que fecha o ciclo: o que foi checado, o que estava quebrado
e o que continua aberto.

Data: 2026-09-01 · 39 arquivos Luau · 141 testes

## Como o trabalho foi dividido

| Leva | Agentes | Arquivos |
|---|---|---|
| 0 | orquestrador | `shared/` inteiro, Rojo, gate de sintaxe |
| 1 | 5 | movimento, plataformas, construtorMapa + jogabilidade, ponte, personagem |
| 2 | 4 | 10 animações de subida, 10 de descida, HUD + câmera, vestiário |
| 3 | orquestrador | sessao, vestiário servidor, flash, síntese |

A regra anti-colisão foi **dono exclusivo por arquivo**, com a instrução de que
faltando algo no compartilhado o agente implementasse localmente e reportasse,
nunca editando fora do escopo. Nenhum conflito de escrita aconteceu nas nove
entregas.

## Checagens

| # | Checagem | Resultado |
|---|---|---|
| 1 | Sintaxe de todo `.lua` (`luac5.1 -p`) | 39/39 |
| 2 | Estrutura conforme o plano, sem colisão | ok |
| 3 | Nenhum módulo órfão (todo arquivo é requerido) | ok |
| 4 | `sessao.lua` só chama função que existe nos 5 módulos | ok, virou teste |
| 5 | Todo RemoteEvent do contrato tem os dois lados ligados | **quebrado, corrigido**, virou teste |
| 6 | As 20 animações batem com `data/animacoes.json` | ok, virou teste |
| 7 | Nenhuma animação usa `rbxassetid` inventado nem move o boneco | ok, virou teste |
| 8 | Constantes duplicadas entre Luau e JavaScript | **quebrado, corrigido**, virou teste |
| 9 | Nenhum token ou URL de túnel em `.lua` versionado | ok, virou teste |
| 10 | Os 11 itens do backlog com evidência no código | 11/11 |

## Defeitos encontrados na síntese

### 1. O empate do combate nunca chegava ao jogo
O HUD escutava `COMBATE_ANULADO`, mas a ponte só publicava empate no SSE do
painel — `aoAnular` nunca tocava o long-poll. **A feature inteira estava morta,
sem erro em lugar nenhum.** É o descasamento clássico de construção paralela:
os dois lados foram escritos contra o contrato, e o contrato não tinha caminho.

O empate não cabia em `eventos` porque delta 0 não existe no contrato com o
jogo, então o envelope do long-poll ganhou uma lista `anulados` ao lado, com
cursor único para as duas.

### 2. A regra horizontal do ADR-009 nunca tinha sido implementada
Só a vertical existia, no schema e no validador da ponte. Ao implementar a
horizontal apareceu que o mapa de exemplo — vindo do próprio `04_MODELAGEM` —
a violava: `variacaoHorizontal` 9 contra um alcance real de 6,07 studs.

Sem isso, **a ponte aceitaria um spec que o jogo recusa dentro do Studio, no
meio da live.** Corrigido nos dois lados, com a fórmula em `regras.mjs` e em
`jogabilidade.lua`, e um teste travando as duas no mesmo número.

### 3. Métrica de jogabilidade medindo a coisa errada
O `verificarConstruido` media distância entre **centros**. Os discos têm raio
~8: dois com centros a 9 studs se sobrepõem, e aí não existe salto horizontal
nenhum. Passou a medir o **vão entre as bordas**, que é o que o streamer de
fato atravessa.

### 4. Laço de long-poll sem piso
O backoff cobria só erro. Uma ponte respondendo na hora sem ter evento —
long-poll mal configurado, 200 com corpo inválido, página de erro do túnel com
status 200 — faria o laço girar livre e estourar o teto de ~500 requisições por
minuto do HttpService. Piso de 0,5s entre voltas **sem evento entregue**, que
não custa latência de presente nenhuma.

### 5. Um teste meu passando vazio
O teste de "cliente só escuta evento que o servidor emite" casava por padrão de
chamada, mas o código real liga por variável intermediária. Os dois conjuntos
vinham quase vazios e a comparação dava verde. **Guarda que não morde é pior
que não ter teste, porque parece cobertura.** Reescrito para casar por nome de
constante, e verificado removendo um arquivo de propósito.

## Lacunas do compartilhado que os agentes acharam

As três foram reportadas em vez de contornadas em silêncio, e as três eram
reais. O padrão vale mais que os itens: a regra anti-colisão custou contornos
temporários e comprou visibilidade.

| Lacuna | Contorno do agente | Correção |
|---|---|---|
| `efeitos.lua` sempre agendava `Debris` | prazo de 6 horas | `duracao` nil = sem limpeza automática |
| `tokens.lua` não espelhava o bloco `painel` | 5 hex replicados à mão | gerador passou a emitir |
| Sem RemoteEvent para clarão de tela | Highlight + luz | `Eventos.FLASH` e `Efeitos.flash` |

## O que continua aberto

1. **Nada disto rodou dentro do Roblox.** O gate de sintaxe prova que o Luau
   compila; ele não prova que a torre sobe, que o Tween pousa em cima da
   plataforma nem que o HUD lê no celular. A primeira sessão no Studio é a
   validação de verdade.
2. **O acervo continua pendente.** Nenhum mapa pode ir ao ar até as imagens
   serem enviadas e aprovadas no Roblox. `npm run validar` mostra o que falta.
3. **O túnel pode ser desnecessário.** Ver a questão em aberto no ADR-002: se o
   HttpService do Studio alcançar `127.0.0.1`, some a única exposição do
   sistema à internet e um terço do orçamento de latência.
4. **A latência nunca foi medida.** A ponte já mede a própria fatia e manda no
   SSE. Falta a ponta a ponta, que é o Princípio nº1 do projeto.
