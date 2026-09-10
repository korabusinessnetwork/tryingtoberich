/**
 * A implementação FALSA da camada de dados, com dado de exemplo realista.
 *
 * É ela que está ligada hoje, e é assim que o console se desenvolve: a chave de
 * serviço ainda não existe, e mesmo quando existir ninguém precisa de uma base
 * de verdade para mexer numa tela.
 *
 * Duas regras que ela leva a sério, e que a diferenciam de um `mock` qualquer:
 *
 * 1. **Ela escreve.** `trocarPlano` e `registrarAcao` mudam o estado em memória
 *    e aparecem no log administrativo, do mesmo jeito que a real. É exigência
 *    do contrato, seção 4: sem isso o teste do item 5 passaria por acidente,
 *    porque a ação nunca teria sido gravada por ninguém.
 * 2. **O dado é feio como o real é feio.** Tem assinante sem licença, licença
 *    cancelada, perfil em espanhol, versão instalada velha e assinante que
 *    nunca conectou. Dado de exemplo bonito demais esconde justamente os
 *    estados que a tela precisa saber desenhar.
 *
 * A busca daqui e a busca do `supabase.js` precisam concordar. Quem garante é
 * `test/busca.test.mjs`, que roda a mesma tabela de casos contra as duas.
 */

import { falha, limiteValido, MOTIVOS, sucesso } from "./contrato.js";

/** Um dia em milissegundos. As datas de exemplo são deslocamentos de "agora". */
const DIA = 24 * 60 * 60 * 1000;

const iso = (agora, dias, horas = 0) =>
  new Date(agora.getTime() - dias * DIA - horas * 60 * 60 * 1000).toISOString();

/**
 * Caixa baixa e espaço das pontas fora. **Nada além disso, de propósito.**
 *
 * A tentação é dobrar acento aqui, para "joao" achar "joão". Não vale: os três
 * campos que a busca varre são ASCII por construção no próprio banco
 * (`usuario_tiktok` casa `[A-Za-z0-9._]`, a chave de licença é hexadecimal com
 * traço, e o e-mail de compra não carrega acento na prática). Dobrar acento
 * aqui e não no `ilike` do Postgres faria a base falsa achar linha que a real
 * não acha, e essa diferença só apareceria no dia da primeira busca de verdade.
 */
export function normalizarTermo(termo) {
  return String(termo ?? "").trim().toLowerCase();
}

/**
 * A busca do item 1: casa usuário da TikTok, e-mail ou chave de licença sem o
 * operador dizer qual dos três está digitando.
 *
 * Casa por CONTÉM, não por igual. O operador raramente tem a chave inteira à
 * mão, e quase sempre tem um pedaço dela colada de um e-mail de suporte.
 */
export function casaBusca(assinante, termo) {
  const alvo = normalizarTermo(termo);
  if (!alvo) return true;
  return [assinante.usuarioTiktok, assinante.email, assinante.licenca]
    .filter(Boolean)
    .some((campo) => normalizarTermo(campo).includes(alvo));
}

/**
 * Os assinantes de exemplo. Sete, e cada um existe para desenhar um estado
 * diferente da tela, não para encher a lista.
 */
