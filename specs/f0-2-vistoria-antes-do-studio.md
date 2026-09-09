# Spec — F0-2: a vistoria antes da primeira sessão no Studio

**Rodada:** 5 do ciclo de produto · **Data:** 2026-09-09
**Origem:** `F0-2` em [`docs/09_BACKLOG/fase-0-fixes-minimos.md`](../docs/09_BACKLOG/fase-0-fixes-minimos.md)

---

## O que eu já verifiquei, antes de propor qualquer coisa

A rodada 4 ensinou a conferir o estado real antes de recomendar. Conferido
agora, nesta máquina:

| O que | Estado |
|---|---|
| Roblox Studio instalado | ✓ `RobloxStudioBeta.exe` achado |
| Rojo instalado | ✓ achado no PATH |
| `default.project.json` cobre todo o `src/` | ✓ shared, animacoes, server, client |
| **O place monta** | ✓ `rojo build` produz 644 KB e **62 instâncias** |
| Acervo pronto | ✓ rodada 4 |
| Mapa real pronto | ✓ `mundo-montado` responde `pode: true` |
| Ponte de pé | ✓ responde na porta do `.env` |

**Não achei bloqueio nenhum.** A sessão no Studio pode acontecer hoje.

## A parada obrigatória, dita de novo

**Eu não posso rodar o F0-2.** Ele é abrir o Studio, dar Play, subir a torre e
olhar. É a terceira rodada seguida a esbarrar nisso, e vale dizer o que faz esta
diferente das outras duas: **tudo que ela entrega executa e passa agora**. A
vistoria não é um instrumento esperando uma medição — ela roda, dá verde, e o
verde é o que autoriza você a abrir o Studio sem medo de perder a sessão com
dependência faltando.

## O que justifica a rodada existir

Para saber que não havia bloqueio, escrevi **mais um script descartável** —
exatamente o que a rodada 4 registrou como sintoma: *"se responder a uma
pergunta exige script descartável, o comando de validação está incompleto."*

O `npm run validar` responde "os contratos estão válidos?" e "dá para ir ao ar?".
Nenhum comando responde **"consigo começar a sessão do Studio agora?"** — que é
uma pergunta de ambiente, não de dado.

E ela não morre com o F0-2: o ADR-P04 nomeia o suporte em máquina alheia como o
custo dominante do produto, com Windows, antivírus, firewall e `HttpService`
desligado. Uma vistoria que **nomeia o que falta** é a semente disso.

## 1. Escopo

- **`npm run vistoria`**: um comando que responde se a sessão pode começar,
  checando o ambiente e nomeando o que falta, um item por vez.
- **Um roteiro de sessão** que junta F0-2, F0-7 e F0-4 numa sentada só, com o
  que observar e onde registrar cada resposta.
- **Corrigir o `game/README.md`**, que ficou para trás em três pontos.

## 2. Fora de escopo

- **Rodar a sessão.** É sua, no Studio.
- **Instalar Rojo ou Studio.** A vistoria diz o que falta e como instalar; ela
  não instala nada por conta própria.
- **Abrir o Studio.** O painel já faz, e a rota `POST /api/jogo/abrir-studio` já
  existe e está bem construída. Reusar, não reescrever.
- **Mexer no `default.project.json`.** Ele cobre tudo; conferido.
- **Consertar a dessincronia `assetId`×`faces.ft`** achada na rodada 4. Continua
  sendo rodada própria.

## 3. Origem e decisões que este item honra

- **`memory/learnings.md`, rodada 4** — a regra do script descartável. Esta
  rodada é a aplicação dela.
- **ADR-P04** — o suporte em máquina alheia é o custo dominante; nomear o que
  falta é o começo da resposta.
- **`docs/11_SEGURANCA`** — a vistoria não imprime token. Ela diz se existe.
- **`game/README.md`** — a fonte do procedimento, que passa a ser verdadeira.

## 4. Arquivos afetados

### Novos
| Arquivo | Papel |
|---|---|
| `scripts/verificar-estudio.mjs` | A vistoria |
| `docs/09_BACKLOG/roteiro-da-sessao-no-studio.md` | O roteiro das três respostas |
| `test/vistoria.test.mjs` | Os testes da seção 5 |

### Modificados
| Arquivo | Mudança |
|---|---|
| `package.json` | Script `vistoria` |
| `game/README.md` | 32 animações (dizia 20), o `src/client` de hoje, e o `npm run sondar` |
| `docs/09_BACKLOG/fase-0-fixes-minimos.md` | F0-2 aponta para a vistoria e o roteiro |

## 5. Critérios de aceite

1. `npm run vistoria` checa e nomeia, um a um: Roblox Studio, Rojo, se o place
   **monta de verdade** via `rojo build`, se a ponte responde, e se o acervo
   está pronto.
2. Cada item falho traz **o que fazer** — não só "faltou". Instalar Rojo tem
   comando; ponte fora do ar tem comando.
3. A vistoria **usa `acharStudio` e `acharRojo` de `bridge/src/roblox/estudio.mjs`**,
   as mesmas funções que o botão do painel usa. Segunda implementação da busca
   divergiria do botão e mentiria.
4. O build de teste sai em pasta temporária e é **apagado no fim**, mesmo se um
   passo falhar. O repositório nunca ganha um `.rbxlx`.
5. Sai com código 0 quando tudo passa, diferente de 0 quando falta algo que
   impede começar.
6. **Nenhum token impresso**, em nenhum caminho. A vistoria diz se existe.
7. O roteiro da sessão cobre as **três** perguntas numa sentada (F0-2 subir a
   torre, F0-7 o alcance de `127.0.0.1`, F0-4 o teto do long-poll), com onde
   registrar cada resposta.
8. O `game/README.md` deixa de dizer "20 animações" e passa a refletir o
   `src/client` atual e o `npm run sondar`.
9. `npm test`, `npm run validar` e `npm run luau` verdes, sem regressão nos 493.

## 6. Edge cases conhecidos

- **Rojo ausente:** é o caso mais provável em máquina nova, e o que a mensagem
  precisa resolver sozinha (`winget install Rojo.Rojo`).
- **`rojo build` falhando:** é o achado mais valioso da vistoria — significa que
  o place não monta, e a sessão morreria no Connect. O erro do Rojo vai inteiro
  para a tela, sem resumo.
- **Ponte fora do ar:** não impede abrir o Studio, mas impede o jogo reagir.
  Precisa ser reportado como **aviso**, não como impedimento — a diferença
  importa, porque `npm run ponte` pode ser subido depois.
- **Fora do Windows:** `acharStudio` depende de `LOCALAPPDATA`. Em outro sistema
  a vistoria precisa dizer isso e não fingir que o Studio sumiu.
- **Build lento:** `rojo build` leva alguns segundos. A vistoria avisa antes, em
  vez de parecer travada.

## 7. Definição de "aprovado sem ressalvas"

Os 9 critérios em sim, suíte e gates verdes, `npm run vistoria` **passando nesta
máquina** — e o roteiro pronto para você sentar e rodar as três respostas de uma
vez.
