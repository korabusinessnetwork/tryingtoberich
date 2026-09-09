/**
 * As duas superfícies HTTP, com o servidor de verdade numa porta efêmera.
 *
 * O que este teste protege é o checklist de `docs/11_SEGURANCA`: token exigido
 * em `/jogo/*`, `/api/*` fora do alcance de quem não é localhost, rate limit, e
 * contrato de erro sem stack trace.
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { criarAppDoJogo, criarAppDoPainel } from "../src/http/servidor.mjs";
import { limitarTaxa } from "../src/http/guardas.mjs";
import { Nucleo } from "../src/nucleo.mjs";
import { REGRAS } from "../src/config.mjs";
import { apagar, caminhoDeDados, escreverJsonAtomico, lerJsonOuPadrao } from "../src/repos/arquivo.mjs";
import { carregarConfiguracao, salvarConfiguracao } from "../src/repos/configuracao.mjs";
import { carregarExemplo } from "../src/repos/fixtures.mjs";
import { salvarPreset } from "../src/repos/presets.mjs";
import { carregarLayout, salvarLayout } from "../src/repos/overlay.mjs";
import { criarValidador } from "../src/repos/schemas.mjs";
import {
  CAM_PADRAO,
  ELEMENTOS_DO_OVERLAY,
  ESCALA_MAX,
  ESCALA_MIN,
  LAYOUT_VAZIO,
} from "../src/dominio/overlay-layout.mjs";

const TOKEN = "t".repeat(32);

const config = {
  token: TOKEN, portaJogo: 0, portaPainel: 0, host: "127.0.0.1",
  usuarioTiktok: "", chaveGemini: "",
  longpollTimeoutMs: 150, combateMaxMs: 2000,
};

/** Duas portas de propósito: é o que impede o túnel de alcançar o painel. */
let base;
let basePainel;
let servidorDoJogo;
let servidorDoPainel;
let nucleo;
/** A cena do Estúdio de Overlay do dono, se ele já montou uma: volta no fim. */
let cenaDoOverlay = null;
const ARQUIVO_DO_LAYOUT = caminhoDeDados("overlay-layout.json");

const escutar = (app) =>
  new Promise((resolve) => {
    const servidor = app.listen(0, "127.0.0.1", () => resolve(servidor));
  });

before(async () => {
  cenaDoOverlay = await lerJsonOuPadrao(ARQUIVO_DO_LAYOUT);
  nucleo = new Nucleo({ config });
  await nucleo.carregarAnimacoesNaMemoria();
  servidorDoJogo = await escutar(criarAppDoJogo(nucleo, { token: TOKEN }));
  servidorDoPainel = await escutar(criarAppDoPainel(nucleo));
  base = `http://127.0.0.1:${servidorDoJogo.address().port}`;
  basePainel = `http://127.0.0.1:${servidorDoPainel.address().port}`;
});

after(async () => {
  nucleo.longpoll.fecharTodos();
  servidorDoJogo.close();
  servidorDoPainel.close();
  // A máquina que roda o teste é a mesma que roda a live: o PUT abaixo escreve
  // o arquivo de verdade, como o de configuração.
  if (cenaDoOverlay) await escreverJsonAtomico(ARQUIVO_DO_LAYOUT, cenaDoOverlay);
  else await apagar(ARQUIVO_DO_LAYOUT);
});

const comToken = { "x-bridge-token": TOKEN };

/* ---------------------------------------------------------------- */
/* Superfície pública                                                */
/* ---------------------------------------------------------------- */

test("sem X-Bridge-Token, /jogo responde 401", async () => {
  const resposta = await fetch(`${base}/jogo/mapa`);
  assert.equal(resposta.status, 401);
  assert.deepEqual(await resposta.json(), {
    erro: "token_invalido",
    mensagem: "Requisição sem X-Bridge-Token válido.",
  });
});

test("com token errado, /jogo também responde 401", async () => {
  const resposta = await fetch(`${base}/jogo/mapa`, { headers: { "x-bridge-token": "x".repeat(32) } });
  assert.equal(resposta.status, 401);
});

test("token de tamanho diferente não passa nem por acidente", async () => {
  const resposta = await fetch(`${base}/jogo/mapa`, { headers: { "x-bridge-token": "t" } });
  assert.equal(resposta.status, 401);
});

test("o long-poll segura a resposta e devolve 204 no timeout", async () => {
  const antes = Date.now();
  const resposta = await fetch(`${base}/jogo/eventos?desde=0`, { headers: comToken });
  const decorrido = Date.now() - antes;

  assert.equal(resposta.status, 204);
  assert.ok(decorrido >= 140, `segurou ${decorrido}ms, esperava ao menos o timeout de 150ms`);
});

test("o long-poll responde no instante do evento, não no timeout", async () => {
  const antes = Date.now();
  const pendente = fetch(`${base}/jogo/eventos?desde=0`, { headers: comToken });

  await new Promise((resolve) => setTimeout(resolve, 20));
  nucleo.longpoll.publicar([{
    id: 1, animacaoId: "sub_cometa", delta: 15, intensidade: 3,
    efeitoCurto: false, nomeDoador: "theuz", presenteNome: "Galaxy", emitidoEm: Date.now(),
  }]);

  const resposta = await pendente;
  const decorrido = Date.now() - antes;
  const corpo = await resposta.json();

  assert.equal(resposta.status, 200);
  assert.ok(decorrido < 140, `respondeu em ${decorrido}ms: não esperou o timeout`);
  assert.equal(corpo.cursor, 1);
  assert.equal(corpo.eventos[0].animacaoId, "sub_cometa");
});

