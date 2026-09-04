/**
 * O overlay de cutscene, para entrar como Browser Source no OBS.
 *
 * O Roblox **não aceita vídeo**: o upload pelo Open Cloud responde
 * `PERMISSION_DENIED ... Recourse options: [IdVerification]`, e mesmo com a
 * conta verificada o `VideoFrame` é recurso restrito. Converter o mp4 em
 * centenas de imagens e tocá-las como sprite dentro do jogo funcionaria, e
 * seria pior em tudo: perde qualidade, perde áudio, e sobrecarrega justamente o
 * momento em que a torre está sendo reerguida.
 *
 * Fora do jogo é o lugar certo. Numa live, a cutscene é do OVERLAY, não do
 * mundo: ela cobre a tela inteira em qualidade cheia, com som, e o Roblox
 * segue rodando embaixo sem saber de nada.
 *
 * Como o overlay sabe que a rodada acabou: o JOGO AVISA, pelo evento `rodada`
 * do SSE, no instante em que o resultado é definitivo — a contagem da vitória
 * zerou sem o streamer sair do topo, ou o portal quebrou (ADR-014). Antes esta
 * página comparava o placar com o anterior, e isso errava nos dois sentidos:
 * o placar sobe no INÍCIO da contagem, que a vitória ainda pode abandonar, e
 * a ponte reiniciada zerava o contador dela enquanto o do jogo continuava —
 * o primeiro estado depois disso tocava uma vitória que ninguém teve.
 *
 * QUAL vídeo toca é escolha do preset: `cutsceneDeVitoria` e
 * `cutsceneDeDerrota` viajam no `estado` como `cutscenes`, e a página aponta
 * os dois `<video>` para `/overlay/video/:id` assim que a escolha muda — antes de a
 * rodada acabar, para o vídeo já estar carregado quando o aviso chegar. O
 * aviso traz o id de novo, para o caso de o overlay ter aberto no meio. Nula
 * = nada toca, e o placar só muda.
 *
 * Serve HTML e vídeo pela porta do PAINEL, que nunca sai da máquina
 * (`11_SEGURANCA`, camada 1). O OBS roda aqui do lado; o túnel não alcança.
 */

//[[ O acesso ao arquivo vive no repositório.
//
// O painel precisa da MESMA resposta ("esse vídeo está lá?") para poder avisar
// antes da live, e a validação do id — que é o que impede `..` de virar
// caminho — tem que morar num lugar só. ]]
import { abrirCutscene } from "../repos/cutscenes.mjs";

const PAGINA = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Kora — cutscenes</title>
<style>
  /* Fundo TRANSPARENTE: o OBS compõe por cima da captura do jogo. Sem isto o
     overlay pintaria um retângulo preto sobre a live o tempo todo. */
  html, body {
    margin: 0; padding: 0; height: 100%; overflow: hidden;
    background: transparent;
  }
  video {
    position: fixed; inset: 0;
    width: 100%; height: 100%;
    object-fit: contain;
    background: transparent;
    /* Escondido por padrão e revelado no play: um <video> parado mostraria o
       primeiro quadro congelado sobre a live. */
    opacity: 0;
    transition: opacity 180ms linear;
    pointer-events: none;
  }
  video.tocando { opacity: 1; }
</style>
</head>
<body>
  <!-- Sem src de propósito: quem diz qual vídeo é o estado, não a página. -->
  <video id="vitoria" preload="auto" playsinline></video>
  <video id="derrota" preload="auto" playsinline></video>

