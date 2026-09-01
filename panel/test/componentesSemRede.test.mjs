/**
 * `panel/src/lib/api.js` só existe porque o CLAUDE.md e docs/06_COMPONENTES
 * proíbem componente de tocar a rede: "Toda chamada de rede passa por
 * panel/src/lib/api.js." Sem um teste que cobre essa regra, ela é só boa
 * intenção — qualquer componente novo pode chamar `fetch` ou `EventSource`
 * direto e nada acusa, até o dia em que trocar a ponte de lugar quebrar meio
 * painel de uma vez.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIR_COMPONENTES = path.join(AQUI, "..", "src", "components");

/**
 * `\bfetch\s*\(` exige um "(" logo depois (com espaço opcional), então não
 * acusa uma função local chamada `fetchPresets` — só a chamada de verdade.
 */
const CHAMA_REDE_DIRETO = /\bfetch\s*\(|\bEventSource\b/;

/**
 * Tira comentário de bloco e linha de comentário inteira antes de checar.
 * Necessário de verdade, não só cautela: MonitorAoVivo.jsx documenta a regra
 * no próprio JSDoc — "Nenhum `EventSource` e nenhuma rede aqui (CLAUDE.md)" —
 * e sem isto o teste acusaria o comentário que descreve a conformidade como
 * se fosse a violação. Mesma ideia do `semComentario` de test/jogo.test.mjs,
 * adaptada para comentário de JS/JSX em vez de Lua.
 */
function semComentarios(fonte) {
  const semBloco = fonte.replace(/\/\*[\s\S]*?\*\//g, "");
  return semBloco
    .split("\n")
    .filter((linha) => !/^\s*\/\//.test(linha))
    .join("\n");
}

/** O ÚNICO lugar onde "o padrão" é definido — real e teste de controle usam esta função. */
function chamadaDeRedeDireta(fonte) {
  const achado = CHAMA_REDE_DIRETO.exec(semComentarios(fonte));
  return achado ? achado[0] : null;
}

async function componentesJsx(dir) {
  const entradas = await readdir(dir, { withFileTypes: true });
  return entradas.filter((e) => e.isFile() && e.name.endsWith(".jsx")).map((e) => e.name);
}

async function infratores(dir) {
  const arquivos = await componentesJsx(dir);
  // Se a pasta estivesse vazia ou o caminho errado, o teste de baixo passaria
  // sem checar nada — verde por motivo errado. Falha alto e cedo nesse caso.
  assert.ok(arquivos.length > 0, `nenhum .jsx em ${dir} — caminho errado, ou pasta vazia`);

  const achados = [];
  for (const arquivo of arquivos) {
    const fonte = await readFile(path.join(dir, arquivo), "utf8");
    const achado = chamadaDeRedeDireta(fonte);
    if (achado) achados.push(`${arquivo}: "${achado}"`);
  }
  return achados;
}

/* ------------------------------------------------------------------ */

test("nenhum componente chama fetch(...) ou EventSource direto — a rede só passa por lib/api.js", async () => {
  const encontrados = await infratores(DIR_COMPONENTES);
  assert.deepEqual(
    encontrados,
    [],
    `componente falando com a rede direto (CLAUDE.md, docs/06_COMPONENTES): ${encontrados.join(", ")}`,
  );
});

test("o teste acima morde de verdade: a MESMA função pega fetch( e EventSource numa string de mentira", () => {
  // Guarda que nunca acusa passa sempre. Este projeto já foi mordido duas
  // vezes por um teste-guarda que parecia proteger e não protegia nada (ver
  // "o teste de evento solto pega um evento solto" e "o teste de segredo pega
  // um segredo de verdade" em test/jogo.test.mjs) — mesma ideia, aqui.
  const componenteComFetch = `
    export function Falso() {
      useEffect(() => {
        fetch("/api/presets").then((r) => r.json());
      }, []);
      return null;
    }
  `;
  const componenteComEventSource = `const fonte = new EventSource("/api/sessao/stream");`;

  assert.ok(chamadaDeRedeDireta(componenteComFetch), "não pegou um fetch( real");
  assert.ok(chamadaDeRedeDireta(componenteComEventSource), "não pegou um EventSource real");

  // E não pode dar falso positivo em quem já faz certo: chama a camada de api.
  const componenteCorreto = `
    import { api } from "../lib/api.js";
    export function Ok() {
      useEffect(() => { api.animacoes(); }, []);
      return null;
    }
  `;
  assert.equal(chamadaDeRedeDireta(componenteCorreto), null, "falso positivo em código que só usa lib/api.js");

  // E não confunde uma função local "fetchAlgo(" com a chamada de verdade.
  const nomeParecido = `function fetchPresets() { return api.listarPresets(); }`;
  assert.equal(chamadaDeRedeDireta(nomeParecido), null, "confundiu um nome de função com fetch(");
});

test("comentário que EXPLICA a regra não conta como violação dela — caso real de MonitorAoVivo.jsx", () => {
  // Este é o texto real do JSDoc do componente, não um exemplo inventado: sem
  // remover comentário, este teste acusaria a própria frase que documenta a
  // conformidade. Ver panel/src/components/MonitorAoVivo.jsx.
  const docComentario = `
/**
 * Só React, e tudo chega por prop: quem cuida do SSE é \`lib/useFluxo.js\`, e
 * quem o chama é o App. Nenhum \`EventSource\` e nenhuma rede aqui (CLAUDE.md).
 */
export function MonitorAoVivo() { return null; }
  `;
  assert.equal(chamadaDeRedeDireta(docComentario), null);

  // Mas a mesma chamada, fora do comentário, na mesma string, ainda tem que
  // acusar — remover comentário não pode virar brecha para esconder código.
  const comentarioEDepoisCodigo = `${docComentario}\nconst fonte = new EventSource("/api/sessao/stream");`;
  assert.ok(chamadaDeRedeDireta(comentarioEDepoisCodigo), "removeu a chamada de verdade junto com o comentário");
});

test("nenhum componente usa diálogo nativo do navegador", async () => {
  // window.confirm/alert/prompt travam o navegador inteiro, e o painel fica
  // aberto numa segunda tela DURANTE a live. Confirmação existe — o Stop da
  // barra de sessão e a troca de mapa têm — mas em dois tempos, dentro da
  // tela, no mesmo âmbar do resto do painel.
  const arquivos = (await readdir(DIR_COMPONENTES)).filter((f) => f.endsWith(".jsx"));

  const infratores = [];
  for (const arquivo of arquivos) {
    const fonte = semComentarios(await readFile(path.join(DIR_COMPONENTES, arquivo), "utf8"));
    if (/\b(window\.)?(confirm|alert|prompt)\s*\(/.test(fonte)) infratores.push(arquivo);
  }

  assert.deepEqual(infratores, []);
});

test("o teste de diálogo nativo morde de verdade", () => {
  const mentira = 'function x() { if (window.confirm("tem certeza?")) return; }';
  assert.equal(/\b(window\.)?(confirm|alert|prompt)\s*\(/.test(semComentarios(mentira)), true);
});
