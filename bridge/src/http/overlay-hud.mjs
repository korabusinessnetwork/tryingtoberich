/**
 * O HUD da live, para entrar como Browser Source no OBS ou no TikTok LIVE
 * Studio (ADR-015).
 *
 * O `hud.client.lua` foi apagado e quase tudo que ele mostrava mora aqui:
 * placar, barra do portal, contagem regressiva, presente que chegou, selo de
 * vitória. Dois HUDs desenhando as mesmas coisas em cima um do outro era o que
 * o dono via na tela, e não havia como alinhá-los: um vive dentro da captura do
 * Roblox e o outro por cima dela.
 *
 * A EXCEÇÃO é a barra da torre, que voltou para dentro do jogo
 * (`game/src/client/torre.client.lua`) por decisão do dono. O motivo é
 * contagem: aqui ela só andaria quando um estado chegasse da ponte, e o estado
 * sai no máximo a cada 2s — o streamer subia três degraus e a barra ficava
 * parada. Lá ela ouve o mesmo evento que o servidor publica a cada TOQUE de
 * plataforma.
 *
 * Por que o overlay ganhou a disputa em vez do jogo: ícone de presente da
 * TikTok não entra no Roblox (não há como subir um asset por presente do
 * catálogo), a metade de cima da tela é a CAM, onde o jogo não alcança, e o
 * aviso de seguidor vem da ponte, que é quem fala com a TikTok.
 *
 * O que NÃO existe aqui, por decisão do dono: ranking de doadores, pote de
 * moedas, maior combo e maior presente. Tudo que media quanto alguém pagou
 * saiu, para a live não correr risco de restrição. O que sobrou fala do
 * PRESENTE — o que ele faz com a torre — e nunca de quem mandou.
 *
 * Tudo vem do SSE que o painel já usa: `estado` traz posição, placar, portal e
 * contagem; `hud` traz a disputa da rodada; `presente` e `combateAnulado`, o
 * que acabou de acontecer; `seguidor`, o follow novo; `layout`, a cena que o
 * estúdio salvou. `/api/hud` traz a legenda dos slots. Nada é calculado aqui —
 * a página só desenha.
 *
 * O fim de rodada chega pelo `estado.contagem`, e NÃO pelo evento `rodada`: a
 * página não assina esse canal. Estava listado aqui e mandava o próximo leitor
 * procurar bug num evento que ela nunca recebe.
 *
 * TUDO fica na área do JOGO, nada sobre a cam. É de propósito: a proporção da
 * cam varia por cena, e um `?cam=` errado colocava o TOP COMBO e a barra VS em
 * cima do rosto do streamer. Com a cam livre, errar o parâmetro só desloca um
 * pouco o conjunto, e nunca cobre a pessoa.
 *
 * Parâmetros na URL, para caber na cena de cada um:
 *   ?cam=33      altura da área da cam, em % da tela (o resto é o jogo)
 *   ?esticar=nao desliga o pré-estique (ver o palco 9:16, abaixo)
 *
 * Nenhuma cor literal: as variáveis vêm de data/tokens.json (repos/tokens).
 *
 * Nenhum texto literal, pelo MESMO caminho das cores: as frases vêm de
 * data/i18n (repos/i18n), recortadas no prefixo `hud.` e injetadas na página
 * como JSON. Esta página não tem bundler e não pode importar módulo nenhum, e
 * é por isso que o catálogo entra por aqui em vez de por import (ADR-P03).
 *
 * O idioma é o do streamer, lido da configuração NA ABERTURA da página — ver
 * `idiomaDoStreamer`, no fim do arquivo.
 */

import { carregarConfiguracao } from "../repos/configuracao.mjs";
import { carregarTextos, normalizarIdioma, recortar } from "../repos/i18n.mjs";
import { carregarTokens, cssDosTokens } from "../repos/tokens.mjs";

/**
 * O locale de cada idioma: o `lang` da página e o `Intl` que formata os números
 * do HUD. Não é frase visível, então não mora no catálogo, que só guarda texto
 * de tela. Em `pt` o resultado é o mesmo `pt-BR` de sempre.
 */
const LOCALE = { pt: "pt-BR", es: "es-ES", en: "en-US" };

/** O texto da chave; a chave crua é a rede quando falta tradução (ver o `t()` da página). */
const diz = (textos, chave) => textos[chave] ?? chave;

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

