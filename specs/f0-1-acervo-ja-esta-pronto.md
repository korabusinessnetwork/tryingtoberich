# Spec — F0-1: o acervo já está pronto, e o backlog não sabia

**Rodada:** 4 do ciclo de produto · **Data:** 2026-09-09
**Origem:** `F0-1` em [`docs/09_BACKLOG/fase-0-fixes-minimos.md`](../docs/09_BACKLOG/fase-0-fixes-minimos.md)

---

## O achado, antes do escopo

`F0-1` está escrito como **bloqueador duro**: *"enquanto os `assetId` estiverem
`pendente-upload`, nenhum mapa pode ir ao ar"*. Auditando `data/acervo.json`:

| Coleção | Itens | Estado real |
|---|---|---|
| skybox | 10 | **todos `aprovado`**, com `assetId` e as 6 faces preenchidas |
| texturas | 10 | **todos `aprovado`**, com `assetId` |
| props | 5 | efeitos nativos do Roblox — não passam por moderação, nunca precisaram |

Nenhum `pendente-upload`. Nenhuma face faltando. Nenhum `assetId` repetido. E o
mapa real salvo, `mundo-montado`, responde `pode: true` em `mapaPodeIrAoAr`.

**O item já estava feito.** O dono subiu e aprovou tudo em algum momento entre
a escrita do backlog e hoje, e o documento ficou para trás.

### Por que isso não é detalhe

O documento errado **custou decisão**. Nas três rodadas anteriores eu apresentei
o acervo como o bloqueador duro que sobrava, e o resumo da rodada 3 recomendou
`F0-1` como próximo item exatamente por isso. Planejou-se em cima de um bloqueio
que não existia.

E descobrir a verdade custou três scripts descartáveis lendo JSON na mão. **Não
existe um comando que responda "o acervo está pronto?"** — o `npm run validar`
só olha o mapa de EXEMPLO, não o acervo nem os mapas reais.

## 1. Escopo

Corrigir o registro e tornar a resposta obtível em um comando:

- **Corrigir** `F0-1` no backlog: de bloqueador duro para item concluído, com o
  que foi verificado e quando.
- **Estender `npm run validar`** para relatar a prontidão do **acervo** e de
  **todos os mapas salvos**, e não só a do mapa de exemplo.
- **Guardar contra `assetId` repetido**, que é o erro que o schema não pega e
  que a forma de trabalho torna provável.

## 2. Fora de escopo

- **Subir asset novo.** Continua sendo do dono, e continua passando pela
  moderação do Roblox (ADR-004).
- **Mexer em `mapaPodeIrAoAr`.** A regra está certa: já exige `aprovado` e
  `assetId` não nulo, e o schema já exige as 6 faces quando `faces` existe.
  Auditei procurando buraco e não achei.
- **Tela nova no painel.** `PainelDeAcervo` já existe e já mostra o estado item
  a item. O que falta é a resposta agregada no terminal, não outra tela.
- **Upload automático de asset gerado por IA.** Adiado no ADR-004, e continua.

## 3. Origem e decisões que este item honra

- **ADR-004** — só item aprovado pode ser referenciado por mapa que vai ao ar.
  A verificação nova lê essa mesma regra, não uma cópia dela.
- **`CLAUDE.md`** — "se doc e código conflitarem, a documentação prevalece **e
  deve ser corrigida quando estiver errada**". Aqui ela estava errada.
- **BUG-001** — status é campo, não prova. A auditoria desta rodada foi
  exatamente esse ceticismo, e o guard de `assetId` repetido é a parte dele que
  vira teste.

## 4. Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `docs/09_BACKLOG/fase-0-fixes-minimos.md` | F0-1 vira concluído; a lista de bloqueadores encolhe |
| `scripts/validar-contratos.mjs` | Prontidão do acervo e de todos os mapas salvos |
| `test/acervo.test.mjs` | O guard de `assetId` repetido |
| `memory/learnings.md` | O custo de documento desatualizado |

## 5. Critérios de aceite

1. `npm run validar` relata, para o **acervo**: quantos itens há em cada coleção
   e quantos estão aprovados, com um veredito claro de pronto ou não.
2. `npm run validar` relata a prontidão de **cada mapa salvo em `data/mapas/`**,
   não só a do exemplo, e nomeia os motivos quando algum não puder ir ao ar.
3. O relatório usa `mapaPodeIrAoAr`, a MESMA função que o painel usa. Nada de
   segunda implementação da regra — divergir dela seria pior que não relatar.
4. `npm run validar` continua saindo com código 0 quando tudo está válido, e
   diferente de 0 quando um contrato quebra. Prontidão de mapa é **relato**, não
   falha: mapa em rascunho é estado legítimo, não erro de contrato.
5. Um teste falha se dois itens do acervo compartilharem o mesmo `assetId`, ou
   se duas faces do mesmo skybox compartilharem o mesmo id.
6. Esse teste explica no erro **por que** duplicata importa: são 60+ números
   copiados à mão da interface do Roblox, e dois iguais deixam dois céus
   idênticos sem nenhum sintoma.
7. `F0-1` no backlog deixa de ser bloqueador duro, diz o que foi verificado e em
   que data, e a seção de bloqueadores passa a refletir o que realmente bloqueia.
8. `npm test`, `npm run validar` e `npm run luau` verdes, sem regressão nos 489.

## 6. Edge cases conhecidos

- **`data/mapas/` vazio:** relatar "nenhum mapa salvo" e seguir, sem erro. É o
  estado de uma instalação nova.
- **Mapa salvo fora do contrato:** já é falha de validação hoje, e continua
  sendo. A prontidão só é avaliada em mapa que passou no schema.
- **Item aprovado sem `faces`:** legítimo — significa imagem única aplicada nas
  seis. O guard de duplicata não pode acusar isso.
- **Props sem `status`:** legítimo e por contrato — são nativos. Nenhuma
  contagem de "aprovados" pode incluí-los como pendentes.

## 7. Definição de "aprovado sem ressalvas"

Os 8 critérios em sim, suíte e gates verdes, e — o que mais importa nesta
rodada — **o backlog dizendo a verdade sobre o que bloqueia a Fase 0**.
