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

## Formato
### BUG-NNN — título
- **Sintoma:**
- **Reprodução:**
- **Causa raiz:**
- **Correção:**
- **Status:** aberto | corrigido | não reproduz

## 2026-09-14 — Os dez achados da primeira varredura de segurança

Encontrados na leitura das rotas autenticadas e das chamadas externas, depois
que a camada de segurança do agente entrou (ADR-014). Todos corrigidos no mesmo
dia, cada um com teste que falha sem a correção.

**Travessia de caminho em `/api/presets/:id` e `/api/mapas/:id` (o grave).**
O Express decodifica `%2F` depois de casar a rota, então `..%2F..%2Fpackage`
chegava ao repositório como `../../package`. Confirmado rodando o servidor de
verdade: o GET resolvia para `package.json` na raiz, e o DELETE apagava
`.json` de fora de `data/`. Um `..` só é pior de perceber e não sai de `data/`:
cai em `data/configuracao.json`, que é a conta da live. Corrigido com duas
travas, `exigirIdentificador` e contenção no `caminhoDeDados`.

**A superfície local não era protegida contra o navegador do próprio streamer.**
O bind em `127.0.0.1` cobria a rede e não a aba aberta: `fetch` de um site
qualquer para `/api/sessao/stop` é requisição simples, sai da máquina dele e
derruba a sessão. Ninguém lê a resposta, e o efeito já aconteceu. Corrigido com
guarda de Origin mais exigência de `content-type: application/json` nas
mutantes, que é o que força preflight.

**Sete de confiança em dado externo ou de estrutura sem teto.** `imageUrl` da
miniatura era buscada como viesse na resposta do Roblox; `userId` entrava na
URL sem ser inteiro; `Range` virava `content-length` negativo; cache de nick,
cache de busca, esperas de long-poll e janelas de rate limit cresciam sem
limite; o place com o token ficava em `%TEMP%` para sempre, um por clique.

**Lição de teste.** O primeiro teste do rate limit passava COM e SEM a correção:
o tamanho do mapa não era observável de fora. Virou `janelasAbertas` no guarda.
Desde então todo teste de correção é rodado com a correção revertida antes de
ser aceito.
