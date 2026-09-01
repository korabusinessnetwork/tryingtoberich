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

const escrever = (nivel, evento, dados) => {
  const linha = { em: new Date().toISOString(), nivel, evento, ...higienizar(dados) };
  const saida = nivel === "erro" ? console.error : console.log;
  saida(JSON.stringify(linha));
};

/** Sai do caminho crítico antes de tocar em console. */
const adiar = (fn) => queueMicrotask(() => { try { fn(); } catch { /* log nunca derruba a ponte */ } });

export const log = {
  info: (evento, dados = {}) => adiar(() => escrever("info", evento, dados)),
  aviso: (evento, dados = {}) => adiar(() => escrever("aviso", evento, dados)),
  erro: (evento, dados = {}) => adiar(() => escrever("erro", evento, dados)),
};