/** Texto indo para dentro da marcação. */
const emHtml = (texto) => String(texto).replace(/[&<>"]/g, (c) => ESCAPES[c]);

/** O catálogo indo para dentro de um `<script>`: um `</script>` no meio fecharia a tag. */
const emScript = (valor) => JSON.stringify(valor).replace(/</g, "\\u003c");

/**
 * O helper de texto chama-se `t` em toda parte — aqui, no corpo da página e no
 * `t()` que roda no navegador. Além de ser o nome do painel e do Luau, é a
 * FORMA que o detector de chave morta do `test/i18n.test.mjs` reconhece: chave
 * escondida atrás de outro nome vira "chave sem uso" e some do catálogo.
 */
const paginaInicio = (idioma, textos) => {
  const t = (chave) => emHtml(diz(textos, chave));
  return `<!doctype html>
<html lang="${LOCALE[idioma]}">
<head>
<meta charset="utf-8">
<title>${t("hud.overlay.pageTitle")}</title>
<style>
`;
};

// Depois das variáveis dos tokens. Sem hex nenhum: o que precisa de cor usa
// var(), e o fundo translúcido das caixas é o --painel-fundo com opacity num
// pseudo-elemento — funciona no Chromium antigo que o OBS embute.
const PAGINA_ESTILO = `
:root {
  /* A unidade do PALCO: 1% da largura de um palco 9:16 montado pela altura da
     janela. O script recalcula; 1vw é o que vale antes dele rodar e numa
     janela que já é 9:16. Nunca vw direto: a fonte "Link" do LIVE Studio
     renderiza em paisagem e estica para a cena vertical (02_DESIGN_SYSTEM, C). */
  --u: 1vw;
  --cam: 33%;
  --sombra: 0 calc(0.15 * var(--u)) calc(0.5 * var(--u)) var(--hud-contorno);
  /* O sinal vai DENTRO do calc(). Um menos ANTES do calc() não existe em CSS:
     invalida a declaração inteira e o text-shadow some sem erro nenhum, que foi
     como o texto do HUD ficou sem contorno sobre a captura (BUG-006). */
  --contorno:
    calc(-0.12 * var(--u)) calc(-0.12 * var(--u)) 0 var(--hud-contorno),  calc(0.12 * var(--u)) calc(-0.12 * var(--u)) 0 var(--hud-contorno),
    calc(-0.12 * var(--u))  calc(0.12 * var(--u)) 0 var(--hud-contorno),  calc(0.12 * var(--u))  calc(0.12 * var(--u)) 0 var(--hud-contorno),
     0 calc(0.25 * var(--u)) calc(0.6 * var(--u)) var(--hud-contorno);
}
html, body {
  margin: 0; padding: 0; height: 100%; overflow: hidden;
  background: transparent;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  font-weight: 800;
  color: var(--hud-texto);
  -webkit-font-smoothing: antialiased;
}

/* O palco 9:16. Largura = 100 unidades; altura = 16/9 disso. Colado à esquerda
   e centrado na vertical; o script aplica scaleX quando a janela é mais larga
   que o palco. */
.hud {
  position: absolute; left: 0; top: calc((100vh - 177.78 * var(--u)) / 2);
  width: calc(100 * var(--u)); height: calc(177.78 * var(--u));
  transform-origin: 0 0;
  pointer-events: none;
}

/* A cam fica LIVRE. Nada é desenhado aqui — ver o cabeçalho. */
.jogo { position: absolute; left: 0; right: 0; top: var(--cam); bottom: 0; }

.texto { text-shadow: var(--contorno); }

.caixa { position: absolute; border-radius: calc(1.4 * var(--u)); }
.caixa::before {
  content: ""; position: absolute; inset: 0; border-radius: inherit;
  background: var(--painel-fundo); opacity: 0.72;
}
.caixa > * { position: relative; }

/* A ESCALA do Estúdio de Overlay, em cada um dos oito contêineres.
   Por variável dentro do transform, e nunca por transform inline: o .vs
   depende do translateX que o centraliza e o .seguidor do translateX que o
   faz deslizar para dentro da tela. Um transform inline apagaria os dois, e o
   sintoma seria o VS colado à esquerda e o aviso de seguidor entrando parado.
   Sem layout salvo, --escala não existe e o fallback 1 deixa tudo como estava. */

/* ---- faixa de cima do jogo: placar à esquerda, VS no meio ---- */
.placar {
  left: calc(2.5 * var(--u)); top: calc(2 * var(--u));
  transform: scale(var(--escala, 1)); transform-origin: 0 0;
  display: flex; align-items: center; gap: calc(1.2 * var(--u));
  padding: calc(0.6 * var(--u)) calc(1.6 * var(--u)) calc(0.8 * var(--u));
  font-size: calc(2.4 * var(--u)); line-height: 1;
}
.placar-v { color: var(--hud-subida); }
.placar-d { color: var(--hud-descida); }

/* Centralizado na TELA, não no espaço que sobra à direita do placar: a disputa
   é o que a plateia acompanha, e o eixo dela é o meio do vídeo. O placar fica
   antes, no canto, porque é consulta e não acontecimento. */
.vs {
  /* O --desloc é o que o estúdio zera ao MOVER o VS: com um x salvo, o left
     passa a ser a borda esquerda de verdade, e o -50% herdado o jogaria meia
     largura para a esquerda do lugar que o streamer escolheu. */
  left: 50%; transform: translateX(var(--desloc, -50%)) scale(var(--escala, 1)); transform-origin: 50% 0;
  top: calc(2 * var(--u));
  width: calc(46 * var(--u));
  display: flex; align-items: center; justify-content: space-between;
  padding: calc(0.6 * var(--u)) calc(2 * var(--u)) calc(1.2 * var(--u)); border-radius: 999px;
  font-size: calc(2.2 * var(--u)); line-height: 1;
  overflow: hidden;
}
.vs-descida { color: var(--hud-descida); }
.vs-subida { color: var(--hud-subida); }
.vs-selo {
  font-size: calc(1.2 * var(--u)); color: var(--hud-contorno); background: var(--hud-combate);
  padding: calc(0.3 * var(--u)) calc(0.8 * var(--u)); border-radius: calc(0.5 * var(--u));
}
/* O medidor: a fatia vermelha cresce com a descida, o resto é a subida. */
.vs-medidor {
  position: absolute; left: 0; right: 0; bottom: 0; height: calc(0.6 * var(--u));
  background: var(--hud-subida); display: flex; opacity: 0.9;
}
.vs-medidor-descida { width: 50%; background: var(--hud-descida); transition: width 400ms ease-out; }

/* ---- legenda dos presentes (o que cada um faz com a torre) ---- */
.legenda {
  position: absolute; top: calc(9 * var(--u)); margin: 0; padding: 0; list-style: none;
  display: flex; flex-direction: column; gap: calc(1.2 * var(--u));
  transform: scale(var(--escala, 1)); transform-origin: 0 0;
  /* O TETO da faixa, no código e não na disciplina de quem monta o preset.
     Cada item mede ~7,2u (ícone 6u + gap 1,2u) e o preset agora vai a 24 slots
     (R1 emendada), com o "ausente = true" da legenda valendo para todo preset
     que já está em disco: um arquivo editado à mão (ADR-003) manda os 24 para
     cá, a coluna passa dos 170u e desce por cima do portal, do presente e do
     boneco — o que o 02_DESIGN_SYSTEM, C proíbe. Em % de .jogo, e não num
     número de unidades, porque a faixa do jogo encolhe com o ?cam= da cena. O
     corte cai nos ÚLTIMOS itens, que são os de menor delta: a ponte manda a
     legenda ordenada pela força do empurrão. */
  max-height: calc(100% - 12 * var(--u)); overflow: hidden;
}
.legenda-esquerda { left: calc(2.5 * var(--u)); align-items: flex-start; }
/* Origem à direita nos que nascem colados a ela: escalar cresce para DENTRO da
   tela, e não para fora dela, onde o OBS corta sem avisar. */
.legenda-direita { right: calc(2.5 * var(--u)); align-items: flex-end; transform-origin: 100% 0; }
.legenda-item { display: flex; align-items: center; gap: calc(0.8 * var(--u)); }
.legenda-direita .legenda-item { flex-direction: row-reverse; }
.legenda-icone { width: calc(6 * var(--u)); height: calc(6 * var(--u)); object-fit: contain; filter: drop-shadow(var(--sombra)); }
.legenda-icone[hidden] { display: none; }
.legenda-nome { font-size: calc(1.4 * var(--u)); max-width: calc(12 * var(--u)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.legenda-delta { font-size: calc(2.8 * var(--u)); line-height: 1; }
.subida { color: var(--hud-subida); }
.descida { color: var(--hud-descida); }


/* ---- portal do primeiro andar: a barra que segura a derrota ---- */
.portal {
  left: calc(2.5 * var(--u)); bottom: calc(14 * var(--u)); width: calc(40 * var(--u));
  transform: scale(var(--escala, 1)); transform-origin: 0 0;
  padding: calc(0.8 * var(--u)) calc(1.2 * var(--u)) calc(1 * var(--u));
  display: flex; flex-direction: column; gap: calc(0.5 * var(--u));
}
.portal[hidden] { display: none; }
.portal-rotulo {
  font-size: calc(1.2 * var(--u)); letter-spacing: 0.12em; color: var(--painel-texto-secundario);
  display: flex; justify-content: space-between;
}
.portal-trilho {
  height: calc(1.6 * var(--u)); border-radius: 999px; overflow: hidden;
  border: calc(0.25 * var(--u)) solid var(--hud-contorno); background: var(--painel-borda);
}
.portal-nivel { height: 100%; width: 100%; background: var(--hud-descida); transition: width 300ms ease-out; }

/* ---- presente que acabou de chegar (o presente, nunca quem mandou) ---- */
.presente {
  left: calc(2.5 * var(--u)); top: calc(46 * var(--u)); max-width: calc(44 * var(--u));
  transform: scale(var(--escala, 1)); transform-origin: 0 0;
  padding: calc(1 * var(--u)) calc(1.4 * var(--u)) calc(1.2 * var(--u));
  display: flex; flex-direction: column; gap: calc(0.3 * var(--u));
  opacity: 0; transition: opacity 160ms linear;
}
.presente.aparecendo { opacity: 1; }
.presente-delta { font-size: calc(4 * var(--u)); line-height: 1; }
.presente-nome { font-size: calc(1.8 * var(--u)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.presente-disputa { font-size: calc(1.3 * var(--u)); color: var(--hud-combate); }
.presente-disputa[hidden] { display: none; }

/* ---- contagem regressiva e selo de fim de rodada, no centro ---- */
.centro {
  /* A largura vai EXPLÍCITA, e não só por left/right: ao mover a caixa, o
     aoLayout escreve right: auto — e o estúdio sempre grava x, mesmo quando o
     streamer só arrasta na vertical. Sem a largura, a faixa vira shrink-to-fit
     e o align-items passa a centrar dentro do conteúdo, não dentro do vídeo: o
     número de 16u sai do meio da tela e cola na esquerda. Sem layout salvo o
     resultado é idêntico ao de antes. */
  position: absolute; left: 0; right: 0; width: calc(100 * var(--u)); top: calc(56 * var(--u));
  display: flex; flex-direction: column; align-items: center; gap: calc(0.5 * var(--u));
  /* Origem no meio porque esta faixa ocupa a largura toda e centraliza o texto:
     escalar pela esquerda empurraria a contagem regressiva para o canto. Ao
     mover, o estúdio troca a origem por 0 0, que é quando ela vira caixa. */
  transform: scale(var(--escala, 1)); transform-origin: 50% 0;
  opacity: 0; transition: opacity 200ms linear;
}
.centro.aparecendo { opacity: 1; }
.centro-resultado { font-size: calc(5 * var(--u)); line-height: 1; letter-spacing: 0.04em; }
.centro-numero { font-size: calc(16 * var(--u)); line-height: 0.95; font-variant-numeric: tabular-nums; }
.centro-numero[hidden] { display: none; }

/* ---- aviso de seguidor, canto inferior direito ---- */
.seguidor {
  right: calc(2.5 * var(--u)); bottom: calc(3 * var(--u)); max-width: calc(52 * var(--u));
  padding: calc(1 * var(--u)) calc(1.6 * var(--u)) calc(1.2 * var(--u));
  border-left: calc(0.5 * var(--u)) solid var(--estado-vitoria);
  display: flex; flex-direction: column; gap: calc(0.2 * var(--u));
  /* A escala entra NA MESMA declaração do deslize. Em declarações separadas a
     última venceria e mataria a entrada — o aviso apareceria parado. */
  opacity: 0; transform: translateX(calc(4 * var(--u))) scale(var(--escala, 1)); transform-origin: 100% 0;
  transition: opacity 240ms ease-out, transform 240ms ease-out;
}
.seguidor.aparecendo { opacity: 1; transform: translateX(0) scale(var(--escala, 1)); }
.seguidor-nome {
  font-size: calc(2.4 * var(--u)); line-height: 1.1; color: var(--estado-vitoria);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.seguidor-frase { font-size: calc(1.7 * var(--u)); line-height: 1.2; }

@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
</head>
`;

/**
 * O corpo da página, com os textos do idioma já dentro.
 *
 * Função, e não constante, por causa do idioma: o mesmo HTML sai em três
 * versões, e cada uma é montada uma vez e guardada (ver `pagina`).
 */
const corpoDaPagina = (idioma, textos) => {
  // O `t` da MARCAÇÃO, resolvido aqui na ponte; o `t` de dentro do `<script>` é
  // outro, e resolve no navegador o texto que muda em cima do evento. Mesmo
  // nome de propósito — ver `paginaInicio`.
  const t = (chave) => emHtml(diz(textos, chave));
  const textosDaPagina = emScript(textos);
  return `<body>
<div class="hud">
  <section class="jogo">

    <div class="placar caixa" data-el="placar">
      <span class="placar-v texto"><span id="placar-vitorias">0</span> ${t("hud.overlay.winsShort")}</span>
      <span class="placar-d texto"><span id="placar-derrotas">0</span> ${t("hud.overlay.lossesShort")}</span>
    </div>

    <div class="vs caixa" data-el="vs">
      <span class="vs-descida texto" id="vs-descida">-0</span>
      <span class="vs-selo">${t("hud.overlay.versus")}</span>
      <span class="vs-subida texto" id="vs-subida">+0</span>
      <div class="vs-medidor"><div class="vs-medidor-descida" id="vs-medidor-descida"></div></div>
    </div>

    <ul class="legenda legenda-esquerda" id="legenda-subida" data-el="legendaSubida"></ul>
    <ul class="legenda legenda-direita" id="legenda-descida" data-el="legendaDescida"></ul>


    <div class="portal caixa" id="portal" data-el="portal" hidden>
      <div class="portal-rotulo"><span>${t("hud.overlay.portal")}</span><span id="portal-numero">0</span></div>
      <div class="portal-trilho"><div class="portal-nivel" id="portal-nivel"></div></div>
    </div>

    <div class="presente caixa" id="presente" data-el="presente">
      <span class="presente-delta texto" id="presente-delta">+0</span>
      <span class="presente-nome texto" id="presente-nome"></span>
      <span class="presente-disputa" id="presente-disputa" hidden></span>
    </div>

    <div class="centro" id="centro" data-el="centro">
      <span class="centro-resultado texto" id="centro-resultado"></span>
      <span class="centro-numero texto" id="centro-numero" hidden></span>
    </div>

    <div class="seguidor caixa" id="seguidor" data-el="seguidor">
      <span class="seguidor-nome texto" id="seguidor-nome"></span>
      <span class="seguidor-frase texto">${t("hud.overlay.newFollower")}</span>
    </div>

  </section>
</div>

<script>
(function () {
  //[[ Os textos da tela, recortados do catálogo pela ponte.
  //
  // A chave CRUA é a rede quando o catálogo não tem a frase: um HUD escrito
  // "hud.overlay.tie" é feio, e uma página que quebra deixa a live sem HUD
  // nenhum. Mesma escolha do painel (spec, edge cases). ]]
  var T = ${textosDaPagina};
  function t(chave, valores) {
    var texto = T[chave] || chave;
    for (var nome in valores) {
      // split/join, e não replace com string: o replace troca só a PRIMEIRA
      // ocorrência, e a mesma marca pode aparecer duas vezes numa tradução.
      texto = texto.split("{" + nome + "}").join(valores[nome]);
    }
    return texto;
  }

  var params = new URLSearchParams(location.search);
  var cam = Number(params.get("cam"));
  if (cam > 0 && cam < 100) document.documentElement.style.setProperty("--cam", cam + "%");
  // Guardado NUMA VARIAVEL, e nao so no CSS: o layout do estudio chega em % do
  // palco inteiro, e converter para dentro de .jogo exige saber onde a cam
  // termina. 33 e o mesmo padrao do --cam do CSS e do catalogo da ponte.
  else cam = 33;
  var preEsticar = params.get("esticar") !== "nao";

  //[[ O palco 9:16, e o pré-estique.
  //
  // A fonte "Link" do LIVE Studio renderiza a página em paisagem (16:9) e o
  // streamer estica o item para preencher a cena vertical: com tamanhos em vw
  // tudo saía 3x mais alto que largo. Aqui a página monta um palco 9:16 pela
  // altura da janela, mede tudo em centésimos da largura dele (--u), e — se a
  // janela for mais larga que o palco — estica em X na mesma razão, para o
  // estique da fonte devolver a proporção certa. Numa fonte 9:16 (OBS com
  // 1080x1920) a razão é 1 e nada acontece. ]]
  var PROPORCAO = 9 / 16;
  var palco = document.querySelector(".hud");
  function ajustar() {
    var largura = window.innerWidth, altura = window.innerHeight;
    if (!(largura > 0 && altura > 0)) return;
    var larguraDoPalco = Math.min(largura, altura * PROPORCAO);
    document.documentElement.style.setProperty("--u", (larguraDoPalco / 100) + "px");
    var razao = largura / larguraDoPalco;
    palco.style.transform = preEsticar && razao > 1.01 ? "scaleX(" + razao.toFixed(4) + ")" : "";
  }
  ajustar();
  window.addEventListener("resize", ajustar);

  // Qual preset está no ar E em que versão dele. Os dois, porque trocar de
  // preset e mexer nos slots do mesmo preset são coisas diferentes e as duas
  // mudam a legenda.
  var presetNoAr = null;

  var formatar = function (n) {
    // O locale acompanha o idioma do streamer: em espanhol e inglês o separador
    // de milhar do HUD é o do público que lê a live, não o do dono da conta.
    return new Intl.NumberFormat("${LOCALE[idioma]}").format(Math.max(0, Math.round(Number(n) || 0)));
  };
  function texto(id, valor) { document.getElementById(id).textContent = valor; }

  /* ---- disputa da rodada ---- */
  function aoHud(hud) {
    if (!hud) return;
    var disputa = hud.disputa || { subida: 0, descida: 0 };
    texto("vs-descida", "-" + formatar(disputa.descida));
    texto("vs-subida", "+" + formatar(disputa.subida));
    var total = (Number(disputa.descida) || 0) + (Number(disputa.subida) || 0);
    document.getElementById("vs-medidor-descida").style.width =
      (total > 0 ? (disputa.descida / total) * 100 : 50) + "%";
  }

  /* ---- contagem regressiva: tica sozinha entre um estado e outro ---- */
  var contagem = null;      // { resultado, terminaEm } em relógio LOCAL
  var tiquetaque = null;
  var centro = document.getElementById("centro");

  function pintarCentro() {
    if (!contagem) { centro.classList.remove("aparecendo"); return; }
    var restante = Math.max(0, contagem.terminaEm - Date.now());
    // Duas chamadas, e não uma com a chave escolhida dentro: a chave fica
    // LITERAL no código, que é o que o detector de chave morta enxerga.
    texto("centro-resultado", contagem.resultado === "vitoria"
      ? t("hud.overlay.roundWin")
      : t("hud.overlay.roundLoss"));
    document.getElementById("centro-resultado").style.color =
      contagem.resultado === "vitoria" ? "var(--hud-subida)" : "var(--hud-descida)";
    var numero = document.getElementById("centro-numero");
    numero.hidden = false;
    numero.textContent = String(Math.ceil(restante / 1000));
    centro.classList.add("aparecendo");
    if (restante <= 0) pararContagem();
  }

  function pararContagem() {
    contagem = null;
    clearInterval(tiquetaque);
    tiquetaque = null;
    centro.classList.remove("aparecendo");
  }

  function aoContagem(dados) {
    if (!dados || typeof dados.restanteMs !== "number") { pararContagem(); return; }
    // O estado manda o tempo QUE FALTA; o relógio de quem desenha é o daqui.
    contagem = { resultado: dados.resultado, terminaEm: Date.now() + dados.restanteMs };
    if (!tiquetaque) tiquetaque = setInterval(pintarCentro, 200);
    pintarCentro();
  }

  /* ---- estado do jogo: torre, placar, portal, contagem ---- */
  function aoEstado(estado) {
    if (!estado) return;

    texto("placar-vitorias", formatar(estado.vitorias));
    texto("placar-derrotas", formatar(estado.derrotas));

    var portal = estado.portal;
    var caixaPortal = document.getElementById("portal");
    if (portal && portal.aberto && Number(portal.vidaMaxima) > 0) {
      caixaPortal.hidden = false;
      var vida = Math.max(0, Number(portal.vida) || 0);
      texto("portal-numero", formatar(vida));
      document.getElementById("portal-nivel").style.width = (vida / portal.vidaMaxima) * 100 + "%";
    } else {
      caixaPortal.hidden = true;
    }

    aoContagem(estado.contagem);

    //[[ A legenda segue o preset que está no ar, e as MEXIDAS nele.
    //
    // Preset trocado no meio da live é o R7. Mas o streamer também troca os
    // presentes DENTRO do preset que já está rodando, e isso não muda o id —
    // a legenda ficava anunciando o presente que ele acabou de tirar. O
    // carimbo presetAtualizadoEm anda a cada salvar, e é ele que pega o
    // segundo caso. ]]
    var assinatura = (estado.presetId || "") + "@" + (estado.presetAtualizadoEm || "");
    if (assinatura !== presetNoAr) {
      presetNoAr = assinatura;
      carregarLegenda();
    }
  }

  /* ---- presente que chegou: o PRESENTE, nunca quem mandou ---- */
  var caixaPresente = document.getElementById("presente");
  var sumirPresente = null;

  function aoPresente(dados) {
    if (!dados) return;
    var delta = Number(dados.delta) || 0;
    var rotulo = document.getElementById("presente-delta");
    rotulo.textContent = (delta > 0 ? "+" : "-") + formatar(Math.abs(delta));
    rotulo.className = "presente-delta texto " + (delta > 0 ? "subida" : "descida");
    texto("presente-nome", dados.presenteNome || "");

    var disputa = dados.disputa;
    var linha = document.getElementById("presente-disputa");
    if (disputa && disputa.contestado) {
      linha.hidden = false;
      linha.textContent = t("hud.overlay.contested", {
        up: formatar(disputa.somaSubida),
        down: formatar(disputa.somaDescida),
      });
    } else {
      linha.hidden = true;
    }

    caixaPresente.classList.add("aparecendo");
    clearTimeout(sumirPresente);
    sumirPresente = setTimeout(function () { caixaPresente.classList.remove("aparecendo"); }, 3000);
  }

  function aoCombateAnulado(dados) {
    if (!dados) return;
    var rotulo = document.getElementById("presente-delta");
    // Este rótulo tem TETO DE 8 CARACTERES (02_DESIGN_SYSTEM, B): é o mesmo
    // lugar onde o "+100" do presente aparece, no maior corpo da caixa.
    rotulo.textContent = t("hud.overlay.tie");
    rotulo.className = "presente-delta texto";
    rotulo.style.color = "var(--hud-combate)";
    texto("presente-nome", t("hud.overlay.tieDetail", {
      up: formatar(dados.somaSubida),
      down: formatar(dados.somaDescida),
    }));
    document.getElementById("presente-disputa").hidden = true;
    caixaPresente.classList.add("aparecendo");
    clearTimeout(sumirPresente);
    sumirPresente = setTimeout(function () {
      caixaPresente.classList.remove("aparecendo");
      rotulo.style.color = "";
    }, 3000);
  }

  /* ---- seguidor novo ---- */
  var caixaSeguidor = document.getElementById("seguidor");
  var sumirSeguidor = null;

  function aoSeguidor(dados) {
    if (!dados || typeof dados.nome !== "string" || !dados.nome) return;
    // textContent, nunca innerHTML: o nome vem da TikTok e não é confiável.
    texto("seguidor-nome", dados.nome);
    caixaSeguidor.classList.add("aparecendo");
    clearTimeout(sumirSeguidor);
    sumirSeguidor = setTimeout(function () { caixaSeguidor.classList.remove("aparecendo"); }, 6000);
  }

  /* ---- legenda dos slots ---- */
  function itemDaLegenda(slot) {
    var li = document.createElement("li");
    li.className = "legenda-item";
    var img = document.createElement("img");
    img.className = "legenda-icone";
    img.alt = "";
    var nome = document.createElement("span");
    nome.className = "legenda-nome texto";
    nome.textContent = slot.nome;
    nome.hidden = Boolean(slot.iconeUrl);
    if (slot.iconeUrl) {
      img.src = slot.iconeUrl;
      img.onerror = function () { img.hidden = true; nome.hidden = false; };
    } else {
      img.hidden = true;
    }
    var delta = document.createElement("span");
    delta.className = "legenda-delta texto " + (slot.delta > 0 ? "subida" : "descida");
    delta.textContent = (slot.delta > 0 ? "+" : "-") + formatar(Math.abs(slot.delta));
    li.appendChild(img); li.appendChild(nome); li.appendChild(delta);
    return li;
  }

  function desenharLegenda(dados) {
    var subida = document.getElementById("legenda-subida");
    var descida = document.getElementById("legenda-descida");
    subida.textContent = ""; descida.textContent = "";
    (dados && dados.slots ? dados.slots : []).forEach(function (slot) {
      (slot.delta > 0 ? subida : descida).appendChild(itemDaLegenda(slot));
    });
  }

  function carregarLegenda() {
    fetch("/api/hud")
      .then(function (r) { return r.json(); })
      .then(desenharLegenda)
      .catch(function (erro) { console.warn("[kora] legenda nao carregou:", erro); });
  }

  //[[ O layout do Estudio de Overlay.
  //
  // Chega pelo SSE, tanto na assinatura quanto a cada salvar do painel: e isso
  // que deixa o streamer arrastar uma caixa e ver a fonte do OBS se ajustar sem
  // tocar no programa de captura, que e justamente o que ninguem consegue fazer
  // no meio de uma live.
  //
  // O elemento AUSENTE do layout fica onde o CSS o pos. Por isso cada volta
  // LIMPA o inline antes de aplicar: sem isso, "voltar ao padrao" so valeria
  // depois de recarregar a fonte, porque o left de ontem continuaria escrito no
  // atributo style, que vence qualquer folha de estilo.
  //
  // A conversao do y: ele vem em % da ALTURA DO PALCO, contado do topo do
  // video, mas estes elementos moram dentro de .jogo, que comeca onde a cam
  // termina. Descontar o cam REAL desta URL e o que faz a caixa cair onde o
  // estudio mostrou em qualquer cena, e nao so na de quem salvou. 1,7778 e a
  // altura do palco em unidades --u dividida por 100 (177,78 / 100). ]]
  var caixasDoLayout = null;

  function aoLayout(layout) {
    if (!caixasDoLayout) caixasDoLayout = document.querySelectorAll("[data-el]");
    var elementos = (layout && layout.elementos) || {};

    for (var i = 0; i < caixasDoLayout.length; i += 1) {
      var caixa = caixasDoLayout[i];
      var ajuste = elementos[caixa.getAttribute("data-el")] || {};

      caixa.style.left = "";
      caixa.style.right = "";
      caixa.style.top = "";
      caixa.style.bottom = "";
      caixa.style.display = "";
      caixa.style.transformOrigin = "";
      caixa.style.removeProperty("--escala");
      caixa.style.removeProperty("--desloc");

      if (typeof ajuste.x === "number") {
        // Quem nascia colado a direita passa a ser ancorado pela esquerda: e o
        // pulo do primeiro arrastar, e o estudio mostra isso na hora.
        caixa.style.left = ajuste.x + "%";
        caixa.style.right = "auto";
        caixa.style.transformOrigin = "0 0";
        caixa.style.setProperty("--desloc", "0px");
      }
      if (typeof ajuste.y === "number") {
        caixa.style.top = "calc(" + ((ajuste.y - cam) * 1.7778).toFixed(3) + " * var(--u))";
        caixa.style.bottom = "auto";
      }
      if (typeof ajuste.escala === "number") caixa.style.setProperty("--escala", String(ajuste.escala));
      // display inline, e nao o atributo hidden: estes elementos tem display
      // proprio no CSS (flex), e o [hidden] do navegador perde para ele.
      if (ajuste.visivel === false) caixa.style.display = "none";
    }
  }

  function ligar() {
    var fonte = new EventSource("/api/sessao/stream");
    var ouvir = function (nome, fn) {
      fonte.addEventListener(nome, function (evento) {
        try { fn(JSON.parse(evento.data)); } catch (e) { /* quadro solto */ }
      });
    };
    ouvir("estado", aoEstado);
    ouvir("hud", aoHud);
    ouvir("presente", aoPresente);
    ouvir("combateAnulado", aoCombateAnulado);
    ouvir("seguidor", aoSeguidor);
    ouvir("layout", aoLayout);
    fonte.onerror = function () { console.warn("[kora] fluxo caiu; o EventSource vai reconectar"); };
  }

  carregarLegenda();
  ligar();
})();
</script>
</body>
</html>`;
};

/** Uma página pronta por idioma. Texto muda com `npm run gerar`, não durante a live. */
const paginasEmCache = new Map();

async function pagina(idioma) {
  if (!paginasEmCache.has(idioma)) {
    const tokens = await carregarTokens();
    // Só o recorte do HUD: injetar o catálogo inteiro numa página que usa uma
    // dúzia de frases seria peso à toa na fonte do OBS.
    const textos = recortar(await carregarTextos(idioma), "hud.");
    paginasEmCache.set(
      idioma,
      `${paginaInicio(idioma, textos)}${cssDosTokens(tokens)}\n${PAGINA_ESTILO}${corpoDaPagina(idioma, textos)}`,
    );
  }
  return paginasEmCache.get(idioma);
}

/**
 * O idioma do streamer, na ABERTURA da página.
 *
 * Aqui e não no `montarOverlayHud` porque `criarAppDoPainel` é síncrono e não
 * conhece a configuração — e porque ler na abertura é melhor para quem usa: o
 * streamer troca o idioma no painel e atualiza a fonte do OBS, sem reiniciar a
 * ponte no meio da live. É o mesmo espírito do layout, que chega pelo SSE.
 *
 * Uma leitura de JSON por ABERTURA de página, nunca no caminho crítico do
 * presente (`CLAUDE.md`, princípio nº 1). Configuração ilegível cai no padrão:
 * HUD em português é melhor que overlay que não abre.
 */
async function idiomaDoStreamer() {
  try {
    const { idioma } = await carregarConfiguracao();
    return normalizarIdioma(idioma);
  } catch {
    return normalizarIdioma(null);
  }
}

/** Registra a página do HUD no app do painel. Antes de `/overlay/video/:id`, por clareza. */
export function montarOverlayHud(rotas) {
  // Também em `/overlay/hud.html`, pelo TikTok LIVE Studio — ver overlay.mjs.
  rotas.get(["/overlay/hud", "/overlay/hud.html"], async (req, res) => {
    res.set("content-type", "text/html; charset=utf-8");
    res.send(await pagina(await idiomaDoStreamer()));
  });
}
