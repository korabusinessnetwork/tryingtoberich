import { useState } from "react";

import { useTraducao } from "../i18n/useTraducao.js";

import "./GaleriaDeSkins.css";

/**
 * A galeria de skins: nicks do Roblox que o vestiário oferece como base.
 *
 * A miniatura é o ponto do componente, não enfeite. Sem ela o streamer
 * acrescenta um nick às cegas e só descobre o que veio quando veste no jogo —
 * e como o Roblox não tem um "código de avatar", o nick é a única chave que
 * existe. Ver antes de salvar é o que torna a lista curável.
 *
 * A busca por palavra-chave do Roblox está bloqueada para chamada sem
 * autenticação (devolve erro vazio), então não dá para navegar: o streamer traz
 * o nick de fora e aqui confere que é a pessoa certa.
 */
export function GaleriaDeSkins({ nicks, espiada, espiando, salvando, aoEspiar, aoAdicionar, aoRemover }) {
  const { t } = useTraducao();
  const [nick, definirNick] = useState("");

  const limpo = nick.trim().replace(/^@+/, "");
  const jaEsta = nicks.some((n) => n.toLowerCase() === limpo.toLowerCase());

  const espiar = (evento) => {
    evento.preventDefault();
    if (limpo.length >= 3 && !espiando) aoEspiar(limpo);
  };

  return (
    <section className="galeria" aria-label={t("panel.skinGallery.title")}>
      <header className="galeria-cabecalho">
        <h2 className="galeria-titulo">{t("panel.skinGallery.title")}</h2>
        <span className="galeria-etiqueta">{t("panel.skinGallery.countInList", { n: nicks.length })}</span>
      </header>

      <p className="galeria-explicacao">{t("panel.skinGallery.explanation")}</p>

      <form className="galeria-busca" onSubmit={espiar}>
        <input
          className="galeria-campo"
          type="text"
          value={nick}
          onChange={(evento) => definirNick(evento.target.value)}
          placeholder={t("panel.skinGallery.nickPlaceholder")}
          spellCheck="false"
          autoComplete="off"
          aria-label={t("panel.skinGallery.nickLabel")}
        />
        <button type="submit" className="galeria-espiar" disabled={limpo.length < 3 || espiando}>
          {espiando ? t("panel.skinGallery.peeking") : t("panel.skinGallery.peekAction")}
        </button>
      </form>

      {espiada ? (
        <div className="galeria-previa">
          {espiada.imagemUrl ? (
            <img
              className="galeria-previa-imagem"
              src={espiada.imagemUrl}
              alt={t("panel.skinGallery.avatarAlt", { nick: espiada.nick })}
            />
          ) : (
            // A miniatura pode vir "Pending" enquanto o Roblox a gera. Sem
            // figura ainda dá para adicionar — só não dá para conferir.
            <div className="galeria-previa-imagem galeria-previa-vazia">{t("panel.skinGallery.noImage")}</div>
          )}

          <div className="galeria-previa-dados">
            <strong className="galeria-previa-nick">{espiada.nick}</strong>
            <span className="galeria-previa-detalhe">
              {t("panel.skinGallery.previewDetail", {
                n: espiada.assets.length,
                type: espiada.playerAvatarType ?? "?",
              })}
            </span>
            <button
              type="button"
              className="galeria-adicionar"
              disabled={jaEsta || salvando}
              onClick={() => aoAdicionar(espiada.nick)}
            >
              {jaEsta ? t("panel.skinGallery.alreadyAdded") : t("panel.skinGallery.addAction")}
            </button>
          </div>
        </div>
      ) : null}

      {nicks.length === 0 ? (
        <p className="galeria-vazio">{t("panel.skinGallery.emptyState")}</p>
      ) : (
        <ul className="galeria-lista">
          {nicks.map((n) => (
            <li className="galeria-linha" key={n}>
              <span className="galeria-nome">{n}</span>
              <button
                type="button"
                className="galeria-remover"
                aria-label={t("panel.skinGallery.removeLabel", { nick: n })}
                disabled={salvando}
                onClick={() => aoRemover(n)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
