/**
 * O HUD da live, para entrar como Browser Source no OBS (ADR-015).
 *
 * Replica o layout que o dono mandou de referência — a live do CTFps7: cam em
 * cima, jogo embaixo, e por cima de tudo o pote de moedas, o ranking dos três
 * maiores doadores, o maior combo, o maior presente, a barra "VS" da disputa,
 * a legenda dos presentes e a barra da torre.
 *
 * Por que é do OBS e não do Roblox: ícone de presente da TikTok não entra no
 * jogo (não há como subir asset por presente), o ranking por nome não pode
 * sair da memória da ponte (11_SEGURANCA), e a metade de cima da tela é a CAM
 * — o jogo não desenha ali. O que o jogo já desenha (o número da plataforma,
 * o selo TOPO, o presente que acabou de chegar) fica no jogo.
 *
 * Tudo vem do SSE que o painel já usa: `hud` traz os agregados, `estado` traz
 * a posição na torre e o preset ativo, e `/api/hud` traz a legenda. Nada é
 * calculado aqui — a página só desenha.
 *
 * Parâmetros na URL, para caber na cena de cada um:
 *   ?cam=43      altura da área da cam, em % da tela (o resto é o jogo)
 *   ?meta=10000  a meta de moedas que enche o pote
 *   ?barra=nao   esconde a barra da torre, para quem prefere a do jogo
 *
 * Nenhuma cor literal: as variáveis vêm de data/tokens.json (repos/tokens).
 */

import { carregarTokens, cssDosTokens } from "../repos/tokens.mjs";

