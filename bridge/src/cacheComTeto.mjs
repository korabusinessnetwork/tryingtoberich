/**
 * Cache com TETO. Existe porque `Map` sem limite é vazamento com outro nome.
 *
 * Os dois clientes do Roblox guardavam resultado por chave de busca — nick e
 * termo digitado — num `Map` que nunca perdia nada. O TTL vencia o VALOR e não
 * removia a CHAVE: o objeto ficava lá, velho e ocupando memória, e a chave nova
 * entrava do lado. Numa live de duas horas, cada nick diferente que passasse
 * por `/jogo/skin` deixava um resto para sempre, e o rate limit não impede
 * isso — ele limita a taxa, não a variedade.
 *
 * Descarte por ordem de INSERÇÃO, que é o que o `Map` do JavaScript já garante:
 * o primeiro `keys().next()` é o mais antigo. Não é LRU de verdade — reler uma
 * chave não a rejuvenesce — e não precisa ser: o uso é rajada curta de buscas
 * diferentes, não releitura longa das mesmas.
 *
 * Nada disto está no caminho crítico do presente (CLAUDE.md, Princípio nº1):
 * vestiário e galeria só abrem com a sessão parada (ADR-011).
 */
export class CacheComTeto {
  #itens = new Map();

  constructor({ teto = 200, ttlMs = 10 * 60 * 1000 } = {}) {
    this.teto = teto;
    this.ttlMs = ttlMs;
  }

  get tamanho() {
    return this.#itens.size;
  }

  /** Devolve `undefined` no vencido, e aproveita para tirá-lo do mapa. */
  ler(chave, agora = Date.now()) {
    const item = this.#itens.get(chave);
    if (!item) return undefined;

    if (agora - item.em >= this.ttlMs) {
      this.#itens.delete(chave);
      return undefined;
    }
    return item.valor;
  }

  gravar(chave, valor, agora = Date.now()) {
    // Regravar tem que ir para o FIM da fila de descarte, senão a chave mantém
    // a idade da primeira vez e sai antes de outras mais velhas de verdade.
    this.#itens.delete(chave);
    this.#itens.set(chave, { em: agora, valor });

    while (this.#itens.size > this.teto) {
      const maisAntiga = this.#itens.keys().next().value;
      this.#itens.delete(maisAntiga);
    }
    return valor;
  }

  limpar() {
    this.#itens.clear();
  }
}
