# Decisões tomadas no lugar do Matheus

Uma entrada por decisão. Ele revisa no final e pode reverter qualquer uma.

## D01 A execução fica na branch atual, não em `full-auto/<slug>`

- **Contexto:** a skill manda criar a branch `full-auto/<slug-do-projeto>`.
- **Decisão:** continuar em `claude/camada-de-produto-e-fase-0`.
- **Por quê:** essa branch foi criada a pedido do próprio Matheus em 2026-09-09,
  ela carrega as três rodadas do ciclo mais três commits dele, e é para ela que
  ele pediu push. Abrir uma branch nova agora separaria a Fase 1 do trabalho de
  onde ela nasceu, sem ganho nenhum.
- **Como reverter:** `git checkout -b full-auto/kora-stream-games` a partir daqui.

## D02 Os hooks rodam com a pasta marcada como CommonJS

- **Contexto:** os hooks da skill são CommonJS, e a raiz deste projeto é
  `"type": "module"`. Todo `.js` dentro do projeto vira ESM, então tanto o
  instalador quanto os hooks instalados morriam com `require is not defined`.
- **Decisão:** rodar o instalador a partir de uma cópia fora do projeto, e criar
  `.claude/hooks/package.json` com `{"type": "commonjs"}`.
- **Por quê:** sem esse arquivo os hooks seriam instalados e nunca rodariam, o
  que é pior que não instalar: pareceriam funcionar. Um `package.json` de uma
  linha na pasta dos hooks resolve para todos eles de uma vez, sem alterar a
  skill nem a raiz.
- **Verificado:** `node .claude/hooks/full-auto-stop.js` responde bloqueando com
  a contagem certa de tarefas pendentes.
- **Como reverter:** apagar `.claude/hooks/package.json` e a seção `hooks` do
  `.claude/settings.json`.

> A instalação foi feita **a pedido explícito do Matheus**. A primeira tentativa
> foi recusada pelo classificador do modo automático, porque instalar hook é
> mudar configuração e deixar script rodando sozinho. Ele autorizou depois.

## D03 O ciclo é feito à mão, sem a skill `/ciclo`

- **Contexto:** o adendo obrigatório manda executar toda tarefa pela `/ciclo`.
- **Decisão:** fazer o ciclo à mão, especificar, construir, revisar contra o
  critério e corrigir até passar.
- **Por quê:** a skill instalada nesta máquina chama-se `loop-spec-build-review`
  e não está disponível para invocação nesta sessão. A própria SKILL.md prevê
  exatamente isto: "não pare a execução, faça o ciclo manualmente, registre em
  PENDENCIAS-DO-MATHEUS.md, e siga".
- **Como reverter:** renomear ou expor a skill como `ciclo` (P02).

## D04 Sem `ask` no `git push`, com `deny` no force push

- **Contexto:** o instalador tem a opção `--com-protecoes`, que põe `git push`
  em `ask` e `git push --force` em `deny`.
- **Decisão:** manter o `deny` do force push como pendência, e não adotar o
  `ask` no push comum.
- **Por quê:** o Matheus pediu, nesta mesma sessão, para eu tocar sozinho e só
  chamá-lo quando a tarefa for dele. Um `ask` a cada push viraria uma chamada a
  cada commit, e o push aqui é para uma branch de trabalho que ele mesmo criou,
  nunca para a `main`. O `deny` do force push não custa nada e protege.
- **Como reverter:** rodar o instalador com `--com-protecoes`.

## D05 O webhook da Lemon Squeezy vira função de borda do Supabase

- **Contexto:** o ADR-P02 diz que o faturamento chega por webhook, e webhook
  precisa de um endereço público. A ponte roda na máquina do cliente e não pode
  receber webhook.
- **Decisão:** o webhook é uma Edge Function do Supabase, escrita e commitada,
  para ser publicada quando a conta existir. O console lê o espelho que ela
  grava.
- **Por quê:** é o único lugar público que o projeto já tem por decisão (ADR-P02)
  e é gratuito no mesmo tier. A alternativa seria contratar hospedagem, que é
  dinheiro e escalaria para ele sem necessidade.
- **Como reverter:** trocar por qualquer endpoint público, o corpo do webhook é
  o mesmo.

## D06 O console nasce com adaptador falso ligado por padrão

- **Contexto:** não existe conta no Supabase nem na Lemon Squeezy ainda.
- **Decisão:** a camada de dados do console tem duas implementações com a mesma
  interface: a real, por REST, e uma falsa com dado de exemplo realista, ativa
  enquanto as variáveis do `.env` estiverem vazias.
- **Por quê:** é o contorno que a skill manda usar, e ele deixa o console
  navegável e revisável hoje, sem esperar conta nenhuma. Trocar é preencher
  duas variáveis.
- **Como reverter:** preencher `SUPABASE_URL` e a chave de serviço no `.env` do
  console.
