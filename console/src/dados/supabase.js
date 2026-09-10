/**
 * A implementação REAL da camada de dados, por REST, com a chave de SERVIÇO.
 *
 * **O único arquivo do console que conhece o banco.** Nome de tabela, nome de
 * coluna em `snake_case` e sintaxe do PostgREST param aqui: o que sai daqui já
 * está em português de domínio. É a mesma regra do `bridge/src/repos/`, e o
 * motivo é o mesmo (ADR-003): trocar o substrato é reescrever um arquivo.
 *
 * **Este módulo roda só no Node.** A chave de serviço ignora RLS e alcança a
 * lista de assinantes com e-mail. Ela nunca entra em `import.meta.env.VITE_*`,
 * porque o bundle do Vite é público por definição, e quem a lê é o processo do
 * servidor de desenvolvimento (ver `console/servidor/rotas.js` e
 * `console/vite.config.js`). O navegador fala com esse processo, nunca com o
 * Supabase, exatamente como o painel fala com a ponte.
 *
 * **Sem dependência nova**, pelo mesmo motivo do cliente da ponte: PostgREST é
 * HTTP puro, e `@supabase/supabase-js` traria árvore de dependência inteira
 * para montar querystring. Projeto em bootstrap gratuito (CLAUDE.md, Custo).
 *
 * **Nunca lança.** Tudo devolve o envelope do `contrato.js`.
 */

import { falha, limiteValido, MOTIVOS, sucesso } from "./contrato.js";
import { normalizarTermo, resumirFaturamento, resumirSaude } from "./exemplo.js";

/**
 * Teto de espera. Mais longo que os 5s da ponte de propósito: lá ninguém pediu
 * nada e a espera não pode segurar o arranque; aqui o operador clicou e está
 * olhando a tela, e uma consulta que demora 8s é melhor que um erro aos 5s.
 */
const TIMEOUT_MS = 10_000;

/** Quantas linhas de faturamento e telemetria uma agregação de um mês varre. */
const TETO_DE_AGREGACAO = 2_000;

/**
 * Valor de filtro do PostgREST entre aspas, com o que quebra a sintaxe escapado.
 *
 * Sem isto, um operador que cole uma busca com vírgula ou parêntese, que é
 * exatamente o que acontece ao colar um trecho de e-mail, quebraria o `or=(...)`
 * e o banco responderia 400 numa tela que só queria filtrar.
 */
export function entreAspas(valor) {
  const escapado = String(valor ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escapado}"`;
}

/**
 * O filtro do item 1: casa usuário da TikTok, e-mail ou chave de licença sem o
 * operador dizer qual dos três está digitando.
 *
 * `ilike` com `*` dos dois lados é "contém, ignorando caixa". Os índices do
 * 002 são de `lower(coluna)` e não servem a um `contains`, então isto é varredura
 * de tabela. Está certo para a Fase 1, onde a base cabe numa tela e o ADR-P05 já
 * diz que e-mail resolve até uns 200 assinantes. Quando doer, o conserto é um
 * índice `pg_trgm`, e ele é do maestro, porque SQL não é desta frente.
 *
 * Devolve `null` quando não há o que filtrar, para o chamador não mandar um
 * `or=()` vazio, que o PostgREST recusa.
 */
export function montarFiltroDeBusca(termo) {
  const alvo = normalizarTermo(termo);
  if (!alvo) return null;
  const padrao = entreAspas(`*${alvo}*`);
  return `(usuario_tiktok.ilike.${padrao},email.ilike.${padrao},licenca.ilike.${padrao})`;
}

/* ------------------------------------------------------------------ */
/* Tradução do banco para o domínio. Só este arquivo fala snake_case.  */
/* ------------------------------------------------------------------ */

const daFicha = (linha) => ({
  streamerId: linha.streamer_id,
  email: linha.email ?? null,
  usuarioTiktok: linha.usuario_tiktok ?? null,
  nome: linha.nome ?? null,
  idioma: linha.idioma ?? null,
  criadoEm: linha.criado_em ?? null,
  licenca: linha.licenca ?? null,
  licencaEstado: linha.licenca_estado ?? null,
  plano: linha.plano ?? null,
  validaAte: linha.valida_ate ?? null,
  ultimaConexao: linha.ultima_conexao ?? null,
  versaoInstalada: linha.versao_instalada ?? null,
  // `array_agg` devolve null quando não agregou nada. A tela quer lista vazia:
  // "nenhuma modalidade" é uma lista de zero, não a ausência do campo.
  modalidades: Array.isArray(linha.modalidades) ? linha.modalidades : [],
});