function assinantesDeExemplo(agora) {
  return [
    {
      streamerId: "matheus-bonato",
      email: "matheus@korabusiness.com",
      usuarioTiktok: "matheus.bonato",
      nome: "Matheus Bonato",
      idioma: "pt",
      criadoEm: iso(agora, 120),
      licenca: "KORA-7F2A-91C4-DE08",
      licencaEstado: "ativa",
      plano: "anual",
      validaAte: iso(agora, -245),
      lemonCustomerId: "cus_exemplo_001",
      ultimaConexao: iso(agora, 0, 2),
      versaoInstalada: "0.9.0",
      modalidades: ["escalada"],
    },
    {
      streamerId: "livia-parkour",
      email: "livia.parkour@gmail.com",
      usuarioTiktok: "livia.parkour",
      nome: "Lívia Ramos",
      idioma: "pt",
      criadoEm: iso(agora, 41),
      licenca: "KORA-2B55-A0F1-3C77",
      licencaEstado: "ativa",
      plano: "mensal",
      validaAte: iso(agora, -19),
      lemonCustomerId: "cus_exemplo_002",
      ultimaConexao: iso(agora, 0, 6),
      versaoInstalada: "0.9.0",
      modalidades: ["escalada"],
    },
    {
      // Perfil em espanhol: a ficha mostra o idioma que a instalação reportou,
      // e o console continua em português. É o ADR-P05 na prática.
      streamerId: "elena-vertical",
      email: "elena@vertical.mx",
      usuarioTiktok: "elena_vertical",
      nome: "Elena Ríos",
      idioma: "es",
      criadoEm: iso(agora, 27),
      licenca: "KORA-8D31-77BE-1A45",
      licencaEstado: "ativa",
      plano: "mensal",
      validaAte: iso(agora, -3),
      lemonCustomerId: "cus_exemplo_003",
      ultimaConexao: iso(agora, 2, 5),
      // Versão velha: é o campo que o ADR-P04 exigiu, e ele só serve quando
      // a tela deixa ver que alguém ficou para trás.
      versaoInstalada: "0.8.2",
      modalidades: ["escalada"],
    },
    {
      streamerId: "tower-guy",
      email: "hello@towerguy.tv",
      usuarioTiktok: "towerguy",
      nome: "Nathan Cole",
      idioma: "en",
      criadoEm: iso(agora, 63),
      licenca: "KORA-C904-16FD-B2E3",
      licencaEstado: "expirada",
      plano: "mensal",
      validaAte: iso(agora, 4),
      lemonCustomerId: "cus_exemplo_004",
      ultimaConexao: iso(agora, 5, 1),
      versaoInstalada: "0.8.2",
      modalidades: ["escalada"],
    },
    {
      streamerId: "duda-sobe",
      email: "duda.sobe@outlook.com",
      usuarioTiktok: "duda.sobe",
      nome: "Eduarda Prado",
      idioma: "pt",
      criadoEm: iso(agora, 88),
      licenca: "KORA-4E7C-2255-90AA",
      licencaEstado: "cancelada",
      plano: "mensal",
      validaAte: iso(agora, 12),
      lemonCustomerId: "cus_exemplo_005",
      ultimaConexao: iso(agora, 14, 3),
      versaoInstalada: "0.8.0",
      modalidades: ["escalada"],
    },
    {
      // Cortesia: existe como assinante e nunca passou pela Lemon Squeezy.
      // É o caso que faz `lemon_customer_id` ser anulável no SQL.
      streamerId: "kora-demo",
      email: "demo@korabusiness.com",
      usuarioTiktok: null,
      nome: "Conta de demonstração",
      idioma: "pt",
      criadoEm: iso(agora, 9),
      licenca: "KORA-0000-DEMO-0001",
      licencaEstado: "ativa",
      plano: "cortesia",
      validaAte: null,
      lemonCustomerId: null,
      ultimaConexao: null,
      versaoInstalada: null,
      modalidades: [],
    },
    {
      // Comprou e ainda não instalou: sem licença emitida, sem telemetria.
      // A ficha dele é a que mais mostra buraco, e é por isso que ele está aqui.
      streamerId: "novo-ainda-sem-instalar",
      email: "contato@subindoaovivo.com.br",
      usuarioTiktok: "subindo.aovivo",
      nome: "Rafael Antunes",
      idioma: "pt",
      criadoEm: iso(agora, 1),
      licenca: null,
      licencaEstado: null,
      plano: null,
      validaAte: null,
      lemonCustomerId: "cus_exemplo_007",
      ultimaConexao: null,
      versaoInstalada: null,
      modalidades: [],
    },
  ];
}

