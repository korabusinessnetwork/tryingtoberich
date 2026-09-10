/**
 * O que a Lemon Squeezy manda vira uma linha de `faturamento`.
 *
 * Mora num arquivo separado do `index.ts`, e em `.mjs`, por um motivo só:
 * **isto é conta de dinheiro e precisa de teste.** A função de borda roda em
 * Deno, no Supabase, e não dá para rodá-la no `npm test`. A tradução do payload
 * dá, e é ela que erra de um jeito caro: valor na unidade errada, evento
 * contado duas vezes, cancelamento lido como renovação.
 *
 * O `index.ts` importa este arquivo. O Deno lê ESM relativo sem cerimônia.
 *
 * A fonte da verdade do dinheiro continua sendo a Lemon Squeezy (ADR-P02).
 * Isto aqui é espelho, para o console montar MRR sem depender da API deles
 * estar de pé, e para o número não mudar sozinho entre dois olhares.
 */

/**
 * Os eventos que interessam, e só eles.
 *
 * A Lemon Squeezy manda muito mais que isto — `order_created`,
 * `subscription_payment_success`, `license_key_created`. Guardar tudo encheria
 * a tabela de linha que ninguém lê e faria o MRR depender de escolher certo na
 * hora da consulta. Aqui a escolha é feita uma vez, na entrada.
 *
 * `subscription_payment_success` fica de fora de propósito: ela chega JUNTO com
 * a renovação, e contar as duas dobraria a receita do mês.
 */
const EVENTOS = {
  subscription_created: "assinatura_criada",
  subscription_updated: null, // mudança de plano não é dinheiro novo; ver abaixo
  subscription_cancelled: "assinatura_cancelada",
  subscription_expired: "assinatura_expirada",
  subscription_payment_refunded: "reembolso",
};

/**
 * A venda avulsa, e por que ela é o caso delicado.
 *
 * A loja vende duas coisas: o pack, que é compra única, e a assinatura. O
 * problema é que `order_created` dispara nas DUAS. Numa assinatura nova ele
 * chega junto de `subscription_created`, e contar os dois dobraria a venda.
 *
 * Por isso `order_created` só vira linha quando a variante comprada está na
 * lista de variantes de PACK, que é configuração explícita. **Sem a lista, ele
 * é ignorado**, que é o comportamento seguro: perder uma venda no relatório é
 * ruim, inventar receita é pior, e a linha perdida está no painel deles.
 */
const AVULSOS = {
  order_created: "venda_avulsa",
  order_refunded: "reembolso",
};

/** A variante que a compra carrega, quando dá para saber. */
function varianteDoPedido(atributos) {
  const bruto = atributos?.first_order_item?.variant_id ?? atributos?.variant_id ?? null;
  return bruto == null ? null : String(bruto);
}

/**
 * `subscription_updated` é o evento mais ambíguo do lote: ele chega quando o
 * plano muda, quando o cartão é trocado, e quando a assinatura renova. Só o
 * `status` de dentro diz qual foi.
 */
function tipoDeAtualizacao(status) {
  if (status === "cancelled") return "assinatura_cancelada";
  if (status === "expired") return "assinatura_expirada";
  if (status === "active") return "assinatura_renovada";
  return null;
}

/** O `streamerId` viaja no `custom_data` do checkout, e é o que liga venda a conta. */
function acharStreamerId(atributos, meta) {
  const bruto = meta?.custom_data?.streamer_id ?? atributos?.user_email ?? null;
  if (!bruto) return null;
  const limpo = String(bruto).trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{1,62}$/.test(limpo) ? limpo : null;
}

/**
 * Centavos, sempre inteiros.
 *
 * A Lemon Squeezy já manda em centavos, mas manda como string em alguns
 * eventos e como número em outros. Ponto flutuante em dinheiro é como centavo
 * some sem ninguém ver, então o que não vira inteiro vira zero, e o corpo cru
 * fica guardado para conferência.
 */
export function emCentavos(valor) {
  const n = Number.parseInt(String(valor ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Traduz o corpo do webhook para a linha da tabela, ou devolve `null` quando o
 * evento não interessa.
 *
 * Nunca lança. Webhook que responde 500 é webhook que a Lemon Squeezy reenvia
 * para sempre, e um corpo estranho não pode virar uma fila infinita.
 */
export function mapear(corpo, { variantesDePack = [] } = {}) {
  const nome = corpo?.meta?.event_name;
  if (!nome) return null;

  const atributos = corpo?.data?.attributes ?? {};

  let tipo = EVENTOS[nome];
  if (nome === "subscription_updated") tipo = tipoDeAtualizacao(atributos.status);

  if (!tipo && AVULSOS[nome]) {
    // Só conta se for o pack. Assinatura nova também dispara `order_created`, e
    // contar os dois dobraria a venda no mês.
    const doPack = new Set([...variantesDePack].map(String));
    const variante = varianteDoPedido(atributos);
    if (variante && doPack.has(variante)) tipo = AVULSOS[nome];
  }

  if (!tipo) return null;

  // O id do evento é a chave da tabela: webhook reenvia, e reenvio virando
  // linha nova duplicaria a venda no MRR. Sem id próprio, o par evento+recurso
  // serve, porque é estável entre reenvios do MESMO evento.
  const eventoId = String(
    corpo?.meta?.event_id ?? corpo?.meta?.webhook_id ?? `${nome}:${corpo?.data?.id ?? "sem-id"}`,
  );

  return {
    evento_id: eventoId,
    tipo,
    streamer_id: acharStreamerId(atributos, corpo.meta),
    plano: atributos.variant_name ? String(atributos.variant_name).slice(0, 40) : null,
    // Reembolso vem com o valor positivo e o tipo diz o sinal. Guardar negativo
    // faria a soma do mês depender de ninguém esquecer o `abs`.
    valor_centavos: emCentavos(
      atributos.total ?? atributos.subtotal ?? atributos.first_subscription_item?.price ?? 0,
    ),
    moeda: /^[A-Z]{3}$/.test(String(atributos.currency ?? "")) ? atributos.currency : "USD",
    em: atributos.created_at ?? atributos.updated_at ?? new Date().toISOString(),
    bruto: corpo,
  };
}
