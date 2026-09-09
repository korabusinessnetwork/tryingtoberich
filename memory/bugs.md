# Bugs conhecidos — Kora Stream Games

### BUG-001 — o estado do jogo era descartado inteiro, em silêncio
- **Sintoma:** a métrica "Plataforma" do monitor ao vivo nunca saía de "—", e o
  painel nunca sabia se o Roblox estava em animação. Nenhum erro em lugar nenhum.
- **Reprodução:** subir o jogo e a ponte juntos. Todo `POST /jogo/estado`
  respondia 204, que é o código de SUCESSO daquela rota.
- **Causa raiz:** `montarEstado()` em `game/src/server/sessao.lua` publica
  `totalPlataformas` e `sessaoAtiva` — campos que o cliente usa — e
  `data/schemas/estado-jogo.schema.json` é `additionalProperties: false` e não
  tinha nenhum dos dois. A validação recusava o payload INTEIRO, a rota logava
  `estado_do_jogo_descartado` e respondia 204 como se estivesse tudo bem.
- **Correção:** os dois campos entraram no schema (mais `vitoria`, do R6), e um
  teste em `test/jogo.test.mjs` lê os campos direto da FONTE do `montarEstado` e
  compara com as propriedades do schema. Campo novo de um lado quebra o teste no
  mesmo commit.
- **Status:** corrigido em 2026-09-02.
- **A lição:** os dois lados estavam certos sozinhos. O jogo publicava o que o
  cliente precisa; o schema barrava o que não conhecia. Ninguém comparou os dois,
  e o 204 fez a falha parecer sucesso. **Contrato entre processos só é contrato
  se algum teste ler os dois lados.**

### BUG-002 — o rate limit da ponte derrubava o próprio jogo
- **Sintoma:** no Studio, `[Ponte] ficou offline: Requisições demais. Espere um
  minuto.` O painel continuava dizendo "Jogo online" (a janela de online é de
  60s), o modo de teste sem live disparava a fixture e o boneco não mexia; a
  sessão fechava com `totalPresentes: 0`.
- **Reprodução:** com o jogo no ar, montar mundo algumas vezes no painel e
  clicar no testador de animação uns 40 vezes num minuto. O log da ponte mostra
  `jogo_taxa_excedida` com `contagem` 61, 62, 63…
- **Causa raiz:** `LIMITE_JOGO_POR_MINUTO` era 60, de quando o jogo só fazia
  long-poll (~3/min parado). Depois entraram o batimento de estado a cada 2s
  (30/min sozinho), o long-poll devolvido na hora a cada presente (um pedido
  novo por presente) e o `recarregar-mapa` que manda buscar mapa e look. O
  tráfego legítimo passava de 60 com folga, a ponte respondia 429, o Roblox
  entrava em backoff (1s → 30s) e tudo que a ponte publicava nesse meio-tempo
  ficava no buffer ou caía no F7.
- **Correção:** teto em 300/min (5/s sustentados, dentro dos 500/min do
  HttpService), com a conta escrita em `config.mjs` e travada num teste. A
  ponte passou a avisar no log quando descarta presente, comando ou empate por
  jogo offline, e quando a sessão começa com o jogo offline — antes era silêncio.
- **Status:** corrigido em 2026-09-04.
- **A lição:** o comentário "o Roblox legítimo faz ~3 req/min" ficou verdadeiro
  por um dia. Toda vez que o jogo ganha um motivo novo para falar com a ponte,
  a conta do teto tem que ser refeita — e quem protege isso é um teste que
  soma os motivos, não um número solto.

### BUG-003 — o teto de 400 andares no schema da sessão travava a ponte inteira
- **Sintoma:** passando do andar 400 numa live, a sessão parava de ser gravada
  (só uma linha `sessao_nao_persistiu` no log, a cada presente) e o botão Parar
  passava a devolver erro em vez do resumo (F5.5). Depois disso a ponte não
  encerrava nem recomeçava: Stop repetia o erro, Start respondia 409
  `sessao_em_andamento`. Só matando o Node.
- **Reprodução:** subir a torre além da plataforma 400 com o mapa no ar
  (`mundo-montado`, 1000 plataformas) e apertar Parar.
- **Causa raiz:** `data/schemas/sessao.schema.json` travava
  `plataformaReferencia` e `plataformaMaxima` em 400 — número da época em que a
  torre era pequena — enquanto `mapa.schema.json` aceita 5000 e o mundo no ar
  tem 1000. O mesmo número estava escrito em três arquivos e dois subiram.
- **Correção:** teto em 5000 nos três campos da sessão, e o teste que já
  amarrava mapa × estado-jogo passou a varrer `sessao.schema.json` recursivamente
  — a raiz e o resumo.
