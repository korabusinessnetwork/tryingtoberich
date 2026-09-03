/**
 * Encher o acervo sozinho (ADR-004, nota de 2026-09-02).
 *
 * Nenhum teste toca a rede nem o Open Cloud: o publicador é injetado, que é o
 * mesmo arranjo do Gemini e do catálogo do Roblox. O que se testa é o que a
 * ponte FAZ com a resposta — inclusive quando ela não vem.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { desenharCeu, desenharTextura } from "../src/acervo/desenho.mjs";
import { publicarAcervoPendente } from "../src/acervo/publicar.mjs";
import { PublicadorRoblox, STATUS_POR_MODERACAO } from "../src/roblox/publicador.mjs";
import { caminhoDeDados } from "../src/repos/arquivo.mjs";
import { carregarAcervo } from "../src/repos/acervo.mjs";
import { criarValidador } from "../src/repos/schemas.mjs";

const { validar } = await criarValidador();

/**
 * O acervo de verdade é só LIDO, como semente. Nada aqui grava em disco.
 *
 * A primeira versão escrevia em `data/acervo.json` e restaurava no fim. Não
 * bastou: o `node --test` roda os arquivos em PARALELO, e outro teste tirou o
 * retrato do acervo no instante em que este o tinha zerado — e "restaurou" o
 * vazio. O acervo do streamer foi para o chão, e ele só descobriu quando o mapa
 * gerado veio sem céu e sem textura.
 *
 * Restaurar depois nunca conserta uma corrida; não escrever, sim.
 */
const semente = JSON.parse(await readFile(caminhoDeDados("acervo.json"), "utf8"));

/** Um acervo em memória, com o par carregar/salvar que a publicação usa. */
function acervoDeMentira(preparar) {
  let estado = JSON.parse(JSON.stringify(semente));
  if (preparar) preparar(estado);
  return {
    get atual() { return estado; },
    carregar: async () => JSON.parse(JSON.stringify(estado)),
    salvar: async (novo) => { estado = novo; return novo; },
  };
}

/** Tudo por subir: é o estado de partida que a maioria dos casos quer. */
const todoPendente = () => acervoDeMentira((a) => {
  for (const colecao of ["skybox", "texturas"]) {
    a[colecao] = a[colecao].map((i) => ({ ...i, assetId: null, status: "pendente-upload" }));
  }
});

const publicadorFalso = ({ moderacao = "Reviewing", falhaEm = null } = {}) => {
  const subidos = [];
  return {
    subidos,
    configurado: true,
    async publicar({ nome, png }) {
      if (falhaEm && nome.includes(falhaEm)) throw new Error("rede caiu");
      subidos.push({ nome, bytes: png.length });
      return { assetId: 900000000 + subidos.length, moderacao };
    },
    async moderacaoDe() { return moderacao; },
  };
};

test("a imagem sai pronta para subir: PNG de verdade, sem dependência nenhuma", async () => {
  const acervo = await carregarAcervo();
  for (const item of [...acervo.texturas, ...acervo.skybox]) {
    const png = acervo.texturas.includes(item) ? desenharTextura(item) : desenharCeu(item);
    assert.equal(png.subarray(1, 4).toString(), "PNG", `${item.id} não é PNG`);
    assert.equal(png.subarray(12, 16).toString(), "IHDR");
    assert.equal(png.subarray(-8, -4).toString(), "IEND", `${item.id} sem fim de arquivo`);
    //[[ Tamanho em bytes não diz nada sobre conteúdo.
    //
    // Esta linha exigia 4 KB, calibrada nas texturas de ruído. As de bloco do
    // Minecraft têm poucos tons e comprimem muito melhor: `tabua` sai com 3,8
    // KB de imagem perfeita e reprovava. O que importa é o IHDR — a imagem tem
    // o tamanho que devia ter? ]]
    const largura = png.readUInt32BE(16);
    const altura = png.readUInt32BE(20);
    assert.equal(largura, altura, `${item.id} não saiu quadrada`);
    assert.ok(largura >= 256, `${item.id} saiu com ${largura}px, pequena demais para textura de plataforma`);
  }
});

test("a mesma peça sai igual toda vez: acervo que muda de cara é impossível de curar", async () => {
  const item = { id: "textura_gelo", nome: "Gelo", tags: ["gelo", "liso", "frio", "claro"] };
  assert.deepEqual(desenharTextura(item), desenharTextura(item));
});

test("tag desconhecida cai no neutro em vez de quebrar: o acervo é dado, não código", () => {
  const png = desenharTextura({ id: "textura_nova", nome: "Nova", tags: ["coisa-que-nao-existe"] });
  assert.equal(png.subarray(1, 4).toString(), "PNG");
});

