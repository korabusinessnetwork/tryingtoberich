import { useEffect, useRef, useState } from "react";

import "./GeradorDeMapa.css";

/**
 * F4 — o streamer descreve o ambiente em texto livre e a ponte gera o mapa.
 *
 * Este componente NUNCA fala com o Gemini e nunca monta prompt (06_COMPONENTES,
 * 11_SEGURANCA): ele só manda a descrição crua para `aoGerar` e mostra o que
 * volta por prop. Quem chama a ponte é o App, via `lib/api.js`.
 *
 * Regra mínima de 5 caracteres espelha `descricao_curta` da rota
 * `POST /api/mapas/gerar` (bridge/src/http/rotas-painel.mjs) — não existe em
 * `lib/regras.js`, então fica local aqui. Ver relatório final.
 */
const DESCRICAO_MINIMA = 5;

/** Rótulo pt-BR do estado do botão de gerar. */
function rotuloDoBotao(gerando) {
  return gerando ? "Gerando…" : "Gerar mapa";
}

export function GeradorDeMapa({
  mapas = [],
  mapaId = null,
  gerando = false,
  erro = null,
  aoGerar,
  aoEscolher,
  travado = false,
}) {
  const [descricao, definirDescricao] = useState("");
  // Qual mapa está com a troca armada, esperando o segundo clique. Mesmo padrão
  // do Stop na barra de sessão: confirmação DENTRO da tela. window.confirm
  // travaria o navegador inteiro num painel que fica aberto durante a live.
  const [armado, definirArmado] = useState(null);
  const gerandoAntes = useRef(gerando);

  // Sessão que termina desarma sozinha: a confirmação existia só por causa dela.
  useEffect(() => {
    if (!travado) definirArmado(null);
  }, [travado]);

  // Limpa o campo só quando uma geração TERMINA COM SUCESSO. Em erro, o texto
  // fica — o streamer não devia digitar tudo de novo para tentar de novo.
  useEffect(() => {
    if (gerandoAntes.current && !gerando && !erro) {
      definirDescricao("");
    }
    gerandoAntes.current = gerando;
  }, [gerando, erro]);

  function submeter(evento) {
    evento.preventDefault();
    const texto = descricao.trim();
    if (texto.length < DESCRICAO_MINIMA || gerando) return;
    aoGerar(texto);
  }

  function escolher(mapa) {
    // F4, nota final: reconstruir 250 plataformas ao vivo travaria a partida.
    // A troca só entra em vigor na próxima entrada na experiência do Roblox —
    // avisar não bloqueia (mesmo espírito de R3), mas exige confirmação
    // explícita quando a sessão está rodando, que é a hora em que o streamer
    // pode achar que o painel quebrou ao não ver nada mudar no jogo.
    if (travado && armado !== mapa.mapaId) {
      definirArmado(mapa.mapaId);
      return;
    }
    definirArmado(null);
    aoEscolher(mapa.mapaId);
  }

  const podeSubmeter = descricao.trim().length >= DESCRICAO_MINIMA && !gerando;
  const mapasOrdenados = [...mapas].sort((a, b) => (b.geradoEm ?? "").localeCompare(a.geradoEm ?? ""));

  return (
    <section className="gerador-de-mapa" aria-busy={gerando}>
      <header className="gerador-de-mapa-cabecalho">
        <h2 className="gerador-de-mapa-titulo">Gerador de mapa</h2>
        {travado && (
          <p className="gerador-de-mapa-aviso-sessao">
            Sessão em andamento — trocar de mapa só vale na próxima entrada na experiência.
          </p>
        )}
      </header>

      <form className="gerador-de-mapa-form" onSubmit={submeter}>
        <label className="gerador-de-mapa-rotulo secundario" htmlFor="gerador-de-mapa-descricao">
          Descreva o ambiente
        </label>
        <textarea
          id="gerador-de-mapa-descricao"
          className="gerador-de-mapa-descricao"
          value={descricao}
          onChange={(evento) => definirDescricao(evento.target.value)}
          placeholder='Ex.: "torre vulcânica ao entardecer, plataformas de rocha"'
          rows={3}
          disabled={gerando}
        />
        <button className="gerador-de-mapa-botao" type="submit" disabled={!podeSubmeter}>
          {rotuloDoBotao(gerando)}
        </button>
      </form>

      {gerando && (
        <p className="gerador-de-mapa-status secundario">
          Chamando o modelo — isso pode levar alguns segundos, e pode falhar. Sem pressa.
        </p>
      )}

      {erro && (
        <p className="pastilha pastilha-erro" role="alert">
          {erro.mensagem ?? erro.message ?? "Não consegui gerar o mapa."}
        </p>
      )}

      <div className="gerador-de-mapa-lista">
        <h3 className="gerador-de-mapa-lista-titulo secundario">Mapas gerados</h3>
        {mapasOrdenados.length === 0 ? (
          <p className="secundario">Nenhum mapa gerado ainda. Descreva um ambiente acima.</p>
        ) : (
          <ul className="gerador-de-mapa-itens">
            {mapasOrdenados.map((mapa) => {
              const ativo = mapa.mapaId === mapaId;
              return (
                <li
                  key={mapa.mapaId}
                  className={ativo ? "gerador-de-mapa-item gerador-de-mapa-item-ativo" : "gerador-de-mapa-item"}
                >
                  <div className="gerador-de-mapa-item-texto">
                    <span className="gerador-de-mapa-item-nome">{mapa.nome}</span>
                    {mapa.promptOriginal && (
                      <span className="gerador-de-mapa-item-prompt secundario">“{mapa.promptOriginal}”</span>
                    )}
                  </div>
                  <button
                    className={
                      armado === mapa.mapaId
                        ? "gerador-de-mapa-item-botao gerador-de-mapa-item-botao-armado"
                        : "gerador-de-mapa-item-botao"
                    }
                    type="button"
                    onClick={() => escolher(mapa)}
                    disabled={ativo}
                  >
                    {ativo ? "Em uso" : armado === mapa.mapaId ? "Confirmar troca" : "Usar este mapa"}
                  </button>
                  {armado === mapa.mapaId && (
                    <p className="gerador-de-mapa-item-alerta" role="status">
                      A sessão está rodando: a troca só vale quando você reentrar na experiência
                      do Roblox. Reconstruir 250 plataformas ao vivo travaria a partida (F4).
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
