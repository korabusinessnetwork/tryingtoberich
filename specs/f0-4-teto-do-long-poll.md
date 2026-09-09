# Spec — F0-4: o teto do long-poll, e o backoff que ele dispara hoje

**Rodada:** 3 do ciclo de produto · **Data:** 2026-09-09
**Origem:** `F0-4` em [`docs/09_BACKLOG/fase-0-fixes-minimos.md`](../docs/09_BACKLOG/fase-0-fixes-minimos.md)
e a nota do [ADR-002](../docs/08_DECISOES/adr-002-ponte-long-poll.md) que chama
os 20 segundos de "chute inicial".

---

## O achado: F0-4 não é só uma medição

O item foi escrito como "confirmar o teto de 20s". Lendo o laço em
`game/src/server/ponte.lua`, o problema é maior, e ele não depende de saber o
número.

**Hoje, se o Roblox fechar o long-poll antes dos 20s da ponte, cada volta ociosa
é tratada como ERRO:**

```
requisitar() falha  ->  definirOnline(false, erro)
                    ->  task.wait(backoffAtual)
                    ->  backoffAtual = min(backoffAtual * 2, 30)
```

As três consequências, em ordem de gravidade:

1. **O backoff sobe até 30 segundos.** Um presente que chegue durante essa
   espera fica parado até ela acabar. O `CLAUDE.md` orça **1000ms** do presente
   ao primeiro frame; 30s é trinta vezes o orçamento inteiro. O valor do produto
   morre exatamente como o princípio nº 1 descreve.
2. **O painel pisca "Jogo offline"** a cada volta ociosa, porque o long-poll é
   o **único** sinal de online que existe — `enviarEstado` é fire-and-forget e
   não mexe nele, de propósito.
3. **Só acontece com a live quieta**, que é justamente quando ninguém está
   olhando o painel. O sintoma aparece na live seguinte, sem causa aparente.

E isso vale **agora**, com o túnel. Não é um risco do futuro instalador.

Por isso esta rodada conserta o laço primeiro e mede depois: o conserto não
depende do número, e o número aparece como subproduto.

## A medição continua sendo do dono

Como no F0-7: confirmar o teto exige o Roblox Studio, que eu não tenho. A
diferença é que aqui **o sistema passa a descobrir o número sozinho durante uma
sessão normal** e a avisá-lo na tela — em vez de exigir uma sessão de teste
dedicada de 10 minutos.

---

## 1. Escopo

Fazer o laço do long-poll ficar correto **sem saber qual é o teto do Roblox**, e
descobrir o teto como subproduto:

- **Classificar** falha que aconteceu depois de uma espera longa como *teto
  atingido*, e não como erro: sem backoff, sem virar offline.
- **Negociar** o tempo de espera: o jogo passa a pedir à ponte um teto de
  retenção por requisição, e o encurta ao descobrir que o Roblox fecha antes.
  Assim as voltas ociosas voltam a terminar em `204` limpo, que é o que
  restaura o sinal de online.
- **Relatar** o teto observado, uma vez, com o número e onde registrá-lo.
- **Amarrar** a expectativa do Luau ao `longpollTimeoutMs` da ponte por teste,
  no padrão que o `test/jogo.test.mjs` já usa para constante duplicada.

## 2. Fora de escopo

- **Rodar a medição.** É do dono, no Studio.
- **Mudar o valor de `longpollTimeoutMs`.** Ele só muda depois de haver número,
  e mudar o padrão é decisão do ADR-002 — rodada própria.
- **Mexer no `PISO_ENTRE_VOLTAS`, no `BACKOFF_MAXIMO` ou no rate limit.** Estão
  certos para o que fazem e nada aqui os contradiz.
- **Tocar em `enviarEstado`.** O fire-and-forget dele não deve mexer no online,
  e isso continua valendo.
- **Sinal de online por outro canal.** Se a negociação resolver, o long-poll
  continua sendo o sinal — e continua suficiente.

## 3. Origem e decisões que este item honra

- **ADR-002** — os 20s são "chute inicial" por escrito. Este item é o que
  transforma o chute em algo que não machuca enquanto não há número.
- **`CLAUDE.md`, princípio nº 1** — 30 segundos de backoff numa volta ociosa é
  a violação mais cara que o sistema tem hoje.
- **BUG-002** — a lição de que um mecanismo de proteção (lá o rate limit, aqui o
  backoff) pode derrubar o próprio jogo. Mesmo formato de erro.