const PAGINA_INICIO = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Kora — HUD da live</title>
<style>
`;

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
  --cam: 43%;
  --sombra: 0 calc(0.15 * var(--u)) calc(0.5 * var(--u)) var(--hud-contorno);
  --contorno:
    -calc(0.12 * var(--u)) -calc(0.12 * var(--u)) 0 var(--hud-contorno),  calc(0.12 * var(--u)) -calc(0.12 * var(--u)) 0 var(--hud-contorno),
    -calc(0.12 * var(--u))  calc(0.12 * var(--u)) 0 var(--hud-contorno),  calc(0.12 * var(--u))  calc(0.12 * var(--u)) 0 var(--hud-contorno),
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
/* O palco 9:16. Largura = 100 unidades; altura = 16/9 disso. Fica colado à
   esquerda e centrado na vertical; o script aplica scaleX quando a janela é
   mais larga que o palco. */
.hud {
  position: absolute; left: 0; top: calc((100vh - 177.78 * var(--u)) / 2);
  width: calc(100 * var(--u)); height: calc(177.78 * var(--u));
  transform-origin: 0 0;
  pointer-events: none;
}
.cam { position: absolute; left: 0; right: 0; top: 0; height: var(--cam); }
.jogo { position: absolute; left: 0; right: 0; top: var(--cam); bottom: 0; }
.texto { text-shadow: var(--contorno); }

/* Caixa escura translúcida. O fundo fica num ::before com opacity para o
   texto por cima continuar 100% opaco. */
.caixa { position: absolute; border-radius: calc(1.4 * var(--u)); }
.caixa::before {
  content: ""; position: absolute; inset: 0; border-radius: inherit;
  background: var(--painel-fundo); opacity: 0.72;
}
.caixa > * { position: relative; }

/* ---- pote de moedas (canto superior esquerdo da cam) ---- */
.pote { left: calc(2.5 * var(--u)); top: 22%; width: calc(20 * var(--u)); padding: calc(1.2 * var(--u)); display: flex; flex-direction: column; align-items: center; gap: calc(0.8 * var(--u)); }
/* A boca do pote: um aro mais largo que o copo, para ler como pote e não
   como caixa. */
.pote-tampa {
  width: calc(15 * var(--u)); height: calc(1.6 * var(--u)); border-radius: 999px;
  background: var(--faixa-5); box-shadow: var(--sombra);
  margin-bottom: calc(-0.6 * var(--u));
}
.pote-copo {
  width: calc(13 * var(--u)); height: calc(15 * var(--u)); border-radius: calc(1.5 * var(--u)) calc(1.5 * var(--u)) calc(4 * var(--u)) calc(4 * var(--u));
  border: calc(0.35 * var(--u)) solid var(--faixa-5); overflow: hidden; position: relative;
  box-shadow: inset 0 0 calc(1.5 * var(--u)) var(--hud-contorno);
}
.pote-nivel {
  position: absolute; left: 0; right: 0; bottom: 0; height: 0%;
  background: var(--faixa-5); opacity: 0.85;
  transition: height 600ms ease-out;
}
.pote-total { font-size: calc(2.6 * var(--u)); line-height: 1; }
.pote-total small { font-size: calc(1.3 * var(--u)); color: var(--painel-texto-secundario); font-weight: 700; }
.pote-meta { font-size: calc(1.2 * var(--u)); color: var(--painel-texto-secundario); font-weight: 700; }

/* ---- ranking (canto superior direito da cam) ---- */
.ranking { position: absolute; right: calc(2.5 * var(--u)); top: 12%; margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: calc(1 * var(--u)); }
.ranking li { display: flex; align-items: center; gap: calc(1 * var(--u)); font-size: calc(2.1 * var(--u)); line-height: 1; white-space: nowrap; }
.ranking-vazio { color: var(--painel-texto-secundario); font-size: calc(1.6 * var(--u)); }
.medalha {
  width: calc(3.4 * var(--u)); height: calc(3.4 * var(--u)); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
  font-size: calc(1.8 * var(--u)); color: var(--hud-contorno); box-shadow: var(--sombra);
}
.medalha-1 { background: var(--faixa-5); }
.medalha-2 { background: var(--faixa-1); }
.medalha-3 { background: var(--faixa-4); }
.ranking-nome { max-width: calc(22 * var(--u)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ranking-moedas { color: var(--faixa-5); }

/* ---- destaques: TOP COMBO e TOP PRESENTE (base da cam, cantos) ---- */
.destaque { bottom: 9%; width: calc(24 * var(--u)); padding: calc(1 * var(--u)) calc(1.2 * var(--u)); display: flex; flex-direction: column; gap: calc(0.6 * var(--u)); }
.destaque-esquerda { left: calc(2.5 * var(--u)); }
.destaque-direita { right: calc(2.5 * var(--u)); }
.destaque-rotulo { font-size: calc(1.25 * var(--u)); letter-spacing: 0.12em; color: var(--painel-texto-secundario); text-align: center; }
.destaque-corpo { display: flex; align-items: center; gap: calc(1 * var(--u)); }
.destaque-icone { width: calc(6 * var(--u)); height: calc(6 * var(--u)); object-fit: contain; filter: drop-shadow(var(--sombra)); }
.destaque-icone[hidden] { display: none; }
.destaque-texto { display: flex; flex-direction: column; gap: calc(0.3 * var(--u)); min-width: 0; }
.destaque-nome { font-size: calc(1.8 * var(--u)); line-height: 1.1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.destaque-valor { font-size: calc(2.4 * var(--u)); line-height: 1; color: var(--faixa-5); }
.destaque-presente { font-size: calc(1.3 * var(--u)); color: var(--painel-texto-secundario); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---- VS (base da cam, centro) ---- */
.vs {
  left: 50%; bottom: 1.5%; transform: translateX(-50%);
  width: calc(56 * var(--u));
  display: flex; align-items: center; justify-content: space-between;
  padding: calc(0.7 * var(--u)) calc(2.6 * var(--u)) calc(1.3 * var(--u)); border-radius: 999px;
  font-size: calc(2.6 * var(--u)); line-height: 1;
  overflow: hidden;
}
/* O medidor da disputa: a fatia vermelha cresce com a descida, o resto é a
   subida. É a barra da referência, e diz de relance quem está ganhando. */
.vs-medidor {
  position: absolute; left: 0; right: 0; bottom: 0; height: calc(0.7 * var(--u));
  background: var(--hud-subida); display: flex; opacity: 0.9;
}
.vs-medidor-descida { width: 50%; background: var(--hud-descida); transition: width 400ms ease-out; }
.vs-descida { color: var(--hud-descida); }
.vs-subida { color: var(--hud-subida); }
.vs-selo {
  font-size: calc(1.4 * var(--u)); color: var(--hud-contorno); background: var(--hud-combate);
  padding: calc(0.4 * var(--u)) calc(0.9 * var(--u)); border-radius: calc(0.6 * var(--u));
}

/* ---- legenda dos presentes (topo do jogo, cantos) ---- */
.legenda { position: absolute; top: 2%; margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: calc(1.2 * var(--u)); }
.legenda-esquerda { left: calc(2.5 * var(--u)); align-items: flex-start; }
.legenda-direita { right: calc(2.5 * var(--u)); align-items: flex-end; }
.legenda-item { display: flex; align-items: center; gap: calc(0.8 * var(--u)); }
.legenda-direita .legenda-item { flex-direction: row-reverse; }
.legenda-icone { width: calc(6.5 * var(--u)); height: calc(6.5 * var(--u)); object-fit: contain; filter: drop-shadow(var(--sombra)); }
.legenda-icone[hidden] { display: none; }
.legenda-nome { font-size: calc(1.4 * var(--u)); max-width: calc(12 * var(--u)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.legenda-delta { font-size: calc(3 * var(--u)); line-height: 1; }
.subida { color: var(--hud-subida); }
.descida { color: var(--hud-descida); }

/* ---- barra da torre (lateral direita do jogo) ---- */
.barra { position: absolute; right: calc(4 * var(--u)); top: 26%; bottom: 20%; width: calc(8 * var(--u)); display: flex; flex-direction: column; align-items: center; gap: calc(1 * var(--u)); }
.barra[hidden] { display: none; }
.barra-bandeira { font-size: calc(4 * var(--u)); line-height: 1; filter: drop-shadow(var(--sombra)); }
.barra-trilho {
  flex: 1; width: calc(5.5 * var(--u)); border-radius: calc(1.2 * var(--u)); overflow: hidden; position: relative;
  border: calc(0.35 * var(--u)) solid var(--hud-contorno); background: var(--painel-borda);
}
.barra-nivel {
  position: absolute; left: 0; right: 0; bottom: 0; height: 0%;
  background: var(--hud-subida); transition: height 400ms ease-out;
}
.barra-numero { font-size: calc(2.2 * var(--u)); line-height: 1; white-space: nowrap; }
</style>
</head>
<body>
<div class="hud">
  <section class="cam">
    <div class="pote caixa" id="pote">
      <div class="pote-tampa"></div>
      <div class="pote-copo"><div class="pote-nivel" id="pote-nivel"></div></div>
      <div class="pote-total texto"><span id="pote-moedas">0</span> <small>moedas</small></div>
      <div class="pote-meta">meta <span id="pote-alvo">0</span></div>
    </div>

    <ol class="ranking" id="ranking"><li class="ranking-vazio texto">sem doadores ainda</li></ol>

    <div class="destaque destaque-esquerda caixa" id="top-combo">
      <div class="destaque-rotulo">TOP COMBO</div>
      <div class="destaque-corpo">
        <img class="destaque-icone" id="top-combo-icone" alt="" hidden>
        <div class="destaque-texto">
          <div class="destaque-nome texto" id="top-combo-nome">—</div>
          <div class="destaque-valor texto" id="top-combo-valor">x0</div>
          <div class="destaque-presente" id="top-combo-presente"></div>
        </div>
      </div>
    </div>

    <div class="destaque destaque-direita caixa" id="top-presente">
      <div class="destaque-rotulo">TOP PRESENTE</div>
      <div class="destaque-corpo">
        <img class="destaque-icone" id="top-presente-icone" alt="" hidden>
        <div class="destaque-texto">
          <div class="destaque-nome texto" id="top-presente-nome">—</div>
          <div class="destaque-valor texto" id="top-presente-valor">0 coins</div>
          <div class="destaque-presente" id="top-presente-presente"></div>
        </div>
      </div>
    </div>

    <div class="vs caixa">
      <span class="vs-descida texto" id="vs-descida">-0</span>
      <span class="vs-selo">VS</span>
      <span class="vs-subida texto" id="vs-subida">+0</span>
      <div class="vs-medidor"><div class="vs-medidor-descida" id="vs-medidor-descida"></div></div>
    </div>
  </section>

  <section class="jogo">
    <ul class="legenda legenda-esquerda" id="legenda-subida"></ul>
    <ul class="legenda legenda-direita" id="legenda-descida"></ul>
    <div class="barra" id="barra">
      <div class="barra-bandeira" aria-hidden="true">&#127937;</div>
      <div class="barra-trilho"><div class="barra-nivel" id="barra-nivel"></div></div>
      <div class="barra-numero texto"><span id="barra-atual">0</span> / <span id="barra-total">0</span></div>
    </div>
  </section>
</div>

<script>
(function () {
  var params = new URLSearchParams(location.search);
  var cam = Number(params.get("cam"));
  if (cam > 0 && cam < 100) document.documentElement.style.setProperty("--cam", cam + "%");
  var meta = Number(params.get("meta"));
  if (!(meta > 0)) meta = 10000;
  if (params.get("barra") === "nao") document.getElementById("barra").hidden = true;
  var preEsticar = params.get("esticar") !== "nao";

  //[[ O palco 9:16, e o pré-estique.
  //
  // A fonte "Link" do LIVE Studio renderiza a página em paisagem (16:9) e o
  // streamer estica o item para preencher a cena vertical: com tamanhos em vw
  // o pote saía 3× mais alto que largo. Aqui a página monta um palco 9:16 pela
  // altura da janela, mede tudo em centésimos da largura dele (--u), e — se a
  // janela for mais larga que o palco — estica em X na mesma razão, para o
  // estique da fonte devolver a proporção certa. Numa fonte 9:16 (OBS com
  // 1080×1920) a razão é 1 e nada acontece. ]]
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

  var presetId = null;
  var legenda = {};   // presenteId -> iconeUrl, para os destaques acharem o ícone

  var formatar = function (n) {
    return new Intl.NumberFormat("pt-BR").format(Math.max(0, Math.round(Number(n) || 0)));
  };
  function texto(id, valor) { document.getElementById(id).textContent = valor; }
  function icone(id, url) {
    var img = document.getElementById(id);
    if (!url) { img.hidden = true; img.removeAttribute("src"); return; }
    img.hidden = false;
    img.onerror = function () { img.hidden = true; };
    if (img.getAttribute("src") !== url) img.src = url;
  }

  texto("pote-alvo", formatar(meta));

  function desenharDestaque(prefixo, dado, valor) {
    if (!dado) {
      texto(prefixo + "-nome", "—");
      texto(prefixo + "-valor", valor(null));
      texto(prefixo + "-presente", "");
      icone(prefixo + "-icone", null);
      return;
    }
    texto(prefixo + "-nome", dado.nome || "anônimo");
    texto(prefixo + "-valor", valor(dado));
    texto(prefixo + "-presente", dado.presenteNome || "");
    icone(prefixo + "-icone", legenda[dado.presenteId] || null);
  }

  function aoHud(hud) {
    if (!hud) return;
    texto("pote-moedas", formatar(hud.moedas));
    document.getElementById("pote-nivel").style.height = Math.min(100, (hud.moedas / meta) * 100) + "%";

    var lista = document.getElementById("ranking");
    lista.textContent = "";
    var ranking = hud.ranking || [];
    if (ranking.length === 0) {
      var vazio = document.createElement("li");
      vazio.className = "ranking-vazio texto";
      vazio.textContent = "sem doadores ainda";
      lista.appendChild(vazio);
    }
    ranking.forEach(function (doador, indice) {
      var li = document.createElement("li");
      var medalha = document.createElement("span");
      medalha.className = "medalha medalha-" + (indice + 1);
      medalha.textContent = String(indice + 1);
      var nome = document.createElement("span");
      nome.className = "ranking-nome texto";
      nome.textContent = doador.nome;
      var moedas = document.createElement("span");
      moedas.className = "ranking-moedas texto";
      moedas.textContent = "🪙 " + formatar(doador.moedas);
      li.appendChild(medalha); li.appendChild(nome); li.appendChild(moedas);
      lista.appendChild(li);
    });

    desenharDestaque("top-combo", hud.topCombo, function (d) { return d ? "x" + formatar(d.repeticoes) : "x0"; });
    desenharDestaque("top-presente", hud.topPresente, function (d) { return (d ? formatar(d.moedas) : "0") + " coins"; });

    var disputa = hud.disputa || { subida: 0, descida: 0 };
    texto("vs-descida", "-" + formatar(disputa.descida));
    texto("vs-subida", "+" + formatar(disputa.subida));
    var total = (Number(disputa.descida) || 0) + (Number(disputa.subida) || 0);
    document.getElementById("vs-medidor-descida").style.width =
      (total > 0 ? (disputa.descida / total) * 100 : 50) + "%";
  }

  function aoEstado(estado) {
    if (!estado) return;
    var atual = Number(estado.plataformaAtual) || 0;
    var total = Number(estado.totalPlataformas) || 0;
    texto("barra-atual", formatar(atual));
    texto("barra-total", formatar(total));
    document.getElementById("barra-nivel").style.height = (total > 0 ? Math.min(100, (atual / total) * 100) : 0) + "%";

    // Preset trocado no meio da live (R7): a legenda muda junto.
    var id = estado.presetId || null;
    if (id !== presetId) { presetId = id; carregarLegenda(); }
  }

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
    legenda = {};
    (dados && dados.slots ? dados.slots : []).forEach(function (slot) {
      legenda[slot.presenteId] = slot.iconeUrl || null;
      (slot.delta > 0 ? subida : descida).appendChild(itemDaLegenda(slot));
    });
  }

  function carregarLegenda() {
    fetch("/api/hud")
      .then(function (r) { return r.json(); })
      .then(desenharLegenda)
      .catch(function (erro) { console.warn("[kora] legenda não carregou:", erro); });
  }

  function ligar() {
    var fonte = new EventSource("/api/sessao/stream");
    fonte.addEventListener("estado", function (evento) {
      try { aoEstado(JSON.parse(evento.data)); } catch (e) { /* quadro solto */ }
    });
    fonte.addEventListener("hud", function (evento) {
      try { aoHud(JSON.parse(evento.data)); } catch (e) { /* quadro solto */ }
    });
    fonte.onerror = function () { console.warn("[kora] fluxo caiu; o EventSource vai reconectar"); };
  }

  carregarLegenda();
  ligar();
})();
</script>
</body>
</html>`;

let paginaEmCache = null;

async function pagina() {
  if (!paginaEmCache) {
    const tokens = await carregarTokens();
    paginaEmCache = `${PAGINA_INICIO}${cssDosTokens(tokens)}\n${PAGINA_ESTILO}`;
  }
  return paginaEmCache;
}

/** Registra a página do HUD no app do painel. Antes de `/overlay/video/:id`, por clareza. */
export function montarOverlayHud(rotas) {
  // Também em `/overlay/hud.html`, pelo TikTok LIVE Studio — ver overlay.mjs.
  rotas.get(["/overlay/hud", "/overlay/hud.html"], async (req, res) => {
    res.set("content-type", "text/html; charset=utf-8");
    res.send(await pagina());
  });
}
