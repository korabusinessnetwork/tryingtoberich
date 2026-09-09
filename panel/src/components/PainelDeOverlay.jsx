import { useCallback, useEffect, useState } from "react";

import { api } from "../lib/api.js";
import "./PainelDeOverlay.css";

/**
 * A aba de overlay: o que o streamer cola no OBS ou no TikTok LIVE Studio.
 *
 * São DUAS fontes de navegador, na mesma porta do painel:
 *
 *   - as cutscenes de vitória e derrota (ADR-014), que tocam o vídeo quando a
 *     rodada acaba;
 *   - o HUD da live (ADR-015): placar, legenda dos presentes, a barra "VS" da
 *     disputa, portal, contagem regressiva e o aviso de seguidor. O ranking de
 *     doadores e o pote de moedas saíram por risco de restrição na live, e a
 *     barra da torre voltou para dentro do jogo, onde ela anda a cada degrau.
 *
 * Elas já funcionavam do lado da ponte — o que faltava era um lugar que
 * dissesse a URL. "Abre uma fonte de navegador apontando para ..." não é
 * coisa que se guarde de cabeça entre uma live e outra.
 *
 * A aba faz três coisas, e a terceira importa mais:
 *
 *   1. mostra e copia as URLs;
 *   2. lista os vídeos que estão na pasta — a pasta É a lista (ADR-014);
 *   3. diz se o vídeo que o preset ativo escolheu ESTÁ lá.
 *
 * A cutscene falha calada. Sem o arquivo, o OBS mostra um retângulo
 * transparente, o `<video>` não reclama com ninguém e, do lado de fora, "não
 * apareceu nada" é indistinguível de "a rodada não acabou ainda". Descobrir
 * isso no meio da live é tarde; esta tela é onde se descobre antes.
 *
 * Qual vídeo toca em cada resultado não se escolhe aqui: é do preset, em
 * "Presentes de placar", junto dos presentes que provocam cada um.
 *
 * As URLs vêm com `.html` no fim porque a fonte "Link" do LIVE Studio recusa
 * URL sem um `algo.letras` no texto, e `127.0.0.1` não tem. Quem monta a URL
 * é a ponte; aqui só se mostra e copia.
 */
const RESULTADOS = [
  ["vitoria", "Vitória"],
  ["derrota", "Derrota"],
];

const FONTES = [
  {
    chave: "url",
    titulo: "Cutscenes",
    descricao: "Toca o vídeo de vitória ou derrota quando a rodada acaba. Transparente o resto do tempo.",
  },
  {
    chave: "urlHud",
    titulo: "HUD da live",
    descricao:
      "Placar, legenda dos presentes, disputa subida × descida da rodada, portal, contagem regressiva e o aviso de seguidor novo. A barra da torre é a única coisa que o jogo ainda desenha, porque ela precisa andar a cada degrau. Nada de doador nem de moeda aqui — o que aparece é o presente e o que ele faz com a torre.",
  },
];

/** Os ajustes do HUD viajam na própria URL: cada cena tem uma proporção de cam. */
const PARAMETROS_DO_HUD = [
  ["?cam=33", "altura da área da cam, em % da tela; o resto é o jogo. Nada é desenhado sobre a cam, então errar aqui desloca o conjunto e nunca cobre o seu rosto"],
  [
    "?esticar=nao",
    "desliga o pré-estique. A página é 9:16; se a fonte a renderiza em paisagem (a “Link” do LIVE Studio faz isso) e o item é esticado para preencher a cena, ela se pré-estica sozinha para sair certa. Só desligue se a sua fonte já for 9:16",
  ],
];

