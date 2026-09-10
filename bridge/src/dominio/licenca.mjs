/**
 * O veredito da licença. Função pura: sem rede, sem disco, sem relógio próprio.
 *
 * Ela existe separada porque a regra difícil aqui não é falar com a Kora — é
 * decidir o que vale quando a Kora NÃO falou. Essa decisão tem que ser testável
 * sem subir nada, e tem que ser lida inteira num arquivo só.
 *
 * Três regras a moldam:
 *
 * 1. **A Kora nunca entra no caminho do presente** (CLAUDE.md, Princípio nº 1).
 *    Por isso o veredito é tirado UMA vez, no arranque, e vale a sessão inteira.
 * 2. **O espelho manda quando a Kora não responde** (licenca.schema.json). Quem
 *    pagou não pode ficar sem produto porque o Supabase caiu.
 * 3. **Carência é para quem já foi confirmado ativo**, e só. Licença que a Kora
 *    já recusou uma vez não ganha sobrevida por a Kora estar fora do ar depois:
 *    não poder repetir o "não" não transforma o "não" em "sim".
 */

/**
 * Códigos de motivo, ESTÁVEIS. O painel traduz por eles (ADR-P03), e nunca
 * recebe frase pronta: frase pronta nasceria em português e o funil da Fase 1
 * é em inglês. Acrescentar um código aqui é acrescentar uma chave de i18n lá.
 */
export const MOTIVOS = Object.freeze({
  SEM_CHAVE: "sem_chave",
  CHAVE_INVALIDA: "chave_invalida",
  LICENCA_EXPIRADA: "licenca_expirada",
  LICENCA_CANCELADA: "licenca_cancelada",
  KORA_INDISPONIVEL: "kora_indisponivel",
  CARENCIA_ESGOTADA: "carencia_esgotada",
});

/**
 * Quatorze dias. O número é uma escolha, e o raciocínio dela é o ADR-P08.
 *
 * O piso: o tier gratuito do Supabase PAUSA o projeto depois de 1 semana sem
 * atividade (ADR-P02). Uma carência de 7 dias transformaria uma pausa nossa em
 * live cancelada do cliente — o produto puniria o streamer por um problema da
 * Kora. Qualquer número tem que passar folgado de 7.
 *
 * O teto: o ciclo de cobrança é mensal. Carência maior que metade do ciclo faz
 * quem cancelou continuar rodando a maior parte de um mês que não pagou, e
 * ficar offline de propósito viraria a forma mais barata de usar o produto.
 *
 * Entre 7 e 15, 14 é o que cobre o evento real que a carência existe para
 * cobrir: a semana sem internet — mudança de casa, viagem, provedor caído —
 * com margem para ela virar duas.
 */
export const CARENCIA_DIAS = 14;

/** A chave que o streamer cola no painel. Os limites são os do schema. */
export const CHAVE_MIN = 8;
export const CHAVE_MAX = 128;

const DIA_MS = 86_400_000;

/** Tira espaço das pontas. Não mexe em maiúscula: a chave é da Kora, não nossa. */
export const normalizarChave = (bruto) => String(bruto ?? "").trim();

export const chaveTemForma = (chave) =>
  typeof chave === "string" && chave.length >= CHAVE_MIN && chave.length <= CHAVE_MAX;

/** Instante + N dias, em ISO. Aritmética em milissegundo, sem fuso no meio. */
export const somarDias = (instante, dias) =>
  new Date(new Date(instante).getTime() + dias * DIA_MS).toISOString();

/** Os estados que a Kora sabe responder. Qualquer outra coisa é resposta que não entendemos. */
const RESPOSTAS_CONHECIDAS = new Set(["ativa", "expirada", "cancelada"]);

const MOTIVO_DA_RESPOSTA = Object.freeze({
  expirada: MOTIVOS.LICENCA_EXPIRADA,
  cancelada: MOTIVOS.LICENCA_CANCELADA,
});

/**
 * O veredito.
 *
 * @param espelho          o `data/licenca.json` de antes, ou `null`.
 * @param resposta         o que a Kora disse: `{ conhecida, estado, plano, validaAte }`.
 *                         `conhecida: false` é "esta chave não existe aqui".
 *                         `null` significa que não deu para perguntar.
 * @param chave            a chave que o streamer acabou de colar. Sem ela, vale a do espelho.
 * @param versaoInstalada  reportada pelo próprio aplicativo (ADR-P04).
 * @param agora            ISO. Parâmetro para o teste não depender do relógio.
 *
 * Devolve SEMPRE um objeto na forma de `licenca.schema.json`. Nunca lança:
 * arranque que quebra por causa da licença é exatamente o que o ADR-P02 proíbe.
 */
