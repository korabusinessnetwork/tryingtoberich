import {
  arroba,
  data,
  dataHora,
  distancia,
  estadoDaLicenca,
  idioma,
  mensagemDeFalha,
  ouVazio,
} from "../lib/formatar.js";
import { TrocaDePlano } from "./TrocaDePlano.jsx";
import "./FichaDoAssinante.css";

/**
 * Item 2 do ADR-P05: a ficha individual, com as sete coisas que ele pede.
 *
 * As sete, e onde cada uma está nesta tela:
 *
 * 1. **estado da licença** e 2. **plano**, no topo, junto do nome, porque são
 *    as duas que decidem se o cliente tem direito ao que está pedindo.
 * 3. **data de início**, 4. **última conexão**, 6. **idioma do perfil**
 *    (ADR-P03) e 7. **versão instalada** (exigida pelo ADR-P04), na grade.
 * 5. **modalidades usadas**, no rodapé, porque hoje só existe uma e a lista
 *    ainda não distingue ninguém.
 *
 * Duas decisões de leitura atravessam o arquivo:
 *
 * - **Campo ausente é escrito, nunca escondido.** "Nunca conectou" e "Sem
 *   licença" ocupam o mesmo lugar que o valor ocuparia. Esconder a linha vazia
 *   faria duas fichas terem alturas diferentes e o operador procurar o campo,
 *   e ausência é justamente o que ele está tentando descobrir quando abre a
 *   ficha de um cliente que escreveu reclamando.
 * - **Tempo aparece duas vezes.** A distância ("há 2 d") responde "esse cliente
 *   está vivo"; a data absoluta ao lado é a que se cola num e-mail de suporte.
 *
 * No rodapé mora o **item 3**, a troca de plano (`TrocaDePlano.jsx`). Ela mora
 * aqui, e não numa aba, porque plano é um campo do assinante e a pergunta "qual
 * o plano dele" já está respondida no topo desta mesma tela.
 *
 * Componente não busca dado nem escreve: quem chama a rede é o `App` (CLAUDE.md).
 */

function Campo({ rotulo, valor, apoio, titulo }) {
  return (
    <div className="ficha-campo" title={titulo}>
      <span className="rotulo">{rotulo}</span>
      <span className="ficha-valor numero">{valor}</span>
      {apoio && <span className="ficha-apoio secundario numero">{apoio}</span>}
    </div>
  );
}

export function FichaDoAssinante({
  ficha,
  carregando,
  erro,
  streamerId,
  aoTrocarPlano,
  trocandoPlano,
  resultadoDaTroca,
  erroDaTroca,
}) {
  if (erro) {
    return (
      <section className="ficha cartao ficha-recado" aria-label="Ficha do assinante">
        <p className="pastilha pastilha-erro" role="alert">{mensagemDeFalha(erro)}</p>
      </section>
    );
  }

  if (carregando && !ficha) {
    return (
      <section className="ficha cartao ficha-recado" aria-label="Ficha do assinante">
        <p className="secundario">Carregando a ficha…</p>
      </section>
    );
  }

  if (!streamerId) {
    return (
      <section className="ficha cartao ficha-recado" aria-label="Ficha do assinante">
        <p className="secundario">
          Escolha um assinante na lista para ver a ficha: estado da licença, plano, início,
          última conexão, modalidades, idioma do perfil e versão instalada.
        </p>
      </section>
    );
  }

  if (!ficha) {
    // Nulo é resposta, não é falha: a camada de dados distingue "não existe"
    // de "não deu para perguntar", e a tela precisa distinguir também.
    return (
      <section className="ficha cartao ficha-recado" aria-label="Ficha do assinante">
        <p className="secundario">
          Não existe assinante com o identificador <strong>{streamerId}</strong>.
        </p>
      </section>
    );
  }

  const estado = estadoDaLicenca(ficha.licencaEstado);
  const modalidades = ficha.modalidades ?? [];

  return (
    <section className="ficha cartao" aria-label={`Ficha de ${ficha.nome ?? ficha.streamerId}`}>
      <header className="ficha-topo">
        <div className="ficha-identidade">
          <h2 className="ficha-nome">{ouVazio(ficha.nome ?? ficha.streamerId)}</h2>
          <p className="ficha-contato secundario">
            {arroba(ficha.usuarioTiktok)} · {ouVazio(ficha.email)}
          </p>
          {/* O identificador aparece porque é ele que viaja nos logs e na
              telemetria: sem ele na tela, cruzar a ficha com uma linha de log
              vira adivinhação. */}
          <p className="ficha-id secundario numero">{ficha.streamerId}</p>
        </div>

        <div className="ficha-estado">
          <span className={`pastilha ${estado.pastilha}`}>{estado.texto}</span>
          <span className="ficha-plano">{ficha.plano ? `Plano ${ficha.plano}` : "Sem plano"}</span>
        </div>
      </header>

      <div className="ficha-grade">
        <Campo
          rotulo="Licença"
          valor={ouVazio(ficha.licenca)}
          apoio={ficha.validaAte ? `Válida até ${data(ficha.validaAte)}` : "Sem validade gravada"}
          titulo="A chave que a instalação usa para se identificar na Kora."
        />
        <Campo
          rotulo="Início"
          valor={data(ficha.criadoEm)}
          apoio={ficha.criadoEm ? `Cliente ${distancia(ficha.criadoEm)}` : null}
        />
        <Campo
          rotulo="Última conexão"
          valor={ficha.ultimaConexao ? distancia(ficha.ultimaConexao) : "Nunca conectou"}
          apoio={ficha.ultimaConexao ? dataHora(ficha.ultimaConexao) : "Sem telemetria nenhuma"}
        />
        <Campo
          rotulo="Versão instalada"
          valor={ouVazio(ficha.versaoInstalada)}
          apoio={ficha.versaoInstalada ? "Última reportada por telemetria" : "Nunca reportou versão"}
          titulo="Exigida pelo ADR-P04: sem ela não dá para saber quem ficou para trás numa atualização."
        />
        <Campo
          rotulo="Idioma do perfil"
          valor={idioma(ficha.idioma)}
          apoio="Do assinante, não do console"
          titulo="O idioma que a instalação reportou (ADR-P03). O console é português apenas."
        />
        <Campo
          rotulo="Modalidades usadas"
          valor={modalidades.length > 0 ? modalidades.join(", ") : "Nenhuma ainda"}
          apoio={modalidades.length > 0 ? null : "Nada rodou nesta instalação"}
        />
      </div>

      {/* Item 3 do ADR-P05, no rodapé da ficha: a única ação de escrita do
          console fica depois de tudo que se lê sobre o cliente, para nunca ser
          a primeira coisa que a mão encontra. */}
      <TrocaDePlano
        ficha={ficha}
        aoTrocar={aoTrocarPlano}
        trocando={trocandoPlano}
        resultado={resultadoDaTroca}
        erro={erroDaTroca}
      />
    </section>
  );
}
