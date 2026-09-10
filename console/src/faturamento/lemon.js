/**
 * O adaptador REAL da Lemon Squeezy, por HTTP, com `LEMON_API_KEY`.
 *
 * **Roda só no Node**, pelo mesmo motivo de `dados/supabase.js`: a chave da
 * Lemon Squeezy lê e escreve assinatura de cliente pagante, e o bundle do Vite
 * é público por definição. Quem a lê é o processo que serve a página.
 *
 * **Sem dependência nova.** A API deles é JSON:API sobre HTTP puro, e o SDK
 * oficial traria árvore inteira para montar cabeçalho (CLAUDE.md, Custo).
 *
 * **Nunca lança.** Tudo devolve o envelope do contrato.
 *
 * ---
 *
 * **O QUE NÃO FOI VERIFICADO, e está escrito aqui para ninguém descobrir tarde:**
 * não existe conta nem chave da Lemon Squeezy neste projeto, então nenhuma
 * chamada deste arquivo jamais tocou a API de verdade. A forma dos caminhos e
 * do corpo saiu da documentação pública deles. O que roda hoje, e o que os
 * testes exercitam, é o adaptador falso. Antes da primeira venda alguém precisa
 * abrir a conta e rodar isto uma vez contra a API real (ver ADR-P06, que está
 * Proposto e bloqueia vender).
 */

import {
  ACAO_NA_LEMON,
  falha,
  MOTIVOS,
  planoCobrado,
  sucesso,
} from "./contrato.js";

const BASE = "https://api.lemonsqueezy.com/v1";

/** Mesmo teto da camada de dados: o operador clicou e está olhando a tela. */
const TIMEOUT_MS = 10_000;

/**
 * Do plano do console para a variante do catálogo deles.
 *
 * A Lemon Squeezy não conhece "mensal": ela conhece um `variant_id` numérico
 * que muda de conta para conta. O mapa sai do ambiente, e não do código, pelo
 * mesmo motivo de toda chave: `LEMON_VARIANTE_MENSAL`, `LEMON_VARIANTE_ANUAL`.
 *
 * Sem a variante configurada a troca não acontece, e a tela diz por quê.
 * Escrever um id chutado seria mudar o plano de um cliente para o produto
 * errado, que é o pior desfecho possível desta tela.
 */
export function varianteDoPlano(env, plano) {
  const chave = `LEMON_VARIANTE_${String(plano ?? "").trim().toUpperCase()}`;
  const valor = String(env?.[chave] ?? "").trim();
  return valor || null;
}

const daAssinatura = (linha) => {
  const atributos = linha?.attributes ?? {};
  return {
    id: String(linha?.id ?? ""),
    plano: atributos.variant_name ? String(atributos.variant_name).slice(0, 40) : null,
    // O vocabulário deles ('active', 'cancelled', 'expired', 'past_due') vira o
    // do domínio aqui, e só aqui: é a mesma regra do `snake_case` do banco.
    estado: ESTADOS[atributos.status] ?? "indeterminada",
    valorCentavos: emCentavos(atributos.first_subscription_item?.price ?? atributos.total ?? 0),
    moeda: /^[A-Z]{3}$/.test(String(atributos.currency ?? "")) ? atributos.currency : "USD",
  };
};

const ESTADOS = {
  active: "ativa",
  on_trial: "ativa",
  past_due: "ativa",
  paused: "pausada",
  cancelled: "cancelada",
  unpaid: "cancelada",
  expired: "expirada",
};

/**
 * Centavos, sempre inteiros. Mesma regra do `mapear.mjs` da função de borda, e
 * pelo mesmo motivo: eles mandam string num evento e número noutro, e centavo
 * em ponto flutuante é como centavo some sem ninguém ver.
 */
