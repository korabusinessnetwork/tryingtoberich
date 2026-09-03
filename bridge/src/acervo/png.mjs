/**
 * Escrever PNG sem dependência nenhuma.
 *
 * O projeto é pré-receita e não instala biblioteca de imagem para desenhar
 * gradiente e ruído: PNG é quatro pedaços com CRC32 e um `deflate`, e o
 * `zlib` já vem no Node. São 40 linhas contra uma árvore de dependências que
 * ninguém audita.
 *
 * Formato: cor verdadeira 8 bits sem canal alfa (IHDR tipo 2), que é o que
 * textura e face de céu precisam.
 */

import { deflateSync } from "node:zlib";

const ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** CRC32 do PNG. Tabela montada uma vez, no carregamento do módulo. */
const TABELA_CRC = (() => {
  const tabela = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c;
  }
  return tabela;
})();

function crc32(bytes) {
  let c = -1;
  for (const b of bytes) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pedaco(tipo, dados) {
  const rotulo = Buffer.from(tipo, "ascii");
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const soma = Buffer.alloc(4);
  soma.writeUInt32BE(crc32(Buffer.concat([rotulo, dados])));
  return Buffer.concat([tamanho, rotulo, dados, soma]);
}

/**
 * `pintar(x, y)` devolve `[r, g, b]` de 0 a 255. Chamada uma vez por pixel.
 *
 * Cada linha do PNG começa com o byte de filtro; 0 é "sem filtro", que deixa o
 * `deflate` fazer o trabalho todo. Imagem procedural comprime bem assim.
 */
export function escreverPng(largura, altura, pintar) {
  const linhas = [];
  for (let y = 0; y < altura; y += 1) {
    const linha = Buffer.alloc(1 + largura * 3);
    for (let x = 0; x < largura; x += 1) {
      const [r, g, b] = pintar(x, y);
      linha[1 + x * 3] = Math.max(0, Math.min(255, Math.round(r)));
      linha[2 + x * 3] = Math.max(0, Math.min(255, Math.round(g)));
      linha[3 + x * 3] = Math.max(0, Math.min(255, Math.round(b)));
    }
    linhas.push(linha);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 2; // cor verdadeira, sem alfa

  return Buffer.concat([
    ASSINATURA,
    pedaco("IHDR", ihdr),
    pedaco("IDAT", deflateSync(Buffer.concat(linhas), { level: 9 })),
    pedaco("IEND", Buffer.alloc(0)),
  ]);
}
