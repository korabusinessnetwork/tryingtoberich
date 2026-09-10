-- =============================================================================
-- Kora Stream Games, migration 003: a venda avulsa entra no faturamento
-- =============================================================================
--
-- Rode DEPOIS do 002-console.sql.
--
-- O plano de produto previa vender um pack de compra única e uma assinatura. O
-- 002 nasceu só com os tipos de assinatura, porque a loja ia começar só com
-- ela. A decisão do dono em 2026-09-10 foi vender as duas, com o pack a
-- US$ 79,90, e o `check` da coluna `tipo` recusaria a linha da compra única.
--
-- Recusar seria pior que parecer: o webhook responderia 500, a Lemon Squeezy
-- reenviaria para sempre, e a venda não apareceria no console.
-- =============================================================================

alter table public.faturamento drop constraint if exists faturamento_tipo_check;

alter table public.faturamento add constraint faturamento_tipo_check
  check (tipo in (
    'assinatura_criada',
    'assinatura_renovada',
    'assinatura_cancelada',
    'assinatura_expirada',
    'venda_avulsa',
    'reembolso'
  ));

comment on column public.faturamento.tipo is
  'assinatura_* para recorrencia, venda_avulsa para o pack de compra unica, reembolso para os dois.';
