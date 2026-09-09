import { useTraducao } from "../i18n/useTraducao.js";
import "./BotaoAbrirJogo.css";

/**
 * Abre o jogo no Roblox Studio, pronto para dar Play.
 *
 * Quem executa é a PONTE, não o navegador: página web não abre programa local,
 * e nem deveria. O painel só pede; o processo nasce no Node, que já roda aqui.
 *
 * O botão não abre o Studio vazio — ele monta um `.rbxlx` com o jogo inteiro E
 * com os dois passos manuais do `game/README` já feitos: o `KoraConfig` no
 * ServerStorage (URL e token da ponte) e o HttpService ligado. Sem isso o
 * streamer criava uma Folder e dois StringValue na mão, e errar um nome dava
 * "falta configurar a ponte" sem dizer onde.
 *
 * Sobra o Play. Só isso.
 */
export function BotaoAbrirJogo({ abrindo, resultado, erro, aoAbrir }) {
  const { t } = useTraducao();

  const recado = () => {
    if (erro) return { texto: erro, classe: "pastilha pastilha-erro" };
    if (!resultado) return null;

    return {
      texto: t("panel.openGame.ready"),
      classe: "pastilha pastilha-ok",
    };
  };

  const aviso = recado();

  // A frase do passo é UMA chave só, com o marcador {action} no meio: quem
  // traduz vê a frase inteira, e o "Play" — nome do botão do Studio, que não
  // se traduz — continua em negrito sem quebrar o texto em dois pedaços.
  const [antesDoPlay, depoisDoPlay] = t("panel.openGame.afterOpen").split("{action}");

  return (
    <section className="abrir-jogo" aria-label={t("panel.openGame.sectionLabel")}>
      <button type="button" className="abrir-jogo-botao" disabled={abrindo} onClick={aoAbrir}>
        {abrindo ? t("panel.openGame.building") : t("panel.openGame.action")}
      </button>

      {aviso ? <p className={aviso.classe}>{aviso.texto}</p> : null}

      {/* O único passo que sobrou para a pessoa. Fica à vista antes do clique
          porque um Studio abrindo é lento, e saber o que fazer quando ele abrir
          evita o "e agora?". */}
      <p className="abrir-jogo-passos">
        {antesDoPlay}
        {/* Nome do botão do Roblox Studio: é o mesmo nos três idiomas e não
            entra no catálogo. Fica como expressão, e não como texto solto,
            para o teste de string cravada não confundir identificador de
            outro programa com frase de tela. */}
        <strong>{"Play"}</strong>
        {depoisDoPlay}
      </p>
    </section>
  );
}
