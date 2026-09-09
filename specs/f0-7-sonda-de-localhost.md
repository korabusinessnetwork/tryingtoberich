# Spec — F0-7: a sonda que responde se o Studio alcança `127.0.0.1`

**Rodada:** 2 do ciclo de produto · **Data:** 2026-09-09
**Origem:** `F0-7` em [`docs/09_BACKLOG/fase-0-fixes-minimos.md`](../docs/09_BACKLOG/fase-0-fixes-minimos.md),
questão aberta no [ADR-002](../docs/08_DECISOES/adr-002-ponte-long-poll.md) desde o
Bloco 1, e tarefa criada pelo [ADR-P04](../docs/08_DECISOES/adr-p04-distribuicao-em-roblox.md).

---

## A parada obrigatória, declarada antes de tudo

**A medição em si não pode ser feita por mim.** Ela exige abrir o Roblox Studio,
apertar Play e ler o Output — e eu não tenho Studio. Isso não é escopo que eu
esteja evitando: é uma restrição de ambiente, e fingir que rodei seria mentir
sobre a coisa que o ADR-002 está esperando desde o Bloco 1.

O que esta rodada entrega é o **instrumento**: transformar cinco minutos de
tentativa e erro ambígua numa resposta que o dono lê em trinta segundos e que
não admite duas interpretações.

Por que o instrumento importa, e não é firula: **hoje o teste tem quatro modos
de falha que se parecem.** Trocar a URL no Studio e "não funcionar" pode ser
(a) `HttpService` desligado no Game Settings, (b) a ponte não estar rodando,
(c) o token errado, ou (d) o Studio realmente não alcançar `127.0.0.1` — que é
a única que responde F0-7. Sem distinguir as quatro, uma tarde some e a
resposta sai errada. **Um `401` é resultado POSITIVO**: prova que o pacote
chegou na ponte. Um instrumento que não sabe disso vai reportar fracasso onde
houve sucesso.

---

## 1. Escopo

Uma sonda de duas pontas que responde, sem ambiguidade, se o `HttpService` do
Roblox Studio alcança a ponte rodando em `127.0.0.1` na mesma máquina:

- uma rota leve na ponte, feita para ser sondada;
- um script Luau para colar na barra de comandos do Studio, que testa os
  candidatos de URL e classifica cada resultado numa das causas acima;
- um comando `npm` que confere a ponte pelo lado de cá **antes** de o dono ir
  ao Studio, e imprime o Luau já com a porta certa, pronto para colar.

## 2. Fora de escopo

- **Rodar a medição.** É do dono, e está dito acima.
- **Remover o Cloudflare Tunnel.** Só depois da resposta, e é decisão que
  reabre o ADR-002 — rodada própria.
- **Mudar como o jogo lê a URL.** `game/src/shared/configuracao.lua` já aceita
  `http://127.0.0.1:8787`; a chave existe e não precisa de nada novo.
- **Medir latência.** É o F0-8, item separado, e exige live real.
- **Sondar de fora da máquina.** F0-7 é sobre a mesma máquina. Túnel e rede
  externa não entram.

## 3. Origem e decisões que este item honra

- **ADR-002** — a questão em aberto é literalmente esta. O resultado decide se
  o túnel continua obrigatório.
- **ADR-P04** — o instalador do produto depende da resposta: com `127.0.0.1`
  funcionando, o passo mais frágil da instalação some para todo cliente.
- **`docs/11_SEGURANCA`** — a superfície pública exige `X-Bridge-Token` em
  **toda** requisição. A sonda não abre exceção: ela é uma rota como as outras,
  com token e rate limit. O `401` é justamente o que a torna útil.
- **`CLAUDE.md`, princípio nº 1** — a sonda não pode entrar no caminho crítico
  do presente. Ela é uma rota à parte, chamada à mão, nunca em laço.

## 4. Arquivos afetados

### Novos
| Arquivo | Papel |
|---|---|
| `game/sonda-localhost.lua` | O script para colar na barra de comandos do Studio |
| `scripts/sondar-localhost.mjs` | Confere a ponte daqui e imprime o Luau com a porta certa |
| `test/sonda.test.mjs` | Os testes da seção 5 |

