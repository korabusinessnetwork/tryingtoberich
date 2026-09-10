/**
 * Escolhe o adaptador de faturamento e reexporta.
 *
 * **A regra de escolha é uma só: sem `LEMON_API_KEY`, vale o falso** (contrato
 * da onda 2, seção 4). Mesma forma da camada de dados, e pelo mesmo motivo:
 * flag separada para ligar mock é como se esquece o mock ligado em produção.
 *
 * Existe como `index.js` espelhando `dados/index.js` porque o console tem duas
 * escolhas de configuração e elas precisam ser lidas do mesmo jeito. Duas
 * formas diferentes de escolher implementação na mesma pasta seriam duas
 * formas de errar.
 */

import { FUNCOES_DE_FATURAMENTO } from "./contrato.js";
import { criarFaturamentoDeExemplo } from "./exemplo.js";
import { criarFaturamentoDaLemon } from "./lemon.js";

/**
 * @param env           de onde sai `LEMON_API_KEY`, por parâmetro para o teste
 *                      nunca mexer no ambiente do processo.
 * @param registrarAcao a `registrarAcao` da camada de dados. Os DOIS
 *                      adaptadores a recebem: é o que faz o falso gravar no log
 *                      administrativo igual ao real, sem o que o teste do item 5
 *                      passaria por acidente.
 */
export function escolherFaturamento(env = process.env, { registrarAcao } = {}) {
  const chave = String(env?.LEMON_API_KEY ?? "").trim();

  if (!chave) return criarFaturamentoDeExemplo({ registrarAcao });
  return criarFaturamentoDaLemon({ chave, env, registrarAcao });
}

export { FUNCOES_DE_FATURAMENTO };
export { ACAO_NA_LEMON, PLANOS, PLANOS_COBRADOS, SEM_COBRANCA, planoCobrado, planoValido } from "./contrato.js";
