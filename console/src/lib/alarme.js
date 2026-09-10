/**
 * A regra do alarme do item 6, e por que ela é uma regra e não um gráfico.
 *
 * O ADR-P05 é explícito: o item 6 **não é enfeite**, é o alarme de quando a
 * TikTok quebra o acesso, que é o risco nº 1 do produto (ADR-006, ADR-P06).
 * Sem ele, a Kora descobre a quebra pelo primeiro cliente irritado que escrever.
 *
 * Um painel com dois números e uma barrinha não é alarme: alarme é alguém
 * decidir, antes, qual combinação de números quer dizer "vá olhar agora". Se
 * essa decisão não estiver escrita aqui, ela acontece na cabeça de quem abre a
 * tela, e só nos dias em que essa pessoa abre a tela.
 *
 * **O que distingue a quebra de plataforma de internet ruim de um streamer:**
 * a quebra derruba todo mundo ao mesmo tempo. Queda espalhada ao longo do dia,
 * em gente diferente, é a vida normal de quem transmite de casa. Várias quedas
 * na MESMA hora é a plataforma tendo mudado alguma coisa. Por isso a regra olha
 * a concentração, e não só o total.
 *
 * Função pura, sem relógio e sem rede: é o que permite testar cada nível sem
 * montar tela e sem esperar um dia ruim acontecer.
 */

/**
 * Abaixo disto não há alarme possível, e o motivo é estatística de base
 * pequena: com dois assinantes, duas quedas na mesma hora são 100% de
 * concentração e não querem dizer nada. Três é o menor número em que
 * "aconteceu junto" começa a ser afirmação.
 */
export const QUEDAS_PARA_SUSPEITAR = 3;

/**
 * Fatia das quedas do dia concentrada numa hora só que faz virar alarme.
 *
 * Dois terços, e não metade: com poucas horas com queda, metade é fácil de
 * atingir por acaso. Alarme que dispara à toa é alarme que o dono aprende a
 * ignorar, e aí ele não serve no dia em que importa.
 */
export const FATIA_DE_ALARME = 2 / 3;

export const NIVEIS = Object.freeze({ CALMO: "calmo", ATENCAO: "atencao", ALARME: "alarme" });

/** A pastilha de cada nível. O texto vem junto: cor sozinha não comunica. */
export const PASTILHA_DO_NIVEL = Object.freeze({
  [NIVEIS.CALMO]: "pastilha-ok",
  [NIVEIS.ATENCAO]: "pastilha-atencao",
  [NIVEIS.ALARME]: "pastilha-erro",
});

/** A hora com mais quedas da janela, e quantas foram. */
export function piorHora(serie = []) {
  let pior = null;
  for (const ponto of serie ?? []) {
    const quedas = Number(ponto?.quedas ?? 0);
    if (!pior || quedas > pior.quedas) pior = { hora: ponto.hora, quedas };
  }
  return pior;
}

/**
 * O veredito da tela, a partir do que a camada de dados devolveu.
 *
 * @param conectadosAgora quantas instalações conectaram e não desconectaram
 * @param quedas24h       quedas na janela de 24h
 * @param serie           `[{ hora, quedas }]`, ordenada, só das horas com queda
 */
export function avaliarAlarme({ conectadosAgora = 0, quedas24h = 0, serie = [] } = {}) {
  const pior = piorHora(serie);

  /* Todo mundo caiu e ninguém voltou. É o desenho da quebra de acesso: a
     instalação perde a live, tenta de novo e não consegue mais entrar. */
  if (quedas24h >= QUEDAS_PARA_SUSPEITAR && conectadosAgora === 0) {
    return {
      nivel: NIVEIS.ALARME,
      titulo: "Ninguém conectado, e houve queda nas últimas 24 horas",
      explicacao:
        "É o desenho de acesso quebrado: as instalações caíram e nenhuma voltou. " +
        "Confira se a ponte ainda entra numa live antes de esperar o primeiro cliente escrever.",
    };
  }

  /* Quedas concentradas numa hora só, em gente diferente. Não é a internet de
     ninguém: é a plataforma tendo mudado alguma coisa naquela hora. */
  if (pior && pior.quedas >= QUEDAS_PARA_SUSPEITAR && pior.quedas >= quedas24h * FATIA_DE_ALARME) {
    return {
      nivel: NIVEIS.ALARME,
      titulo: `${pior.quedas} quedas concentradas numa hora só`,
      explicacao:
        "Queda espalhada pelo dia é internet de streamer. Queda junta na mesma hora, " +
        "em instalações diferentes, é a plataforma. Comece a olhar por essa hora.",
      hora: pior.hora,
    };
  }

  if (quedas24h >= QUEDAS_PARA_SUSPEITAR) {
    return {
      nivel: NIVEIS.ATENCAO,
      titulo: `${quedas24h} quedas nas últimas 24 horas, espalhadas`,
      explicacao:
        "Espalhadas ao longo do dia, quedas são a vida normal de quem transmite de casa. " +
        "Vale olhar de novo mais tarde: o que vira alarme é elas se juntarem numa hora.",
    };
  }

  return {
    nivel: NIVEIS.CALMO,
    titulo: quedas24h === 0 ? "Nenhuma queda nas últimas 24 horas" : `${quedas24h} queda${quedas24h === 1 ? "" : "s"} nas últimas 24 horas`,
    explicacao:
      "Nada aqui parece quebra de acesso. O alarme dispara quando as quedas se juntam " +
      "numa hora só, ou quando todo mundo cai e ninguém volta.",
  };
}