### Modificados
| Arquivo | Mudança |
|---|---|
| `bridge/src/http/rotas-jogo.mjs` | Rota `GET /jogo/sonda` |
| `package.json` | Script `sondar` |
| `docs/09_BACKLOG/fase-0-fixes-minimos.md` | F0-7 ganha o procedimento exato |
| `docs/08_DECISOES/adr-002-ponte-long-poll.md` | A questão aberta aponta para a sonda |

## 5. Critérios de aceite

1. `GET /jogo/sonda` responde **200** com `{ ok: true, porta }` quando o
   `X-Bridge-Token` está correto.

   > **Desvio do spec original, com o motivo.** A primeira redação pedia
   > `versao` no corpo. Não entrou: não existe versão no `config` da ponte
   > hoje, e criá-la exigiria ler `package.json` — acesso a arquivo, que pelo
   > ADR-003 só pode acontecer na camada de repositório. Reportar versão é
   > tarefa da telemetria do ADR-P02, que tem dono e rodada próprios (o ADR-P04
   > já a exige para saber quem recebeu correção). Uma rota pública devolve o
   > mínimo que resolve a pergunta, e para F0-7 a porta basta: ela diz QUAL
   > ponte respondeu.
2. A mesma rota responde **401** sem token, como todas as outras da superfície
   pública. Um teste cobre os dois lados.
3. A rota responde **na hora**: nada de long-poll, nada de disco, nada de
   `await` em rede. Um teste garante que ela não é assíncrona sobre I/O.
4. A rota está **sob o mesmo rate limit** das demais rotas do jogo — ela não
   pode virar um buraco para floodar a porta pública.
5. `game/sonda-localhost.lua` passa no gate `npm run luau` (subconjunto Lua
   5.1, sem anotação de tipo).
6. O Luau distingue e nomeia, em português, **as quatro causas**: `HttpService`
   desligado, ponte fora do ar/porta fechada, token errado, e Studio bloqueado
   de alcançar `127.0.0.1`.
7. **O Luau trata `401` como SUCESSO de alcance**, e diz isso na tela com todas
   as letras. Este é o critério que impede a conclusão errada.
8. O Luau testa mais de um candidato (`127.0.0.1` e `localhost`) e reporta cada
   um separadamente — os dois podem se comportar diferente.
9. `npm run sondar` falha com mensagem clara **se a ponte não estiver de pé**,
   antes de mandar o dono para o Studio.
10. `npm run sondar` imprime o Luau com a **porta real** lida da configuração,
    nunca uma porta chutada.
11. Nenhum token aparece impresso na saída do `npm run sondar` nem no Luau
    gerado: o script lê o token do `ServerStorage` no Studio, e o comando local
    só diz se ele existe. (`11_SEGURANCA`)
12. O procedimento fica escrito em `fase-0-fixes-minimos.md`, com o lugar exato
    onde a resposta deve ser registrada.
13. `npm test`, `npm run validar` e `npm run luau` verdes, sem regressão nos
    465 testes existentes.

## 6. Edge cases conhecidos

- **Ponte no ar mas em outra porta:** a sonda local lê a porta da configuração,
  não do palpite. Se `BRIDGE_PORT` mudar, o Luau impresso muda junto.
- **`HttpService` desligado:** o Roblox lança erro com texto próprio. O Luau
  captura com `pcall` e reconhece esse caso pelo nome, em vez de reportar
  "falhou".
- **Timeout sem erro:** requisição que pendura precisa terminar com veredito, e
  não deixar o dono olhando o Output parado.
- **Token ausente no `ServerStorage`:** a sonda roda mesmo assim, sem token, e
  o `401` que vier ainda responde F0-7. Isso precisa estar dito na tela, senão
  o dono acha que precisa configurar antes.
- **`localhost` resolvendo para IPv6 (`::1`)** enquanto a ponte escuta só IPv4:
  é falha de resolução, não de alcance. Por isso os dois candidatos são
  testados e reportados separadamente.

## 7. Definição de "aprovado sem ressalvas"

Todos os 13 critérios em sim, suíte verde, os três gates verdes, sem `TODO`
pendente e sem `console.log` esquecido. **A rodada fecha com o instrumento
pronto e a medição explicitamente pendente do dono** — esse é o resultado
correto, não uma entrega pela metade.