/** Telemetria de exemplo, o suficiente para os itens 5 e 6 terem o que mostrar. */
function eventosDeExemplo(agora) {
  const linhas = [];
  let id = 1;
  const por = (streamerId, tipo, dias, horas, extra = {}) => {
    linhas.push({
      id: id++,
      streamerId,
      tipo,
      em: iso(agora, dias, horas),
      versaoInstalada: extra.versaoInstalada ?? null,
      idioma: extra.idioma ?? null,
      modalidade: extra.modalidade ?? null,
      motivo: extra.motivo ?? null,
    });
  };

  por("matheus-bonato", "instalacao", 120, 0, { versaoInstalada: "0.8.0", idioma: "pt" });
  por("matheus-bonato", "conexao", 1, 3, { versaoInstalada: "0.9.0", idioma: "pt", modalidade: "escalada" });
  por("matheus-bonato", "queda", 1, 1, { motivo: "conexao_perdida" });
  por("matheus-bonato", "conexao", 0, 2, { versaoInstalada: "0.9.0", idioma: "pt", modalidade: "escalada" });

  por("livia-parkour", "conexao", 0, 6, { versaoInstalada: "0.9.0", idioma: "pt", modalidade: "escalada" });
  por("livia-parkour", "queda", 0, 4, { motivo: "sala_encerrada" });

  por("elena-vertical", "conexao", 2, 5, { versaoInstalada: "0.8.2", idioma: "es", modalidade: "escalada" });
  por("elena-vertical", "desconexao", 2, 1, {});

  por("tower-guy", "conexao", 5, 1, { versaoInstalada: "0.8.2", idioma: "en", modalidade: "escalada" });
  por("tower-guy", "desconexao", 4, 20, {});

  por("duda-sobe", "conexao", 14, 3, { versaoInstalada: "0.8.0", idioma: "pt", modalidade: "escalada" });
  por("duda-sobe", "desconexao", 14, 1, {});

  return linhas.sort((a, b) => (a.em < b.em ? 1 : -1));
}

/**
 * Faturamento de exemplo, em CENTAVOS e com a moeda ao lado.
 * Nunca ponto flutuante: centavo em `float` é como centavo some sem ninguém ver.
 */
function faturamentoDeExemplo(agora) {
  const linhas = [
    { eventoId: "evt_ex_001", tipo: "assinatura_criada", streamerId: "matheus-bonato", plano: "anual", valorCentavos: 19_900, moeda: "USD", em: iso(agora, 120) },
    { eventoId: "evt_ex_002", tipo: "assinatura_criada", streamerId: "duda-sobe", plano: "mensal", valorCentavos: 1_900, moeda: "USD", em: iso(agora, 88) },
    { eventoId: "evt_ex_003", tipo: "assinatura_criada", streamerId: "tower-guy", plano: "mensal", valorCentavos: 1_900, moeda: "USD", em: iso(agora, 63) },
    { eventoId: "evt_ex_004", tipo: "assinatura_criada", streamerId: "livia-parkour", plano: "mensal", valorCentavos: 1_900, moeda: "USD", em: iso(agora, 41) },
    { eventoId: "evt_ex_005", tipo: "assinatura_criada", streamerId: "elena-vertical", plano: "mensal", valorCentavos: 1_900, moeda: "USD", em: iso(agora, 27) },
    { eventoId: "evt_ex_006", tipo: "assinatura_renovada", streamerId: "livia-parkour", plano: "mensal", valorCentavos: 1_900, moeda: "USD", em: iso(agora, 11) },
    { eventoId: "evt_ex_007", tipo: "assinatura_cancelada", streamerId: "duda-sobe", plano: "mensal", valorCentavos: 0, moeda: "USD", em: iso(agora, 6) },
    { eventoId: "evt_ex_008", tipo: "assinatura_expirada", streamerId: "tower-guy", plano: "mensal", valorCentavos: 0, moeda: "USD", em: iso(agora, 4) },
  ];
  return linhas.sort((a, b) => (a.em < b.em ? 1 : -1));
}

/**
 * Cria uma base de exemplo nova, isolada.
 *
 * Cada chamada tem o próprio estado, para um teste que troca de plano não
 * contaminar o de baixo. `agora` entra por parâmetro pelo mesmo motivo: teste
 * com data de relógio é teste que falha na virada do mês.
 */
