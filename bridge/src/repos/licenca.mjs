/**
 * A licença desta instalação: o que a Kora respondeu, e o espelho em disco.
 *
 * Dois substratos num repositório só, e é de propósito (ADR-P02): a fonte da
 * verdade é o Supabase, e `data/licenca.json` é ESPELHO. O espelho existe para
 * uma coisa: o produto continuar funcionando quando a Kora está fora do ar.
 *
 * A regra que manda em tudo aqui é o Princípio nº 1 do `CLAUDE.md`. Nenhuma
 * função deste arquivo pode ser chamada por um evento de presente. Quem chama
 * é o arranque (uma vez) e o painel (clique do streamer). O `nucleo.mjs` guarda
 * o veredito em memória e é dali que qualquer decisão de sessão sai.
 *
 * Nada aqui lança. Licença que derruba o arranque é o oposto do que ela serve
 * para fazer — a instalação ficaria sem painel, que é justamente onde o
 * streamer arrumaria o problema.
 */

import { REGRAS } from "../config.mjs";
import { MOTIVOS, chaveTemForma, decidirLicenca, normalizarChave } from "../dominio/licenca.mjs";
import { ErroDeDominio } from "../erros.mjs";
import { log } from "../log.mjs";
import { VERSAO } from "../versao.mjs";
import { apagar, caminhoDeDados, escreverJsonAtomico, lerJsonOuPadrao } from "./arquivo.mjs";
import { criarValidador } from "./schemas.mjs";
import { registrarFalhaDaKora } from "./supabase.mjs";

/** Função e não constante: `caminhoDeDados` depende da RAIZ, que o teste troca. */
const ARQUIVO = () => caminhoDeDados("licenca.json");

/** A tabela da Kora. O nome vive aqui e no SQL de `data/supabase/`, e em mais lugar nenhum. */
export const TABELA = "licencas";

/**
 * O espelho em disco, ou `null`.
 *
 * Arquivo corrompido devolve `null` em vez de subir o erro: um JSON truncado
 * — queda de energia no meio da escrita, edição à mão — não pode impedir a
 * ponte de subir. O efeito prático é reperguntar à Kora, que é o certo.
 */
export async function lerEspelho() {
  try {
    return await lerJsonOuPadrao(ARQUIVO(), null);
  } catch (erro) {
    log.aviso("licenca_espelho_ilegivel", { motivo: erro.message });
    return null;
  }
}

/**
 * Grava o espelho, validando contra `licenca.schema.json` antes.
 *
 * Espelho fora do contrato NÃO derruba nada: registra e não escreve. O veredito
 * já foi decidido em memória e continua valendo esta sessão; o que se perde é a
 * memória dele para o arranque seguinte. É o menos ruim dos dois — a
 * alternativa é a ponte não subir por causa de um campo errado.
 *
 * Que o veredito sempre CABE no schema é cobrado por teste, onde a mesma
 * validação vira falha vermelha em vez de linha de log.
 */
async function espelhar(licenca) {
  try {
    const { validar } = await criarValidador();
    const problemas = validar("licenca", licenca);
    if (problemas.length) {
      log.erro("licenca_fora_do_contrato", { problemas });
      return false;
    }
    await escreverJsonAtomico(ARQUIVO(), licenca);
    return true;
  } catch (erro) {
    log.aviso("licenca_espelho_nao_gravado", { motivo: erro.message });
    return false;
  }
}

/**
 * Pergunta à Kora e devolve o veredito, SEM gravar.
 *
 * Separada de quem grava porque as duas decisões são diferentes: perguntar é
 * sempre a mesma coisa, gravar depende de quem chamou — e o POST de ativação
 * tem um caso em que a resposta boa é não gravar (ver `ativarLicenca`).
 */
async function consultar({ cliente, espelho, chave = null, agora = new Date().toISOString() }) {
  const chaveEmUso = normalizarChave(chave) || espelho?.chave || null;

  const comum = {
    espelho,
    chave: chaveEmUso,
    streamerId: espelho?.streamerId ?? REGRAS.STREAMER_ID,
    versaoInstalada: VERSAO,
    agora,
  };

  // Sem chave não há o que perguntar, e sem `SUPABASE_URL` não há a quem: os
  // dois caem no veredito sem resposta, que o domínio já sabe tratar.
  if (!chaveEmUso || !cliente?.configurado) return decidirLicenca(comum);

  const resultado = await cliente.selecionar(TABELA, {
    colunas: "chave,streamer_id,estado,plano,valida_ate",
    filtros: { chave: chaveEmUso },
    chaveDaLicenca: chaveEmUso,
  });

  if (!resultado.ok) {
    registrarFalhaDaKora("licenca_kora_indisponivel", resultado);
    return decidirLicenca(comum);
  }

  const linha = resultado.linhas?.[0] ?? null;

  // Zero linhas com a consulta OK é resposta, não falha: a Kora respondeu e
  // disse que esta chave não existe. Confundir os dois deixaria uma chave
  // inventada rodando pela carência de uma licença que nunca houve.
  const resposta = linha
    ? { conhecida: true, estado: linha.estado, plano: linha.plano ?? null, validaAte: linha.valida_ate ?? null }
    : { conhecida: false };

  return decidirLicenca({
    ...comum,
    resposta,
    // O tenant real passa a ser o que a Kora disser (ADR-P02). Hoje é sempre
    // "local" (ADR-003), e este é o ponto onde isso deixa de ser verdade sem
    // nenhuma outra linha do produto mudar.
    streamerId: linha?.streamer_id ?? comum.streamerId,
  });
}

