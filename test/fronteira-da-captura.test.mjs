/**
 * A fronteira da captura, que virou requisito no dia em que o produto passou a
 * ser vendido (ADR-P06, mitigação nº 1).
 *
 * O acesso à live da TikTok é **não oficial**: sem contrato, sem permissão, sem
 * garantia. O ADR-006 registrou isso em 2026-09-01 e o ADR-P06 aceitou o risco
 * em 2026-09-10, com cinco mitigações obrigatórias. A primeira delas é esta, e
 * a razão é concreta:
 *
 * > "Todo contato com captura fica em `bridge/src/tiktok/`. Trocar para a via
 * > oficial é reescrever um diretório, e essa propriedade é o que compra tempo
 * > se a via oficial sair."
 *
 * Era uma propriedade que o código tinha por bom gosto. Agora é o plano de
 * contingência do produto inteiro, e plano de contingência que não é testado
 * não existe: ele se perde num `import` conveniente feito numa terça-feira.
 *
 * O que este arquivo NÃO faz é julgar se a captura é boa ideia. Isso é do
 * ADR-P06 e já está decidido.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { RAIZ, listarArquivosRecursivo } from "../bridge/src/repos/arquivo.mjs";

const DENTRO = "bridge/src/tiktok";

/** Todo `.mjs` da ponte, com o caminho relativo em barra normal. */
async function fontesDaPonte() {
  const nomes = await listarArquivosRecursivo(path.join(RAIZ, "bridge", "src"));
  return nomes.filter((nome) => nome.endsWith(".mjs")).map((nome) => `bridge/src/${nome}`);
}

const eDaCaptura = (relativo) => relativo.startsWith(`${DENTRO}/`);

test("só o diretório da captura conhece a biblioteca da TikTok", async () => {
  // O dia em que a via oficial sair, ou o dia em que a EulerStream cair, o
  // trabalho tem que ser reescrever UM diretório. Um `import` de
  // `tiktok-live-connector` em `nucleo.mjs` transformaria isso numa caçada.
  const vazando = [];

  for (const relativo of await fontesDaPonte()) {
    if (eDaCaptura(relativo)) continue;
    const fonte = await readFile(path.join(RAIZ, relativo), "utf8");
    if (/tiktok-live-connector|TikTokLiveConnection|WebcastEvent/.test(fonte)) vazando.push(relativo);
  }

  assert.deepEqual(
    vazando,
    [],
    "arquivo fora de bridge/src/tiktok/ conhecendo a biblioteca de captura: " +
      `trocar de mecanismo deixaria de ser reescrever um diretório — ${vazando.join(", ")}`,
  );
});

test("o painel e o console nunca tocam na captura", async () => {
  // Eles são tela. Se um dia um deles falar com a biblioteca direto, a captura
  // deixa de ter uma fronteira e passa a ter três.
  const suspeitos = [];

  for (const superficie of ["panel/src", "console/src"]) {
    const nomes = await listarArquivosRecursivo(path.join(RAIZ, superficie));
    for (const nome of nomes) {
      if (!/\.(mjs|js|jsx)$/.test(nome)) continue;
      const fonte = await readFile(path.join(RAIZ, superficie, nome), "utf8");
      if (/tiktok-live-connector|TikTokLiveConnection/.test(fonte)) suspeitos.push(`${superficie}/${nome}`);
    }
  }

  assert.deepEqual(suspeitos, [], `superfície de tela falando com a captura: ${suspeitos.join(", ")}`);
});

test("o que sai do diretório da captura é evento normalizado, não payload cru", async () => {
  // A fronteira só vale se o resto da ponte falar a língua do domínio. Se o
  // payload da TikTok atravessar inteiro, trocar de mecanismo obriga a reescrever
  // quem consome, e a mitigação vira letra morta.
  const normalizador = await readFile(path.join(RAIZ, "bridge", "src", "tiktok", "normalizador.mjs"), "utf8");

  assert.match(
    normalizador,
    /export function normalizar/,
    "é o normalizador que faz a fronteira ser fronteira",
  );

  const nucleo = await readFile(path.join(RAIZ, "bridge", "src", "nucleo.mjs"), "utf8");
  assert.ok(
    !/webcast|giftId|repeatEnd|uniqueId/i.test(nucleo),
    "o núcleo não pode falar o vocabulário da TikTok: ele fala o do domínio",
  );
});

test("a mitigação está escrita onde alguém vai procurar", async () => {
  // Teste que guarda uma regra some quando a regra sai do documento. Este par
  // existe para que apagar um lado quebre o outro.
  const adr = await readFile(
    path.join(RAIZ, "docs", "08_DECISOES", "adr-p06-uso-comercial-da-captura.md"),
    "utf8",
  );

  assert.match(adr, /\*\*Status\*\*: \*\*Aceito\*\*/, "o ADR-P06 foi decidido; se voltar a Proposto, isto avisa");
  assert.match(adr, /bridge\/src\/tiktok\//, "a mitigação nº 1 nomeia o diretório que este teste guarda");
});