export function decidirLicenca({
  espelho = null,
  resposta = null,
  chave = null,
  streamerId = "local",
  versaoInstalada = null,
  agora = new Date().toISOString(),
  carenciaDias = CARENCIA_DIAS,
} = {}) {
  const chaveEmUso = normalizarChave(chave) || espelho?.chave || null;

  const molde = {
    streamerId,
    estado: "indeterminada",
    chave: chaveEmUso,
    plano: null,
    validaAte: null,
    verificadaEm: agora,
    carenciaAte: null,
    motivo: null,
    // O que o espelho já sabia vale enquanto ninguém trouxer coisa nova: o
    // DELETE da chave não pode fazer a instalação esquecer qual versão ela é.
    versaoInstalada: versaoInstalada ?? espelho?.versaoInstalada ?? null,
    atualizadoEm: agora,
  };

  // Sem chave nenhuma nem se pergunta. Não é erro: é o estado de quem acabou
  // de baixar o produto, e é assim que a instalação nova nasce.
  if (!chaveEmUso) {
    return { ...molde, estado: "sem_licenca", chave: null, motivo: MOTIVOS.SEM_CHAVE };
  }

  // ---- A Kora respondeu ----------------------------------------------------
  if (resposta && RESPOSTAS_CONHECIDAS.has(resposta.estado)) {
    if (resposta.estado === "ativa") {
      return {
        ...molde,
        estado: "ativa",
        plano: resposta.plano ?? null,
        validaAte: resposta.validaAte ?? null,
        // A carência conta da ÚLTIMA confirmação boa, e é gravada agora para o
        // arranque seguinte não precisar recalculá-la sem saber quando foi.
        carenciaAte: somarDias(agora, carenciaDias),
        motivo: null,
      };
    }

    // "Não" explícito da Kora. Sem carência de propósito: carência é para quem
    // não pôde ser reconfirmado, não para quem foi reconfirmado como recusado.
    return {
      ...molde,
      estado: resposta.estado,
      plano: resposta.plano ?? null,
      validaAte: resposta.validaAte ?? null,
      motivo: MOTIVO_DA_RESPOSTA[resposta.estado],
    };
  }

  // Chave que a Kora não conhece. `sem_licenca` e não `cancelada`: esta
  // instalação não tem licença, e nunca teve esta. O motivo diz o resto.
  if (resposta && resposta.conhecida === false) {
    return { ...molde, estado: "sem_licenca", motivo: MOTIVOS.CHAVE_INVALIDA };
  }

  // ---- Não deu para perguntar: manda o espelho -----------------------------
  //
  // Resposta que chegou mas não entendemos cai aqui de propósito. Um estado
  // novo inventado do lado da Kora não pode derrubar a live de quem já pagou;
  // o pior que pode acontecer é a instalação rodar com o veredito de ontem.

  // O "não" de antes continua valendo. Reescrevemos só os campos de contexto.
  if (espelho?.estado === "expirada" || espelho?.estado === "cancelada") {
    return {
      ...espelho,
      streamerId,
      chave: chaveEmUso,
      versaoInstalada: molde.versaoInstalada,
      atualizadoEm: agora,
    };
  }

  //[[ Quem tem carência é quem já foi confirmado ativo ALGUMA vez.
  //
  // "Alguma vez" e não "no espelho de agora", e a diferença é o bug que este
  // desenho quase teve. Na PRIMEIRA subida offline o espelho ainda diz `ativa`;
  // da segunda em diante ele já diz `indeterminada`, porque foi isto aqui que o
  // escreveu. Olhar só para `estado === "ativa"` faria a carência valer um
  // arranque e sumir no seguinte — a licença cairia para o caminho de baixo,
  // que é `kora_indisponivel` para sempre, e o prazo nunca esgotaria.
  //
  // O que carrega a memória é o `carenciaAte`, e é por ele que se pergunta. A
  // soma cobre o espelho escrito por uma versão que gravava `ativa` sem ele.
  const carenciaAte =
    espelho?.carenciaAte ??
    (espelho?.estado === "ativa" ? somarDias(espelho.verificadaEm, carenciaDias) : null);

  if (carenciaAte) {
    const dentroDaCarencia = new Date(agora).getTime() <= new Date(carenciaAte).getTime();

    return {
      ...molde,
      estado: "indeterminada",
      plano: espelho.plano ?? null,
      // `validaAte` é nulo em `indeterminada` por contrato: a data que a Kora
      // deu vale enquanto a Kora confirma, e agora ela não confirmou nada.
      validaAte: null,
      // A carência conta da última confirmação BOA, então este campo é o do
      // espelho. Reescrevê-lo com `agora` renovaria a carência a cada arranque
      // e ela nunca esgotaria — que é o bug óbvio deste desenho.
      verificadaEm: espelho.verificadaEm,
      carenciaAte,
      motivo: dentroDaCarencia ? MOTIVOS.KORA_INDISPONIVEL : MOTIVOS.CARENCIA_ESGOTADA,
    };
  }

  // Há chave, mas ela nunca foi confirmada nesta máquina. Não há carência a
  // aplicar — não existe o que estender.
  return {
    ...molde,
    estado: "indeterminada",
    verificadaEm: espelho?.verificadaEm ?? agora,
    motivo: MOTIVOS.KORA_INDISPONIVEL,
  };
}

/**
 * O produto pode rodar?
 *
 * Só um "não" explícito da Kora, ou uma carência que acabou, travam. Todo o
 * resto libera — inclusive `indeterminada` e `sem_licenca`. Isso é decisão, não
 * descuido: uma instalação sem `SUPABASE_URL` roda inteira em modo local
 * (ADR-P02), e travar por dúvida transformaria uma queda da Kora em live
 * cancelada do cliente.
 */
export function liberado(licenca) {
  if (!licenca) return true;
  if (licenca.estado === "expirada" || licenca.estado === "cancelada") return false;
  return licenca.motivo !== MOTIVOS.CARENCIA_ESGOTADA;
}

/** Quantos dias de carência ainda restam. Negativo é carência esgotada. */
export function diasDeCarencia(licenca, agora = new Date().toISOString()) {
  if (!licenca?.carenciaAte) return null;
  return (new Date(licenca.carenciaAte).getTime() - new Date(agora).getTime()) / DIA_MS;
}
