/**
 * Item 3 do ADR-P05: a troca de plano, que é a única operação do console que
 * escreve em DOIS sistemas.
 *
 * Existe como módulo próprio porque não é de nenhum dos dois lados: a camada de
 * dados não pode conhecer a Lemon Squeezy (trocar o substrato do banco viraria
 * reescrever cobrança junto), o adaptador de cobrança não pode conhecer
 * `licencas`, e `servidor/rotas.js` não guarda regra de negócio nenhuma, por
 * decisão escrita no cabeçalho dele.
 *
 * **A ordem é Lemon Squeezy primeiro, base da Kora depois, e ela não é
 * arbitrária.** A fonte da verdade do dinheiro é a Lemon Squeezy (ADR-P02).
 * Gravar `plano = 'anual'` aqui enquanto lá continua cobrando mensal produz uma
 * ficha que mente para quem atende, e o cliente descobre pela fatura. O
 * contrário é chato mas honesto: a cobrança mudou, a ficha não, e o log
 * administrativo mostra exatamente essa metade, porque os dois passos gravam
 * verbos diferentes (ver `ACAO_NA_LEMON` no contrato).
 *
 * **Motivo é obrigatório.** Ação administrativa sobre a conta paga de alguém
 * sem uma linha dizendo por quê é a linha de log que ninguém consegue usar seis
 * meses depois, que é justamente quando ela é procurada.
 */

import { falha, MOTIVOS, sucesso } from "../dados/contrato.js";
import { planoCobrado, planoValido, SEM_COBRANCA } from "./contrato.js";

/** Motivo curto demais não é motivo, é o operador se livrando do campo. */
const MOTIVO_MINIMO = 3;

export async function trocarPlanoDoAssinante({ dados, faturamento, streamerId, plano, motivo } = {}) {
  if (!streamerId) return falha(MOTIVOS.PEDIDO_INVALIDO, "streamerId é obrigatório");
  if (!planoValido(plano)) return falha(MOTIVOS.PEDIDO_INVALIDO, "plano fora do catálogo");

  const razao = String(motivo ?? "").trim();
  if (razao.length < MOTIVO_MINIMO) {
    return falha(MOTIVOS.PEDIDO_INVALIDO, "motivo é obrigatório na troca de plano");
  }

  const cobranca = await dados.buscarCobranca(streamerId);
  if (cobranca.ok !== true) return cobranca;
  if (!cobranca.existe) return falha(MOTIVOS.NAO_ENCONTRADO, streamerId);

  /* ---- 1. a Lemon Squeezy, quando ela tem o que mudar ---------------- */

  let escritaNaLemon = { escrita: false, motivo: null, adaptador: faturamento?.fonte ?? null };

  if (!cobranca.lemonCustomerId) {
    // Conta de cortesia ou criada à mão: nunca passou pela Lemon Squeezy, e não
    // há assinatura para alterar. Não é erro, e a tela precisa dizer que a
    // troca valeu só na base da Kora.
    escritaNaLemon.motivo = SEM_COBRANCA.SEM_CLIENTE;
  } else if (!planoCobrado(plano)) {
    escritaNaLemon.motivo = SEM_COBRANCA.PLANO_SEM_COBRANCA;
  } else {
    const resposta = await faturamento.trocarPlano(cobranca.lemonCustomerId, plano, { streamerId });
    // Recusa da cobrança ABORTA a troca inteira, e a base da Kora fica como
    // estava. Ver o cabeçalho: ficha que mente é pior que ficha desatualizada.
    if (resposta.ok !== true) return resposta;
    escritaNaLemon = { escrita: true, motivo: null, adaptador: faturamento.fonte, assinatura: resposta.assinatura ?? null };
  }

  /* ---- 2. a base da Kora, que grava `plano_trocado` no log ----------- */

  const local = await dados.trocarPlano(streamerId, plano, {
    motivo: razao,
    // O que aconteceu do lado do dinheiro entra no detalhe da MESMA linha que
    // registra a troca local: quem lê o log seis meses depois não deveria ter
    // de cruzar duas linhas para saber se o cliente foi cobrado.
    cobranca: escritaNaLemon,
  });
  if (local.ok !== true) return local;

  return sucesso({ ficha: local.ficha, cobranca: escritaNaLemon });
}
