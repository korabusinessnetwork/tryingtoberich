/**
 * Escolhe a implementação da camada de dados e reexporta.
 *
 * **A regra de escolha é uma só: sem `SUPABASE_URL` ou sem a chave de serviço,
 * vale a falsa.** Nada de flag separada para ligar o mock, porque flag separada
 * é como se esquece o mock ligado em produção: a configuração diria "produção"
 * e a variável esquecida diria "exemplo", e a tela mostraria assinante que não
 * existe para quem acha que está atendendo um cliente. Aqui não há esse estado:
 * ou o console tem como falar com o banco, ou está no exemplo.
 *
 * Roda no Node, e só. Ver o cabeçalho de `supabase.js`: a chave de serviço
 * ignora RLS e nunca pode chegar ao navegador.
 */

import { FUNCOES } from "./contrato.js";
import { criarDadosDeExemplo } from "./exemplo.js";
import { criarDadosDoSupabase } from "./supabase.js";

/**
 * A única regra de escolha. `env` entra por parâmetro para o teste conferir os
 * quatro casos sem mexer no ambiente do processo, e para o `vite.config.js`
 * poder passar o que leu do `.env` da raiz sem publicar nada no bundle.
 */
export function escolherDados(env = process.env) {
  const url = String(env?.SUPABASE_URL ?? "").trim();
  const chave = String(env?.SUPABASE_SERVICE_KEY ?? "").trim();

  if (!url || !chave) return criarDadosDeExemplo();
  return criarDadosDoSupabase({ url, chave });
}

/**
 * A implementação escolhida para este processo.
 *
 * As funções saem amarradas ao objeto de origem: `trocarPlano` da real chama
 * `this.buscarFicha`, e uma função solta perderia o `this` no caminho para a
 * rota.
 */
export const dados = escolherDados();

const amarrar = (nome) => (...argumentos) => dados[nome](...argumentos);

export const listarAssinantes = amarrar("listarAssinantes");
export const buscarFicha = amarrar("buscarFicha");
export const trocarPlano = amarrar("trocarPlano");
export const resumoDeFaturamento = amarrar("resumoDeFaturamento");
export const listarEventos = amarrar("listarEventos");
export const listarAcoesAdministrativas = amarrar("listarAcoesAdministrativas");
export const saudeDeConexao = amarrar("saudeDeConexao");
export const registrarAcao = amarrar("registrarAcao");

export { FUNCOES };
export { falha, falhou, MOTIVOS, sucesso } from "./contrato.js";
