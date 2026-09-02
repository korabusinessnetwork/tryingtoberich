import { useEffect, useState } from "react";

import "./ContaDaLive.css";

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
    <section className="conta" aria-label="Conta da live">
      <h2 className="conta-titulo">Conta da live</h2>

      <form className="conta-linha" onSubmit={enviar}>
        {/* A arroba é desenho, não texto do campo: a ponte quer o nome sem ela.
            Digitar "@fulano" mesmo assim funciona — o repositório normaliza. */}
        <span className="conta-arroba" aria-hidden="true">@</span>
        <input
          className="conta-campo"
          type="text"
          value={texto}
          onChange={(e) => definirTexto(e.target.value)}
          placeholder="seu_usuario"
          disabled={travado}
          spellCheck="false"
          autoComplete="off"
          aria-label="Usuário do TikTok, sem arroba"
        />
        <button type="submit" className="conta-salvar" disabled={travado || salvando || !limpo || !mudou}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </form>

      {travado ? (
        <p className="conta-recado">A sessão está rodando. Pare para trocar de live.</p>
      ) : configuracao?.usuarioTiktok ? (
        <p className="conta-recado">
          A sessão vai conectar em <strong>@{configuracao.usuarioTiktok}</strong>.
        </p>
      ) : (
        <p className="pastilha pastilha-atencao">
          Sem conta configurada, a sessão não inicia.
        </p>
      )}
    </section>
  );
}
