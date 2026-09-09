/**
 * O Estúdio de Overlay, do lado da ponte: o CATÁLOGO contra a PÁGINA.
 *
 * Duas garantias, e a primeira é a que existe para MORDER:
 *
 * 1. O catálogo da ponte e o CSS da página do HUD são DUAS ESCRITAS DOS MESMOS
 *    NÚMEROS. Divergir é o risco real: o estúdio desenharia a caixa num lugar e
 *    o OBS a mostraria em outro, e quem descobre isso é o streamer no meio da
 *    live. Este teste lê o CSS servido e confere contra o catálogo.
 * 2. A página aplica o layout ao vivo e LIMPA o que estava inline antes — é o
 *    que faz "voltar ao padrão" valer sem recarregar a fonte no OBS.
 *
 * NADA aqui encosta em disco, de propósito. O repositório é testado em
 * http.test.mjs, junto do PUT: os dois arquivos escreviam o mesmo
 * data/overlay-layout.json de verdade e `node --test` roda arquivo em paralelo,
 * então um apagava o arquivo esperando lê-lo vazio enquanto o outro gravava.
 * Flake estreito — e, entre o apagar e o restaurar, um Ctrl+C apagava de vez a
 * cena do dono, que está no .gitignore e não tem de onde voltar.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { montarOverlayHud } from "../src/http/overlay-hud.mjs";
import {
  CAM_PADRAO,
  ELEMENTOS_DO_OVERLAY,
  U_EM_Y,
  idsDoOverlay,
} from "../src/dominio/overlay-layout.mjs";

/* ---------------------------------------------------------------- */
/* (a) O espelho: catálogo × página                                  */
/* ---------------------------------------------------------------- */

/** A página do HUD, sem subir servidor: `montarOverlayHud` só registra uma rota. */
async function htmlDoHud() {
  let responder = null;
  montarOverlayHud({ get: (caminhos, fn) => { responder = fn; } });
  assert.ok(responder, "montarOverlayHud deixou de registrar a rota da página");

  let html = null;
  await responder({}, { set: () => {}, send: (corpo) => { html = corpo; } });
  return html;
}

const html = await htmlDoHud();

/** O bloco de declarações de um seletor. Nenhuma regra do HUD tem chave aninhada. */
function blocoCss(seletor) {
  const bloco = new RegExp(`\\${seletor}\\s*\\{([^}]*)\\}`).exec(html);
  assert.ok(bloco, `o seletor ${seletor} sumiu do CSS da página`);
  return bloco[1];
}

/** O número de uma declaração `propriedade: calc(N * var(--u))`. */
function unidades(seletor, propriedade) {
  const achado = new RegExp(`(?:^|[;\\s])${propriedade}:\\s*calc\\(([\\d.]+) \\* var\\(--u\\)\\)`)
    .exec(blocoCss(seletor));
  assert.ok(achado, `${seletor} perdeu a declaração ${propriedade}`);
  return Number(achado[1]);
}

const doCatalogo = (id) => {
  const elemento = ELEMENTOS_DO_OVERLAY.find((e) => e.id === id);
  assert.ok(elemento, `o catálogo não tem "${id}"`);
  return elemento;
};

const igual = (a, b, porque) => assert.ok(Math.abs(a - b) < 1e-9, `${porque}: ${a} ≠ ${b}`);