test("a resposta do long-poll não vaza slot nem presenteId para o jogo", async () => {
  const pendente = fetch(`${base}/jogo/eventos?desde=1`, { headers: comToken });
  await new Promise((resolve) => setTimeout(resolve, 20));
  nucleo.longpoll.publicar([{
    id: 2, animacaoId: "des_chumbo", delta: -8, intensidade: 2, efeitoCurto: false,
    nomeDoador: null, presenteNome: "Hand Hearts", emitidoEm: Date.now(),
    slot: 4, presenteId: "sem-hand-hearts", repeticoes: 1, recebidoEm: Date.now(),
  }]);

  const corpo = await (await pendente).json();
  assert.deepEqual(
    Object.keys(corpo.eventos[0]).sort(),
    ["animacaoId", "delta", "efeitoCurto", "emitidoEm", "id", "intensidade", "nomeDoador", "presenteNome"],
    "o motor no Roblox é burro de propósito: recebe animação e delta, e mais nada (ADR-007)",
  );
});

test("estado do jogo fora da faixa é descartado, não corrige o estado", async () => {
  const enviar = (corpo) =>
    fetch(`${base}/jogo/estado`, {
      method: "POST",
      headers: { ...comToken, "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });

  // Sempre 200, inclusive quando o corpo é descartado: o jogo nunca espera a
  // ponte, e a resposta existe só para devolver o estado da live — que é o que
  // tranca o vestiário (ADR-011). Descartar o estado recebido e ainda assim
  // responder é de propósito: são duas coisas independentes.
  const valido = await enviar({ plataformaReferencia: 184, plataformaMaxima: 191, emAnimacao: false });
  assert.equal(valido.status, 200);
  assert.equal(typeof (await valido.json()).live, "boolean", "o jogo não tem outro jeito de saber se há plateia");

  assert.equal((await enviar({ plataformaReferencia: -5, plataformaMaxima: 191, emAnimacao: false })).status, 200);
  assert.equal((await enviar({ nada: "a ver" })).status, 200);
});

test("o fim de rodada confirmado vira evento `rodada` no SSE, com a cutscene do preset (ADR-014)", async () => {
  const enviar = (corpo, cabecalhos = comToken) =>
    fetch(`${base}/jogo/rodada`, {
      method: "POST",
      headers: { ...cabecalhos, "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });

  // Superfície pública: sem token, nem o aviso de fim de rodada entra.
  assert.equal((await enviar({ resultado: "vitoria" }, {})).status, 401);

  const recebidos = [];
  const parar = nucleo.ouvir((evento, dados) => recebidos.push({ evento, dados }));
  try {
    const resposta = await enviar({ resultado: "derrota", vitorias: 2, derrotas: 5 });
    assert.equal(resposta.status, 200);
    assert.deepEqual(await resposta.json(), { aceito: true });

    const rodada = recebidos.find((r) => r.evento === "rodada");
    // Sem preset ativo a cutscene é nula — e é DITA, para o overlay ficar mudo
    // de propósito em vez de tocar o vídeo errado.
    assert.deepEqual(rodada.dados, { resultado: "derrota", cutscene: null, vitorias: 2, derrotas: 5 });
    assert.equal(nucleo.estado.derrotas, 5, "o placar do aviso entra no estado na hora");

    // Corpo fora do contrato: descartado com 200, como o /estado — e nada no SSE.
    recebidos.length = 0;
    const invalido = await enviar({ resultado: "empate" });
    assert.equal(invalido.status, 200);
    assert.deepEqual(await invalido.json(), { aceito: false });
    assert.equal(recebidos.some((r) => r.evento === "rodada"), false, "aviso inválido chegou ao overlay");
  } finally {
    parar();
  }
});

test("o vestiário não abre com a sessão rodando (ADR-011)", async () => {
  const resposta = await fetch(`${base}/jogo/catalogo-itens?busca=a`, { headers: comToken });
  const corpo = await resposta.json();
  assert.equal(resposta.status, 400);
  assert.equal(corpo.erro, "busca_curta");
});

/* ---------------------------------------------------------------- */
/* Superfície local                                                  */
/* ---------------------------------------------------------------- */

test("/api responde em localhost, sem token", async () => {
  const corpo = await (await fetch(`${basePainel}/api/modalidades`)).json();
  assert.deepEqual(corpo.modalidades, [{ id: "escalada", nome: "Escalada", disponivel: true }]);
});

test("/api/animacoes serve a biblioteca inteira, metade de cada direção", async () => {
  const corpo = await (await fetch(`${basePainel}/api/animacoes`)).json();
  // Sem número fixo: a biblioteca cresce quando entra animação nova (ver
  // test/jogo.test.mjs). O que a rota promete é servir TODAS e não perder
  // direção pelo caminho.
  const subidas = corpo.animacoes.filter((a) => a.direcao === "subida").length;
  const descidas = corpo.animacoes.filter((a) => a.direcao === "descida").length;
  assert.ok(corpo.animacoes.length >= 20, "a biblioteca encolheu");
  assert.equal(subidas + descidas, corpo.animacoes.length, "animação sem direção conhecida");
  assert.equal(subidas, descidas, "o painel precisa do mesmo número dos dois lados");
});

test("/api/cenarios lista as fixtures, para o painel oferecer o modo sem live", async () => {
  const corpo = await (await fetch(`${basePainel}/api/cenarios`)).json();
  assert.ok(corpo.cenarios.includes("04-combate-de-presentes"));
});

test("/api/cutscenes lista a pasta, e só o que passa no padrão de nome (ADR-014)", async () => {
  const corpo = await (await fetch(`${basePainel}/api/cutscenes`)).json();
  assert.equal(corpo.pasta, "data/cutscenes");
  assert.ok(Array.isArray(corpo.cutscenes) && Array.isArray(corpo.ignorados));
  // Sem número fixo: a pasta é do streamer e não é versionada. O que a rota
  // promete é que todo id listado passa no padrão que `/overlay/video/:id` aceita.
  for (const cutscene of corpo.cutscenes) {
    assert.match(cutscene.id, /^[a-z0-9][a-z0-9-]*$/, `id fora do padrão: ${cutscene.id}`);
    assert.equal(cutscene.caminho, `data/cutscenes/${cutscene.arquivo}`);
  }
});

test("/api/overlay diz a URL do OBS e cruza a escolha do preset com a pasta", async () => {
  const corpo = await (await fetch(`${basePainel}/api/overlay`)).json();
  assert.match(corpo.url, /^http:\/\/127\.0\.0\.1:\d+\/overlay\.html$/);
  // Sem preset ativo, nada em uso — e "nada" é dito, não omitido.
  assert.deepEqual(corpo.emUso, {
    vitoria: { id: null, existe: false },
    derrota: { id: null, existe: false },
  });
});

test("/overlay/video/:id nunca sai da pasta: id fora do padrão é 404 antes de tocar o disco", async () => {
  for (const id of ["..%2F..%2Fpackage.json", "Vitoria", "a b", ".env", "vitoria.mp4.bak"]) {
    const resposta = await fetch(`${basePainel}/overlay/video/${id}`);
    assert.equal(resposta.status, 404, `"${id}" passou`);
    assert.equal((await resposta.json()).erro, "cutscene_ausente");
  }
});

test("/api/overlay também entrega a URL do HUD da live, e /overlay/hud é a página (ADR-015)", async () => {
  const corpo = await (await fetch(`${basePainel}/api/overlay`)).json();
  assert.match(corpo.urlHud, /^http:\/\/127\.0\.0\.1:\d+\/overlay\/hud\.html$/);

  const pagina = await fetch(`${basePainel}/overlay/hud`);
  assert.equal(pagina.status, 200);
  assert.match(pagina.headers.get("content-type"), /text\/html/);
  const html = await pagina.text();
  // As cores vêm de data/tokens.json, injetadas como variáveis — é o único
  // hex da página, e o que garante que o overlay e o painel são a mesma marca.
  assert.match(html, /--hud-subida: #[0-9A-Fa-f]{6};/, "os tokens não chegaram à página");
  assert.match(html, /--estado-vitoria: #[0-9A-Fa-f]{6};/, "os tokens de estado não chegaram à página");
  assert.match(html, /ouvir\("hud", aoHud\)/, "a página não ouve a disputa da rodada");
  assert.match(html, /ouvir\("seguidor", aoSeguidor\)/, "a página não ouve o aviso de seguidor");
  assert.match(html, /fetch\("\/api\/hud"\)/, "a página não busca a legenda");
  //[[ A legenda tem TETO no CSS, e não na disciplina de quem monta o preset.
  // O preset vai a 24 slots (R1 emendada) e a legenda vale "ausente = true":
  // um arquivo editado à mão em disco (ADR-003) manda os 24 para a faixa, cada
  // item mede ~7,2u, e a coluna desce por cima do portal e do boneco — o que o
  // 02_DESIGN_SYSTEM, C proíbe. Em % de .jogo, porque a faixa do jogo encolhe
  // com o ?cam= da cena. ]]
  assert.match(
    html,
    /\.legenda \{[^}]*max-height: calc\(100% - 12 \* var\(--u\)\);\s*overflow: hidden;/,
    "sem teto, 24 slots marcados cobrem o boneco na live",
  );
  // A fonte "Link" do LIVE Studio renderiza em 16:9 e estica para 9:16: sem o
  // palco e o pré-estique, o pote saía 3× mais alto que largo (02_DESIGN_SYSTEM, C).
  assert.match(html, /scaleX\(/, "sem o pré-estique a página deforma no LIVE Studio");

  //[[ `-calc(...)` não existe em CSS, e o navegador não reclama: ele descarta a
  // declaração inteira em silêncio. Aconteceu com o `--contorno` do texto —
  // trocar `vw` pela unidade do palco com uma substituição cega transformou
  // `-0.12vw` em `-calc(0.12 * var(--u))` — e o ranking, a legenda e a barra
  // ficaram com texto branco sem contorno em cima da captura da cam, ilegíveis
  // em cena clara. O sinal vai DENTRO do calc. ]]
  // Sem os comentários, como em componentesSemRede.test.mjs e pelo mesmo
  // motivo: o comentário que documenta a forma ERRADA a contém, e a checagem
  // acusaria a explicação da conformidade como se fosse a violação.
  const semComentarios = html.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(
    !/[^\w)]-calc\(/.test(semComentarios),
    "menos antes de calc() invalida a declaração inteira; o sinal vai dentro: calc(-x * …)",
  );
  assert.match(semComentarios, /--contorno:[\s\S]{0,400}?var\(--hud-contorno\)/, "o texto do HUD precisa do contorno escuro");
  // O único vw permitido é o fallback da própria unidade (`--u: 1vw`), que
  // vale até o script medir a janela. Comentários não contam.
  const semFallback = html.replace(/--u:\s*1vw;/, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/\d(\.\d+)?vw\b/.test(semFallback), "tamanho em vw ignora o palco 9:16; use a unidade --u");
  assert.ok(!html.includes("${"), "placeholder de template vazou para o HTML");
});

test("as URLs de /api/overlay passam na validação do TikTok LIVE Studio, e as páginas respondem com e sem .html", async () => {
  // A regra é a da fonte "Link" do LIVE Studio 1.35.2 (static/js/modal.*.js):
  // precisa haver `algo.letras` em algum lugar da URL. `http://127.0.0.1:8788/overlay`
  // não tem e cai em "Digite o URL correto"; com `.html` no caminho, passa.
  const regraDoLiveStudio =
    /(http(s)?:\/\/)?[(www.)?a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_+.~#?&//=]*)/gi;
  const aceita = (url) => {
    regraDoLiveStudio.lastIndex = 0;
    return regraDoLiveStudio.test(url);
  };

  const corpo = await (await fetch(`${basePainel}/api/overlay`)).json();
  assert.ok(aceita(corpo.url), `o LIVE Studio recusaria ${corpo.url}`);
  assert.ok(aceita(corpo.urlHud), `o LIVE Studio recusaria ${corpo.urlHud}`);
  assert.ok(aceita(`${corpo.urlHud}?cam=43&barra=nao`), "os ajustes do HUD não podem quebrar a validação");
  // O guarda do porquê: se um dia a forma sem `.html` passar, o alias virou opcional.
  assert.equal(aceita(corpo.url.replace(/\.html$/, "")), false, "a regra do LIVE Studio mudou; reveja o .html");

  for (const caminho of ["/overlay", "/overlay.html", "/overlay/hud", "/overlay/hud.html"]) {
    const pagina = await fetch(`${basePainel}${caminho}`);
    assert.equal(pagina.status, 200, caminho);
    assert.match(pagina.headers.get("content-type"), /text\/html/, caminho);
  }
  // A MESMA página nas duas formas — não uma cópia que envelhece sozinha.
  assert.equal(
    await (await fetch(`${basePainel}/overlay.html`)).text(),
    await (await fetch(`${basePainel}/overlay`)).text(),
  );
  assert.equal(
    await (await fetch(`${basePainel}/overlay/hud.html`)).text(),
    await (await fetch(`${basePainel}/overlay/hud`)).text(),
  );
});

test("/api/hud sem preset ativo é lista vazia, não erro — a página abre antes da sessão", async () => {
  const corpo = await (await fetch(`${basePainel}/api/hud`)).json();
  assert.deepEqual(corpo, { presetId: null, slots: [] });
});

/* ---------------------------------------------------------------- */
/* Estúdio de Overlay                                                */
/*                                                                   */
/* O REPOSITÓRIO é testado AQUI, e não em overlay-layout.test.mjs, de */
/* propósito: os dois arquivos escreviam o MESMO data/overlay-layout. */
/* json de verdade, e `node --test` roda arquivo em paralelo. Um      */
/* apagava o arquivo e lia esperando vazio enquanto o outro gravava   */
/* pelo PUT — flake estreito, do tipo que só aparece em máquina mais  */
/* lenta. Pior: o backup da cena do dono só existe na memória do      */
/* processo, o arquivo está no .gitignore, e um Ctrl+C no meio apaga  */
/* de vez a cena que ele montou. Um processo só encosta no arquivo.   */
/* ---------------------------------------------------------------- */

test("arquivo ausente devolve layout vazio, e não erro: é o estado de quem nunca abriu o estúdio", async () => {
  await apagar(ARQUIVO_DO_LAYOUT);
  assert.deepEqual(await carregarLayout(), LAYOUT_VAZIO("local"));
});

test("o que o estúdio salva volta inteiro na releitura", async () => {
  const salvo = await salvarLayout(
    { elementos: { placar: { x: 12.5, y: 40, escala: 1.5 }, seguidor: { visivel: false } } },
    { streamerId: "local" },
  );
  assert.equal(salvo.streamerId, "local");
  assert.ok(salvo.atualizadoEm, "sem carimbo não há como saber qual cena é a mais nova");

  const relido = await carregarLayout();
  assert.deepEqual(relido.elementos, {
    placar: { x: 12.5, y: 40, escala: 1.5 },
    seguidor: { visivel: false },
  });
});

test("elemento com objeto vazio SOME do arquivo: 'voltar ao padrão' é ausência, não uma cópia do CSS", async () => {
  //[[ É o que permite mudar o padrão da página depois.
  //
  // Se "voltar ao padrão" gravasse os números de hoje, toda instalação ficaria
  // congelada no padrão do dia em que o streamer abriu o estúdio — e mexer no
  // CSS da página não mudaria a tela de mais ninguém. ]]
  await salvarLayout({ elementos: { placar: { x: 1, y: 2 }, portal: { escala: 2 } } });
  const depois = await salvarLayout({ elementos: { placar: {}, portal: { escala: 2 } } });

  assert.deepEqual(Object.keys(depois.elementos), ["portal"]);
  assert.equal("placar" in (await carregarLayout()).elementos, false);
});

test("layout fora do contrato é recusado com 400, antes de encostar no disco", async () => {
  const antes = await carregarLayout();
  const recusa = { name: "ErroDeDominio", codigo: "layout_invalido", status: 400 };

  const fora = [
    ["id que a página não desenha", { topcombo: { x: 10 } }],
    ["x fora do palco", { placar: { x: 120 } }],
    ["y fora do palco", { placar: { y: -1 } }],
    ["escala além do teto", { placar: { escala: 3 } }],
    ["escala abaixo do piso", { placar: { escala: 0.2 } }],
    ["campo que ninguém lê", { placar: { x: 10, girar: 90 } }],
  ];

  for (const [porque, elementos] of fora) {
    await assert.rejects(() => salvarLayout({ elementos }), recusa, porque);
  }

  assert.deepEqual(
    (await carregarLayout()).elementos,
    antes.elementos,
    "uma recusa não pode ter gravado metade da cena",
  );
});

test("id fora do catálogo é descartado na LEITURA, senão todo 'Salvar' seguinte tomaria 400", async () => {
  //[[ O painel devolve no PUT exatamente o objeto que leu.
  //
  // Uma chave que não está mais no catálogo — id removido numa versão nova, ou
  // edição a mão, que o ADR-003 prevê — entrava inteira no estado do estúdio e
  // voltava no PUT seguinte. Resultado: TODO "Salvar" respondia 400 sem nada na
  // tela dizer qual chave era a culpada, e a única saída era "voltar ao
  // padrão", que joga a cena boa fora junto. A página do OBS sempre tolerou
  // isso (só percorre os data-el que existem); agora quem lê tolera igual. ]]
  await escreverJsonAtomico(ARQUIVO_DO_LAYOUT, {
    streamerId: "local",
    atualizadoEm: new Date().toISOString(),
    elementos: { placar: { x: 10, y: 40 }, topcombo: { x: 5, y: 50 } },
  });

  const lido = await carregarLayout();
  assert.deepEqual(Object.keys(lido.elementos), ["placar"], "o id fora do catálogo tinha que sumir na leitura");

  // E o que sobrou volta a ser aceito: é a ida-e-volta que o estúdio faz.
  assert.deepEqual((await salvarLayout({ elementos: lido.elementos })).elementos, { placar: { x: 10, y: 40 } });
});

test("os limites de escala do domínio são os mesmos do schema", () => {
  // Dois números escritos em dois lugares. O painel prende a barra por estes;
  // o schema recusa por aqueles. Se um andar sozinho, o streamer arrasta a
  // barra até o fim e o salvar responde 400 sem ele entender por quê.
  assert.equal(ESCALA_MIN, 0.5);
  assert.equal(ESCALA_MAX, 2);
});

test("/api/overlay/layout entrega o CATÁLOGO dos elementos junto do que o streamer mexeu", async () => {
  //[[ Os NOMES das chaves SÃO o contrato, e ele já esteve quebrado.
  //
  // `catalogo` e `elementos` são lidos assim em EstudioDeOverlay.jsx: o
  // catálogo em `dados?.catalogo`, a exceção salva em `resposta?.elementos`. A
  // rota já mandou o catálogo dentro de `elementos` e o layout dentro de
  // `layout`: nada quebrava, todos os testes passavam, e o estúdio inteiro caía
  // no estado vazio "a ponte não mandou o catálogo" — nenhuma caixa desenhada,
  // a feature não existia na tela. O teste da ponte afirmava uma forma e o do
  // painel mockava a oposta, os dois verdes, nenhum cruzando a fronteira.
  //
  // O catálogo vai na resposta porque o painel não pode ter uma segunda cópia
  // da geometria da página: duas escritas dos mesmos números divergem caladas. ]]
  await salvarLayout({ elementos: { placar: { x: 12.5, y: 40 } } });
  const corpo = await (await fetch(`${basePainel}/api/overlay/layout`)).json();

  assert.deepEqual(Object.keys(corpo).sort(), ["cam", "catalogo", "elementos"]);
  assert.ok(Array.isArray(corpo.catalogo), "o catálogo é a LISTA do que existe");
  assert.equal(typeof corpo.elementos, "object", "`elementos` é a exceção salva: um objeto por id");
  assert.equal(Array.isArray(corpo.elementos), false, "array aqui viraria { 0: ..., 1: ... } no PUT seguinte");
  assert.deepEqual(corpo.elementos.placar, { x: 12.5, y: 40 }, "a cena de ontem tem que voltar para o estúdio");

  assert.equal(corpo.cam, CAM_PADRAO, "sem a cam o estúdio não sabe onde sombrear (ADR-015)");
  assert.equal(corpo.catalogo.length, 8);
  assert.deepEqual(
    corpo.catalogo.map((e) => e.id),
    ELEMENTOS_DO_OVERLAY.map((e) => e.id),
  );
  for (const elemento of corpo.catalogo) {
    assert.ok(elemento.rotulo, `${elemento.id} sem nome legível para o streamer`);
    assert.equal(typeof elemento.x, "number", `${elemento.id} sem posição padrão`);
    assert.equal(typeof elemento.largura, "number", `${elemento.id} sem retângulo para arrastar`);
  }
});

test("o corpo que o estúdio MONTA passa no schema: o clique de salvar não pode ser o primeiro encontro", async () => {
  //[[ O `mudar()` do EstudioDeOverlay escreve os QUATRO campos sempre, mesmo
  // quando o streamer só arrastou na vertical ou só mexeu na escala. Se o
  // schema recusasse essa forma, o erro apareceria no primeiro clique de salvar
  // de uma live — e não aqui. É a mesma ida-e-volta, sem o navegador no meio. ]]
  const elementos = Object.fromEntries(
    ELEMENTOS_DO_OVERLAY.map((item) => [item.id, { x: item.x, y: item.y, escala: 1, visivel: true }]),
  );

  const { validar } = await criarValidador();
  assert.deepEqual(
    validar("overlay-layout", { streamerId: "local", atualizadoEm: null, elementos }),
    [],
    "o objeto que o estúdio produz tem que ser válido para o schema que a ponte usa",
  );

  const resposta = await fetch(`${basePainel}/api/overlay/layout`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ elementos }),
  });
  assert.equal(resposta.status, 200, "e a rota tem que aceitar o mesmo corpo");
  assert.deepEqual((await resposta.json()).elementos, elementos);
});

test("o PUT do estúdio grava, o GET seguinte confirma, e o SSE avisa o OBS sem recarregar a fonte", async () => {
  const recebidos = [];
  const parar = nucleo.ouvir((evento, dados) => recebidos.push({ evento, dados }));
  try {
    const resposta = await fetch(`${basePainel}/api/overlay/layout`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ elementos: { presente: { x: 33.5, y: 70, escala: 1.25 } } }),
    });
    assert.equal(resposta.status, 200);
    const salvo = await resposta.json();
    // O streamerId é preenchido pela ROTA: o painel não conhece o tenant (ADR-003).
    assert.equal(salvo.streamerId, REGRAS.STREAMER_ID);
    assert.deepEqual(salvo.elementos.presente, { x: 33.5, y: 70, escala: 1.25 });

    const relido = await (await fetch(`${basePainel}/api/overlay/layout`)).json();
    assert.deepEqual(relido.elementos.presente, { x: 33.5, y: 70, escala: 1.25 });

    //[[ É este evento que dispensa o streamer de mexer no OBS.
    //
    // A fonte de navegador fica aberta durante a live inteira, e recarregar uma
    // fonte no meio da transmissão é justamente o que ninguém consegue fazer.
    // Sem o `layout` no SSE, arrastar uma caixa no painel não mudaria nada na
    // tela até a próxima abertura do programa de captura. ]]
    const aviso = recebidos.filter((r) => r.evento === "layout");
    assert.equal(aviso.length, 2, "um na assinatura, um depois do PUT");
    assert.deepEqual(aviso.at(-1).dados.elementos.presente, { x: 33.5, y: 70, escala: 1.25 });
  } finally {
    parar();
  }
});

test("o streamerId do CORPO não vence o da ponte: quem manda o tenant é a rota (ADR-003)", async () => {
  // O spread do corpo ficava DEPOIS do streamerId da ponte, então qualquer
  // requisição gravava o tenant que quisesse em disco — enquanto o resto da
  // Fase 1 assume "local". Só morderia na Fase 3, e calado.
  const resposta = await fetch(`${basePainel}/api/overlay/layout`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ streamerId: "outro-canal", elementos: { placar: { x: 5 } } }),
  });
  assert.equal(resposta.status, 200);
  assert.equal((await resposta.json()).streamerId, REGRAS.STREAMER_ID);
  assert.equal((await lerJsonOuPadrao(ARQUIVO_DO_LAYOUT)).streamerId, REGRAS.STREAMER_ID);
});

test("PUT sem `elementos` é recusado: corpo truncado não pode significar 'apague a cena'", async () => {
  //[[ A gravação é substituição TOTAL por decisão documentada, então um corpo
  // `{}` — truncado, bug no painel, retry de um fetch abortado — apagaria a
  // cena inteira com escrita atômica e sem confirmação. Como o repositório não
  // pode salvar parcial sem tornar impossível apagar uma exceção, quem exige a
  // intenção é a rota. Apagar continua possível, mas dito. ]]
  await salvarLayout({ elementos: { placar: { x: 7, y: 42 } } });

  for (const corpoRuim of [{}, { elementos: null }, { elementos: [] }, { elementos: "tudo" }]) {
    const resposta = await fetch(`${basePainel}/api/overlay/layout`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpoRuim),
    });
    assert.equal(resposta.status, 400, `${JSON.stringify(corpoRuim)} tinha que ser recusado`);
    assert.equal((await resposta.json()).erro, "layout_invalido");
  }

  assert.deepEqual(
    (await carregarLayout()).elementos,
    { placar: { x: 7, y: 42 } },
    "nenhuma das recusas pode ter encostado na cena",
  );

  // E o pedido EXPLÍCITO de apagar continua passando: é o "voltar ao padrão".
  const limpo = await fetch(`${basePainel}/api/overlay/layout`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ elementos: {} }),
  });
  assert.equal(limpo.status, 200);
  assert.deepEqual((await limpo.json()).elementos, {});
});

