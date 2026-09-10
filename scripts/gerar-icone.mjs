#!/usr/bin/env node
/**
 * O ícone do aplicativo, desenhado por código.
 *
 *   node scripts/gerar-icone.mjs [saida.ico]
 *
 * Por que gerado e não um arquivo de arte: um `.ico` é um contêiner de seis
 * PNGs de tamanhos diferentes, e a única coisa que ele precisa dizer é o que o
 * produto é. Desenhar três degraus subindo, nas cores das faixas de presente do
 * próprio `data/tokens.json`, custa menos que abrir um editor — e o dia em que
 * a paleta mudar, o ícone muda junto.
 *
 * Sem dependência: o PNG é escrito à mão (IHDR/IDAT/IEND, o `deflate` vem do
 * `node:zlib`) e o `.ico` é o cabeçalho de 22 bytes por tamanho em volta deles.
 * Windows lê PNG dentro de `.ico` desde o Vista.
 *
 * O ícone é a identidade do programa na barra de tarefas. É o que separa "meu
 * aplicativo" de "aquele quadradinho genérico" — ver ADR-P07.
 */

import { deflateSync } from "node:zlib";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { RAIZ, escreverBinarioAtomico, lerJson } from "../bridge/src/repos/arquivo.mjs";

/** Os tamanhos que o Windows pede: barra de tarefas, Alt+Tab, lista, Explorer. */
const TAMANHOS = [16, 24, 32, 48, 64, 128, 256];

/** Quatro amostras por eixo. Resolve a borda arredondada sem serrilhado. */
const SUPER = 4;

const hex = (cor) => [1, 3, 5].map((i) => Number.parseInt(cor.slice(i, i + 2), 16));

// --- PNG -------------------------------------------------------------------

const TABELA_CRC = (() => {
  const tabela = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c;
  }
  return tabela;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = TABELA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pedaco(tipo, dados) {
  const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), dados]);
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const soma = Buffer.alloc(4);
  soma.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, soma]);
}

/** RGBA cru (largura × altura × 4) vira um PNG. */
export function montarPng(rgba, lado) {
  const assinatura = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  // 10, 11, 12 ficam em zero: deflate, filtro padrão, sem entrelaçamento.

  // Cada linha do PNG começa com o byte do filtro. Zero — "sem filtro" — é o
  // suficiente: a imagem é pequena e o deflate faz o trabalho.
  const linhas = Buffer.alloc(lado * (lado * 4 + 1));
  for (let y = 0; y < lado; y += 1) {
    linhas[y * (lado * 4 + 1)] = 0;
    rgba.copy(linhas, y * (lado * 4 + 1) + 1, y * lado * 4, (y + 1) * lado * 4);
  }

  return Buffer.concat([
    assinatura,
    pedaco("IHDR", ihdr),
    pedaco("IDAT", deflateSync(linhas, { level: 9 })),
    pedaco("IEND", Buffer.alloc(0)),
  ]);
}

// --- ICO -------------------------------------------------------------------

/** O contêiner: 6 bytes de cabeçalho, 16 por imagem, e os PNGs em seguida. */
export function montarIco(imagens) {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0);
  cabecalho.writeUInt16LE(1, 2); // 1 = ícone
  cabecalho.writeUInt16LE(imagens.length, 4);

  const entradas = Buffer.alloc(16 * imagens.length);
  let deslocamento = cabecalho.length + entradas.length;

  imagens.forEach(({ lado, png }, i) => {
    const base = i * 16;
    // 256 não cabe num byte e é escrito como 0. É a convenção do formato.
    entradas[base] = lado >= 256 ? 0 : lado;
    entradas[base + 1] = lado >= 256 ? 0 : lado;
    entradas.writeUInt16LE(1, base + 4); // planos
    entradas.writeUInt16LE(32, base + 6); // bits por pixel
    entradas.writeUInt32LE(png.length, base + 8);
    entradas.writeUInt32LE(deslocamento, base + 12);
    deslocamento += png.length;
  });

  return Buffer.concat([cabecalho, entradas, ...imagens.map((i) => i.png)]);
}

// --- O desenho -------------------------------------------------------------

/**
 * Três degraus subindo num quadrado escuro de cantos redondos.
 *
 * A escolha do desenho não é decorativa: o jogo é uma torre que sobe, e as três
 * cores são as faixas 2, 3 e 5 do `data/tokens.json` — as mesmas que o painel
 * usa nos cartões de presente. Em 16 pixels o que sobra é a diagonal subindo,
 * que é exatamente o que o produto faz.
 */
