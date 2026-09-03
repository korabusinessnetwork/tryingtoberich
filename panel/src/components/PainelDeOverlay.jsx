import { useCallback, useEffect, useState } from "react";

import { api } from "../lib/api.js";
import "./PainelDeOverlay.css";

/**
 * A aba de overlay: o que o streamer cola no OBS.
 *
 * Hoje existe UM overlay, o das cutscenes de vitória e derrota. Ele já
 * funcionava — o que faltava era um lugar que dissesse a URL. Ela estava só no
 * comentário de um arquivo do servidor, e "abre uma fonte de navegador
 * apontando para ..." não é coisa que se guarde de cabeça entre uma live e
 * outra.
 *
 * A aba faz duas coisas, e a segunda importa mais que a primeira:
 *
 *   1. mostra e copia a URL;
 *   2. diz se os VÍDEOS estão no lugar.
 *
 * A cutscene falha calada. Sem o arquivo, o OBS mostra um retângulo
 * transparente, o `<video>` não reclama com ninguém e, do lado de fora, "não
 * apareceu nada" é indistinguível de "a rodada não acabou ainda". Descobrir
 * isso no meio da live é tarde; esta tela é onde se descobre antes.
 */
export function PainelDeOverlay() {
  const [dados, definirDados] = useState(null);
  const [erro, definirErro] = useState(null);
  const [copiado, definirCopiado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      definirErro(null);
      definirDados(await api.overlay());
    } catch (falha) {
      definirErro(falha.message);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const copiar = useCallback(async () => {
    if (!dados?.url) return;
    try {
      // `navigator.clipboard` não existe fora de contexto seguro, e o painel
      // roda em http://127.0.0.1 — que os navegadores tratam COMO seguro. Ainda
      // assim o try/catch fica: recusa de permissão é decisão do usuário, e não
      // pode virar erro vermelho numa tela que está funcionando.
      await navigator.clipboard.writeText(dados.url);
      definirCopiado(true);
      setTimeout(() => definirCopiado(false), 2000);
    } catch {
      definirCopiado(false);
    }
  }, [dados]);

  if (erro) {
    return (
      <section className="overlay">
        <p className="pastilha pastilha-erro">{erro}</p>
        <button type="button" onClick={carregar}>Tentar de novo</button>
      </section>
    );
  }

  if (!dados) {
    return (
      <section className="overlay">
        <p className="overlay-vazio">Carregando…</p>
      </section>
    );
  }

  const faltando = (dados.cutscenes ?? []).filter((c) => !c.existe);

  return (
    <section className="overlay">
      <header className="overlay-cabecalho">
        <h2 className="overlay-titulo">Cutscenes de vitória e derrota</h2>
        <span className="overlay-etiqueta">1 overlay</span>
      </header>

      <p className="overlay-explicacao">
        Uma página transparente que fica por cima da captura do jogo e toca o vídeo quando o
        placar muda. O Roblox não aceita vídeo; por isso ela vive no OBS, e não dentro do jogo.
      </p>

      <div className="overlay-url">
        <code className="overlay-endereco">{dados.url}</code>
        <button type="button" className="overlay-copiar" onClick={copiar}>
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>

      <ol className="overlay-passos">
        <li>No OBS: <strong>+ → Fonte de navegador</strong>.</li>
        <li>Cole a URL acima. Largura e altura iguais às da sua cena (1080 × 1920 no vertical).</li>
        <li>Deixe a fonte <strong>acima</strong> da captura do Roblox na lista.</li>
        <li>Nada de marcar “desligar quando não estiver visível”: ela precisa estar ouvindo.</li>
      </ol>

      <h3 className="overlay-subtitulo">Vídeos</h3>
      <ul className="overlay-arquivos">
        {(dados.cutscenes ?? []).map((cutscene) => (
          <li key={cutscene.id} className="overlay-arquivo">
            <span
              className={cutscene.existe ? "overlay-marca overlay-marca-ok" : "overlay-marca overlay-marca-falta"}
              aria-hidden="true"
            />
            <span className="overlay-arquivo-nome">{cutscene.id}</span>
            <code className="overlay-arquivo-caminho">{cutscene.caminho}</code>
            {/* Texto junto da cor, nunca cor sozinha (02_DESIGN_SYSTEM). */}
            <span className="overlay-arquivo-estado">
              {cutscene.existe ? `${Math.round(cutscene.bytes / 1024 / 1024)} MB` : "não está lá"}
            </span>
          </li>
        ))}
      </ul>

      {faltando.length > 0 ? (
        <p className="pastilha pastilha-atencao overlay-aviso">
          Sem o arquivo, a cutscene não toca e nada avisa: o OBS mostra um retângulo transparente.
          Ponha o vídeo no caminho acima e recarregue.
        </p>
      ) : null}

      <button type="button" className="overlay-recarregar" onClick={carregar}>
        Verificar de novo
      </button>
    </section>
  );
}