test("PUT com layout fora do contrato responde o contrato de erro, sem stack trace", async () => {
  const resposta = await fetch(`${basePainel}/api/overlay/layout`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ elementos: { placar: { x: 120 } } }),
  });
  const corpo = await resposta.json();

  assert.equal(resposta.status, 400);
  assert.deepEqual(Object.keys(corpo).sort(), ["erro", "mensagem"]);
  assert.equal(corpo.erro, "layout_invalido");
  assert.equal(JSON.stringify(corpo).includes("at "), false, "nada de stack trace na resposta");
});

test("quem assina o SSE recebe o HUD de cara, para o overlay aberto no meio da live não começar vazio", async () => {
  const recebidos = [];
  const parar = nucleo.ouvir((evento, dados) => recebidos.push({ evento, dados }));
  try {
    const inicial = recebidos.find((r) => r.evento === "hud");
    assert.ok(inicial, "sem HUD na assinatura");
    // Só a disputa: o ranking de doadores saiu por decisão do dono, e com ele
    // o único acúmulo de nickname da ponte (11_SEGURANCA, camada 4).
    assert.deepEqual(Object.keys(inicial.dados), ["disputa"]);
    assert.deepEqual(inicial.dados.disputa, { subida: 0, descida: 0 });

    // E o layout junto, pelo mesmo motivo: a fonte do OBS é aberta uma vez e
    // fica meses aberta. Sem isto ela desenharia no padrão até o streamer
    // salvar algo no estúdio, perdendo o que ele arrumou ontem.
    const layout = recebidos.find((r) => r.evento === "layout");
    assert.ok(layout, "sem layout na assinatura");
    assert.equal(typeof layout.dados.elementos, "object");
  } finally {
    parar();
  }
});