- **BUG-001** — constante que existe nos dois lados só é contrato se um teste
  ler os dois. Vale para o teto esperado.
- **ADR-P04** — o instalador vai depender de o laço ser robusto na máquina de
  gente que não sabe depurar isso.

## 4. Arquivos afetados

### Modificados
| Arquivo | Mudança |
|---|---|
| `game/src/server/ponte.lua` | Classificação de teto, negociação e relato |
| `bridge/src/http/rotas-jogo.mjs` | `GET /jogo/eventos` aceita `?teto=` |
| `bridge/src/nucleo.mjs` ou o long-poll | Honrar o teto pedido, com clamp |
| `test/jogo.test.mjs` | Constante do Luau × `longpollTimeoutMs` |
| `bridge/test/*` | O clamp do `teto` |
| `docs/07_APIS/README.md` | O parâmetro novo |
| `docs/08_DECISOES/adr-002-ponte-long-poll.md` | O achado e a negociação |
| `docs/09_BACKLOG/fase-0-fixes-minimos.md` | F0-4 vira "leia o aviso" |

## 5. Critérios de aceite

1. Falha de requisição que durou **≥ metade** do teto esperado é classificada
   como *teto atingido*, e **não** dispara `task.wait(backoffAtual)` nem
   multiplica o backoff.
2. Teto atingido **não** chama `definirOnline(false)`. Fechar um long-poll
   ocioso não é evidência de que a ponte caiu.
3. Falha **rápida** (conexão recusada, host desconhecido, token) continua sendo
   erro de verdade: backoff e offline como hoje. Um teste cobre a fronteira.
4. Ao detectar um teto em `D` segundos, o jogo passa a pedir à ponte um teto
   **menor que `D`**, para as voltas seguintes terminarem em `204` limpo.
5. `GET /jogo/eventos?teto=<segundos>` é honrado pela ponte, **com clamp**: nunca
   maior que `longpollTimeoutMs`, nunca menor que 1 segundo, e valor inválido é
   ignorado em favor do padrão.
6. Sem o parâmetro, o comportamento é **exatamente** o de hoje. Um teste garante
   que o padrão não mudou.
7. O teto observado é avisado **uma vez** (não a cada volta), com o número em
   segundos e a instrução de onde registrá-lo.
8. Uma constante no Luau declara o teto esperado, e **um teste compara essa
   constante com `longpollTimeoutMs` da ponte** — divergência quebra o teste no
   mesmo commit (BUG-001).
9. O piso entre voltas continua valendo para volta que não entregou evento,
   inclusive quando ela terminou em teto: o laço nunca pode girar livre e
   estourar as ~500 req/min do `HttpService`.
10. Volta que ENTREGOU evento continua sem espera nenhuma. Latência de presente
    não pode piorar um milissegundo (princípio nº 1).
11. Nada do que foi acrescentado roda por evento de presente: a classificação é
    aritmética sobre um `os.clock()` que já era medido.
12. `npm run luau` verde, `npm test` verde sem regressão nos 478, e
    `npm run validar` sem erro.

## 6. Edge cases conhecidos

- **Túnel pendurado sem fechar:** falha lenta que NÃO é teto do Roblox.
  **Resolvido na review, e não aceito como limitação** — que era o que este
  parágrafo dizia antes. Depois de a negociação já ter pedido um teto menor,
  durar muito além do pedido é a ponte não honrando: volta a ser erro, com
  backoff e offline. Antes da negociação não há como separar, e aí assume teto.
  Ver `pareceTetoDoRoblox` em `ponte.lua`.
- **Teto maior que o da ponte:** se o Roblox aguentar mais de 20s, nada é
  classificado como teto e o caminho é o de hoje, intocado.
- **`teto` maior que `longpollTimeoutMs`:** clamp. Um cliente não pode fazer a
  ponte segurar conexão além do que ela decidiu.
- **`teto` negativo, zero, texto ou ausente:** cai no padrão, sem erro.
- **Primeira volta:** ainda não há teto observado; usa o padrão.
- **Relógio:** `os.clock()` é tempo de CPU do processo no Luau, e é o que o laço
  já usava para o piso. Manter o mesmo relógio evita comparar grandezas
  diferentes.

## 7. Definição de "aprovado sem ressalvas"

Todos os 12 critérios em sim, `npm test` e os três gates verdes, sem `TODO` e
sem `console.log` esquecido. **O conserto do backoff é a entrega; a confirmação
do número continua pendente do dono**, agora sem custar uma sessão de teste
dedicada.
