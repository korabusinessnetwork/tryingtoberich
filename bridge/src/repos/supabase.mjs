/**
 * O ÚNICO módulo do projeto que fala com o Supabase. Ver ADR-P02.
 *
 * É a irmã da regra do `arquivo.mjs`: `fs` mora num arquivo só, e agora o
 * cliente do banco também. O motivo é o mesmo do ADR-003 — trocar o substrato
 * é reescrever `repos/` e nada mais.
 *
 * **Sem dependência nova, de propósito.** O Supabase expõe PostgREST por HTTP
 * puro; `@supabase/supabase-js` é conveniência que traz árvore de dependência
 * inteira para montar querystring e cabeçalho. O projeto é bootstrap gratuito e
 * evita dependência (CLAUDE.md, Custo), e o que usamos aqui é `GET` com filtro
 * e `POST` de linha — dois `fetch`.
 *
 * **Nunca lança.** Todo método devolve `{ ok, ... }`. Quem chama precisa
 * distinguir "a Kora disse" de "não deu para perguntar", e exceção é o jeito
 * errado de dizer a segunda: ela subiria pelo arranque e pela telemetria, que
 * são justamente os dois lugares onde a Kora não pode derrubar nada.
 */

import { log } from "../log.mjs";

/**
 * Teto de espera, curto de propósito.
 *
 * Diferente dos 120s do Gemini: lá o streamer clicou em "gerar" e está olhando
 * a tela esperando. Aqui ninguém pediu nada — é o arranque perguntando da
 * licença e a telemetria despachando. Cinco segundos é o suficiente para uma
 * consulta que devolve uma linha, e é pouco o bastante para uma Kora fora do ar
 * não segurar nada. `fetch` sem sinal espera para sempre.
 */
const TIMEOUT_MS = 5_000;

/** Filtro do PostgREST: `coluna=eq.valor`, com o valor escapado. */
const igual = (coluna, valor) => `${encodeURIComponent(coluna)}=eq.${encodeURIComponent(valor)}`;

export class ClienteSupabase {
  /**
   * @param url    `SUPABASE_URL`. Vem do `.env`, nunca do código (CLAUDE.md, Segurança).
   * @param chave  `SUPABASE_ANON_KEY`. Anônima: quem separa um streamer do outro
   *               é o RLS, não a chave — ver `data/supabase/001-esquema.sql`.
   * @param buscar injetável para o teste nunca tocar a rede de verdade.
   */
  constructor({ url = "", chave = "", buscar = fetch, timeoutMs = TIMEOUT_MS } = {}) {
    // Sem barra no fim: `${base}/rest/v1` com barra dupla vira 404 no PostgREST.
    this.url = String(url ?? "").trim().replace(/\/+$/, "");
    this.chave = String(chave ?? "").trim();
    this.buscar = buscar;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Sem as duas variáveis o produto roda inteiro em modo local (ADR-P02): a
   * licença fica `indeterminada` e nada quebra. Não é erro de configuração, é
   * o estado normal de quem baixou e ainda não ativou.
   */
  get configurado() {
    return Boolean(this.url && this.chave);
  }

  #cabecalhos(chaveDaLicenca) {
    const cabecalhos = {
      apikey: this.chave,
      authorization: `Bearer ${this.chave}`,
      accept: "application/json",
    };
    //[[ A chave da licença é o que o RLS lê para saber QUEM está pedindo.
    //
    // A chave anônima é a mesma em todas as instalações e por isso não
    // identifica ninguém. As policies comparam este cabeçalho com a coluna
    // `chave` da tabela `licencas` — é assim que uma instalação enxerga a
    // própria linha e só ela. Ver o SQL, que é onde a regra de verdade mora. ]]
    if (chaveDaLicenca) cabecalhos["x-kora-chave"] = chaveDaLicenca;
    return cabecalhos;
  }

  async #chamar(caminho, opcoes, chaveDaLicenca) {
    if (!this.configurado) return { ok: false, motivo: "sem_configuracao" };

    let resposta;
    try {
      resposta = await this.buscar(`${this.url}/rest/v1/${caminho}`, {
        ...opcoes,
        headers: { ...this.#cabecalhos(chaveDaLicenca), ...(opcoes.headers ?? {}) },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (erro) {
      // Timeout, DNS, cabo na tomada, projeto pausado por inatividade — tudo
      // isto é "não deu para perguntar", e nenhum deles é veredito.
      return { ok: false, motivo: erro.name === "TimeoutError" ? "timeout" : "rede", detalhe: erro.message };
    }

    if (!resposta.ok) {
      // O corpo do erro do PostgREST pode citar a coluna e a policy. Vai para o
      // log local, nunca para a resposta ao painel (07_APIS, contrato de erro).
      const detalhe = await resposta.text().catch(() => null);
      return { ok: false, motivo: "http", status: resposta.status, detalhe };
    }

    // 204 do `Prefer: return=minimal` não tem corpo. `.json()` nele estoura.
    if (resposta.status === 204) return { ok: true, linhas: [] };

    try {
      const corpo = await resposta.json();
      return { ok: true, linhas: Array.isArray(corpo) ? corpo : [corpo] };
    } catch (erro) {
      return { ok: false, motivo: "corpo_ilegivel", detalhe: erro.message };
    }
  }

  /**
   * Uma consulta com filtros de igualdade. É tudo que a ponte precisa: ela lê a
   * própria linha de licença e mais nada — agregação é do console, que fala com
   * o banco por outro caminho (ADR-P05).
   */
  async selecionar(tabela, { filtros = {}, colunas = "*", limite = 1, chaveDaLicenca = null } = {}) {
    const busca = [
      `select=${encodeURIComponent(colunas)}`,
      ...Object.entries(filtros).map(([coluna, valor]) => igual(coluna, valor)),
      `limit=${Number.parseInt(limite, 10) || 1}`,
    ].join("&");

    return this.#chamar(`${encodeURIComponent(tabela)}?${busca}`, { method: "GET" }, chaveDaLicenca);
  }

  /**
   * Insere linhas. Usado só pela telemetria, e por isso pede `return=minimal`:
   * não há nada que queiramos de volta, e não pedir o corpo economiza egress —
   * que é um dos dois gatilhos de upgrade do tier gratuito (ADR-P02).
   */
  async inserir(tabela, linhas, { chaveDaLicenca = null } = {}) {
    const lote = Array.isArray(linhas) ? linhas : [linhas];
    if (lote.length === 0) return { ok: true, linhas: [] };

    return this.#chamar(
      encodeURIComponent(tabela),
      {
        method: "POST",
        headers: { "content-type": "application/json", prefer: "return=minimal" },
        body: JSON.stringify(lote),
      },
      chaveDaLicenca,
    );
  }
}

/**
 * Registra no log local por que a Kora não respondeu.
 *
 * Existe como função porque os dois chamadores — licença e telemetria —
 * precisam da mesma linha, e porque um `console.log` no meio do cliente
 * esconderia que este é o único lugar onde a falha vira visível. A falha da
 * Kora é silenciosa por construção; o log é o que a torna diagnosticável.
 */
export function registrarFalhaDaKora(evento, resultado) {
  log.aviso(evento, {
    motivo: resultado?.motivo ?? "desconhecido",
    status: resultado?.status ?? null,
  });
}