export function emCentavos(valor) {
  const n = Number.parseInt(String(valor ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export class ClienteDaLemon {
  constructor({ chave = "", buscar = fetch, timeoutMs = TIMEOUT_MS } = {}) {
    this.chave = String(chave ?? "").trim();
    this.buscar = buscar;
    this.timeoutMs = timeoutMs;
  }

  get configurado() {
    return Boolean(this.chave);
  }

  async chamar(caminho, opcoes = {}) {
    if (!this.configurado) return falha(MOTIVOS.SEM_CONFIGURACAO);

    let resposta;
    try {
      resposta = await this.buscar(`${BASE}${caminho}`, {
        ...opcoes,
        headers: {
          authorization: `Bearer ${this.chave}`,
          accept: "application/vnd.api+json",
          "content-type": "application/vnd.api+json",
          ...(opcoes.headers ?? {}),
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (erro) {
      return falha(erro?.name === "TimeoutError" ? MOTIVOS.TIMEOUT : MOTIVOS.REDE, erro?.message ?? null);
    }

    if (!resposta.ok) {
      // O corpo do erro deles cita id de loja e de variante. Vai para o log
      // local do console, nunca cru para a tela.
      const detalhe = await resposta.text().catch(() => null);
      return { ...falha(MOTIVOS.HTTP, detalhe), status: resposta.status };
    }

    try {
      return sucesso({ corpo: await resposta.json() });
    } catch (erro) {
      return falha(MOTIVOS.CORPO_ILEGIVEL, erro?.message ?? null);
    }
  }
}

/**
 * @param env de onde saem as variantes de cada plano. Entra por parâmetro,
 *            como em toda a camada, para o teste nunca depender do ambiente.
 * @param registrarAcao a `registrarAcao` da camada de dados, injetada.
 */
export function criarFaturamentoDaLemon({ chave, env = {}, buscar, cliente, registrarAcao } = {}) {
  const lemon = cliente ?? new ClienteDaLemon({ chave, buscar });

  /** A assinatura ATIVA do cliente, que é a única que faz sentido alterar. */
  async function assinaturaDe(lemonCustomerId) {
    if (!lemonCustomerId) return falha(MOTIVOS.PEDIDO_INVALIDO, "lemonCustomerId é obrigatório");

    const resposta = await lemon.chamar(
      `/customers/${encodeURIComponent(lemonCustomerId)}/subscriptions`,
    );
    if (resposta.ok !== true) return resposta;

    const linhas = Array.isArray(resposta.corpo?.data) ? resposta.corpo.data : [];
    const assinaturas = linhas.map(daAssinatura);
    // A ativa primeiro. Um cliente que cancelou e voltou tem duas, e mexer na
    // antiga seria mudar o plano de uma assinatura que não cobra mais nada.
    const escolhida = assinaturas.find((a) => a.estado === "ativa") ?? assinaturas[0] ?? null;

    return sucesso({ assinatura: escolhida });
  }

  return {
    fonte: "lemon",

    assinaturaDe,

    async trocarPlano(lemonCustomerId, plano, { streamerId = null } = {}) {
      if (!lemonCustomerId) return falha(MOTIVOS.PEDIDO_INVALIDO, "lemonCustomerId é obrigatório");
      if (!planoCobrado(plano)) return falha(MOTIVOS.PEDIDO_INVALIDO, "plano sem cobrança na Lemon Squeezy");

      const variante = varianteDoPlano(env, plano);
      if (!variante) {
        // Sem a variante, o pedido não sai. Chutar um id mudaria o plano do
        // cliente para o produto errado, que é o pior desfecho desta tela.
        return falha(MOTIVOS.SEM_CONFIGURACAO, `LEMON_VARIANTE_${String(plano).toUpperCase()} ausente`);
      }

      const atual = await assinaturaDe(lemonCustomerId);
      if (atual.ok !== true) return atual;
      if (!atual.assinatura) return falha(MOTIVOS.NAO_ENCONTRADO, "sem assinatura na Lemon Squeezy");

      const escrita = await lemon.chamar(`/subscriptions/${encodeURIComponent(atual.assinatura.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          data: {
            type: "subscriptions",
            id: String(atual.assinatura.id),
            attributes: { variant_id: Number.parseInt(variante, 10) },
          },
        }),
      });
      if (escrita.ok !== true) return escrita;

      const depois = daAssinatura(escrita.corpo?.data ?? {});

      // Depois da escrita, e antes do retorno. Igual ao falso, e é essa
      // igualdade que faz o teste do item 5 valer alguma coisa.
      await registrarAcao?.({
        acao: ACAO_NA_LEMON,
        streamerId,
        detalhe: {
          de: atual.assinatura.plano,
          para: plano,
          lemonCustomerId: String(lemonCustomerId),
          assinatura: atual.assinatura.id,
          adaptador: "lemon",
        },
      });

      return sucesso({ assinatura: depois });
    },
  };
}
