-- =============================================================================
-- Kora Stream Games, migration 002: o que o console do operador precisa
-- =============================================================================
--
-- Rode DEPOIS do 001-esquema.sql, no SQL Editor do Supabase.
--
-- O 001 criou o que a INSTALAÇÃO escreve e lê: licença e telemetria. Este aqui
-- cria o que só a KORA vê (ADR-P05): quem é o assinante por trás da licença, o
-- que foi feito na conta dele, e o espelho do dinheiro.
--
-- A regra que atravessa o arquivo inteiro: **nada aqui é alcançável pelo papel
-- `anon`.** A instalação do cliente usa a chave anon e não pode ver a lista de
-- assinantes da Kora nem o faturamento. O console usa a chave de serviço, que
-- nunca sai do console e nunca entra no produto.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- assinantes: a pessoa, separada da licença
-- -----------------------------------------------------------------------------
--
-- Por que não é coluna na tabela `licencas`: uma pessoa pode trocar de licença
-- (upgrade, reemissão depois de vazamento) sem deixar de ser a mesma pessoa, e
-- o histórico de faturamento segue a pessoa, não a chave. Juntar os dois faria
-- "cancelou e voltou" virar dois clientes no MRR.
--
-- O e-mail é dado pessoal. Ele existe aqui porque é como a Kora fala com quem
-- comprou, e por nenhum outro motivo (`docs/11_SEGURANCA`, LGPD). Nunca desce
-- para a instalação: a licença que o produto lê não tem e-mail nenhum.