test("todo id do catálogo tem um data-el na página, e todo data-el está no catálogo", () => {
  const naPagina = [...html.matchAll(/data-el="([A-Za-z]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(naPagina, [...idsDoOverlay()].sort());
  assert.equal(naPagina.length, 8, "os oito contêineres do HUD");
});

test("a cam padrão do catálogo é a mesma do CSS da página", () => {
  // O estúdio sombreia a faixa da cam por este número. Errado, ele deixaria o
  // streamer pôr o placar em cima do próprio rosto (ADR-015).
  assert.match(html, new RegExp(`--cam:\\s*${CAM_PADRAO}%`));
});

test("as posições padrão do catálogo são as MESMAS que o CSS desenha hoje", () => {
  //[[ A guarda que morde.
  //
  // Renomear um elemento, mudar um `left` no CSS ou mexer no catálogo sem mexer
  // no outro falha aqui. Sem isto, os dois divergem calados e o sintoma é a
  // caixa cair no estúdio num lugar e no OBS em outro — descoberto ao vivo. ]]
  const doTopo = (u) => CAM_PADRAO + u * U_EM_Y;
  const daBase = (u) => 100 - u * U_EM_Y;

  const placar = doCatalogo("placar");
  igual(placar.x, unidades(".placar", "left"), "placar.x");
  igual(placar.y, doTopo(unidades(".placar", "top")), "placar.y");

  const presente = doCatalogo("presente");
  igual(presente.x, unidades(".presente", "left"), "presente.x");
  igual(presente.y, doTopo(unidades(".presente", "top")), "presente.y");

  // Estes dois nascem colados à base: o CSS diz a borda de BAIXO, o catálogo
  // diz o topo. É a soma que tem que bater.
  const portal = doCatalogo("portal");
  igual(portal.x, unidades(".portal", "left"), "portal.x");
  igual(portal.y + portal.altura, daBase(unidades(".portal", "bottom")), "a base do portal");

  const seguidor = doCatalogo("seguidor");
  igual(seguidor.x + seguidor.largura, 100 - unidades(".seguidor", "right"), "a direita do seguidor");
  igual(seguidor.y + seguidor.altura, daBase(unidades(".seguidor", "bottom")), "a base do seguidor");
});

test("todo elemento do catálogo cabe no palco e diz por qual ponta o CSS o prende", () => {
  const ancoras = new Set(["esquerda-topo", "centro-topo", "direita-topo", "esquerda-base", "direita-base", "faixa-topo"]);
  for (const elemento of ELEMENTOS_DO_OVERLAY) {
    assert.ok(elemento.rotulo && elemento.descricao, `${elemento.id} sem nome legível para o estúdio`);
    assert.ok(ancoras.has(elemento.ancora), `${elemento.id} com âncora desconhecida: ${elemento.ancora}`);
    assert.ok(elemento.x >= 0 && elemento.x + elemento.largura <= 100.001, `${elemento.id} nasce fora do palco em X`);
    assert.ok(elemento.y >= 0 && elemento.y + elemento.altura <= 100.001, `${elemento.id} nasce fora do palco em Y`);
    // Nada nasce sobre a cam: é a regra do ADR-015, e o catálogo é quem a
    // documenta em número para o estúdio poder sombrear a faixa.
    assert.ok(elemento.y >= CAM_PADRAO, `${elemento.id} nasce em cima da cam`);
  }
});

test("a faixa central tem LARGURA explícita: sem ela, mover a caixa descentraliza a contagem", () => {
  //[[ Descoberto ao vivo é o pior jeito de descobrir isto.
  //
  // O `.centro` é uma faixa de largura cheia por `left: 0; right: 0`, e o
  // `align-items: center` centra o TOPO! / CAIU! e o número da contagem dentro
  // dela. Mas o `aoLayout` escreve `right: auto` sempre que houver um `x`
  // salvo — e o estúdio SEMPRE grava x, mesmo quando o streamer só arrasta na
  // vertical ou só mexe na escala. Sem largura, a faixa vira shrink-to-fit e o
  // número de 16u passa a centrar dentro do próprio conteúdo: sai do meio do
  // vídeo e cola na esquerda. O estúdio desenharia um retângulo de largura
  // cheia e o OBS mostraria outra coisa. ]]
  assert.equal(unidades(".centro", "width"), 100, "a faixa central precisa da largura do palco, e não só de left/right");
  assert.match(blocoCss(".centro"), /right:\s*0/, "sem o right: 0 ela nem nasce centrada");
});

/* ---------------------------------------------------------------- */
/* (b) A página                                                      */
/* ---------------------------------------------------------------- */

test("a página ouve o evento `layout` do SSE: é o que dispensa recarregar a fonte no OBS", () => {
  assert.match(html, /ouvir\("layout", aoLayout\)/);
});

test("a página LIMPA o inline antes de aplicar — sem isso, 'voltar ao padrão' só valeria recarregando", () => {
  const limpeza = html.indexOf('caixa.style.left = "";');
  const aplicacao = html.indexOf('caixa.style.left = ajuste.x');
  assert.ok(limpeza > 0, "a página não limpa o left inline");
  assert.ok(aplicacao > limpeza, "a página aplica antes de limpar: a posição de ontem sobrevive");

  for (const propriedade of ["right", "top", "bottom", "display"]) {
    assert.ok(html.includes(`caixa.style.${propriedade} = "";`), `${propriedade} inline nunca é limpo`);
  }
  for (const variavel of ["--escala", "--desloc"]) {
    assert.ok(html.includes(`caixa.style.removeProperty("${variavel}")`), `${variavel} inline nunca é limpo`);
  }
});

test("a escala é variável CSS dentro do transform, nunca transform inline", () => {
  //[[ O `.vs` e o `.seguidor` dependem do próprio transform.
  //
  // Um `style.transform` inline apagaria o translateX que centraliza o VS e o
  // que faz o aviso de seguidor deslizar para dentro da tela. Por variável, os
  // dois convivem — e sem layout salvo o fallback 1 deixa tudo como estava. ]]
  assert.match(html, /transform: translateX\(var\(--desloc, -50%\)\) scale\(var\(--escala, 1\)\)/);
  assert.match(html, /\.seguidor\.aparecendo \{ opacity: 1; transform: translateX\(0\) scale\(var\(--escala, 1\)\); \}/);
  assert.equal(/caixa\.style\.transform\s*=/.test(html), false, "transform inline mataria a entrada do seguidor");
});

test("o layout não trouxe vw solto nem vazou placeholder de template para o HTML", () => {
  // As duas armadilhas que já quebraram este módulo. A crase e o dólar-chave
  // fecham a string de template e derrubam o import inteiro; o vw ignora o
  // palco 9:16 e deforma a página no LIVE Studio.
  const semFallback = html.replace(/--u:\s*1vw;/, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/\d(\.\d+)?vw\b/.test(semFallback), "tamanho em vw ignora o palco 9:16; use a unidade --u");
  assert.ok(!html.includes("${"), "placeholder de template vazou para o HTML");
});
