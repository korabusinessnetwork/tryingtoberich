import { IDIOMAS } from "../i18n/traduzir.js";
import { useTraducao } from "../i18n/useTraducao.js";
import "./SeletorDeIdioma.css";

/**
 * Troca o idioma do produto: painel, HUD do jogo e overlay (ADR-P03).
 *
 * Três botões, não um `select`. São três opções fixas, e o design system pede
 * estado sempre visível: com `select` o idioma ativo fica escondido atrás de um
 * clique, e o streamer não vê de canto de olho em que língua a live está.
 *
 * O nome de cada idioma vem do catálogo e é escrito NA PRÓPRIA LÍNGUA quando
 * ela é a ativa — quem abriu o painel em espanhol procura "Español", não
 * "Espanhol". Por isso a chave é resolvida normalmente, e não forçada em PT.
 */
export function SeletorDeIdioma() {
  const { t, idioma, trocarIdioma, trocandoIdioma } = useTraducao();

  return (
    <div className="seletor-de-idioma">
      <span className="seletor-de-idioma-rotulo">{t("panel.language.label")}</span>
      <div className="seletor-de-idioma-opcoes" role="group" aria-label={t("panel.language.label")}>
        {IDIOMAS.map((codigo) => (
          <button
            key={codigo}
            type="button"
            className={`seletor-de-idioma-botao${codigo === idioma ? " seletor-de-idioma-botao-ativo" : ""}`}
            aria-pressed={codigo === idioma}
            disabled={trocandoIdioma}
            title={t(`panel.language.${codigo}`)}
            onClick={() => trocarIdioma(codigo)}
          >
            {codigo}
          </button>
        ))}
      </div>
    </div>
  );
}
