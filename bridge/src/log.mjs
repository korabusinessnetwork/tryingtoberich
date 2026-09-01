/**
 * Log de atividade. Duas regras que valem mais que o formato:
 *
 * 1. **Fire-and-forget.** Nunca bloqueia a operação principal. Escrever log no
 *    caminho crítico do evento de presente é violar o Princípio nº1.
 * 2. **Nunca junta nickname com identificador persistente de espectador.**
 *    Ver 11_SEGURANCA, camada 4. Os campos abaixo são removidos na marra, em
 *    vez de dependerem de quem chama lembrar da regra.
 */

const CAMPOS_PROIBIDOS = new Set([
  "userId", "uniqueId", "secUid", "espectadorId", "profilePictureUrl",
  "avatarThumb", "avatarMedium", "avatarLarge", "nomeDoador", "nickname",
]);

/** Tira de `dados` qualquer campo que identifique um espectador. */
export function higienizar(dados) {
  if (dados === null || typeof dados !== "object") return dados;
  if (Array.isArray(dados)) return dados.map(higienizar);
  return Object.fromEntries(
    Object.entries(dados)
      .filter(([chave]) => !CAMPOS_PROIBIDOS.has(chave))
      .map(([chave, valor]) => [chave, higienizar(valor)]),
  );
}

/**
 * Últimas linhas em memória, para o painel poder olhar quando algo falha.
 *
 * Em memória e não em disco de propósito: escrever log da live no disco
 * colocaria I/O perto do caminho quente, e o `11_SEGURANCA` já manda não
 * persistir dado de espectador. O que sobrevive ao processo é o console.
 *
 * O teto existe porque uma live de 2 horas com a ponte reconectando geraria
 * milhares de linhas, e o painel só precisa das últimas para diagnosticar.
 */
const TETO_DO_BUFFER = 200;
const recentes = [];
const ouvintes = new Set();
let proximoId = 0;

const escrever = (nivel, evento, dados) => {
  proximoId += 1;
  // `higienizar` roda ANTES de qualquer destino: nickname e id de espectador
  // não entram no console nem no buffer que o painel lê.
  const linha = { id: proximoId, em: new Date().toISOString(), nivel, evento, ...higienizar(dados) };

  const saida = nivel === "erro" ? console.error : console.log;
  saida(JSON.stringify(linha));

  recentes.push(linha);
  if (recentes.length > TETO_DO_BUFFER) recentes.shift();

  for (const ouvinte of ouvintes) {
    try {
      ouvinte(linha);
    } catch {
      // Ouvinte quebrado não pode derrubar quem estava só tentando logar.
    }
  }
};

/** Sai do caminho crítico antes de tocar em console. */
const adiar = (fn) => queueMicrotask(() => { try { fn(); } catch { /* log nunca derruba a ponte */ } });

export const log = {
  info: (evento, dados = {}) => adiar(() => escrever("info", evento, dados)),
  aviso: (evento, dados = {}) => adiar(() => escrever("aviso", evento, dados)),
  erro: (evento, dados = {}) => adiar(() => escrever("erro", evento, dados)),
};

/** As últimas linhas, mais novas primeiro. É o que o painel busca ao abrir. */
export const logRecente = (limite = TETO_DO_BUFFER) => recentes.slice(-limite).reverse();

/** Assina o fluxo de log. Devolve a função que cancela. */
export function ouvirLog(ouvinte) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** Só para teste: o buffer é global ao processo. */
export function limparLogRecente() {
  recentes.length = 0;
  proximoId = 0;
}