export function criarDadosDeExemplo({ agora = new Date() } = {}) {
  const base = {
    assinantes: assinantesDeExemplo(agora),
    eventos: eventosDeExemplo(agora),
    faturamento: faturamentoDeExemplo(agora),
    acoes: [],
  };

  let proximoIdDeAcao = 1;

  const acharAssinante = (streamerId) =>
    base.assinantes.find((a) => a.streamerId === streamerId) ?? null;

  /** A ficha é uma cópia: quem chama não escreve na base sem passar por aqui. */
  const montarFicha = (assinante) => ({ ...assinante, modalidades: [...assinante.modalidades] });

  const paraLista = (assinante) => ({
    streamerId: assinante.streamerId,
    email: assinante.email,
    usuarioTiktok: assinante.usuarioTiktok,
    nome: assinante.nome,
    idioma: assinante.idioma,
    licenca: assinante.licenca,
    licencaEstado: assinante.licencaEstado,
    plano: assinante.plano,
    criadoEm: assinante.criadoEm,
    ultimaConexao: assinante.ultimaConexao,
    versaoInstalada: assinante.versaoInstalada,
  });

  async function registrarAcao({ acao, streamerId = null, detalhe = {}, operador = "dono" } = {}) {
    if (!acao || !/^[a-z0-9_]+$/.test(acao)) {
      return falha(MOTIVOS.PEDIDO_INVALIDO, "acao precisa ser um verbo em snake_case");
    }
    const linha = {
      id: proximoIdDeAcao++,
      operador,
      acao,
      streamerId,
      detalhe: detalhe ?? {},
      em: new Date().toISOString(),
    };
    // Cresce no topo porque a tela lê do mais recente para o mais antigo, que é
    // a ordem em que a pergunta "quem mexeu nisso" é feita.
    base.acoes.unshift(linha);
    return sucesso({ acao: linha });
  }

  return {
    /** Só para a tela poder dizer, sem mentir, que está olhando dado de exemplo. */
    fonte: "exemplo",

    async listarAssinantes({ busca = "", limite, cursor = null } = {}) {
      const teto = limiteValido(limite);
      const filtrados = base.assinantes
        .filter((a) => casaBusca(a, busca))
        .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));

      // Paginação por chave, não por deslocamento: com linha entrando enquanto
      // o operador pagina, o deslocamento pula linha e repete linha.
      const daPagina = cursor ? filtrados.filter((a) => a.criadoEm < cursor) : filtrados;
      const pagina = daPagina.slice(0, teto);
      const proximo = daPagina.length > teto ? pagina[pagina.length - 1].criadoEm : null;

      return sucesso({ assinantes: pagina.map(paraLista), proximo });
    },

    async buscarFicha(streamerId) {
      const assinante = acharAssinante(streamerId);
      // Null é resposta, não é falha: "esse assinante não existe" é uma
      // informação que a tela precisa dar, e ela é diferente de "não deu para
      // perguntar".
      return sucesso({ ficha: assinante ? montarFicha(assinante) : null });
    },

    async trocarPlano(streamerId, plano, { motivo = null } = {}) {
      const assinante = acharAssinante(streamerId);
      if (!assinante) return falha(MOTIVOS.NAO_ENCONTRADO, streamerId);

      const anterior = assinante.plano;
      assinante.plano = plano;

      // O log é gravado do mesmo jeito que na real. Sem isto o teste do item 5
      // passaria por acidente (contrato da onda 2, seção 4).
      await registrarAcao({
        acao: "plano_trocado",
        streamerId,
        detalhe: { de: anterior, para: plano, motivo },
      });

      return sucesso({ ficha: montarFicha(assinante) });
    },

    async resumoDeFaturamento({ mes } = {}) {
      return sucesso(resumirFaturamento(base.faturamento, mes));
    },

    async listarEventos({ streamerId = null, desde = null, limite } = {}) {
      const teto = limiteValido(limite);
      const eventos = base.eventos
        .filter((e) => (streamerId ? e.streamerId === streamerId : true))
        .filter((e) => (desde ? e.em >= desde : true))
        .slice(0, teto);
      return sucesso({ eventos });
    },

    async listarAcoesAdministrativas({ desde = null, limite } = {}) {
      const teto = limiteValido(limite);
      const acoes = base.acoes.filter((a) => (desde ? a.em >= desde : true)).slice(0, teto);
      return sucesso({ acoes });
    },

    async saudeDeConexao() {
      return sucesso(resumirSaude(base.eventos, new Date()));
    },

    registrarAcao,
  };
}

/* ------------------------------------------------------------------ */
/* Agregações puras. Ficam aqui porque a base falsa é quem as usa, e    */
/* `supabase.js` as reusa para os dois lados contarem igual.            */
/* ------------------------------------------------------------------ */

/** `2026-09` a partir de um ISO, ou o mês corrente quando não vier nada. */
export function mesDe(valor, agora = new Date()) {
  if (typeof valor === "string" && /^\d{4}-\d{2}$/.test(valor)) return valor;
  const data = valor ? new Date(valor) : agora;
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  return `${data.getUTCFullYear()}-${mes}`;
}

const RECEITA = new Set(["assinatura_criada", "assinatura_renovada"]);
const PERDA = new Set(["assinatura_cancelada", "assinatura_expirada"]);