- **Status:** corrigido em 2026-09-04.
- **A lição:** é o BUG-001 outra vez, com outro schema. Número igual escrito em
  três lugares diverge no dia em que um muda. Quando um teto sobe, o teste que o
  trava tem que varrer TODOS os arquivos que o repetem, não só o par que
  quebrou da última vez.

### BUG-004 — `encerrarSessao` soltava a sessão depois de um await que podia falhar
- **Sintoma:** sessão fantasma. Conector desconectado, long-polls fechados,
  relógio parado — e `estado.sessao` dizendo "rodando" para sempre.
- **Reprodução:** fazer a gravação da sessão falhar (era o BUG-003; hoje serve
  disco cheio ou o OneDrive segurando o arquivo) e apertar Parar.
- **Causa raiz:** ordem. `bridge/src/nucleo.mjs` derrubava a live inteira, e só
  depois fazia `await this.#sessao.encerrar()`, com `this.#sessao = null` na
  linha seguinte. O await estourava e aquela linha nunca rodava.
- **Correção:** a sessão é solta ANTES do await, junto do `#hud` (nickname não
  pode sobreviver ao Stop nem quando a gravação falha, 11_SEGURANCA camada 4).
  A gravação ficou num `try/finally` que publica o estado nos dois caminhos.
  Teste em `bridge/test/ponta-a-ponta.test.mjs` prova que dá para dar Start
  depois de um Stop que falhou.
- **Status:** corrigido em 2026-09-04.
- **A lição:** limpeza de estado nunca vai depois de um `await` que pode lançar.
  O BUG-003 era o gatilho; esta é a razão de ele ter derrubado a ponte inteira
  em vez de só perder um arquivo.

### BUG-005 — `publicarEstado` chamado antes de existir: a fila de donates parava na primeira
- **Sintoma:** no Output do Studio, "attempt to call a nil value (global
  'publicarEstado')" ao fim de TODA rodada. Efeito real, silencioso: um donate
  de 6 derrotas cobrava uma e perdia cinco (R4, ADR-014).
- **Reprodução:** terminar qualquer rodada e esperar a contagem zerar.
- **Causa raiz:** `game/src/server/sessao.lua` chamava `publicarEstado()` dentro
  de `encerrarRodada`, cerca de 60 linhas antes do `local function
  publicarEstado()`. Em Lua isso não é erro de sintaxe: o nome vira busca de
  global, que é nil. A linha seguinte, `cobrarProximaDaFila()`, nunca rodava.
  Passava por ruído porque a torre reiniciava do mesmo jeito, por outro caminho.
- **Correção:** `publicarEstado` entrou na lista de declarações adiantadas que o
  arquivo já mantinha para `encerrarRodada` e `cobrarProximaDaFila`. O teste
  novo em `test/jogo.test.mjs` cobra isso de TODA função local do arquivo, com
  teste de controle.
- **Status:** corrigido em 2026-09-04.
- **A lição:** o arquivo já tinha o remédio escrito no topo, com o comentário
  dizendo que o tropeço tinha acontecido duas vezes no vestiário. Aconteceu a
  terceira. Remédio que depende de alguém lembrar precisa virar teste.

### BUG-006 — o contorno do texto do HUD sumiu numa substituição cega
- **Sintoma:** na live, o ranking, a legenda e a barra da torre saíam com texto
  branco sem contorno em cima da captura da cam — ilegíveis em cena clara. A
  página parecia certa para quem só olhava: sombra de ícone e medalha continuava
  funcionando.
- **Reprodução:** abrir `/overlay/hud` sobre qualquer fundo claro.
- **Causa raiz:** trocar a unidade `vw` pela unidade do palco com uma
  substituição por regex transformou `-0.12vw` em `-calc(0.12 * var(--u))`. Um
  menos antes do `calc()` não existe em CSS: o navegador descarta a declaração
  inteira, sem erro. O sinal tem que ir dentro.
- **Correção:** `calc(-0.12 * var(--u))`, e um teste em `bridge/test/http.test.mjs`
  que recusa qualquer menos antes de `calc(` na página servida — ignorando
  comentários, senão o comentário que documenta a forma errada acusa a si mesmo.
- **Status:** corrigido em 2026-09-04.
- **A lição:** substituição cega em CSS não é refatoração, é reescrita. E CSS
  inválido falha CALADO — a mesma classe de erro do BUG-001, em outra linguagem:
  ninguém reclama, e o defeito só aparece na tela de quem está assistindo.

## Formato
### BUG-NNN — título
- **Sintoma:**
- **Reprodução:**
- **Causa raiz:**
- **Correção:**
- **Status:** aberto | corrigido | não reproduz
