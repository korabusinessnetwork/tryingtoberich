/**
 * Contrato de erro de todas as superfícies (07_APIS):
 *   { "erro": "codigo_curto", "mensagem": "Explicação em português para o streamer." }
 *
 * Nada de stack trace na resposta. O detalhe vai para o log local.
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

export const corpoDeErro = (codigo, mensagem) => ({ erro: codigo, mensagem });

export function responderErro(res, erro) {
  const eDeDominio = erro instanceof ErroDeDominio;
  const status = eDeDominio ? erro.status : 500;
  const codigo = eDeDominio ? erro.codigo : "erro_interno";
  const mensagem = eDeDominio ? erro.message : "Algo quebrou na ponte. Veja o log local.";
  res.status(status).json(corpoDeErro(codigo, mensagem));
}
