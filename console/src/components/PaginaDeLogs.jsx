// Nada de `arroba` nem de nome aqui, de propósito: log guarda o que aconteceu,
// nunca a pessoa (CLAUDE.md, Segurança). O que identifica é o `streamerId`.
import { dataHora, evento as tipoDeEvento, mensagemDeFalha, ouVazio, resumirDetalhe } from "../lib/formatar.js";
import "./PaginaDeLogs.css";

/**
 * Item 5 do ADR-P05: os dois logs, lado a lado.
 *
 * São dois de propósito, e a diferença entre eles é a razão de esta tela
 * existir com duas colunas em vez de uma lista misturada:
 *
 * - **Ação administrativa** é o que a KORA fez na conta de alguém. Ela é
 *   imutável no banco (`002-console.sql`: um trigger recusa `update`, `delete`
 *   e `truncate`, inclusive para a chave de serviço, que é a do console). É a
 *   linha que responde "quem mexeu nessa conta", e quem teria motivo para
 *   apagá-la é justamente quem opera esta tela.
 * - **Evento de telemetria** é o que a INSTALAÇÃO do cliente reportou. Ele não
 *   é imutável nem precisa ser: é observação, não decisão, e tem prazo de
 *   validade (o 001 prevê o `delete` de retenção).
 *
 * Misturar os dois numa lista só faria a ação da Kora se perder num rio de
 * conexão e desconexão, e é a ação da Kora que alguém procura quando abre isto.
 *
 * **Não existe botão de editar nem de apagar, e a ausência é a feature.** O
 * banco recusaria de qualquer jeito; a tela não oferece porque oferecer e
 * receber erro ensinaria o operador que o log "às vezes deixa". Há teste que
 * prova que nenhum caminho do console tenta escrever de outro jeito no log
 * administrativo (`test/log-imutavel.test.mjs`).
 *
 * Componente não busca dado: quem chama a rede é o `App` (CLAUDE.md).
 */

/** Vazio tem duas causas, e cada uma pede uma frase. */
function Vazio({ carregando, erro, frase }) {
  if (erro) {
    return (
      <p className="logs-recado pastilha pastilha-erro" role="alert">
        {mensagemDeFalha(erro)}
      </p>
    );
  }
  if (carregando) return <p className="logs-recado secundario">Carregando…</p>;
  return <p className="logs-recado secundario">{frase}</p>;
}

function LinhaDeAcao({ acao }) {
  return (
    <li className="logs-linha">
      <span className="logs-quando secundario numero">{dataHora(acao.em)}</span>
      <span className="logs-corpo">
        <span className="logs-verbo">{acao.acao}</span>
        <span className="logs-alvo secundario numero">{ouVazio(acao.streamerId)}</span>
        <span className="logs-detalhe secundario">{resumirDetalhe(acao.detalhe)}</span>
      </span>
      {/* Quem operou fica visível desde já, mesmo sendo sempre o dono hoje: a
          coluna existe no banco pelo mesmo motivo que o `streamerId` do
          ADR-003 existe antes de servir. */}
      <span className="logs-operador secundario">{ouVazio(acao.operador)}</span>
    </li>
  );
}

function LinhaDeEvento({ linha }) {
  const marca = tipoDeEvento(linha.tipo);
  const apoio = [linha.versaoInstalada, linha.modalidade, linha.motivo].filter(Boolean).join(" · ");

  return (
    <li className="logs-linha">
      <span className="logs-quando secundario numero">{dataHora(linha.em)}</span>
      <span className="logs-corpo">
        <span className={`pastilha ${marca.pastilha} logs-tipo`}>{marca.texto}</span>
        {/* O identificador, e nunca o nickname: log de evento guarda o que
            aconteceu, não a pessoa (CLAUDE.md, Segurança). */}
        <span className="logs-alvo secundario numero">{ouVazio(linha.streamerId)}</span>
        <span className="logs-detalhe secundario">{apoio || "—"}</span>
      </span>
    </li>
  );
}

export function PaginaDeLogs({ acoes, eventos, carregandoAcoes, carregandoEventos, erroDeAcoes, erroDeEventos }) {
  const linhasDeAcao = acoes ?? [];
  const linhasDeEvento = eventos ?? [];

  return (
    <div className="logs">
      <section className="logs-coluna cartao" aria-label="Ações administrativas">
        <header className="logs-cabecalho">
          <h2 className="logs-titulo">Ações administrativas</h2>
          <p className="logs-subtitulo secundario">
            O que a Kora fez na conta de alguém. <strong>Imutável no banco</strong>: o Postgres
            recusa update, delete e truncate, inclusive para a chave de serviço, que é a deste
            console. Por isso não há botão de editar nem de apagar aqui.
          </p>
        </header>

        <div className="logs-rolagem">
          {linhasDeAcao.length === 0 ? (
            <Vazio
              carregando={carregandoAcoes}
              erro={erroDeAcoes}
              frase="Nenhuma ação administrativa registrada. Trocar o plano de alguém na ficha escreve a primeira."
            />
          ) : (
            <ul className="logs-linhas">
              {linhasDeAcao.map((acao) => (
                <LinhaDeAcao key={acao.id} acao={acao} />
              ))}
            </ul>
          )}
          {erroDeAcoes && linhasDeAcao.length > 0 && (
            <p className="logs-recado pastilha pastilha-erro" role="alert">
              {mensagemDeFalha(erroDeAcoes)}
            </p>
          )}
        </div>
      </section>

      <section className="logs-coluna cartao" aria-label="Eventos de telemetria">
        <header className="logs-cabecalho">
          <h2 className="logs-titulo">Eventos de telemetria</h2>
          <p className="logs-subtitulo secundario">
            O que a instalação do cliente reportou: instalou, conectou, encerrou, caiu. Observação,
            não decisão, e por isso não é imutável. É esta coluna que alimenta a saúde de conexão.
          </p>
        </header>

        <div className="logs-rolagem">
          {linhasDeEvento.length === 0 ? (
            <Vazio
              carregando={carregandoEventos}
              erro={erroDeEventos}
              frase="Nenhum evento reportado ainda. Nenhuma instalação abriu uma live."
            />
          ) : (
            <ul className="logs-linhas">
              {linhasDeEvento.map((linha) => (
                <LinhaDeEvento key={linha.id} linha={linha} />
              ))}
            </ul>
          )}
          {erroDeEventos && linhasDeEvento.length > 0 && (
            <p className="logs-recado pastilha pastilha-erro" role="alert">
              {mensagemDeFalha(erroDeEventos)}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