create table if not exists public.assinantes (
  streamer_id     text primary key
                  check (streamer_id ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),

  email           text not null
                  check (email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),

  -- O @ da TikTok, sem arroba, na mesma regra do painel: 2 a 24, letras,
  -- números, ponto e sublinhado.
  usuario_tiktok  text
                  check (usuario_tiktok is null
                         or usuario_tiktok ~ '^[A-Za-z0-9._]{2,24}$'),

  nome            text check (nome is null or char_length(nome) between 1 and 80),

  -- Idioma do PERFIL (ADR-P03), item 2 do console. É o que a instalação
  -- reportou por telemetria, não uma preferência editada aqui.
  idioma          text check (idioma is null or idioma in ('pt', 'es', 'en')),

  -- Id do cliente na Lemon Squeezy. Nulo enquanto a venda não existir, o que é
  -- o caso de todo assinante criado à mão para teste ou cortesia.
  lemon_customer_id text,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

comment on table public.assinantes is
  'Quem comprou. Só a Kora lê (ADR-P05). O e-mail nunca desce para a instalação.';

-- Busca do item 1: por usuário da TikTok, e-mail ou licença. Os dois primeiros
-- moram aqui; a licença é chave primária na outra tabela e já tem índice.
create index if not exists assinantes_email_idx
  on public.assinantes (lower(email));
create index if not exists assinantes_tiktok_idx
  on public.assinantes (lower(usuario_tiktok));

create trigger assinantes_carimbo
  before update on public.assinantes
  for each row execute function public.kora_carimbar_atualizacao();

-- -----------------------------------------------------------------------------
-- log_administrativo: quem fez o quê e quando, imutável
-- -----------------------------------------------------------------------------
--
-- Item 5 do ADR-P05. "Imutável" não é adjetivo de documentação: é regra do
-- banco. Um log administrativo que pode ser editado não serve para a única
-- coisa que ele existe para fazer, que é responder "quem mexeu nessa conta".
--
-- A regra vale inclusive para o papel de serviço, que é o do console. Quem
-- opera o console é quem teria motivo para apagar a própria linha.

create table if not exists public.log_administrativo (
  id          bigint generated always as identity primary key,

  -- Quem operou. Hoje é sempre o dono; a coluna existe desde já pelo mesmo
  -- motivo que o `streamerId` do ADR-003 existe desde antes de servir.
  operador    text not null default 'dono'
              check (char_length(operador) between 1 and 60),

  -- Verbo do domínio, em snake_case, não frase. Frase envelhece e não agrupa.
  acao        text not null check (acao ~ '^[a-z0-9_]+$'),

  -- Sobre quem. Nulo em ação que não é de uma conta só.
  streamer_id text,

  -- O antes e o depois, para a ação ser auditável sem adivinhação.
  detalhe     jsonb not null default '{}'::jsonb,

  em          timestamptz not null default now()
);

comment on table public.log_administrativo is
  'Append-only por trigger. Item 5 do ADR-P05: log que aceita update nao e log.';

create index if not exists log_admin_em_idx on public.log_administrativo (em desc);
create index if not exists log_admin_streamer_idx
  on public.log_administrativo (streamer_id, em desc);

create or replace function public.kora_recusar_alteracao()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'log_administrativo e append-only: % recusado (ADR-P05, item 5)', tg_op
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists log_admin_sem_update on public.log_administrativo;
create trigger log_admin_sem_update
  before update or delete on public.log_administrativo
  for each row execute function public.kora_recusar_alteracao();

-- -----------------------------------------------------------------------------
-- faturamento: espelho do que a Lemon Squeezy manda por webhook
-- -----------------------------------------------------------------------------
--
-- Item 4 do ADR-P05. **Esta tabela não é a fonte da verdade do dinheiro** (ADR-P02):
-- a fonte é a Lemon Squeezy. Ela é espelho, para o console montar MRR e o mês
-- sem depender da API deles estar de pé, e para o número não mudar sozinho
-- entre dois olhares.
--
-- `evento_id` é a chave: webhook reenvia, e reenvio que vira linha nova
-- duplicaria a venda no MRR. O `on conflict do nothing` da função de borda
-- depende deste unique.

create table if not exists public.faturamento (
  evento_id   text primary key,

  tipo        text not null
              check (tipo in ('assinatura_criada', 'assinatura_renovada',
                              'assinatura_cancelada', 'assinatura_expirada',
                              'reembolso')),

  streamer_id text,
  plano       text check (plano is null or char_length(plano) between 1 and 40),

  -- Em CENTAVOS, e a moeda do lado. Dinheiro em ponto flutuante é como
  -- centavo some sem ninguém ver.
  valor_centavos integer not null default 0 check (valor_centavos >= 0),
  moeda          text not null default 'USD' check (moeda ~ '^[A-Z]{3}$'),

  em          timestamptz not null,
  recebido_em timestamptz not null default now(),

  -- O corpo cru do webhook. Guardado porque toda vez que um número do painel
  -- discordar do painel deles, a resposta está aqui e não na memória de alguém.
  bruto       jsonb not null default '{}'::jsonb
);

comment on table public.faturamento is
  'Espelho do webhook da Lemon Squeezy. A fonte da verdade do dinheiro e la (ADR-P02).';

create index if not exists faturamento_em_idx on public.faturamento (em desc);
create index if not exists faturamento_streamer_idx
  on public.faturamento (streamer_id, em desc);

-- -----------------------------------------------------------------------------
-- A trava: nada disto é do papel `anon`
-- -----------------------------------------------------------------------------
--
-- O Supabase concede tudo a `anon` e `authenticated` em tabela nova. Sem estes
-- revokes, a chave anon que vai em TODA instalação leria a lista de assinantes
-- da Kora, com e-mail. RLS ligado sem revogar o grant é meia defesa: aqui não
-- existe policy nenhuma, então RLS ligado já nega tudo, e o revoke é o cinto.

alter table public.assinantes         enable row level security;
alter table public.log_administrativo enable row level security;
alter table public.faturamento        enable row level security;

revoke all on public.assinantes         from anon, authenticated;
revoke all on public.log_administrativo from anon, authenticated;
revoke all on public.faturamento        from anon, authenticated;

-- Sem `create policy` de propósito. Só a chave de serviço, que ignora RLS,
-- alcança estas três tabelas, e ela é do console.

-- -----------------------------------------------------------------------------
-- A ficha do assinante, montada de uma vez
-- -----------------------------------------------------------------------------
--
-- Item 2 do ADR-P05 pede sete coisas numa tela. Buscá-las em quatro consultas
-- do lado do console daria quatro momentos diferentes do banco na mesma ficha.

create or replace view public.ficha_do_assinante as
select
  a.streamer_id,
  a.email,
  a.usuario_tiktok,
  a.nome,
  a.idioma,
  a.criado_em,
  l.chave                          as licenca,
  l.estado                         as licenca_estado,
  l.plano,
  l.valida_ate,
  (select max(t.em) from public.telemetria t
    where t.streamer_id = a.streamer_id)                 as ultima_conexao,
  (select max(t.versao_instalada) from public.telemetria t
    where t.streamer_id = a.streamer_id
      and t.versao_instalada is not null)                as versao_instalada,
  (select array_agg(distinct t.modalidade) from public.telemetria t
    where t.streamer_id = a.streamer_id
      and t.modalidade is not null)                      as modalidades
from public.assinantes a
left join public.licencas l on l.streamer_id = a.streamer_id;

comment on view public.ficha_do_assinante is
  'Item 2 do ADR-P05: as sete coisas da ficha, num momento so do banco.';

revoke all on public.ficha_do_assinante from anon, authenticated;
