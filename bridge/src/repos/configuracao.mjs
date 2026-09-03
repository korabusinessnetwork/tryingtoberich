/**
 * Configuração do streamer: o que ele define no painel e vale entre sessões.
 *
 * Hoje só a conta da live. Mora em disco e não no `.env` porque é configuração
 * de PRODUTO, não de ambiente: o streamer troca de conta sem editar arquivo de
 * texto nem reiniciar a ponte. O `.env` continua com segredo e porta, que são
 * da máquina.
 *
 * O `TIKTOK_USERNAME` do `.env` vira SEMENTE: vale enquanto o painel não tiver
 * gravado nada. Assim quem já tinha o `.env` preenchido não perde a config, e
 * quem não tinha começa pelo painel.
 */

import { ErroDeDominio } from "../erros.mjs";
import { caminhoDeDados, escreverJsonAtomico, lerJsonOuPadrao } from "./arquivo.mjs";
import { criarValidador } from "./schemas.mjs";

const ARQUIVO = () => caminhoDeDados("configuracao.json");

/** O que o `.env.example` traz. Passa na guarda de "não vazio" e não é conta nenhuma. */
export const PLACEHOLDER = "seu_usuario_sem_arroba";

/**
 * Normaliza o que o streamer digitou.
 *
 * Tira a arroba porque a biblioteca do TikTok quer o nome sem ela, e digitar
 * "@fulano" é o que qualquer pessoa faz — recusar isso seria only-me. Também
 * tira espaço das pontas e a URL inteira, que é o outro jeito natural de
 * responder "qual é o seu @".
 */
export function normalizarUsuario(bruto) {
  let texto = String(bruto ?? "").trim();

  const daUrl = /tiktok\.com\/@([A-Za-z0-9._]+)/i.exec(texto);
  if (daUrl) return daUrl[1];

  while (texto.startsWith("@")) texto = texto.slice(1);
  return texto.trim();
}

const PADRAO = { streamerId: "local", usuarioTiktok: null, presetAtivo: null, galeriaDeSkins: [], atualizadoEm: null };

/**
 * A configuração completa, com o `.env` entrando só onde o disco está vazio.
 *
 * Nunca devolve `null`: quem chama pergunta por campo (`usuarioTiktok`,
 * `presetAtivo`), e um objeto com nulos evita `?.` espalhado por toda parte.
 */
export async function carregarConfiguracao(semente = "") {
  const base = { ...PADRAO, ...((await lerJsonOuPadrao(ARQUIVO())) ?? {}) };
  if (base.usuarioTiktok) return base;

  const doEnv = normalizarUsuario(semente);
  if (!doEnv || doEnv === PLACEHOLDER) return base;
  return { ...base, usuarioTiktok: doEnv };
}

/**
 * Grava MUDANÇA PARCIAL: o que não vier fica como estava.
 *
 * Parcial de propósito. A conta da live e o preset ativo são escritos por
 * caminhos diferentes — um pela tela, outro por trocar de preset — e um salvar
 * completo faria cada um apagar o outro.
 */
export async function salvarConfiguracao(mudancas = {}, semente = "") {
  const atual = await carregarConfiguracao(semente);
  const proxima = { ...atual, atualizadoEm: new Date().toISOString() };

  if ("usuarioTiktok" in mudancas) {
    const usuario = normalizarUsuario(mudancas.usuarioTiktok);

    if (!usuario) {
      throw new ErroDeDominio("usuario_obrigatorio", "Digite o @ da sua live.", { status: 400 });
    }
    if (usuario === PLACEHOLDER) {
      throw new ErroDeDominio(
        "usuario_placeholder",
        `"${PLACEHOLDER}" é o exemplo do .env.example, não uma conta. Digite o seu @.`,
        { status: 400 },
      );
    }
    proxima.usuarioTiktok = usuario;
  }

  if ("presetAtivo" in mudancas) proxima.presetAtivo = mudancas.presetAtivo ?? null;

  if ("galeriaDeSkins" in mudancas) {
    // Normaliza aqui e não na tela: nick com arroba ou espaço é o que qualquer
    // pessoa digita, e o schema recusa os dois. Duplicata sai porque a galeria
    // é um conjunto — o mesmo nick duas vezes não acrescenta nada.
    const nicks = Array.isArray(mudancas.galeriaDeSkins) ? mudancas.galeriaDeSkins : [];
    proxima.galeriaDeSkins = [...new Set(
      nicks.map((n) => String(n ?? "").trim().replace(/^@+/, "")).filter(Boolean),
    )];
  }

  const { validar } = await criarValidador();
  const problemas = validar("configuracao", proxima);
  if (problemas.length) {
    throw new ErroDeDominio(
      "configuracao_invalida",
      `Configuração fora do contrato: ${problemas.join("; ")}`,
      { status: 400 },
    );
  }

  await escreverJsonAtomico(ARQUIVO(), proxima);
  return proxima;
}