<script>
(function () {
  var videos = {
    vitoria: document.getElementById("vitoria"),
    derrota: document.getElementById("derrota"),
  };
  var apontadas = { vitoria: null, derrota: null }; // o id carregado em cada <video>

  function algumTocando() {
    return videos.vitoria.classList.contains("tocando") || videos.derrota.classList.contains("tocando");
  }

  // Troca o vídeo de um resultado quando o preset muda de ideia. Carrega na
  // hora, e não no play: o momento de tocar é o pior para começar a baixar.
  function apontar(qual, id) {
    if (apontadas[qual] === id) return;
    apontadas[qual] = id;
    var video = videos[qual];
    video.classList.remove("tocando");
    if (id) video.src = "/overlay/video/" + encodeURIComponent(id);
    else video.removeAttribute("src");
    video.load();
  }

  function tocar(qual) {
    var video = videos[qual];
    if (!video || !apontadas[qual] || algumTocando()) return;
    video.currentTime = 0;
    video.classList.add("tocando");
    var promessa = video.play();
    if (promessa && promessa.catch) {
      // O OBS não exige gesto do usuário, mas um navegador comum exige: sem
      // isto a página abriria muda e ninguém saberia por quê.
      promessa.catch(function (erro) {
        video.classList.remove("tocando");
        console.warn("[kora] o vídeo não tocou:", erro);
      });
    }
  }

  Object.keys(videos).forEach(function (qual) {
    videos[qual].addEventListener("ended", function () {
      videos[qual].classList.remove("tocando");
    });
    // Arquivo que sumiu da pasta no meio da live: sem isto a página ficaria
    // "tocando" um vídeo que nunca vai terminar, e a próxima rodada ficaria muda.
    videos[qual].addEventListener("error", function () {
      videos[qual].classList.remove("tocando");
      console.warn("[kora] o vídeo de " + qual + " não carregou:", apontadas[qual]);
    });
  });

  // O estado só PREPARA: aponta cada <video> para a escolha do preset, para
  // o arquivo estar carregado antes de a rodada acabar. Nunca toca nada.
  function aoEstado(estado) {
    if (!estado) return;
    var escolhidas = estado.cutscenes || {};
    apontar("vitoria", typeof escolhidas.vitoria === "string" ? escolhidas.vitoria : null);
    apontar("derrota", typeof escolhidas.derrota === "string" ? escolhidas.derrota : null);
  }

  // O gatilho é o AVISO do jogo, no instante em que o resultado é definitivo.
  // O aviso traz o id: se o overlay abriu depois de a escolha mudar, aponta
  // agora e toca — um load a mais é melhor que um vídeo errado.
  function aoRodada(dados) {
    if (!dados || (dados.resultado !== "vitoria" && dados.resultado !== "derrota")) return;
    apontar(dados.resultado, typeof dados.cutscene === "string" ? dados.cutscene : null);
    tocar(dados.resultado);
  }

  function ligar() {
    var fonte = new EventSource("/api/sessao/stream");
    fonte.addEventListener("estado", function (evento) {
      try { aoEstado(JSON.parse(evento.data)); } catch (e) { /* quadro solto */ }
    });
    fonte.addEventListener("rodada", function (evento) {
      try { aoRodada(JSON.parse(evento.data)); } catch (e) { /* quadro solto */ }
    });
    // Reconecta sozinho: o EventSource já faz isso, mas a ponte reiniciada
    // fecha o fluxo e o OBS não recarrega a página sozinho.
    fonte.onerror = function () { console.warn("[kora] fluxo caiu; o EventSource vai reconectar"); };
  }

  ligar();
})();
</script>
</body>
</html>`;

/** Registra as rotas do overlay no app do painel. */
export function montarOverlay(rotas) {
  // Também em `/overlay.html`. A fonte "Link" do TikTok LIVE Studio (1.35) só
  // aceita URL em que apareça `algo.letras`: a validação dele exige um domínio
  // de letras, e `127.0.0.1` termina em número — "Digite o URL correto". O
  // `.html` no caminho satisfaz a regra sem sair da máquina; o OBS aceita as
  // duas formas. É a forma que `/api/overlay` entrega.
  rotas.get(["/overlay", "/overlay.html"], (req, res) => {
    res.set("content-type", "text/html; charset=utf-8");
    res.send(PAGINA);
  });

  // Debaixo de `/overlay/video/` e não de `/overlay/:id`: a segunda página
  // (`/overlay/hud`, ADR-015) mora ao lado, e um id de cutscene não pode
  // roubar o nome de uma página.
  rotas.get("/overlay/video/:id", async (req, res) => {
    // Tolerante à extensão: `vitoria.mp4` colado num navegador para conferir
    // ainda funciona. O id é o que o repositório valida — `..` nunca passa.
    const id = String(req.params.id).replace(/\.(mp4|webm)$/i, "");

    // O acesso a disco passa pelo repositório (ADR-003), inclusive para vídeo:
    // a regra é sobre o diretório, não sobre o formato do arquivo.
    const fonte = await abrirCutscene(id);
    if (!fonte) {
      res.status(404).json({
        erro: "cutscene_ausente",
        mensagem: "Não há esse vídeo em data/cutscenes/ (.mp4 ou .webm, nome só com minúsculas, números e hífen).",
      });
      return;
    }
    const tamanho = fonte.tamanho;

    //[[ Range é OBRIGATÓRIO para vídeo.
    //
    // O Chromium (que é o que o OBS embute) pede o arquivo por pedaços e
    // desiste se o servidor responder 200 com o corpo inteiro: o vídeo fica
    // preto e não há erro em lugar nenhum. Responder 206 com o trecho pedido é
    // o que faz `<video>` funcionar. ]]
    const faixa = req.headers.range;
    if (faixa) {
      const [inicioBruto, fimBruto] = faixa.replace(/bytes=/, "").split("-");
      const inicio = Number(inicioBruto) || 0;
      const fim = fimBruto ? Number(fimBruto) : tamanho - 1;

      res.status(206).set({
        "content-range": `bytes ${inicio}-${fim}/${tamanho}`,
        "accept-ranges": "bytes",
        "content-length": fim - inicio + 1,
        "content-type": fonte.tipo,
      });
      fonte.trecho(inicio, fim).pipe(res);
      return;
    }

    res.set({ "content-length": tamanho, "content-type": fonte.tipo, "accept-ranges": "bytes" });
    fonte.inteiro().pipe(res);
  });
}
