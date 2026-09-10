import { arroba, distancia, estadoDaLicenca, mensagemDeFalha, ouVazio } from "../lib/formatar.js";
import { CampoDeBusca } from "./CampoDeBusca.jsx";
import "./ListaDeAssinantes.css";

/**
 * Item 1 do ADR-P05: a lista de assinantes, com a busca.
 *
 * Cada linha responde três perguntas, e nada além delas: **quem é**, **a
 * licença está de pé** e **essa pessoa ainda usa o produto**. Tudo o mais é da
 * ficha. Uma lista que tenta mostrar a ficha inteira por linha vira uma tabela
 * que não cabe na tela e que ninguém varre com o olho.
 *
 * O e-mail aparece porque é a única coisa que identifica sem ambiguidade quem
 * escreveu pedindo suporte, e é por isso que ele existe no banco (LGPD, o
 * `002-console.sql` é explícito). Ele não vai para lugar nenhum além desta tela.
 *
 * Componente não busca dado: quem chama a rede é o `App` (CLAUDE.md).
 */

/** Lista vazia tem três causas diferentes, e cada uma pede uma frase diferente. */
function Vazio({ busca }) {
  if (busca) {
    return (
      <p className="lista-vazia secundario">
        Nenhum assinante casa com <strong>{busca}</strong>. A busca casa usuário da TikTok, e-mail
        e chave de licença, por trecho.
      </p>
    );
  }
  return (
    <p className="lista-vazia secundario">
      Nenhum assinante na base ainda. Na base de exemplo isto não acontece, então esta tela
      significa que o console está lendo o Supabase de verdade e ele está vazio.
    </p>
  );
}

export function ListaDeAssinantes({
  assinantes,
  escolhido,
  aoEscolher,
  busca,
  aoBuscar,
  carregando,
  erro,
  proximo,
  aoCarregarMais,
  carregandoMais,
}) {
  const linhas = assinantes ?? [];

  return (
    <section className="lista cartao" aria-label="Assinantes">
      <CampoDeBusca
        valor={busca}
        aoMudar={aoBuscar}
        resultados={linhas.length}
        carregando={carregando}
      />

      {erro && (
        <p className="lista-erro pastilha pastilha-erro" role="alert">
          {mensagemDeFalha(erro)}
        </p>
      )}

      <div className="lista-rolagem">
        {/* Carregando com lista antiga na tela mantém a lista: trocar por
            "Carregando…" a cada tecla apagaria o resultado que o operador está
            lendo enquanto digita o próximo caractere. */}
        {linhas.length === 0 && !carregando && !erro && <Vazio busca={busca} />}

        <ul className="lista-linhas">
          {linhas.map((assinante) => {
            const estado = estadoDaLicenca(assinante.licencaEstado);
            const ativo = assinante.streamerId === escolhido;

            return (
              <li key={assinante.streamerId}>
                <button
                  type="button"
                  className={`lista-linha${ativo ? " lista-linha-ativa" : ""}`}
                  onClick={() => aoEscolher?.(assinante.streamerId)}
                  aria-current={ativo ? "true" : undefined}
                >
                  <span className="lista-linha-topo">
                    <span className="lista-nome">{ouVazio(assinante.nome ?? assinante.streamerId)}</span>
                    <span className={`pastilha ${estado.pastilha} lista-estado`}>{estado.texto}</span>
                  </span>

                  <span className="lista-linha-meio secundario">
                    <span className="lista-tiktok">{arroba(assinante.usuarioTiktok)}</span>
                    <span className="lista-email">{ouVazio(assinante.email)}</span>
                  </span>

                  <span className="lista-linha-base secundario numero">
                    <span>{assinante.plano ? `Plano ${assinante.plano}` : "Sem plano"}</span>
                    {/* "Última conexão" como distância, não como data: a
                        pergunta que a lista responde é "essa pessoa ainda usa
                        isto", e a resposta a essa pergunta é o tempo desde. */}
                    <span>
                      {assinante.ultimaConexao
                        ? `Conectou ${distancia(assinante.ultimaConexao)}`
                        : "Nunca conectou"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {proximo && (
          <button
            type="button"
            className="lista-mais"
            onClick={aoCarregarMais}
            disabled={carregandoMais}
          >
            {carregandoMais ? "Carregando…" : "Carregar mais"}
          </button>
        )}
      </div>
    </section>
  );
}
