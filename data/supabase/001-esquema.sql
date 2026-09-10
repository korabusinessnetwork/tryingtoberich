-- =============================================================================
-- Kora Stream Games — a camada da Kora (ADR-P02)
--
-- Cole isto no SQL Editor do projeto do Supabase e rode. É idempotente: rodar
-- duas vezes não quebra nada.
--
-- O QUE MORA AQUI, e o que não mora:
--
--   Aqui  → licença e telemetria. Dado da KORA. O cliente não pode poder
--           editar a própria licença, e telemetria só serve agregada entre
--           clientes.
--   Lá    → preset, mapa, look, acervo, sessão. Dado do STREAMER, em JSON na
--           máquina dele (ADR-003). Nada disso sobe para cá, nunca.
--
-- A REGRA QUE MANDA EM TUDO: nenhuma consulta a este banco entra no caminho do
-- presente (CLAUDE.md, Princípio nº 1). A ponte lê a licença UMA vez, no
-- arranque, e escreve telemetria fire-and-forget. Se este projeto estiver fora
-- do ar, a live do cliente continua — é para isso que existe o espelho em disco
-- e a carência do ADR-P08.
--
-- Schema `public` de propósito. O Supabase só expõe pelo PostgREST os schemas
-- listados em Settings → API → Exposed schemas, e `public` já está lá. Um
-- schema `kora` seria mais bonito e custaria ao dono um passo a mais no painel
-- para o produto funcionar — passo que, esquecido, dá 404 sem explicação.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. LICENÇAS — a fonte da verdade de quem pode usar o produto
-- -----------------------------------------------------------------------------
--
-- `streamer_id` é a chave de tenant. O ADR-003 mandou todo modelo persistido
-- carregar esse campo, hoje sempre "local", justamente para este momento: aqui
-- ele deixa de ser enfeite e vira a coluna de TODA policy de RLS.
--
-- Uma linha por CHAVE, não por streamer: o mesmo streamer pode ter mais de uma
-- instalação (a máquina de casa e a do estúdio), e cada uma tem a sua chave.

