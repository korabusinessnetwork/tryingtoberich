# Tarefas

Legenda: `[ ]` pendente · `[~]` em andamento · `[x]` concluída e verificada · `[!]` bloqueada (com diagnóstico)

Formato: `- [ ] ID título | trilha: <nome> | depende: <IDs ou nenhum> | pronto quando: <critério>`

O objetivo desta execução é fechar o que falta dos ADRs já escritos. O que já
está feito e commitado não entra na lista: ADR-001 a 016 (fundação), P01, P02
(lado da ponte), P03 (i18n do painel), P04 (topologia), P07 e P08.

O que falta, em uma frase: **o console do operador (ADR-P05) não tem uma linha
de código**, o instalador e o atualizador do ADR-P04 não existem, e sobraram
três dívidas conhecidas do ADR-P03.

---

## Fase 0: preparação do maestro (sequencial, não paraleliza)

- [x] M01 Contrato da onda 2 | trilha: base | depende: nenhum | pronto quando: `docs/contratos/onda-2.md` descreve a camada de dados do console e o adaptador da Lemon Squeezy, e está commitado
- [x] M02 `console` nos workspaces | trilha: base | depende: nenhum | pronto quando: `npm install` reconhece `console/` como workspace e a suíte continua verde

## Fase 1: o console do operador (ADR-P05, seis itens, PT apenas)

- [~] C01 Fundação do console | trilha: console | depende: M01, M02 | pronto quando: `npm run console` sobe uma tela em porta própria, usando os tokens do design system, sem uma linha de i18n
- [~] C02 Camada de dados do console | trilha: console | depende: M01 | pronto quando: lê do Supabase por REST com a chave de serviço vinda do `.env`, e o adaptador FALSO está ativo por padrão, com dado de exemplo realista
- [~] C03 Item 1, lista de assinantes | trilha: console | depende: C01, C02 | pronto quando: a lista abre e a busca por usuário da TikTok, e-mail ou licença filtra
- [~] C04 Item 2, ficha individual | trilha: console | depende: C03 | pronto quando: a ficha mostra status, plano, início, última conexão, modalidades, idioma e versão instalada
- [ ] C05 Item 5, logs de evento e de ação administrativa | trilha: console | depende: C01, C02 | pronto quando: a tela lista os dois, o log administrativo é imutável no banco, e há teste provando que ele não aceita update nem delete
- [ ] C06 Item 6, saúde de conexão | trilha: console | depende: C01, C02 | pronto quando: mostra quantos clientes conectados agora e quantas quedas em 24h, alimentado pela telemetria que a ponte já manda
- [ ] C07 Item 3, edição de plano | trilha: console | depende: C04 | pronto quando: a ação escreve pelo adaptador da Lemon Squeezy (falso por padrão) e registra no log administrativo
- [ ] C08 Item 4, faturamento | trilha: console | depende: C02 | pronto quando: MRR, vendas do mês e cancelamentos aparecem, lidos do espelho que o webhook alimenta, com o webhook pronto e documentado

## Fase 2: o que falta do produto

- [~] P01 Instalador do ADR-P04 | trilha: produto | depende: nenhum | pronto quando: `npm run empacotar -- --instalador` produz um instalador NSIS além do portátil, e ele instala e desinstala numa pasta de teste
- [~] P02 Atualização automática | trilha: produto | depende: P01 | pronto quando: o `electron-updater` está fiado e configurado, com o servidor de publicação escolhido e o passo do Matheus anotado
- [~] P03 `LEIA-ME.txt` em inglês | trilha: produto | depende: nenhum | pronto quando: o pacote leva o LEIA-ME no idioma certo e o `npm run empacotar` escolhe qual
- [ ] P04 Os 26 erros dinâmicos traduzidos | trilha: ponte | depende: nenhum | pronto quando: a ponte manda `detalhe` estruturado, o painel monta a frase nos três idiomas, e o teste que hoje guarda a lista dos não traduzidos vira zero

## Fase 3: integração e fechamento (maestro)

- [ ] M03 Integração das ondas | trilha: base | depende: todas | pronto quando: as branches das frentes estão integradas, `npm test`, `npm run validar` e `npm run luau` verdes
- [ ] M04 Verificação final de verdade | trilha: base | depende: M03 | pronto quando: o executável é montado, aberto, e eu passo pelo fluxo principal na tela, mais o console aberto no navegador
- [ ] M05 Relatório final | trilha: base | depende: M04 | pronto quando: `.full-auto/RELATORIO-FINAL.md` escrito e `ESTADO.md` em `CONCLUIDO`

---

## Fora do escopo desta execução, e por quê

- **Ligar o portão da licença.** Existe e está testado, mas travar funcionalidade
  depende do ADR-P06, que é decisão do Matheus. Ver `PENDENCIAS-DO-MATHEUS.md`.
- **A sessão no Roblox Studio** (F0-2, F0-4, F0-7, F0-6). Exige alguém abrindo o
  Studio. Roteiro pronto, é pendência dele.
- **Assinatura de código.** Custa dinheiro, é decisão dele.
- **Console v2** (desempenho por assinante, ranking, funil, retenção). O próprio
  ADR-P05 adia, e o motivo continua valendo: heatmap com zero assinante não
  mostra nada.