test("publicar preenche o assetId e deixa o acervo dentro do contrato", async () => {
  const disco = todoPendente();
  const quantos = disco.atual.skybox.length + disco.atual.texturas.length;

  const { relatorio, resumo } = await publicarAcervoPendente({
    publicador: publicadorFalso(), carregar: disco.carregar, salvar: disco.salvar,
  });

  const publicados = relatorio.filter((r) => r.acao === "publicado");
  assert.equal(publicados.length, quantos, "a fila inteira tinha que ter subido");
  for (const linha of publicados) {
    assert.equal(linha.status, "em-moderacao", "moderação é do Roblox: ninguém entra aprovado por conta própria");
    assert.ok(Number.isInteger(linha.assetId));
  }

  const depois = disco.atual;
  assert.deepEqual(validar("acervo", depois), [], "o acervo gravado tem que continuar válido");
  assert.ok(depois.skybox.every((i) => Number.isInteger(i.assetId)), "sobrou céu sem número");
  assert.ok(depois.texturas.every((i) => Number.isInteger(i.assetId)), "sobrou textura sem número");
  assert.equal(resumo.skyboxTotal, depois.skybox.length);
});

test("item que o Roblox aprovou vira aprovado, e é o único que o gerador pode usar", async () => {
  const disco = todoPendente();
  await publicarAcervoPendente({
    publicador: publicadorFalso({ moderacao: "Approved" }), carregar: disco.carregar, salvar: disco.salvar,
  });
  assert.ok(disco.atual.texturas.some((i) => i.status === "aprovado" && i.assetId));
});

test("um item que falha não leva a fila junto", async () => {
  const disco = todoPendente();
  const quantos = disco.atual.skybox.length + disco.atual.texturas.length;

  const { relatorio } = await publicarAcervoPendente({
    publicador: publicadorFalso({ falhaEm: "Gelo" }), carregar: disco.carregar, salvar: disco.salvar,
  });

  assert.ok(relatorio.some((r) => r.acao === "falhou" && r.id === "textura_gelo"));
  assert.equal(
    relatorio.filter((r) => r.acao === "publicado").length,
    quantos - 1,
    "todos os outros tinham que ter subido mesmo assim",
  );
});

test("item já aprovado não sobe de novo: asset duplicado fica no inventário para sempre", async () => {
  // Com o acervo cheio, publicar tem que ser um NÃO-evento. Sem isto, cada
  // clique no botão do painel criaria assets novos na conta do streamer, e
  // asset criado não sai mais de lá.
  const disco = acervoDeMentira((a) => {
    for (const colecao of ["skybox", "texturas"]) {
      a[colecao] = a[colecao].map((i, n) => ({ ...i, assetId: 900000 + n, status: "aprovado" }));
    }
  });

  const publicador = publicadorFalso();
  const { relatorio } = await publicarAcervoPendente({
    publicador, carregar: disco.carregar, salvar: disco.salvar,
  });

  assert.equal(publicador.subidos.length, 0, "nada podia subir: está tudo aprovado");
  assert.equal(relatorio.filter((r) => r.acao === "publicado").length, 0);
});

test("o mapa da moderação é o contrato do schema, não uma tradução solta", () => {
  const permitidos = new Set(["pendente-upload", "em-moderacao", "aprovado", "rejeitado"]);
  for (const status of Object.values(STATUS_POR_MODERACAO)) {
    assert.ok(permitidos.has(status), `"${status}" não existe no acervo.schema.json`);
  }
});

test("sem chave no .env, o erro diz onde criar uma — de graça", () => {
  const publicador = new PublicadorRoblox({});
  assert.equal(publicador.configurado, false);
  assert.rejects(() => publicador.enviarImagem({ nome: "x", png: Buffer.alloc(1) }), /ROBLOX_API_KEY/);
});

test("HTTP 200 com corpo de erro do Roblox não vira assetId inventado", async () => {
  const publicador = new PublicadorRoblox({
    chave: "k", criador: "1", esperar: async () => {},
    buscarNaRede: async () => ({ ok: true, status: 200, json: async () => ({ done: true, response: {} }) }),
  });
  await assert.rejects(() => publicador.aguardarAssetId("op"), /sem assetId/);
});

test("o upload é do tipo IMAGE, e nunca Decal", async () => {
  //[[ A diferença não aparece no upload: o Open Cloud aceita os dois para um
  // PNG e devolve "aprovado" nos dois. Ela só aparece DENTRO do jogo.
  //
  // Decal é um EMBRULHO em volta de uma imagem, com id próprio.
  // `Sky.SkyboxFt` e `Texture.Texture` esperam o id da IMAGEM — com o do decal
  // não resolvem nada, e o resultado é céu padrão do Roblox e plataforma
  // cinza, sem um erro em lugar nenhum.
  //
  // Custou 70 uploads aprovados e inúteis, e da tela parecia que a arte não
  // tinha chegado. Vale um teste de uma linha. ]]
  const fonte = await readFile(
    caminhoDeDados("..", "bridge", "src", "roblox", "publicador.mjs"), "utf8",
  ).catch(async () => {
    const { readFile: ler } = await import("node:fs/promises");
    return ler(new URL("../src/roblox/publicador.mjs", import.meta.url), "utf8");
  });

  assert.match(fonte, /assetType: "Image"/, "o upload tem que ser de IMAGEM");
  assert.ok(
    !/assetType: "Decal"/.test(fonte),
    'Decal não renderiza em Sky nem em Texture: o id é do embrulho, não da imagem',
  );
});