create table if not exists public.licencas (
  -- A chave que o streamer cola no painel. Os limites são os mesmos do
  -- `data/schemas/licenca.schema.json`, para os dois lados recusarem a mesma coisa.
  chave         text primary key
                check (char_length(chave) between 8 and 128),

  -- O tenant. Mesma forma do `$defs/streamerId` em `comuns.schema.json`.
  streamer_id   text not null
                check (streamer_id ~ '^[a-z0-9][a-z0-9-]*$' and char_length(streamer_id) <= 64),

  -- Os três estados que a Kora sabe RESPONDER. `sem_licenca` e `indeterminada`
  -- não existem aqui de propósito: os dois são conclusões da ponte, não
  -- respostas do banco. "Não achei a linha" já diz `sem_licenca`, e
  -- `indeterminada` é literalmente "não deu para perguntar" — guardá-los aqui
  -- seria a Kora afirmar que não conseguiu falar consigo mesma.
  estado        text not null default 'ativa'
                check (estado in ('ativa', 'expirada', 'cancelada')),

  -- Só para exibir. Nada do produto decide nada por ele na v1 (ADR-P05).
  plano         text check (plano is null or char_length(plano) between 1 and 40),

  -- Até quando a Kora diz que vale. A ponte NÃO decide expiração por esta data:
  -- quem decide é `estado`. Duas fontes de verdade para a mesma pergunta
  -- divergem caladas, e a que o cliente veria seria a errada.
  valida_ate    timestamptz,

  criada_em     timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

comment on table public.licencas is
  'Fonte da verdade da licença (ADR-P02). O espelho em data/licenca.json na máquina do cliente é cópia, e existe para o produto funcionar quando isto aqui está fora do ar.';

-- Busca do console: "todas as instalações deste assinante" (ADR-P05, item 1).
create index if not exists licencas_streamer_id_idx on public.licencas (streamer_id);

-- Lista de renovação: quem vence nos próximos dias, sem varrer a tabela.
create index if not exists licencas_valida_ate_idx on public.licencas (valida_ate)
  where estado = 'ativa';


-- Carimbo de alteração. Existe porque a edição de plano é ação administrativa
-- (ADR-P05, item 3) e "quando isto mudou" é a primeira pergunta de qualquer
-- suporte. Deixar por conta de quem escreve é garantir que um dia esqueçam.
create or replace function public.kora_carimbar_atualizacao()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizada_em := now();
  return new;
end;
$$;

drop trigger if exists licencas_carimbar_atualizacao on public.licencas;
create trigger licencas_carimbar_atualizacao
  before update on public.licencas
  for each row execute function public.kora_carimbar_atualizacao();


-- -----------------------------------------------------------------------------
-- 2. TELEMETRIA — saúde de conexão e ficha do assinante
-- -----------------------------------------------------------------------------
--
-- LGPD, e este é o ponto mais perigoso do projeto inteiro: aqui o dado SAI da
-- máquina do streamer. A regra do `CLAUDE.md` — evento guarda tipo e valor, não
-- a pessoa — vale em dobro numa tabela remota, onde errar é bem mais caro.
--
-- A defesa é estrutural, não de disciplina: **não existe coluna onde caiba um
-- espectador.** Sem nickname, sem id, sem avatar, sem texto livre. Um `jsonb`
-- de "detalhe" resolveria muita coisa e seria exatamente por onde o vazamento
-- entraria — por isso ele não está aqui. Do lado da ponte a mesma fronteira é o
-- `additionalProperties: false` de `data/schemas/telemetria.schema.json`.
--
-- O que se pode perguntar a esta tabela é o console v1 e nada além (ADR-P05):
-- quantos conectados agora, quantas quedas em 24h, qual versão, qual idioma,
-- qual modalidade. "Presentes por modalidade" e "tempo em live" são v2, e por
-- isso não têm coluna: coluna que existe é coluna que alguém preenche.

create table if not exists public.telemetria (
  id               bigint generated always as identity primary key,

  streamer_id      text not null
                   check (streamer_id ~ '^[a-z0-9][a-z0-9-]*$' and char_length(streamer_id) <= 64),

  tipo             text not null
                   check (tipo in ('instalacao', 'conexao', 'queda', 'desconexao')),

  -- O relógio da máquina do streamer, que pode estar errado.
  em               timestamptz not null,
  -- O relógio do banco, que não pode. A diferença entre os dois é o que
  -- permite descobrir um cliente com a hora torta em vez de acreditar nela.
  recebida_em      timestamptz not null default now(),

  versao_instalada text check (versao_instalada is null or char_length(versao_instalada) between 1 and 20),
  idioma           text check (idioma is null or idioma in ('pt', 'es', 'en')),
  modalidade       text check (modalidade is null or modalidade in ('escalada')),
  motivo           text check (motivo is null or motivo ~ '^[a-z0-9_]+$')
);

comment on table public.telemetria is
  'Saúde de conexão e ficha do assinante (ADR-P05, itens 2 e 6). NENHUMA coluna aceita dado de espectador, e isso é por construção — ver o comentário do arquivo data/supabase/001-esquema.sql.';

-- "Este assinante, em ordem de tempo": é a ficha individual do console.
create index if not exists telemetria_streamer_em_idx on public.telemetria (streamer_id, em desc);

-- "Quantas quedas nas últimas 24h", que é a pergunta do item 6 e a única que
-- roda com frequência. Parcial porque queda é a minoria das linhas.
create index if not exists telemetria_quedas_idx on public.telemetria (em desc)
  where tipo = 'queda';


-- -----------------------------------------------------------------------------
-- 3. QUEM É QUEM — a identidade por trás do RLS
-- -----------------------------------------------------------------------------
--
-- A ponte usa a chave ANÔNIMA, que é a mesma em toda instalação e por isso não
-- identifica ninguém. Quem identifica é a chave da LICENÇA, mandada em todo
-- pedido no cabeçalho `X-Kora-Chave` (ver bridge/src/repos/supabase.mjs).
--
-- O PostgREST publica os cabeçalhos do pedido no GUC `request.headers`, e é daí
-- que as policies leem. Não é gambiarra: é o mecanismo documentado para
-- autorização sem sessão de usuário, e é o que evita ter que inventar login
-- para uma ferramenta que roda sozinha na máquina do streamer.

create or replace function public.kora_chave_da_requisicao()
returns text
language sql
stable
set search_path = public
as $$
  select nullif(current_setting('request.headers', true)::json ->> 'x-kora-chave', '')
$$;

-- O tenant de quem está pedindo, resolvido pela chave.
--
-- `security definer` é obrigatório aqui e o motivo é sutil: esta função é
-- chamada de DENTRO da policy de `telemetria`, e ela lê `licencas`. Sem
-- `definer`, a leitura passaria pela policy de `licencas`, que por sua vez
-- chama esta função — e o resultado seria recursão ou negação silenciosa.
--
-- Só resolve licença ATIVA. É deliberado: instalação expirada ou cancelada
-- para de escrever telemetria no mesmo instante em que perde o produto, e a
-- base não engorda com quem já saiu.
create or replace function public.kora_streamer_da_requisicao()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select l.streamer_id
    from public.licencas l
   where l.chave = public.kora_chave_da_requisicao()
     and l.estado = 'ativa'
   limit 1
$$;


-- -----------------------------------------------------------------------------
-- 4. RLS — o `streamerId` do ADR-003 virando coluna de policy
-- -----------------------------------------------------------------------------
--
-- ATENÇÃO ao `revoke`: o Supabase concede, por padrão, TODOS os privilégios de
-- tabela nova aos papéis `anon` e `authenticated`. RLS sem revogar o grant é
-- meia defesa — e a metade que falta é a que importa. Revogar primeiro e
-- conceder só o verbo necessário é o que faz `insert` em `licencas` ser
-- impossível, e não apenas "sem policy".

alter table public.licencas  enable row level security;
alter table public.telemetria enable row level security;

revoke all on public.licencas   from anon, authenticated;
revoke all on public.telemetria from anon, authenticated;

grant usage  on schema public       to anon;
grant select on public.licencas     to anon;
grant insert on public.telemetria   to anon;

-- A instalação enxerga a PRÓPRIA linha de licença, e só ela.
drop policy if exists licenca_da_propria_instalacao on public.licencas;
create policy licenca_da_propria_instalacao
  on public.licencas
  for select
  to anon
  using (chave = public.kora_chave_da_requisicao());

--[[ E não há policy de insert, update ou delete em `licencas`. ]]
--
-- Essa AUSÊNCIA é a decisão inteira do ADR-P02: "licença guardada na máquina do
-- cliente é licença que o cliente edita". Quem escreve aqui é o webhook do
-- Lemon Squeezy e o console, os dois com a chave de serviço, que não passa por
-- RLS e nunca chega perto do produto instalado.

-- A instalação escreve telemetria em nome do próprio tenant, e de nenhum outro.
drop policy if exists telemetria_da_propria_instalacao on public.telemetria;
create policy telemetria_da_propria_instalacao
  on public.telemetria
  for insert
  to anon
  with check (streamer_id = public.kora_streamer_da_requisicao());

--[[ E não há policy de select em `telemetria`. ]]
--
-- Telemetria só serve agregada entre clientes, e quem agrega é o console. Um
-- cliente conseguir LER esta tabela seria um cliente lendo a operação dos
-- outros — inclusive quantos são.


-- -----------------------------------------------------------------------------
-- 5. SAÚDE DE CONEXÃO — a pergunta do item 6, respondida em uma consulta
-- -----------------------------------------------------------------------------
--
-- O ADR-P05 chama isto de alarme de quando a TikTok quebra o acesso, que é o
-- risco nº 1 do produto (ADR-006, ADR-P06). Uma queda de quedas em massa entre
-- vários assinantes ao mesmo tempo não é problema de internet de ninguém: é a
-- plataforma tendo mudado alguma coisa.

create or replace view public.saude_de_conexao as
select
  t.streamer_id,
  max(t.em) filter (where t.tipo = 'conexao')    as ultima_conexao,
  max(t.em) filter (where t.tipo = 'desconexao') as ultima_desconexao,
  -- Conectado agora = conectou e ainda não desconectou. Instalação que morreu
  -- no tapa (queda de energia, processo morto) fica marcada como conectada até
  -- o próximo arranque; é o preço de não ter batimento periódico, e não ter
  -- batimento é o que mantém o egress perto de zero (ADR-P02).
  coalesce(
    max(t.em) filter (where t.tipo = 'conexao') >
    coalesce(max(t.em) filter (where t.tipo = 'desconexao'), '-infinity'::timestamptz),
    false
  ) as conectado_agora,
  count(*) filter (where t.tipo = 'queda' and t.em > now() - interval '24 hours') as quedas_24h,
  -- O último valor reportado, não o maior: "0.9.0" e "0.10.0" ordenam ao
  -- contrário do esperado como texto, e o `max` diria a versão errada.
  (array_agg(t.versao_instalada order by t.em desc) filter (where t.versao_instalada is not null))[1] as versao_instalada,
  (array_agg(t.idioma           order by t.em desc) filter (where t.idioma           is not null))[1] as idioma,
  (array_agg(t.modalidade       order by t.em desc) filter (where t.modalidade       is not null))[1] as ultima_modalidade
from public.telemetria t
group by t.streamer_id;

comment on view public.saude_de_conexao is
  'Console v1, item 6 (ADR-P05). Só o console lê: nenhum grant para anon.';

-- A view herda o privilégio padrão do Supabase como as tabelas. Mesmo motivo,
-- mesma revogação: um cliente lendo isto veria a base inteira de assinantes.
revoke all on public.saude_de_conexao from anon, authenticated;


-- -----------------------------------------------------------------------------
-- 6. RETENÇÃO
-- -----------------------------------------------------------------------------
--
-- Não há dado pessoal de espectador aqui (ver seção 2), então retenção é
-- questão de espaço, não de LGPD. O gatilho de upgrade do tier gratuito é 500 MB
-- de banco (ADR-P02), e a telemetria é a única tabela que cresce sozinha.
--
-- A conta: ~100 bytes por linha, e uma instalação gera ~4 linhas por live. Cem
-- assinantes com uma live por dia dão ~15 MB por ano. Não é problema na Fase 1,
-- e por isso NÃO há job de limpeza agendado — automação para um problema que
-- não existe é automação que ninguém lembra que existe quando ela quebra.
--
-- Quando fizer falta, é uma linha, rodada à mão ou por pg_cron:
--
--   delete from public.telemetria where em < now() - interval '180 days';
