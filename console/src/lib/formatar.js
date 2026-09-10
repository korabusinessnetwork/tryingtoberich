/**
 * Como o console escreve número, data e dinheiro na tela.
 *
 * **Sem i18n, e nunca com i18n** (ADR-P05). O console tem um usuário e ele é
 * brasileiro: `pt-BR` está cravado aqui de propósito, e cada string traduzida
 * nesta superfície seria trabalho gasto em plateia de uma pessoa. Isto não é
 * um `formatar.js` do painel com o idioma esquecido, é a decisão.
 *
 * Funções puras, todas. É o que permite testar a regra sem montar tela.
 */

/** O idioma da SUPERFÍCIE, não o do assinante. O do assinante é dado da ficha. */
const LOCAL = "pt-BR";

const VAZIO = "—";

/** Dia e hora curtos: a tela compara linhas, e ano de quatro dígitos só ocupa. */
export function dataHora(iso) {
  if (!iso) return VAZIO;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return VAZIO;
  return new Intl.DateTimeFormat(LOCAL, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}

export function data(iso) {
  if (!iso) return VAZIO;
  const valor = new Date(iso);
  if (Number.isNaN(valor.getTime())) return VAZIO;
  return new Intl.DateTimeFormat(LOCAL, { day: "2-digit", month: "2-digit", year: "numeric" }).format(valor);
}

/**
 * "há 3 dias", "há 2 h", "agora".
 *
 * A ficha pergunta "esse cliente está vivo?", e a resposta a essa pergunta é a
 * DISTÂNCIA, não a data. A data absoluta continua ao lado, porque ela é a que
 * se cola num e-mail de suporte.
 */
export function distancia(iso, agora = new Date()) {
  if (!iso) return VAZIO;
  const valor = new Date(iso);
  if (Number.isNaN(valor.getTime())) return VAZIO;

  const segundos = Math.round((agora.getTime() - valor.getTime()) / 1000);
  const futuro = segundos < 0;
  const absoluto = Math.abs(segundos);

  if (absoluto < 60) return futuro ? "em instantes" : "agora";

  const escalas = [
    { limite: 3600, divisor: 60, unidade: "min" },
    { limite: 86_400, divisor: 3600, unidade: "h" },
    { limite: 2_592_000, divisor: 86_400, unidade: "d" },
    { limite: Infinity, divisor: 2_592_000, unidade: "mês" },
  ];
  const escala = escalas.find((e) => absoluto < e.limite);
  const quanto = Math.floor(absoluto / escala.divisor);
  const unidade = escala.unidade === "mês" && quanto !== 1 ? "meses" : escala.unidade;

  return futuro ? `em ${quanto} ${unidade}` : `há ${quanto} ${unidade}`;
}

/**
 * Dinheiro. **Entra INTEIRO em centavos e a moeda vem ao lado.**
 *
 * Nunca ponto flutuante em nenhum ponto do caminho: o banco guarda centavo
 * inteiro, a camada de dados soma centavo inteiro, e a divisão por 100 acontece
 * aqui, no último instante antes de virar texto. Centavo em `float` é como
 * centavo some sem ninguém ver.
 */
export function dinheiro(centavos, moeda = "USD") {
  const inteiro = Number.isFinite(centavos) ? Math.round(centavos) : 0;
  return new Intl.NumberFormat(LOCAL, {
    style: "currency",
    currency: moeda,
    minimumFractionDigits: 2,
  }).format(inteiro / 100);
}

export const numero = (valor) =>
  Number.isFinite(valor) ? new Intl.NumberFormat(LOCAL).format(valor) : VAZIO;

/** `2026-09` vira "setembro de 2026". O mês do faturamento é lido, não comparado. */
export function mesPorExtenso(mes) {
  if (!/^\d{4}-\d{2}$/.test(String(mes ?? ""))) return VAZIO;
  const [ano, numeroDoMes] = String(mes).split("-").map((parte) => Number.parseInt(parte, 10));
  return new Intl.DateTimeFormat(LOCAL, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(ano, numeroDoMes - 1, 1)),
  );
}