export function desenhar(lado, paleta) {
  const grande = lado * SUPER;
  const amostra = Buffer.alloc(grande * grande * 4);

  const raio = grande * 0.22;
  const dentroDoQuadrado = (x, y) => {
    const dx = Math.min(x, grande - 1 - x);
    const dy = Math.min(y, grande - 1 - y);
    if (dx >= raio || dy >= raio) return true;
    return (raio - dx) ** 2 + (raio - dy) ** 2 <= raio ** 2;
  };

  // Três plataformas subindo da esquerda para a direita, cada uma um degrau
  // acima da anterior. Barras de altura crescente virariam gráfico de vendas; o
  // que o jogo faz é SUBIR, e degrau separado é o que diz isso em 16 pixels.
  const margem = grande * 0.19;
  const util = grande - margem * 2;
  const passo = util / 3;
  const espaco = grande * 0.045;
  const degraus = [0, 1, 2].map((i) => ({
    x0: margem + i * passo,
    x1: margem + (i + 1) * passo - espaco,
    y0: grande - margem - (i + 1) * passo + espaco,
    y1: grande - margem - i * passo,
    cor: paleta.degraus[i],
  }));

  for (let y = 0; y < grande; y += 1) {
    for (let x = 0; x < grande; x += 1) {
      const p = (y * grande + x) * 4;
      if (!dentroDoQuadrado(x, y)) continue;

      let cor = paleta.fundo;
      for (const degrau of degraus) {
        if (x >= degrau.x0 && x < degrau.x1 && y >= degrau.y0 && y < degrau.y1) cor = degrau.cor;
      }

      const [r, g, b] = hex(cor);
      amostra[p] = r;
      amostra[p + 1] = g;
      amostra[p + 2] = b;
      amostra[p + 3] = 255;
    }
  }

  return reduzir(amostra, grande, lado);
}

/** Média de SUPER×SUPER amostras por pixel. É isto que suaviza os cantos. */
function reduzir(amostra, grande, lado) {
  const saida = Buffer.alloc(lado * lado * 4);

  for (let y = 0; y < lado; y += 1) {
    for (let x = 0; x < lado; x += 1) {
      const soma = [0, 0, 0, 0];
      for (let sy = 0; sy < SUPER; sy += 1) {
        for (let sx = 0; sx < SUPER; sx += 1) {
          const p = ((y * SUPER + sy) * grande + (x * SUPER + sx)) * 4;
          // Pré-multiplicado: sem isto, o preto transparente de fora do canto
          // escurece a borda e o ícone ganha uma auréola suja.
          const alfa = amostra[p + 3] / 255;
          soma[0] += amostra[p] * alfa;
          soma[1] += amostra[p + 1] * alfa;
          soma[2] += amostra[p + 2] * alfa;
          soma[3] += amostra[p + 3];
        }
      }

      const total = SUPER * SUPER;
      const p = (y * lado + x) * 4;
      const alfa = soma[3] / total;
      const escala = alfa > 0 ? 255 / alfa : 0;
      saida[p] = Math.min(255, Math.round((soma[0] / total) * escala));
      saida[p + 1] = Math.min(255, Math.round((soma[1] / total) * escala));
      saida[p + 2] = Math.min(255, Math.round((soma[2] / total) * escala));
      saida[p + 3] = Math.round(alfa);
    }
  }

  return saida;
}

export async function gerarIcone(destino) {
  const tokens = await lerJson(path.join(RAIZ, "data", "tokens.json"));
  const paleta = {
    fundo: tokens.painel.superficie,
    degraus: [tokens.faixas["2"].cor, tokens.faixas["3"].cor, tokens.faixas["5"].cor],
  };

  const imagens = TAMANHOS.map((lado) => ({ lado, png: montarPng(desenhar(lado, paleta), lado) }));
  const ico = montarIco(imagens);
  await escreverBinarioAtomico(destino, ico);

  return { destino, tamanhos: TAMANHOS, bytes: ico.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const destino = process.argv[2] ?? path.join(RAIZ, "build", "icone.ico");
  const feito = await gerarIcone(destino);
  console.log(`${path.relative(RAIZ, feito.destino)} — ${feito.tamanhos.join(", ")} px, ${(feito.bytes / 1024).toFixed(1)} KB`);
}