test("erro de domínio vira o contrato de erro, sem stack trace", async () => {
  const resposta = await fetch(`${basePainel}/api/presets/nao-existe`);
  const corpo = await resposta.json();

  assert.equal(resposta.status, 404);
  assert.deepEqual(Object.keys(corpo).sort(), ["erro", "mensagem"]);
  assert.equal(corpo.erro, "preset_nao_encontrado");
  assert.equal(JSON.stringify(corpo).includes("at "), false, "nada de stack trace na resposta");
});

test("preset fora das regras R1 e R2 é recusado com motivo legível", async () => {
  const resposta = await fetch(`${basePainel}/api/presets/teste-invalido`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      streamerId: "local", nome: "Inválido", modalidade: "escalada",
      slots: [
        { posicao: 1, presenteId: "sem-rose", animacaoId: "sub_pulo", delta: 0, intensidade: 1 },
      ],
    }),
  });

  assert.equal(resposta.status, 400);
  assert.equal((await resposta.json()).erro, "preset_invalido", "delta 0 não é presente");
});

test("preset com o mesmo presente em dois slots é recusado (R1.4)", async () => {
  const slot = (posicao) => ({ posicao, presenteId: "sem-rose", animacaoId: "sub_pulo", delta: 2, intensidade: 1 });
  const resposta = await fetch(`${basePainel}/api/presets/teste-repetido`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ streamerId: "local", nome: "Repetido", modalidade: "escalada", slots: [slot(1), slot(2)] }),
  });

  assert.equal(resposta.status, 400);
  assert.equal((await resposta.json()).erro, "presente_repetido");
});