/** `2026-09-10` vira "10/09". A série do mês compara dias, e o ano é sempre o mesmo. */
export function diaCurto(dia) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dia ?? ""))) return VAZIO;
  const [ano, mes, numeroDoDia] = String(dia).split("-").map((parte) => Number.parseInt(parte, 10));
  return new Intl.DateTimeFormat(LOCAL, { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(
    new Date(Date.UTC(ano, mes - 1, numeroDoDia)),
  );
}

/** `2026-09-10T14:00` vira "10/09 14h". A série da saúde pergunta "que hora começou". */
export function horaCurta(hora) {
  const valor = new Date(hora);
  if (Number.isNaN(valor.getTime())) return VAZIO;
  const dia = new Intl.DateTimeFormat(LOCAL, { day: "2-digit", month: "2-digit" }).format(valor);
  return `${dia} ${String(valor.getHours()).padStart(2, "0")}h`;
}

/**
 * Como o console escreve cada tipo de evento de telemetria.
 *
 * Mapa, e não `tipo` cru na tela, porque `desconexao` e `queda` parecem a mesma
 * coisa escritas assim e são opostas: uma é a live acabando, a outra é a live
 * sendo perdida. É a diferença que o item 6 inteiro existe para enxergar.
 */
export const NOME_DO_EVENTO = {
  instalacao: { texto: "Instalação", pastilha: "pastilha-neutra" },
  conexao: { texto: "Conectou", pastilha: "pastilha-ok" },
  desconexao: { texto: "Encerrou", pastilha: "pastilha-neutra" },
  queda: { texto: "Caiu", pastilha: "pastilha-erro" },
};

export const evento = (tipo) => NOME_DO_EVENTO[tipo] ?? { texto: ouVazio(tipo), pastilha: "pastilha-neutra" };

/**
 * O `detalhe` de uma ação administrativa, em uma linha legível.
 *
 * A troca de plano é a ação que existe hoje e ela tem forma conhecida
 * (`de`, `para`, `motivo`), então essa forma é escrita por extenso. O resto
 * cai no genérico: ação futura precisa aparecer no log desde o primeiro dia,
 * mesmo feia, e não ficar invisível até alguém lembrar de formatá-la.
 */
export function resumirDetalhe(detalhe) {
  if (!detalhe || typeof detalhe !== "object") return VAZIO;

  const partes = [];
  if (detalhe.de !== undefined || detalhe.para !== undefined) {
    partes.push(`${ouVazio(detalhe.de) === VAZIO ? "sem plano" : detalhe.de} → ${ouVazio(detalhe.para)}`);
  }
  if (detalhe.motivo) partes.push(String(detalhe.motivo));

  const conhecidas = new Set(["de", "para", "motivo", "cobranca"]);
  const sobra = Object.entries(detalhe).filter(([chave]) => !conhecidas.has(chave));
  for (const [chave, valor] of sobra) {
    partes.push(`${chave}: ${typeof valor === "object" ? JSON.stringify(valor) : String(valor)}`);
  }

  return partes.length > 0 ? partes.join(" · ") : VAZIO;
}

/**
 * O que aconteceu do lado do dinheiro numa troca de plano.
 *
 * Frase própria, e não um "ok" genérico: "a cobrança mudou" e "não havia
 * cobrança para mudar" são desfechos diferentes, e o segundo é o normal em
 * conta de cortesia. Confundir os dois faria o operador achar que cobrou
 * alguém que não foi cobrado.
 */
export const RECADO_DA_COBRANCA = {
  sem_cliente_na_lemon: "Sem cliente na Lemon Squeezy: a troca valeu só na base da Kora.",
  plano_sem_cobranca: "Plano sem cobrança: nada foi alterado na Lemon Squeezy.",
};

export function recadoDaCobranca(cobranca) {
  if (!cobranca) return VAZIO;
  if (cobranca.escrita) return "Assinatura alterada na Lemon Squeezy.";
  return RECADO_DA_COBRANCA[cobranca.motivo] ?? "Nada foi alterado na Lemon Squeezy.";
}

/** Campo ausente escrito de um jeito só na tela inteira. */
export const ouVazio = (valor) => {
  if (valor === null || valor === undefined) return VAZIO;
  const texto = String(valor).trim();
  return texto === "" ? VAZIO : texto;
};

/** O @ da TikTok é guardado sem arroba no banco, e sempre mostrado com ela. */
export const arroba = (usuario) => (usuario ? `@${usuario}` : VAZIO);

/** Como o console chama cada estado de licença, e a cor que ele merece. */
export const ESTADO_DA_LICENCA = {
  ativa: { texto: "Ativa", pastilha: "pastilha-ok" },
  expirada: { texto: "Expirada", pastilha: "pastilha-atencao" },
  cancelada: { texto: "Cancelada", pastilha: "pastilha-erro" },
};

/**
 * Sem licença não é erro: é quem comprou e ainda não instalou. Pintar isso de
 * vermelho faria o operador ligar para um cliente que não tem problema nenhum.
 */
export const SEM_LICENCA = { texto: "Sem licença", pastilha: "pastilha-neutra" };

export const estadoDaLicenca = (estado) => ESTADO_DA_LICENCA[estado] ?? SEM_LICENCA;

/** O idioma do PERFIL do assinante (ADR-P03), que não é o idioma do console. */
export const NOME_DO_IDIOMA = { pt: "Português", es: "Espanhol", en: "Inglês" };

export const idioma = (codigo) => NOME_DO_IDIOMA[codigo] ?? VAZIO;

/**
 * O que a tela diz quando a camada de dados falhou.
 *
 * Existe como mapa porque o motivo é do contrato e a frase é da tela: o
 * operador precisa saber se o problema é dele (subir o console de novo) ou da
 * Kora (esperar), e `motivo` cru não responde isso.
 */
export const MENSAGEM_DE_FALHA = {
  console_offline: "O console não está no ar. Rode `npm run console` de novo.",
  sem_configuracao: "Sem SUPABASE_URL ou sem a chave de serviço no .env.",
  rede: "Não deu para falar com a base da Kora.",
  timeout: "A base da Kora demorou demais para responder.",
  http: "A base da Kora recusou a consulta.",
  corpo_ilegivel: "A base da Kora respondeu algo que o console não entendeu.",
  nao_encontrado: "Não existe assinante com esse identificador.",
  pedido_invalido: "O console montou um pedido que a base recusou.",
};

export const mensagemDeFalha = (motivo) =>
  MENSAGEM_DE_FALHA[motivo] ?? "Não deu para carregar. Veja o terminal do console.";

export { VAZIO };
