# Tarefas que só o dono pode fazer

Um lugar só, para não perseguir pendência espalhada por seis documentos. Aqui
entra **exclusivamente** o que não pode ser feito por quem escreve código:
decisão de negócio, dinheiro, conta em serviço de terceiro e a sessão no Studio.

Ordem: **bloqueio primeiro, custo depois**. Cada item diz o que fazer, quanto
tempo leva, e **o que trazer de volta**, porque tarefa respondida e não anotada
é tarefa perdida (foi o que aconteceu com o acervo, listado como bloqueador
durante meses depois de pronto).

---

## 1. Decidir o ADR-P06: **bloqueia vender**

**Tempo: 20 minutos de leitura.**

`docs/08_DECISOES/adr-p06-uso-comercial-da-captura.md` é o único ADR da série P
que não está aceito. Ele descreve o risco de vender um produto que depende de
captura não oficial da TikTok, o que a API gerenciada resolve, e o que ela não
resolve, que são os termos.

**Por que é o primeiro item da lista:** ele não bloqueia construir, mas bloqueia
faturar. E é ele que decide se vale construir a cobrança: se a resposta for
"não aceito o risco", o console de faturamento (item 4 abaixo) e a integração
com a Lemon Squeezy deixam de fazer sentido no formato atual.

**Trazer de volta:** aceito ou recusado, e por quê. Eu registro no ADR e no
`memory/decisions.md`.

---

## 2. A sessão no Roblox Studio: **destrava o resto da Fase 0**

**Tempo: uma hora, quase toda olhando a torre.**

Roteiro pronto e passo a passo em
[`roteiro-da-sessao-no-studio.md`](./roteiro-da-sessao-no-studio.md). Ela responde
três perguntas de uma vez:

| | Pergunta | O que a resposta decide |
|---|---|---|
| **F0-2** | a torre sobe, e o presente move o boneco? | se há bug de verdade a corrigir |
| **F0-7** | o `HttpService` do Studio alcança `127.0.0.1`? | se o Cloudflare Tunnel some do produto, e com ele a única exposição do sistema à internet e um terço do orçamento de latência |
| **F0-4** | qual é o teto do long-poll do Roblox? | se o chute de 20s do ADR-002 estava certo |

Começa com `npm run vistoria`, que confere Studio, Rojo, place e acervo antes de
você abrir qualquer coisa.

**Trazer de volta:** as três respostas. O roteiro diz onde anotar cada uma.

---

## 3. Criar o projeto no Supabase, grátis

**Tempo: 15 minutos.**

O ADR-P02 põe no Supabase o que é da Kora: conta, licença, telemetria e saúde
de conexão. O que é do streamer continua em JSON na máquina dele.

1. <https://supabase.com> → criar conta → **New project** (tier gratuito).
2. Rodar, no editor SQL do projeto, o arquivo `data/supabase/001-esquema.sql`.
   Ele cria as tabelas, os índices e as policies de RLS, comentado.
3. Em **Project Settings → API**, copiar a **Project URL** e a **anon public key**.

**Trazer de volta:** a URL e a chave anon. Elas vão para o `.env`, nunca para o
código (CLAUDE.md, Segurança), e o produto já funciona inteiro sem elas: sem
Supabase a licença fica `indeterminada` e nada quebra.

> A chave `service_role` **não** deve sair do painel do Supabase para lugar
> nenhum, nem para mim. Ela ignora RLS. A chave que o produto usa é a `anon`,
> que é pública por definição, ela vai em toda instalação, e não dá acesso a
> nada: quem separa um streamer do outro é o RLS do Postgres.

**Já verificado por mim:** o SQL revoga os privilégios que o Supabase concede
por padrão e reconcede só `select` em `licencas` e `insert` em `telemetria`.
Não existe policy de escrita em `licencas`, e é essa ausência que impede o
cliente de editar a própria licença.

---

## 4. Criar a conta na Lemon Squeezy: **depende do item 1**

**Tempo: 30 minutos.** Só faça depois de decidir o ADR-P06.

É a fonte da verdade do dinheiro (ADR-P02), e o console v1 lê e comanda por ela
(ADR-P05, itens 3 e 4). Precisa de: a loja criada, o produto/plano cadastrado,
uma chave de API e o segredo do webhook.

**Trazer de volta:** chave de API e segredo do webhook. Vão para o `.env`.

---

## 5. Assinatura de código: **US$ 200 a 400 por ano**

**Decisão de custo. Adiada por padrão** (CLAUDE.md, Custo), e é a recomendação
enquanto o cliente for você e os primeiros testadores.

Sem assinatura, o Windows mostra "O Windows protegeu o computador" na primeira
execução do `KoraStreamGames.exe`. O `LEIA-ME.txt` explica o caminho ("Mais
informações" → "Executar assim mesmo").

**Quando reavaliar:** quando começar a vender para desconhecido. Aí o aviso
deixa de ser inconveniência e vira venda perdida.

---

## 6. `assetId` × `faces.ft` no skybox: escolher entre três

**Tempo: 5 minutos.** Não é urgente, **não está acontecendo hoje**, os 10
skybox têm `assetId` igual a `faces.ft`.

O painel pode dessincronizar as duas coisas, porque `anotarItemDoAcervo` grava
`assetId` e não toca em `faces`. O schema documenta a regra em texto, mas nada a
faz valer. As opções, do `memory/decisions.md`:

1. **Deixar como está** e confiar no texto do schema. Custo zero, risco baixo.
2. **O painel recusa editar `assetId` de item que tem `faces`** e manda editar as
   seis faces. Mais honesto; exige tela para as seis.
3. **`assetId` vira derivado de `faces.ft`** e some do formulário. Mais simples
   de garantir; muda o schema.

**Recomendação:** a 3. É a única que torna a dessincronia impossível em vez de
improvável, e o campo derivado não pede tela nova.

**Trazer de volta:** o número.

---

## 7. A carência da licença: 14 dias está bom?

**Tempo: 2 minutos.** Trocar é uma constante.

Licença `ativa` que não pôde ser reconfirmada continua valendo por 14 dias
(ADR-P08). Existe porque a alternativa é pior: streamer sem internet no dia da
live pagou e não pode ficar sem produto.

O raciocínio do número: o piso são os 7 dias em que o tier gratuito do Supabase
pausa por inatividade, uma economia nossa não pode cancelar a live do cliente;
o teto é meio ciclo de cobrança, senão ficar offline vira a forma mais barata de
usar o produto.

**Trazer de volta:** o número, se 14 não servir.

---

## 8. O portão da licença está construído e desligado

Não é tarefa, é aviso, para não virar surpresa.

A função que decide se uma instalação está liberada existe e está testada, mas
**nenhuma funcionalidade a consulta ainda**. Enquanto o ADR-P06 (item 1) não for
decidido, não há o que travar: até a primeira venda todo veredito real é
`sem_licenca` ou `indeterminada`.

Ligar o portão é decisão sua e é uma linha de código.

---

## 9. O `LEIA-ME.txt` em inglês: **decisão de quando, não de se**

O ADR-P03 diz que o funil da Fase 1 é em inglês, e o `LEIA-ME.txt` que acompanha
o executável está em português. Não bloqueia enquanto os testadores forem daqui.

**Trazer de volta:** quando o primeiro cliente de língua inglesa entrar na
conversa, me avise e eu traduzo.
