import { useEffect, useState } from "react";

import { useTraducao } from "../i18n/useTraducao.js";

import "./ContaDaLive.css";

/**
 * Costura a conta em destaque de volta na frase traduzida.
 *
 * O catálogo guarda a frase INTEIRA com `{conta}` onde entra o `<strong>` —
 * quem traduz lê a frase toda, e o negrito continua envolvendo só o `@conta`,
 * como antes da i18n. Mesmo padrão do `HistoricoDeSessoes`.
 */
function comContaEmDestaque(texto, conta) {
  return texto
    .split(/(\{conta\})/g)
    .map((pedaco, indice) => (pedaco === "{conta}" ? <strong key={indice}>@{conta}</strong> : pedaco));
}

/**
 * O @ da live. É ele que decide em QUAL live o jogo vai rodar.
 *
 * Antes desta tela isso só existia no `.env`, e o valor de fábrica
 * (`seu_usuario_sem_arroba`) passava pela guarda de "não vazio": a ponte tentava
 * conectar numa conta que nunca existiu e o streamer via um erro do TikTok em
 * vez de "configure sua conta".
 *
 * Trava com a sessão rodando, pelo mesmo motivo que modalidade e look: trocar a
 * live no meio da partida não é uma edição, é outra sessão.
 */
export function ContaDaLive({ configuracao, salvando, travado, aoSalvar }) {
  const { t } = useTraducao();
  const [texto, definirTexto] = useState("");

  // Sincroniza quando a carga chega, sem pisar no que o streamer está digitando.
  useEffect(() => {
    definirTexto(configuracao?.usuarioTiktok ?? "");
  }, [configuracao?.usuarioTiktok]);

  const limpo = texto.trim();
  const mudou = limpo !== (configuracao?.usuarioTiktok ?? "");

  const enviar = (evento) => {
    evento.preventDefault();
    if (!limpo || travado || salvando) return;
    aoSalvar(limpo);
  };

  return (
    <section className="conta" aria-label={t("panel.liveAccount.title")}>
      <h2 className="conta-titulo">{t("panel.liveAccount.title")}</h2>

      <form className="conta-linha" onSubmit={enviar}>
        {/* A arroba é desenho, não texto do campo: a ponte quer o nome sem ela.
            Digitar "@fulano" mesmo assim funciona — o repositório normaliza. */}
        <span className="conta-arroba" aria-hidden="true">@</span>
        <input
          className="conta-campo"
          type="text"
          value={texto}
          onChange={(e) => definirTexto(e.target.value)}
          placeholder={t("panel.liveAccount.usernamePlaceholder")}
          disabled={travado}
          spellCheck="false"
          autoComplete="off"
          aria-label={t("panel.liveAccount.usernameLabel")}
        />
        <button type="submit" className="conta-salvar" disabled={travado || salvando || !limpo || !mudou}>
          {salvando ? t("common.state.saving") : t("common.action.save")}
        </button>
      </form>

      {travado ? (
        <p className="conta-recado">{t("panel.liveAccount.lockedNotice")}</p>
      ) : configuracao?.usuarioTiktok ? (
        <p className="conta-recado">
          {comContaEmDestaque(t("panel.liveAccount.willConnect"), configuracao.usuarioTiktok)}
        </p>
      ) : (
        <p className="pastilha pastilha-atencao">
          {t("panel.liveAccount.missingAccount")}
        </p>
      )}
    </section>
  );
}
