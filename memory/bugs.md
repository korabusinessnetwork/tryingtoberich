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