export function PainelDeOverlay() {
  const [dados, definirDados] = useState(null);
  const [erro, definirErro] = useState(null);
  const [copiada, definirCopiada] = useState(null);

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

  const copiar = useCallback(async (chave) => {
    const url = dados?.[chave];
    if (!url) return;
    try {
      // `navigator.clipboard` não existe fora de contexto seguro, e o painel
      // roda em http://127.0.0.1 — que os navegadores tratam COMO seguro. Ainda
      // assim o try/catch fica: recusa de permissão é decisão do usuário, e não
      // pode virar erro vermelho numa tela que está funcionando.
      await navigator.clipboard.writeText(url);
      definirCopiada(chave);
      setTimeout(() => definirCopiada(null), 2000);
    } catch {
      definirCopiada(null);
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

  const naPasta = dados.cutscenes ?? [];
  const ignorados = dados.ignorados ?? [];
  const emUso = dados.emUso ?? {};
  const pasta = dados.pasta ?? "data/cutscenes";
  const sumidas = RESULTADOS.filter(([qual]) => emUso[qual]?.id && !emUso[qual].existe);

  return (
    <section className="overlay">
      <header className="overlay-cabecalho">
        <h2 className="overlay-titulo">Overlays da live</h2>
        <span className="overlay-etiqueta">{FONTES.length} fontes de navegador</span>
      </header>

      <p className="overlay-explicacao">
        Páginas transparentes que ficam por cima da captura do jogo e da cam. O Roblox não aceita
        vídeo nem ícone de presente da TikTok; por isso elas vivem no OBS ou no TikTok LIVE Studio,
        e não dentro do jogo.
      </p>

      <ul className="overlay-fontes">
        {FONTES.map(({ chave, titulo, descricao }) => (
          <li key={chave} className="overlay-fonte">
            <span className="overlay-fonte-titulo">{titulo}</span>
            <p className="overlay-fonte-descricao">{descricao}</p>
            <div className="overlay-url">
              <code className="overlay-endereco">{dados[chave] ?? "—"}</code>
              <button type="button" className="overlay-copiar" onClick={() => copiar(chave)}>
                {copiada === chave ? "Copiado" : "Copiar"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <ol className="overlay-passos">
        <li>No OBS: <strong>+ → Fonte de navegador</strong>, uma para cada URL.</li>
        <li>
          No TikTok LIVE Studio: <strong>Adicionar origem → Link</strong>, uma para cada URL. Cole
          a URL inteira, com o <code>.html</code> no fim — sem ele o LIVE Studio responde “Digite o
          URL correto”.
        </li>
        <li>Largura e altura iguais às da sua cena (1080 × 1920 no vertical).</li>
        <li>Deixe as duas <strong>acima</strong> da captura do Roblox e da cam na lista.</li>
        <li>Nada de marcar “desligar quando não estiver visível”: elas precisam estar ouvindo.</li>
      </ol>

      <p className="overlay-explicacao">
        Onde cada peça do HUD aparece na tela se arruma na página <strong>Estúdio</strong>: lá o
        placar, as legendas e o resto se arrastam pela cena. Salvar lá ajusta a fonte que já está
        aberta no OBS — não é preciso recarregá-la.
      </p>

      <h3 className="overlay-subtitulo">Ajustes do HUD, na URL</h3>
      <ul className="overlay-parametros">
        {PARAMETROS_DO_HUD.map(([parametro, efeito]) => (
          <li key={parametro} className="overlay-parametro">
            <code className="overlay-parametro-chave">{parametro}</code>
            <span className="overlay-parametro-efeito">{efeito}</span>
          </li>
        ))}
      </ul>

      <h3 className="overlay-subtitulo">Cutscene em uso no preset ativo</h3>
      <ul className="overlay-arquivos">
        {RESULTADOS.map(([qual, rotulo]) => {
          const escolha = emUso[qual] ?? { id: null, existe: false };
          const situacao = !escolha.id ? "nenhuma" : escolha.existe ? "ok" : "falta";
          return (
            <li key={qual} className="overlay-arquivo">
              <span className={`overlay-marca overlay-marca-${situacao}`} aria-hidden="true" />
              <span className="overlay-arquivo-nome">{rotulo}</span>
              <code className="overlay-arquivo-caminho">{escolha.id ?? "—"}</code>
              {/* Texto junto da cor, nunca cor sozinha (02_DESIGN_SYSTEM). */}
              <span className="overlay-arquivo-estado">
                {situacao === "nenhuma" && "nenhuma — só o placar muda"}
                {situacao === "ok" && "na pasta"}
                {situacao === "falta" && "não está na pasta"}
              </span>
            </li>
          );
        })}
      </ul>

      <h3 className="overlay-subtitulo">Vídeos em {pasta}</h3>
      {naPasta.length === 0 ? (
        <p className="overlay-vazio">
          Nenhum vídeo ainda. Ponha um <code>.mp4</code> ou <code>.webm</code> em{" "}
          <code>{pasta}</code> — nome só com minúsculas, números e hífen — e verifique de novo.
        </p>
      ) : (
        <ul className="overlay-arquivos">
          {naPasta.map((cutscene) => (
            <li key={cutscene.id} className="overlay-arquivo">
              <span className="overlay-marca overlay-marca-ok" aria-hidden="true" />
              <span className="overlay-arquivo-nome">{cutscene.id}</span>
              <code className="overlay-arquivo-caminho">{cutscene.caminho}</code>
              <span className="overlay-arquivo-estado">
                {Math.round(cutscene.bytes / 1024 / 1024)} MB
              </span>
            </li>
          ))}
        </ul>
      )}

      {ignorados.length > 0 ? (
        <p className="overlay-explicacao">
          Fora do padrão de nome, e por isso fora da lista: {ignorados.join(", ")}. Vale só
          minúsculas, números e hífen, terminando em <code>.mp4</code> ou <code>.webm</code>.
        </p>
      ) : null}

      {sumidas.length > 0 ? (
        <p className="pastilha pastilha-atencao overlay-aviso">
          O preset ativo aponta para um vídeo que não está na pasta. Sem ele, a cutscene não
          toca e nada avisa: o OBS mostra um retângulo transparente. Ponha o arquivo lá, ou
          troque a escolha em Presentes de placar.
        </p>
      ) : null}

      <button type="button" className="overlay-recarregar" onClick={carregar}>
        Verificar de novo
      </button>
    </section>
  );
}
