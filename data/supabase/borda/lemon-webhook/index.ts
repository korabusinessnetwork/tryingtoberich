/**
 * O webhook da Lemon Squeezy, como função de borda do Supabase.
 *
 * POR QUE AQUI E NÃO NA PONTE: a ponte roda na máquina do cliente (ADR-P04) e
 * não tem endereço público. O webhook precisa de um. A função de borda é o
 * único lugar público que o projeto já tem por decisão (ADR-P02), e é gratuita
 * no mesmo tier. A alternativa seria contratar hospedagem, que é dinheiro.
 *
 * O que ela faz: confere a assinatura, traduz o corpo, grava uma linha em
 * `faturamento`. O console lê essa tabela; ele nunca fala com a Lemon Squeezy
 * para montar o MRR.
 *
 * Publicar (o passo é do Matheus, ver PENDENCIAS-DO-MATHEUS.md):
 *
 *     supabase functions deploy lemon-webhook --no-verify-jwt
 *     supabase secrets set LEMON_WEBHOOK_SECRET=<segredo>
 *
 * `--no-verify-jwt` é obrigatório e é seguro: quem chama é a Lemon Squeezy, que
 * não tem JWT do Supabase. Quem autentica a chamada é a assinatura HMAC abaixo,
 * e é ela que não pode falhar.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { mapear } from "./mapear.mjs";

/**
 * Comparação em tempo constante.
 *
 * Comparar assinatura com `===` vaza, pelo tempo de resposta, quantos bytes do
 * começo estavam certos, e isso é suficiente para descobrir a assinatura byte a
 * byte. É pouco provável de explorar num webhook, e custa cinco linhas evitar.
 */
function iguais(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i += 1) diferenca |= a[i] ^ b[i];
  return diferenca === 0;
}

const emBytes = (hex: string): Uint8Array =>
  new Uint8Array((hex.match(/.{1,2}/g) ?? []).map((par) => Number.parseInt(par, 16)));

async function assinaturaConfere(corpoCru: string, cabecalho: string | null, segredo: string) {
  if (!cabecalho) return false;

  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const esperada = new Uint8Array(
    await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpoCru)),
  );

  return iguais(esperada, emBytes(cabecalho.trim().toLowerCase()));
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const segredo = Deno.env.get("LEMON_WEBHOOK_SECRET");
  if (!segredo) {
    // Sem segredo NÃO se aceita nada. Aceitar sem conferir deixaria qualquer um
    // escrever no faturamento da Kora, que é pior que perder o evento: a Lemon
    // Squeezy reenvia, um número inventado fica.
    console.error("LEMON_WEBHOOK_SECRET ausente: recusando tudo");
    return new Response("Not configured", { status: 503 });
  }

  // O corpo CRU, antes de virar JSON: a assinatura é sobre os bytes exatos, e
  // um `JSON.parse` seguido de `stringify` muda espaço e ordem.
  const corpoCru = await req.text();

  if (!(await assinaturaConfere(corpoCru, req.headers.get("x-signature"), segredo))) {
    console.error("assinatura invalida");
    return new Response("Invalid signature", { status: 401 });
  }

  let corpo: unknown;
  try {
    corpo = JSON.parse(corpoCru);
  } catch {
    // 200 de propósito: corpo quebrado não melhora com reenvio, e recusar faria
    // a Lemon Squeezy tentar para sempre.
    console.error("corpo nao e JSON");
    return new Response("ok", { status: 200 });
  }

  //[[ Quais variantes são o pack, e não a assinatura.
  //
  // Sem esta lista o `order_created` é ignorado, e é de propósito: numa
  // assinatura nova ele chega junto do `subscription_created`, e contar os dois
  // dobraria a venda. Ignorar perde uma linha do relatório; contar errado
  // inventa receita, que é pior e mais difícil de descobrir.
  //
  // `supabase secrets set LEMON_VARIANTES_PACK=123,456`
  const variantesDePack = (Deno.env.get("LEMON_VARIANTES_PACK") ?? "")
    .split(",")
    .map((v: string) => v.trim())
    .filter(Boolean);

  const linha = mapear(corpo, { variantesDePack });
  if (!linha) return new Response("ignored", { status: 200 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // `ignoreDuplicates`: reenvio do mesmo evento não pode virar linha nova, ou a
  // venda aparece duas vezes no MRR. É para isso que `evento_id` é a chave.
  const { error } = await supabase
    .from("faturamento")
    .upsert(linha, { onConflict: "evento_id", ignoreDuplicates: true });

  if (error) {
    // Aqui sim vale 500: falha de banco melhora com reenvio, e perder a linha
    // silenciosamente faria o MRR ficar errado sem ninguém saber.
    console.error("nao gravei:", error.message);
    return new Response("Storage failed", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