const doEvento = (linha) => ({
  id: linha.id,
  streamerId: linha.streamer_id,
  tipo: linha.tipo,
  em: linha.em,
  versaoInstalada: linha.versao_instalada ?? null,
  idioma: linha.idioma ?? null,
  modalidade: linha.modalidade ?? null,
  motivo: linha.motivo ?? null,
});

const daAcao = (linha) => ({
  id: linha.id,
  operador: linha.operador,
  acao: linha.acao,
  streamerId: linha.streamer_id ?? null,
  detalhe: linha.detalhe ?? {},
  em: linha.em,
});

const doFaturamento = (linha) => ({
  eventoId: linha.evento_id,
  tipo: linha.tipo,
  streamerId: linha.streamer_id ?? null,
  plano: linha.plano ?? null,
  valorCentavos: linha.valor_centavos ?? 0,
  moeda: linha.moeda ?? "USD",
  em: linha.em,
});

/* ------------------------------------------------------------------ */

/** Primeiro e último instante do mês `AAAA-MM`, em UTC. */
export function janelaDoMes(mes) {
  const [ano, numero] = String(mes).split("-").map((parte) => Number.parseInt(parte, 10));
  const inicio = new Date(Date.UTC(ano, numero - 1, 1));
  const fim = new Date(Date.UTC(numero === 12 ? ano + 1 : ano, numero % 12, 1));
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}

export class ClienteDoConsole {
  /**
   * @param url    `SUPABASE_URL`, do `.env`, nunca do código.
   * @param chave  `SUPABASE_SERVICE_KEY`. Ignora RLS. Nunca sai do Node.
   * @param buscar injetável para o teste nunca tocar a rede de verdade.
   */
  constructor({ url = "", chave = "", buscar = fetch, timeoutMs = TIMEOUT_MS } = {}) {
    // Sem barra no fim: `${base}/rest/v1` com barra dupla vira 404 no PostgREST.
    this.url = String(url ?? "").trim().replace(/\/+$/, "");
    this.chave = String(chave ?? "").trim();
    this.buscar = buscar;
    this.timeoutMs = timeoutMs;
  }

  get configurado() {
    return Boolean(this.url && this.chave);
  }

