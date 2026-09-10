# Pendências do Matheus

Coisas que só você pode fazer. O produto já funciona com contornos, estas
tarefas trocam o contorno pelo real.

Ordem: da mais importante para a menos importante. Cada uma diz quanto tempo
leva e o que trazer de volta, porque tarefa respondida e não anotada é tarefa
perdida, foi o que aconteceu com o acervo, listado como bloqueador durante meses
depois de pronto.

> A versão longa e explicada de várias destas está em
> `docs/09_BACKLOG/tarefas-do-dono.md`, que continua sendo o documento do
> projeto. Este aqui é a lista de execução.

---

## P01 Decidir o ADR-P06 [prioridade: alta]

- **Por quê:** é o único ADR da série P que não está aceito, e ele **bloqueia
  faturar**. Não bloqueia construir, mas decide se vale ligar a cobrança.
- **Contorno atual:** o console está sendo construído com os quatro itens que
  valem de qualquer jeito (assinantes, ficha, logs, saúde). Os dois de dinheiro
  (plano e faturamento) ficam atrás de um adaptador falso.
- **Passo a passo:**
  1. Ler `docs/08_DECISOES/adr-p06-uso-comercial-da-captura.md`, 20 minutos.
  2. Decidir se aceita o risco de vender um produto que depende de captura não
     oficial da TikTok.
- **Onde colar o resultado:** me diga aceito ou recusado e por quê, eu registro
  no ADR e no `memory/decisions.md`.
- **Como confirmar que funcionou:** o ADR sai de "Proposto" e a Fase 1 deixa de
  ter bloqueio de negócio.

## P02 A sessão no Roblox Studio [prioridade: alta]

- **Por quê:** destrava o resto da Fase 0 e responde se o Cloudflare Tunnel some
  do produto, e com ele a única exposição do sistema à internet e um terço do
  orçamento de latência.
- **Contorno atual:** nenhum possível. Exige alguém abrindo o Studio.
- **Passo a passo:** o roteiro completo está em
  `docs/09_BACKLOG/roteiro-da-sessao-no-studio.md`. Uma hora, começando por
  `npm run vistoria`.
- **Onde colar o resultado:** as três respostas (F0-2, F0-7, F0-4). O roteiro
  diz onde anotar cada uma.
- **Como confirmar que funcionou:** a torre sobe no Play e o presente move o
  boneco.

## P03 Criar o projeto no Supabase [prioridade: alta, grátis]

- **Por quê:** é onde vivem licença, telemetria e saúde de conexão (ADR-P02), e
  é o que faz o console mostrar dado de verdade em vez de exemplo.
- **Contorno atual:** a ponte roda inteira sem Supabase, a licença fica
  `indeterminada` e nada quebra. O console usa um adaptador falso com dado de
  exemplo realista.
- **Passo a passo:**
  1. supabase.com, criar conta, **New project**, tier gratuito, US$ 0.
  2. No SQL Editor, rodar `data/supabase/001-esquema.sql` inteiro.
  3. Em **Project Settings → API**, copiar o **Project URL** e a chave
     **anon public**.
- **Onde colar o resultado:** `SUPABASE_URL` e `SUPABASE_ANON_KEY` no `.env`.
  A chave `service_role` **não** sai do painel do Supabase para o produto, ela é
  só do console, e não deve ser mandada para mim.
- **Como confirmar que funcionou:** abrir a aba Licença no painel; ela sai de
  "Não deu para confirmar".

## P04 Instalar o `/ciclo` com nome invocável [prioridade: média]

- **Por quê:** a skill Full Automático manda executar toda tarefa pela `/ciclo`.
  A que existe nesta máquina chama-se `loop-spec-build-review` e não aparece
  como invocável, então estou fazendo o ciclo à mão (especificar, construir,
  revisar contra o critério, corrigir até passar).
- **Contorno atual:** ciclo manual. Funciona, só não é a skill.
- **Passo a passo:** renomear a pasta para `~/.claude/skills/ciclo/` ou pôr
  `name: ciclo` no frontmatter dela, e conferir que não tem
  `disable-model-invocation: true`.
- **Como confirmar que funcionou:** `/ciclo` aparece na lista de skills da
  sessão.

## P05 Criar a conta na Lemon Squeezy [prioridade: média, depende da P01]

- **Por quê:** é a fonte da verdade do dinheiro (ADR-P02) e o console v1 lê e
  comanda por ela (ADR-P05, itens 3 e 4).
- **Contorno atual:** adaptador falso, que registra a ação no log administrativo
  e devolve resposta plausível.
- **Passo a passo:** criar a loja, cadastrar o plano, gerar uma chave de API e o
  segredo do webhook, e publicar a Edge Function do webhook no Supabase.
- **Onde colar o resultado:** `LEMON_API_KEY` e `LEMON_WEBHOOK_SECRET` no `.env`
  do console.
- **Como confirmar que funcionou:** a aba Faturamento sai do dado de exemplo.

## P06 A carência da licença: 14 dias serve? [prioridade: baixa]

- **Por quê:** licença ativa que não pôde ser reconfirmada continua valendo por
  14 dias (ADR-P08). Trocar é uma constante.
- **Passo a passo:** o raciocínio está no ADR-P08. Piso de 7 dias, que é quando
  o tier gratuito do Supabase pausa por inatividade, uma economia nossa não pode
  cancelar a live de quem pagou. Teto de meio ciclo de cobrança, senão ficar
  offline vira a forma mais barata de usar o produto.
- **Onde colar o resultado:** só me diga o número.

## P07 `assetId` × `faces.ft` no skybox [prioridade: baixa]

- **Por quê:** o painel pode dessincronizar os dois. **Não está acontecendo
  hoje**, os 10 skybox têm `assetId` igual a `faces.ft`.
- **Passo a passo:** escolher entre 1) deixar como está, 2) o painel recusar
  editar `assetId` de item com `faces`, 3) `assetId` virar derivado de
  `faces.ft`. **Recomendo a 3**, é a única que torna a dessincronia impossível
  em vez de improvável, e não pede tela nova.
- **Onde colar o resultado:** só o número.

## P08 Assinatura de código [prioridade: baixa, custa dinheiro]

- **Por quê:** sem ela o Windows mostra "O Windows protegeu o computador" na
  primeira execução.
- **Custo:** US$ 200 a 400 por ano. **Adiada por padrão** (CLAUDE.md, Custo), e
  essa é a recomendação enquanto o cliente for você e os primeiros testadores.
- **Quando reavaliar:** ao começar a vender para desconhecido, quando o aviso
  deixa de ser inconveniência e vira venda perdida.

## P09 `LEIA-ME.txt` em inglês [prioridade: baixa]

- **Por quê:** o funil da Fase 1 é em inglês (ADR-P03) e o arquivo que acompanha
  o executável está em português.
- **Contorno atual:** estou traduzindo e fazendo o empacotador escolher o
  idioma, então isto deve sair desta lista sozinho.

---

## Aviso, não é tarefa: o portão da licença está construído e desligado

A função que decide se uma instalação está liberada existe e está testada, mas
**nenhuma funcionalidade a consulta**. Enquanto a P01 não for decidida não há o
que travar: até a primeira venda todo veredito real é `sem_licenca` ou
`indeterminada`. Ligar o portão é decisão sua e é uma linha de código.