/**
 * O arranque: pergunta UMA vez, espelha e devolve.
 *
 * "Uma vez" é a regra inteira (ADR-P02). Quem chama guarda o resultado em
 * memória e não volta aqui até a próxima subida da ponte — presente chegando
 * nunca consulta banco.
 */
export async function verificarLicenca({ cliente, agora = new Date().toISOString() } = {}) {
  try {
    const espelho = await lerEspelho();
    const licenca = await consultar({ cliente, espelho, agora });
    await espelhar(licenca);
    return licenca;
  } catch (erro) {
    // Rede de segurança. Se um bug daqui escapasse, o arranque continuaria: o
    // pior veredito possível é `indeterminada`, e ele libera (ver `liberado`).
    log.erro("licenca_nao_verificada", { motivo: erro.message });
    return decidirLicenca({ agora, versaoInstalada: VERSAO, streamerId: REGRAS.STREAMER_ID });
  }
}

/**
 * `POST /api/licenca` — o streamer colou a chave.
 *
 * A forma da chave é validada AQUI, antes de sair da máquina: mandar dois
 * caracteres para a Kora só gasta uma viagem para receber "não conheço", e a
 * mensagem que o streamer merece é sobre o que ele digitou.
 */
export async function ativarLicenca({ cliente, chave, agora = new Date().toISOString() } = {}) {
  const limpa = normalizarChave(chave);

  if (!limpa) {
    throw new ErroDeDominio("chave_obrigatoria", "Cole a chave que a Kora te mandou.", { status: 400 });
  }
  if (!chaveTemForma(limpa)) {
    throw new ErroDeDominio(
      "chave_malformada",
      "Essa chave não tem a forma de uma chave da Kora. Confira se copiou ela inteira.",
      { status: 400 },
    );
  }

  const espelho = await lerEspelho();
  const licenca = await consultar({ cliente, espelho, chave: limpa, agora });

  //[[ Chave recusada NÃO derruba a que já estava valendo.
  //
  // O caminho realista aqui é erro de digitação, e o preço de aceitar a recusa
  // seria desproporcional: um caractere trocado apagaria a licença boa de quem
  // pagou, e ele só descobriria na próxima live.
  //
  // O que volta é a licença que CONTINUA VALENDO, com o motivo explicando o
  // que aconteceu com a chave digitada. Uma versão anterior devolvia o veredito
  // da recusa aqui, e o disco de fato ficava intacto, mas o núcleo adotava esse
  // veredito como o estado da sessão: a tela passava a dizer "sem licença" até
  // alguém reiniciar o programa. Ou seja, a proteção existia no arquivo e não
  // existia para o streamer, que é para quem ela foi escrita. Achado testando
  // contra o banco de verdade. ]]
  if (licenca.motivo === MOTIVOS.CHAVE_INVALIDA && espelho?.estado === "ativa") {
    log.aviso("licenca_chave_recusada", { manteveEspelho: true });
    return { ...espelho, motivo: MOTIVOS.CHAVE_INVALIDA };
  }

  await espelhar(licenca);
  log.info("licenca_ativada", { estado: licenca.estado, motivo: licenca.motivo, plano: licenca.plano });
  return licenca;
}

/**
 * `DELETE /api/licenca` — esquece a chave NESTA MÁQUINA.
 *
 * Não cancela nada e não fala com a Kora: cancelar é assunto do faturamento, e
 * o dinheiro é do Lemon Squeezy (ADR-P02). Isto aqui é o botão de "vou instalar
 * na outra máquina" e o de "tirem meus dados daqui".
 *
 * O arquivo é APAGADO, não zerado: com espelho nenhum, a instalação volta a ser
 * exatamente o que era antes de qualquer ativação.
 */
export async function esquecerLicenca({ agora = new Date().toISOString() } = {}) {
  const espelho = await lerEspelho();
  const licenca = decidirLicenca({
    chave: null,
    streamerId: espelho?.streamerId ?? REGRAS.STREAMER_ID,
    versaoInstalada: VERSAO,
    agora,
  });

  try {
    await apagar(ARQUIVO());
  } catch (erro) {
    log.aviso("licenca_espelho_nao_apagado", { motivo: erro.message });
  }

  log.info("licenca_esquecida", {});
  return licenca;
}