test("preset com dois slots na mesma posição é recusado com posicao_repetida (R1)", async () => {
  //[[ Prova que o código de erro novo atravessa até o painel.
  //
  // A checagem deixou de ser do schema e virou regra cruzada; se ela ficasse só
  // no repositório sem a rota devolver o motivo, o painel mostraria "erro ao
  // salvar" genérico e o streamer não saberia qual caixa arrumar. ]]
  const slot = (posicao, presenteId) => ({ posicao, presenteId, animacaoId: "sub_pulo", delta: 2, intensidade: 1 });
  const resposta = await fetch(`${basePainel}/api/presets/teste-posicao`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      streamerId: "local", nome: "Colidido", modalidade: "escalada",
      slots: [slot(2, "sem-rose"), slot(2, "sem-galaxy")],
    }),
  });

  assert.equal(resposta.status, 400);
  assert.equal((await resposta.json()).erro, "posicao_repetida");
});

test("gerar mapa sem GEMINI_API_KEY diz que quem chama é a ponte", async () => {
  const resposta = await fetch(`${basePainel}/api/mapas/gerar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ descricao: "torre vulcânica ao entardecer" }),
  });

  assert.equal(resposta.status, 503);
  assert.equal((await resposta.json()).erro, "gemini_sem_chave");
});

test("stop sem sessão não explode, responde o contrato de erro", async () => {
  const resposta = await fetch(`${basePainel}/api/sessao/stop`, { method: "POST" });
  assert.equal(resposta.status, 409);
  assert.equal((await resposta.json()).erro, "sem_sessao");
});

test("rota desconhecida devolve o contrato de erro, não HTML do Express", async () => {
  for (const onde of [base, basePainel]) {
    const resposta = await fetch(`${onde}/nao-existe`);
    assert.equal(resposta.status, 404);
    assert.equal((await resposta.json()).erro, "rota_desconhecida");
  }
});

test("o painel simplesmente não existe na porta que o túnel publica", async () => {
  // Este é o teste que vale: mesmo que o túnel seja configurado apontando para
  // a raiz, /api não está nesta porta. É defesa por construção, não por regra.
  const resposta = await fetch(`${base}/api/presets`, { headers: comToken });
  assert.equal(resposta.status, 404);
  assert.equal((await resposta.json()).erro, "rota_desconhecida");
});

test("e o jogo não existe na porta do painel", async () => {
  const resposta = await fetch(`${basePainel}/jogo/mapa`, { headers: comToken });
  assert.equal(resposta.status, 404);
});

/* ---------------------------------------------------------------- */
/* Rate limit                                                        */
/* ---------------------------------------------------------------- */

test("o teto de requisições cabe o jogo legítimo numa live cheia, e corta o que passa dele", () => {
  //[[ O teto era 60, de quando o jogo só fazia long-poll. O batimento de estado
  // a cada 2s já é 30/min, e cada presente devolve o long-poll e abre outro.
  // Numa sessão de teste, 40 cliques no testador de animação em 50s somaram
  // 429 na ponte, backoff no Roblox e "Jogo online" na tela com o boneco
  // parado. A conta abaixo é o mínimo que o teto tem que cobrir. ]]
  const batimentoPorMinuto = 60 / 2;
  const presentesPorMinutoNumaLiveCheia = 120;
  const mapaELookAoMontarMundo = 10;
  assert.ok(
    REGRAS.LIMITE_JOGO_POR_MINUTO >= batimentoPorMinuto + presentesPorMinutoNumaLiveCheia + mapaELookAoMontarMundo,
    `teto de ${REGRAS.LIMITE_JOGO_POR_MINUTO}/min não cabe o jogo legítimo`,
  );
  assert.ok(REGRAS.LIMITE_JOGO_POR_MINUTO <= 500, "acima do teto do HttpService do Roblox o limite não limita nada");

  let instante = 0;
  const limite = limitarTaxa({ agora: () => instante });
  const req = { ip: "1.2.3.4", path: "/jogo/eventos" };

  let bloqueios = 0;
  const res = { status: () => ({ json: () => { bloqueios += 1; } }) };

  for (let i = 0; i < REGRAS.LIMITE_JOGO_POR_MINUTO; i += 1) limite(req, res, () => {});
  assert.equal(bloqueios, 0, "até o teto, tudo passa");

  limite(req, res, () => {});
  assert.equal(bloqueios, 1);

  instante += 60_000;
  let passou = false;
  limite(req, res, () => { passou = true; });
  assert.equal(passou, true, "a janela vira e libera");
});

/* ---------------------------------------------------------------- */
/* ADR-014 — o aviso de fim de rodada sai com a cutscene do preset   */
/* ---------------------------------------------------------------- */

test("com preset ativo, o evento `rodada` já traz o id da cutscene resolvido", async () => {
  // Por último de propósito: os testes acima contam com "sem preset ativo", e
  // o ativo persiste em data/configuracao.json — restaurada no fim, porque a
  // máquina que roda o teste é a mesma que roda a live.
  const PRESET_ID = "teste-cutscene-http";
  const { presetAtivo: anterior } = await carregarConfiguracao();
  await salvarPreset({
    ...(await carregarExemplo("preset-escalada-padrao")),
    presetId: PRESET_ID,
    cutsceneDeVitoria: "final-boss",
    cutsceneDeDerrota: null,
  });

  const recebidos = [];
  const parar = nucleo.ouvir((evento, dados) => recebidos.push({ evento, dados }));
  try {
    await nucleo.definirPresetAtivo(PRESET_ID);
    assert.deepEqual(nucleo.estado.cutscenes, { vitoria: "final-boss", derrota: null });

    await fetch(`${base}/jogo/rodada`, {
      method: "POST",
      headers: { ...comToken, "content-type": "application/json" },
      body: JSON.stringify({ resultado: "vitoria" }),
    });
    const rodada = recebidos.find((r) => r.evento === "rodada");
    assert.equal(rodada.dados.cutscene, "final-boss", "o overlay precisa do id resolvido: ele não conhece preset");

    // E a aba de overlay diz que o escolhido não está na pasta — antes da live.
    const overlay = await (await fetch(`${basePainel}/api/overlay`)).json();
    assert.deepEqual(overlay.emUso.vitoria, { id: "final-boss", existe: false });
    assert.deepEqual(overlay.emUso.derrota, { id: null, existe: false });

    // A legenda do HUD (ADR-015) sai do mesmo preset: 6 slots, o mais forte
    // primeiro. Os ids de exemplo não estão no catálogo real, então o nome é o
    // id e o ícone é nulo — a página mostra o texto no lugar.
    const legenda = await (await fetch(`${basePainel}/api/hud`)).json();
    assert.equal(legenda.presetId, PRESET_ID);
    assert.equal(legenda.slots.length, 6);
    assert.deepEqual(legenda.slots[0], { posicao: 6, presenteId: "sem-lion", nome: "sem-lion", iconeUrl: null, delta: -60 });

    //[[ Mexer nos presentes do preset QUE JÁ ESTÁ NO AR muda a legenda.
    //
    // O overlay relia `/api/hud` só quando o `presetId` trocava. Trocar os
    // presentes dentro do mesmo preset não troca o id: o streamer tirava um
    // presente da live, punha outro, e o overlay seguia anunciando o antigo até
    // alguém recarregar a fonte no OBS. O carimbo é o que o pega.
    //
    // Por último no teste porque MUTA o preset: as asserções acima contam com
    // os 6 slots do exemplo. ]]
    const carimboAntes = nucleo.estado.presetAtualizadoEm;
    assert.ok(carimboAntes, "o estado precisa carregar o carimbo do preset");

    const preset = await (await fetch(`${basePainel}/api/presets/${PRESET_ID}`)).json();
    await fetch(`${basePainel}/api/presets/${PRESET_ID}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...preset, slots: preset.slots.slice(0, 2) }),
    });

    const depois = await (await fetch(`${basePainel}/api/hud`)).json();
    assert.equal(depois.slots.length, 2, "a legenda tem que seguir os slots que o streamer deixou");
    assert.notEqual(
      nucleo.estado.presetAtualizadoEm,
      carimboAntes,
      "sem o carimbo andar, o overlay não tem como saber que o preset mudou por dentro",
    );
    assert.equal(nucleo.estado.presetId, PRESET_ID, "e o preset continua o mesmo: só o conteúdo mudou");
  } finally {
    parar();
    // definirPresetAtivo persiste em segundo plano: espera a escrita cair antes
    // de restaurar, senão ela cairia POR CIMA da restauração.
    for (let i = 0; i < 40 && (await carregarConfiguracao()).presetAtivo !== PRESET_ID; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await salvarConfiguracao({ presetAtivo: anterior ?? null });
    await apagar(caminhoDeDados("presets", `${PRESET_ID}.json`));
  }
});
