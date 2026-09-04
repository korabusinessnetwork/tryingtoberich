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

## Formato
### BUG-NNN — título
- **Sintoma:**
- **Reprodução:**
- **Causa raiz:**
- **Correção:**
- **Status:** aberto | corrigido | não reproduz
