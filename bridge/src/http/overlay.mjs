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
 * Como o overlay sabe que a rodada acabou: pelo PLACAR. O jogo reporta
 * `vitorias` e `derrotas` no estado, a ponte repassa pelo SSE, e esta página
 * compara com o número anterior. Comparar número é o único jeito que funciona
 * para os dois casos — a vitória tem um booleano no estado, a derrota não tem
 * nada equivalente.
 *
 * Serve HTML e vídeo pela porta do PAINEL, que nunca sai da máquina
 * (`11_SEGURANCA`, camada 1). O OBS roda aqui do lado; o túnel não alcança.
 */

//[[ A lista e o acesso ao arquivo vivem no repositório.
//
// O painel precisa da MESMA resposta ("esse vídeo está lá?") para poder avisar
// antes da live, e duas cópias da lista de nomes desencostariam na primeira
// cutscene nova. ]]
import { abrirCutscene, CUTSCENES } from "../repos/cutscenes.mjs";

export { CUTSCENES };

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
  <video id="vitoria" src="/overlay/vitoria.mp4" preload="auto" playsinline></video>
  <video id="derrota" src="/overlay/derrota.mp4" preload="auto" playsinline></video>

<script>
(function () {
  var videos = {
    vitoria: document.getElementById("vitoria"),
    derrota: document.getElementById("derrota"),
  };
  var placar = null;   // null = ainda não sabemos; o primeiro estado só calibra
  var tocando = false;

  function tocar(qual) {
    var video = videos[qual];
    if (!video || tocando) return;
    tocando = true;
    video.currentTime = 0;
    video.classList.add("tocando");
    var promessa = video.play();
    if (promessa && promessa.catch) {
      // O OBS não exige gesto do usuário, mas um navegador comum exige: sem
      // isto a página abriria muda e ninguém saberia por quê.
      promessa.catch(function (erro) { console.warn("[kora] o vídeo não tocou:", erro); });
    }
  }

  Object.keys(videos).forEach(function (qual) {
    videos[qual].addEventListener("ended", function () {
      videos[qual].classList.remove("tocando");
      tocando = false;
    });
  });

  function aoEstado(estado) {
    if (!estado || typeof estado.vitorias !== "number") return;

    // O PRIMEIRO estado só calibra. Sem isto, abrir o overlay no meio de uma
    // live com 3 vitórias no placar dispararia a cutscene na hora.
    if (placar === null) {
      placar = { vitorias: estado.vitorias, derrotas: estado.derrotas };
      return;
    }

    if (estado.vitorias > placar.vitorias) tocar("vitoria");
    else if (estado.derrotas > placar.derrotas) tocar("derrota");

    placar = { vitorias: estado.vitorias, derrotas: estado.derrotas };
  }

  function ligar() {
    var fonte = new EventSource("/api/sessao/stream");
    fonte.addEventListener("estado", function (evento) {
      try { aoEstado(JSON.parse(evento.data)); } catch (e) { /* quadro solto */ }
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
  rotas.get("/overlay", (req, res) => {
    res.set("content-type", "text/html; charset=utf-8");
    res.send(PAGINA);
  });

  rotas.get("/overlay/:nome", async (req, res) => {
    const nome = String(req.params.nome).replace(/\.mp4$/, "");
    const arquivo = CUTSCENES[nome];
    if (!arquivo) {
      res.status(404).json({ erro: "cutscene_desconhecida", mensagem: "Só existem vitoria.mp4 e derrota.mp4." });
      return;
    }

    // O acesso a disco passa pelo repositório (ADR-003), inclusive para vídeo:
    // a regra é sobre o diretório, não sobre o formato do arquivo.
    const fonte = await abrirCutscene(nome);
    if (!fonte) {
      res.status(404).json({
        erro: "cutscene_ausente",
        mensagem: `Ponha o vídeo em data/cutscenes/${arquivo}.`,
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
        "content-type": "video/mp4",
      });
      fonte.trecho(inicio, fim).pipe(res);
      return;
    }

    res.set({ "content-length": tamanho, "content-type": "video/mp4", "accept-ranges": "bytes" });
    fonte.inteiro().pipe(res);
  });
}
