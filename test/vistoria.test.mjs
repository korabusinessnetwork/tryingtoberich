/**
 * A vistoria antes da sessão no Studio (F0-2, `specs/f0-2-vistoria-antes-do-studio.md`).
 *
 * O que dá para garantir daqui: que ela não mente sobre o ambiente e que não
 * suja o repositório. O resto — a sessão em si — é do dono, no Studio.
 *
 * O ponto que mais importa é a separação entre **impedimento** e **aviso**. Ela
 * não é cosmética: impedimento é o que exige instalar coisa ou consertar o
 * place, e aviso é o que se resolve sem sair da cadeira. Confundir os dois faz
 * a vistoria mandar parar quando bastava um `npm run ponte`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { RAIZ } from "../bridge/src/repos/arquivo.mjs";
import { acharRojo, acharStudio } from "../bridge/src/roblox/estudio.mjs";

const fonte = await readFile(path.join(RAIZ, "scripts", "verificar-estudio.mjs"), "utf8");

test("a vistoria usa a MESMA busca de Studio e Rojo que o botão do painel", () => {
  // Segunda implementação divergiria do botão e mentiria sobre o que vai
  // acontecer no clique — que é justamente o que a vistoria promete prever.
  assert.match(
    fonte,
    /import \{ acharRojo, acharStudio \} from "\.\.\/bridge\/src\/roblox\/estudio\.mjs"/,
    "as funções vêm de bridge/src/roblox/estudio.mjs, não são recriadas aqui",
  );
  // A checagem persegue a RECONSTRUÇÃO do caminho, não a palavra: citar
  // "LOCALAPPDATA" numa mensagem de erro é desejável — é onde o dono vai olhar.
  // O que não pode é a vistoria andar na pasta de versões por conta própria.
  assert.ok(
    !/["']Roblox["']\s*,\s*["']Versions["']/.test(fonte),
    "a vistoria não pode reconstruir o caminho do Studio: isso é trabalho de acharStudio",
  );
  assert.ok(!/readdirSync/.test(fonte), "varrer versões à mão é a busca duplicada de novo");
});

test("as duas funções de busca continuam exportadas por quem a vistoria importa", () => {
  // Se alguém tornar `acharStudio`/`acharRojo` privadas, a vistoria quebra na
  // hora de rodar, não em teste. Este teste faz o contrato falar antes.
  assert.equal(typeof acharStudio, "function");
  assert.equal(typeof acharRojo, "function");
});

test("o build de teste sai em pasta temporária e é apagado mesmo se falhar", async () => {
  assert.match(fonte, /os\.tmpdir\(\)/, "o .rbxlx nunca nasce no repositório");
  assert.match(
    fonte,
    /finally \{[\s\S]{0,160}rm\(saida, \{ force: true \}\)/,
    "o apagar precisa estar no finally: build que falha também deixa arquivo",
  );

  // E o repositório está limpo de .rbxlx agora, que é o efeito que importa.
  const naRaizDoJogo = await readdir(path.join(RAIZ, "game"));
  assert.deepEqual(
    naRaizDoJogo.filter((a) => a.endsWith(".rbxlx") || a.endsWith(".rbxl")),
    [],
    "place montado não pode ficar versionado",
  );
});

test("nada da ponte impede começar — só avisa", () => {
  // A pergunta é "consigo COMEÇAR a sessão?". Ponte se resolve com um comando,
  // sem fechar nada. O que impede é o que exige instalar ou consertar.
  const bloco = /async function checarPonte\(\)([\s\S]*?)\n\}/.exec(fonte);
  assert.ok(bloco, "checarPonte precisa existir");

  const negativos = [...bloco[1].matchAll(/anotar\(\s*false[\s\S]{0,220}?\);/g)].map((m) => m[0]);
  assert.ok(negativos.length >= 4, `esperava as quatro falhas da ponte, achei ${negativos.length}`);

  for (const chamada of negativos) {
    assert.match(chamada, /impede: false/, `falha da ponte sem "impede: false": ${chamada.slice(0, 90)}`);
  }
});

test("Studio, Rojo, place e acervo IMPEDEM — esses não se resolvem sem trabalho", () => {
  for (const funcao of ["checarStudio", "checarRojo", "checarBuild", "checarAcervo"]) {
    const bloco = new RegExp(`function ${funcao}\\(\\)([\\s\\S]*?)\\n\\}`).exec(fonte);
    assert.ok(bloco, `${funcao} precisa existir`);
    assert.ok(
      !/impede: false/.test(bloco[1]),
      `${funcao} marcou algo como aviso, e falta de Studio/Rojo/place/acervo impede começar`,
    );
  }
});

test("a vistoria não imprime o token", () => {
  // O 11_SEGURANCA proíbe token em log, e ferramenta de diagnóstico é onde
  // alguém imprimiria "só para ajudar a depurar".
  const VALOR = /console\.log\([^)]*\$\{\s*token\s*\}|console\.log\(\s*token\b/;
  assert.ok(!VALOR.test(fonte), "o valor do token não pode ser impresso");
  assert.match(fonte, /não será impresso/, "e a vistoria diz que não imprime");
});

test("cada falha diz O QUE FAZER, não só o que faltou", () => {
  // "Rojo não encontrado" manda procurar no Google. "winget install Rojo.Rojo"
  // resolve. A diferença é a sessão acontecer hoje ou semana que vem.
  assert.match(fonte, /winget install Rojo\.Rojo/, "faltando Rojo, o comando de instalar");
  assert.match(fonte, /npm run ponte/, "ponte fora do ar, o comando de subir");
  assert.match(fonte, /npm run validar/, "acervo incompleto, para onde olhar");
});

test("fora do Windows a vistoria diz isso, em vez de fingir que o Studio sumiu", () => {
  assert.match(
    fonte,
    /process\.platform !== "win32"[\s\S]{0,260}só roda em Windows/,
    "Linux sem Studio não é Studio faltando",
  );
});

test("o roteiro da sessão existe e cobre as três perguntas", async () => {
  const roteiro = await readFile(
    path.join(RAIZ, "docs", "09_BACKLOG", "roteiro-da-sessao-no-studio.md"),
    "utf8",
  );

  for (const item of ["F0-2", "F0-7", "F0-4"]) {
    assert.ok(roteiro.includes(item), `o roteiro precisa cobrir ${item}`);
  }
  assert.match(roteiro, /npm run vistoria/, "começa pela vistoria");
  assert.match(roteiro, /npm run sondar/, "e usa a sonda do F0-7");
  assert.match(roteiro, /memory\/learnings\.md/, "e diz onde anotar cada resposta");
});

test("só impedimento derruba o código de saída — aviso não", () => {
  // A distinção precisa chegar ATÉ o exit code, senão ela é decorativa: uma
  // ponte fora do ar faria `npm run vistoria` falhar numa esteira, e a esteira
  // não tem ponte para subir.
  assert.match(
    fonte,
    /const impedimentos = itens\.filter\(\(i\) => !i\.ok && i\.impede\)/,
    "só o que impede entra na conta do exit code",
  );

  // Aviso precisa ser o complemento EXATO, senão algo cai fora das duas listas
  // e some do relatório sem ninguém notar.
  assert.match(
    fonte,
    /const avisos = itens\.filter\(\(i\) => !i\.ok && !i\.impede\)/,
    "aviso é o complemento exato de impedimento",
  );

  assert.match(fonte, /process\.exitCode = 1/, "e impedimento sai diferente de zero");

  const posExit = fonte.indexOf("process.exitCode = 1");
  const posImpedimentos = fonte.indexOf("const impedimentos");
  assert.ok(posExit > posImpedimentos, "o exit code sai depois de contar os impedimentos");
});

test("a vistoria aponta para o roteiro quando passa", () => {
  // Vistoria verde que não diz o próximo passo deixa o dono parado com um
  // terminal cheio de ✓.
  assert.match(fonte, /roteiro-da-sessao-no-studio\.md/, "o caminho do roteiro sai na tela");
});
