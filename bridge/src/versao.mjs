/**
 * A versão instalada, como um número só e sem tocar disco.
 *
 * O ADR-P04 exige que a instalação reporte a própria versão, e o console a
 * mostra na ficha do assinante (ADR-P05, item 2). Ela poderia sair do
 * `bridge/package.json`, mas não sai por um motivo concreto: dentro do
 * `Kora Stream Games.exe` esse arquivo não existe em disco — o código é um blob
 * colado no executável (ver `empacotamento.mjs`). Ler dali funcionaria no
 * repositório e devolveria `null` justamente na instalação do cliente, que é a
 * única que interessa reportar.
 *
 * O preço é a constante poder divergir do `package.json`. Ele é cobrado por
 * teste: `bridge/test/licenca.test.mjs` compara os dois quando o arquivo
 * existe, e falha antes do commit se alguém subir a versão num lugar só.
 */
export const VERSAO = "0.1.0";
