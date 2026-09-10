/**
 * Contrato de erro de todas as superfícies (07_APIS):
 *   { "erro": "codigo_curto", "mensagem": "...", "detalhe": { ... } }
 *
 * O `detalhe` é opcional e existe por um motivo só: **traduzir a frase**.
 *
 * Metade dos erros da ponte carrega um valor dentro do texto, "Não achei o mapa
 * X", "Preset fora do contrato: Y". Enquanto o valor viajava só grudado na
 * frase em português, o painel não tinha como remontá-la em outro idioma, e
 * esses erros apareciam em português para um streamer inglês. Mandando os
 * valores separados, o painel monta a frase dele a partir da chave e do
 * `detalhe` (`panel/src/i18n/erro.js`).
 *
 * Regras do `detalhe`, e elas não são estilo:
 *
 * - **Só valor, nunca frase pronta.** Frase pronta aqui nasceria em português e
 *   voltaria ao problema que este campo resolve.
 * - **Nada de dado de espectador, caminho de disco, stack trace ou segredo.**
 *   Isto vai para a tela e para o navegador. O detalhe técnico continua indo só
 *   para o log local (`docs/11_SEGURANCA`).
 * - **As chaves do `detalhe` são os nomes dos parâmetros da chave de i18n.** É
 *   esse acordo que `test/erros-traduzidos.test.mjs` verifica dos dois lados.
 *
 * A `mensagem` continua vindo, inteira e em português, e continua sendo o que o
 * painel mostra quando não conhece o código. Nada quebra para quem já lia o
 * contrato antigo: o campo é novo e opcional.
 */

export class ErroDeDominio extends Error {
  constructor(codigo, mensagem, { status = 400, detalhe = null } = {}) {
    super(mensagem);
    this.name = "ErroDeDominio";
    this.codigo = codigo;
    this.status = status;
    this.detalhe = detalhe;
  }
}

export const corpoDeErro = (codigo, mensagem, detalhe = null) =>
  detalhe ? { erro: codigo, mensagem, detalhe } : { erro: codigo, mensagem };

export function responderErro(res, erro) {
  const eDeDominio = erro instanceof ErroDeDominio;
  const status = eDeDominio ? erro.status : 500;
  const codigo = eDeDominio ? erro.codigo : "erro_interno";
  const mensagem = eDeDominio ? erro.message : "Algo quebrou na ponte. Veja o log local.";
  // Erro inesperado nunca leva detalhe: o que ele teria para contar é stack
  // trace e caminho de disco, que não vão para a tela.
  res.status(status).json(corpoDeErro(codigo, mensagem, eDeDominio ? erro.detalhe : null));
}