  #cabecalhos() {
    return {
      apikey: this.chave,
      authorization: `Bearer ${this.chave}`,
      accept: "application/json",
    };
  }

  async chamar(caminho, opcoes = {}) {
    if (!this.configurado) return falha(MOTIVOS.SEM_CONFIGURACAO);

    let resposta;
    try {
      resposta = await this.buscar(`${this.url}/rest/v1/${caminho}`, {
        ...opcoes,
        headers: { ...this.#cabecalhos(), ...(opcoes.headers ?? {}) },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (erro) {
      // Timeout, DNS, cabo na tomada, projeto pausado por inatividade: tudo
      // isto é "não deu para perguntar", e nenhum deles é veredito.
      return falha(erro?.name === "TimeoutError" ? MOTIVOS.TIMEOUT : MOTIVOS.REDE, erro?.message ?? null);
    }

    if (!resposta.ok) {
      // O corpo do erro do PostgREST pode citar coluna e policy. Vai para o
      // log local do console, nunca cru para a tela.
      const detalhe = await resposta.text().catch(() => null);
      return { ...falha(MOTIVOS.HTTP, detalhe), status: resposta.status };
    }

    if (resposta.status === 204) return sucesso({ linhas: [] });

    try {
      const corpo = await resposta.json();
      return sucesso({ linhas: Array.isArray(corpo) ? corpo : [corpo] });
    } catch (erro) {
      return falha(MOTIVOS.CORPO_ILEGIVEL, erro?.message ?? null);
    }
  }
}

/**
 * Monta a camada de dados real.
 *
 * `cliente` entra por parâmetro para o teste montar a camada inteira com um
 * `fetch` de mentira e conferir a URL que ela produz, que é a única parte da
 * implementação real verificável sem uma base de verdade em pé.
 */
export function criarDadosDoSupabase({ url, chave, buscar, cliente } = {}) {
  const banco = cliente ?? new ClienteDoConsole({ url, chave, buscar });

  async function registrarAcao({ acao, streamerId = null, detalhe = {}, operador = "dono" } = {}) {
    if (!acao || !/^[a-z0-9_]+$/.test(acao)) {
      return falha(MOTIVOS.PEDIDO_INVALIDO, "acao precisa ser um verbo em snake_case");
    }

    const resposta = await banco.chamar("log_administrativo", {
      method: "POST",
      headers: { "content-type": "application/json", prefer: "return=representation" },
      body: JSON.stringify([{ operador, acao, streamer_id: streamerId, detalhe: detalhe ?? {} }]),
    });
    if (resposta.ok !== true) return resposta;

    // `return=representation`, e não `minimal`: o console precisa devolver a
    // ação gravada, com o id e o carimbo que o banco pôs. Diferente da ponte,
    // que despacha telemetria e não quer nada de volta.
    return sucesso({ acao: daAcao(resposta.linhas[0] ?? {}) });
  }

  return {
    fonte: "supabase",

    async listarAssinantes({ busca = "", limite, cursor = null } = {}) {
      const teto = limiteValido(limite);
      const partes = [
        "select=*",
        "order=criado_em.desc",
        // Uma linha a mais que o pedido: é como se sabe que existe página
        // seguinte sem uma segunda consulta de contagem.
        `limit=${teto + 1}`,
      ];

      const filtro = montarFiltroDeBusca(busca);
      if (filtro) partes.push(`or=${filtro}`);
      if (cursor) partes.push(`criado_em=lt.${encodeURIComponent(cursor)}`);

      // A visão, e não a tabela `assinantes`: a busca casa também a CHAVE DE
      // LICENÇA, que mora na outra tabela. É a visão que já junta as duas, e
      // pedir por ela evita o console montar `join` na mão pela querystring.
      const resposta = await banco.chamar(`ficha_do_assinante?${partes.join("&")}`);
      if (resposta.ok !== true) return resposta;

      const linhas = resposta.linhas.map(daFicha);
      const pagina = linhas.slice(0, teto);
      const proximo = linhas.length > teto ? pagina[pagina.length - 1]?.criadoEm ?? null : null;

      return sucesso({ assinantes: pagina, proximo });
    },

    async buscarFicha(streamerId) {
      if (!streamerId) return falha(MOTIVOS.PEDIDO_INVALIDO, "streamerId é obrigatório");

      const resposta = await banco.chamar(
        `ficha_do_assinante?select=*&streamer_id=eq.${encodeURIComponent(streamerId)}&limit=1`,
      );
      if (resposta.ok !== true) return resposta;

      // Linha nenhuma é resposta, não é falha: a tela precisa poder dizer
      // "esse assinante não existe" sem confundir com "a base não respondeu".
      const linha = resposta.linhas[0];
      return sucesso({ ficha: linha ? daFicha(linha) : null });
    },

    /**
     * O vínculo do assinante com a Lemon Squeezy, para a troca de plano.
     *
     * Vai à tabela `assinantes`, e não à visão `ficha_do_assinante`, porque a
     * visão do `002-console.sql` não traz `lemon_customer_id`. Pedir a coluna
     * na visão seria mudança de SQL, e SQL é do maestro (contrato da onda 2,
     * seção 2): está no relatório da onda. Enquanto isso, esta consulta paga o
     * custo no lugar certo, que é a operação rara, e não a ficha.
     */
    async buscarCobranca(streamerId) {
      if (!streamerId) return falha(MOTIVOS.PEDIDO_INVALIDO, "streamerId é obrigatório");

      const resposta = await banco.chamar(
        `assinantes?select=lemon_customer_id&streamer_id=eq.${encodeURIComponent(streamerId)}&limit=1`,
      );
      if (resposta.ok !== true) return resposta;

      const linha = resposta.linhas[0];
      if (!linha) return sucesso({ existe: false, lemonCustomerId: null });
      return sucesso({ existe: true, lemonCustomerId: linha.lemon_customer_id ?? null });
    },

    async trocarPlano(streamerId, plano, { motivo = null, cobranca = null } = {}) {
      if (!streamerId) return falha(MOTIVOS.PEDIDO_INVALIDO, "streamerId é obrigatório");

      const antes = await this.buscarFicha(streamerId);
      if (antes.ok !== true) return antes;
      if (!antes.ficha) return falha(MOTIVOS.NAO_ENCONTRADO, streamerId);

      const escrita = await banco.chamar(
        `licencas?streamer_id=eq.${encodeURIComponent(streamerId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json", prefer: "return=minimal" },
          body: JSON.stringify({ plano }),
        },
      );
      if (escrita.ok !== true) return escrita;

      // O log vem DEPOIS da escrita e antes do retorno: registrar antes diria
      // que houve troca quando o banco recusou, e é justamente esse log que
      // responde "quem mexeu nessa conta" (ADR-P05, item 5).
      const registro = await registrarAcao({
        acao: "plano_trocado",
        streamerId,
        detalhe: { de: antes.ficha.plano, para: plano, motivo, ...(cobranca ? { cobranca } : {}) },
      });
      if (registro.ok !== true) return registro;

      return this.buscarFicha(streamerId);
    },

    async resumoDeFaturamento({ mes } = {}) {
      const alvo = /^\d{4}-\d{2}$/.test(String(mes ?? "")) ? String(mes) : new Date().toISOString().slice(0, 7);
      const { inicio, fim } = janelaDoMes(alvo);

      const resposta = await banco.chamar(
        `faturamento?select=*&em=gte.${encodeURIComponent(inicio)}&em=lt.${encodeURIComponent(fim)}` +
          `&order=em.desc&limit=${TETO_DE_AGREGACAO}`,
      );
      if (resposta.ok !== true) return resposta;

      // A soma acontece no console, e não no banco, porque agregação do
      // PostgREST precisa ser habilitada por configuração do projeto, e o mês
      // inteiro da Fase 1 cabe folgado numa resposta. Quem soma é a MESMA
      // função da base falsa, para os dois lados nunca contarem diferente.
      return sucesso(resumirFaturamento(resposta.linhas.map(doFaturamento), alvo));
    },

    async listarEventos({ streamerId = null, desde = null, limite } = {}) {
      const teto = limiteValido(limite);
      const partes = ["select=*", "order=em.desc", `limit=${teto}`];
      if (streamerId) partes.push(`streamer_id=eq.${encodeURIComponent(streamerId)}`);
      if (desde) partes.push(`em=gte.${encodeURIComponent(desde)}`);

      const resposta = await banco.chamar(`telemetria?${partes.join("&")}`);
      if (resposta.ok !== true) return resposta;
      return sucesso({ eventos: resposta.linhas.map(doEvento) });
    },

    async listarAcoesAdministrativas({ desde = null, limite } = {}) {
      const teto = limiteValido(limite);
      const partes = ["select=*", "order=em.desc", `limit=${teto}`];
      if (desde) partes.push(`em=gte.${encodeURIComponent(desde)}`);

      const resposta = await banco.chamar(`log_administrativo?${partes.join("&")}`);
      if (resposta.ok !== true) return resposta;
      return sucesso({ acoes: resposta.linhas.map(daAcao) });
    },

    async saudeDeConexao() {
      const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // A visão `saude_de_conexao` responde "conectado agora" por assinante, e
      // ela é quem sabe: "conectou e ainda não desconectou" olha o histórico
      // inteiro, não as últimas 24h. A série por hora, essa sim, sai da
      // telemetria da janela, porque é ela que responde "isso começou quando".
      const visao = await banco.chamar("saude_de_conexao?select=*");
      if (visao.ok !== true) return visao;

      const quedas = await banco.chamar(
        `telemetria?select=*&tipo=eq.queda&em=gte.${encodeURIComponent(desde)}` +
          `&order=em.desc&limit=${TETO_DE_AGREGACAO}`,
      );
      if (quedas.ok !== true) return quedas;

      const conectadosAgora = visao.linhas.filter((linha) => linha.conectado_agora === true).length;
      const serie = resumirSaude(quedas.linhas.map(doEvento)).serie;

      return sucesso({
        conectadosAgora,
        quedas24h: visao.linhas.reduce((soma, linha) => soma + Number(linha.quedas_24h ?? 0), 0),
        serie,
      });
    },

    registrarAcao,
  };
}