/**
 * MRR, vendas e cancelamentos do mês, mais a série por dia.
 *
 * **MRR aqui é a receita reconhecida no mês**, e não a projeção da carteira.
 * A diferença aparece no plano anual, que entra inteiro num mês só. Está
 * escrito porque é o número que o dono vai ler, e um número de dinheiro sem
 * definição escrita vira briga com o painel da Lemon Squeezy. Quando a Fase 1
 * tiver carteira de verdade, o item 4 revisita, e a fonte da verdade continua
 * sendo a Lemon Squeezy (ADR-P02).
 */
export function resumirFaturamento(linhas, mes, agora = new Date()) {
  const alvo = mesDe(mes, agora);
  const doMes = linhas.filter((linha) => String(linha.em).slice(0, 7) === alvo);

  let mrrCentavos = 0;
  let vendas = 0;
  let cancelamentos = 0;
  const porDia = new Map();

  for (const linha of doMes) {
    const dia = String(linha.em).slice(0, 10);
    const acumulado = porDia.get(dia) ?? { dia, valorCentavos: 0, vendas: 0, cancelamentos: 0 };

    if (RECEITA.has(linha.tipo)) {
      mrrCentavos += linha.valorCentavos;
      acumulado.valorCentavos += linha.valorCentavos;
      if (linha.tipo === "assinatura_criada") {
        vendas += 1;
        acumulado.vendas += 1;
      }
    } else if (PERDA.has(linha.tipo)) {
      cancelamentos += 1;
      acumulado.cancelamentos += 1;
    } else if (linha.tipo === "reembolso") {
      // Reembolso abate: dinheiro que voltou não é receita do mês.
      mrrCentavos -= linha.valorCentavos;
      acumulado.valorCentavos -= linha.valorCentavos;
    }

    porDia.set(dia, acumulado);
  }

  // Uma moeda só por resumo. Misturar moeda numa soma é o mesmo erro de somar
  // centavo com float: o número sai e ninguém percebe que ele não quer dizer nada.
  const moeda = doMes.find((linha) => linha.moeda)?.moeda ?? "USD";

  return {
    mes: alvo,
    mrrCentavos,
    moeda,
    vendas,
    cancelamentos,
    serie: [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
  };
}

/**
 * Item 6: quantos conectados agora e quantas quedas em 24h.
 *
 * Conectado agora = conectou e ainda não desconectou, a mesma definição da
 * visão `saude_de_conexao` do 001. Instalação que morreu no tapa fica marcada
 * como conectada até o próximo arranque, e isso é o preço de não ter batimento
 * periódico (ADR-P02).
 */
export function resumirSaude(eventos, agora = new Date()) {
  const limite = new Date(agora.getTime() - DIA).toISOString();
  const ultimaPorTipo = new Map();

  for (const evento of eventos) {
    const chave = `${evento.streamerId}|${evento.tipo}`;
    const anterior = ultimaPorTipo.get(chave);
    if (!anterior || evento.em > anterior) ultimaPorTipo.set(chave, evento.em);
  }

  const streamers = new Set(eventos.map((e) => e.streamerId));
  let conectadosAgora = 0;
  for (const streamerId of streamers) {
    const conexao = ultimaPorTipo.get(`${streamerId}|conexao`) ?? null;
    const desconexao = ultimaPorTipo.get(`${streamerId}|desconexao`) ?? null;
    if (conexao && (!desconexao || conexao > desconexao)) conectadosAgora += 1;
  }

  const quedas = eventos.filter((e) => e.tipo === "queda" && e.em >= limite);

  // A série é por hora porque a pergunta do alarme é "isso começou quando":
  // várias quedas na mesma hora, em assinantes diferentes, não é internet de
  // ninguém, é a plataforma tendo mudado alguma coisa (ADR-P05, item 6).
  const porHora = new Map();
  for (const queda of quedas) {
    const hora = `${String(queda.em).slice(0, 13)}:00`;
    porHora.set(hora, (porHora.get(hora) ?? 0) + 1);
  }

  return {
    conectadosAgora,
    quedas24h: quedas.length,
    serie: [...porHora.entries()]
      .map(([hora, total]) => ({ hora, quedas: total }))
      .sort((a, b) => a.hora.localeCompare(b.hora)),
  };
}
