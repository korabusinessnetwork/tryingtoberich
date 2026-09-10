import { avaliarAlarme, PASTILHA_DO_NIVEL, QUEDAS_PARA_SUSPEITAR } from "../lib/alarme.js";
import { horaCurta, mensagemDeFalha, numero } from "../lib/formatar.js";
import "./PaginaDeSaude.css";

/**
 * Item 6 do ADR-P05: saúde de conexão, desenhada como ALARME.
 *
 * O ADR é explícito: este item não é enfeite, é o alarme de quando a TikTok
 * quebra o acesso, que é o risco nº 1 do produto (ADR-006, ADR-P06). Sem ele, a
 * Kora descobre a quebra pelo primeiro cliente irritado que escrever.
 *
 * O que separa um alarme de um gráfico bonito, e o que esta tela faz por isso:
 *
 * - **O veredito vem primeiro, em uma frase, antes dos números.** Painel que
 *   entrega dois números e deixa a conclusão por conta de quem olha é painel
 *   que só funciona nos dias em que alguém olha com atenção. A regra que produz
 *   a frase está escrita e testada em `lib/alarme.js`, não na cabeça de quem
 *   abre a tela.
 * - **A série é por HORA, e existe para responder "começou quando".** Várias
 *   quedas na mesma hora, em instalações diferentes, não é a internet de
 *   ninguém: é a plataforma tendo mudado alguma coisa.
 * - **Sem queda nenhuma, não há gráfico.** Barra de altura zero é
 *   indistinguível de gráfico que não carregou, e "nenhuma queda" é justamente
 *   a informação boa.
 *
 * Componente não busca dado: quem chama a rede é o `App` (CLAUDE.md).
 */

function Numero({ rotulo, valor, apoio }) {
  return (
    <div className="saude-numero">
      <span className="rotulo">{rotulo}</span>
      <strong className="saude-valor numero">{valor}</strong>
      <span className="saude-apoio secundario">{apoio}</span>
    </div>
  );
}

export function PaginaDeSaude({ saude, carregando, erro }) {
  if (erro) {
    return (
      <section className="saude cartao saude-recado" aria-label="Saúde de conexão">
        <p className="pastilha pastilha-erro" role="alert">{mensagemDeFalha(erro)}</p>
        {/* Falha aqui é mais grave que nas outras telas, e vale dizer: é o
            alarme que está mudo, e alarme mudo parece calmaria. */}
        <p className="secundario">
          Enquanto isto não responder, o alarme de acesso quebrado está mudo, e alarme mudo parece
          calmaria.
        </p>
      </section>
    );
  }

  if (!saude) {
    return (
      <section className="saude cartao saude-recado" aria-label="Saúde de conexão">
        <p className="secundario">{carregando ? "Consultando a telemetria…" : "Sem resposta da telemetria ainda."}</p>
      </section>
    );
  }

  const veredito = avaliarAlarme(saude);
  const serie = saude.serie ?? [];

  /**
   * A escala das barras nunca é menor que o limiar do alarme, e isso foi
   * descoberto abrindo a tela: com uma queda só na janela, escalar pelo maior
   * valor pintava a barra inteira de vermelho, de ponta a ponta, embaixo de um
   * veredito verde dizendo que estava tudo calmo. A tela contradizia a si
   * mesma. Escalando pelo limiar, uma queda ocupa um terço, que é exatamente o
   * que ela é: um terço do que começaria a preocupar.
   */
  const pico = Math.max(
    QUEDAS_PARA_SUSPEITAR,
    serie.reduce((maior, ponto) => Math.max(maior, Number(ponto.quedas ?? 0)), 0),
  );

  return (
    <section className={`saude cartao saude-${veredito.nivel}`} aria-label="Saúde de conexão">
      <header className="saude-topo">
        <span className={`pastilha ${PASTILHA_DO_NIVEL[veredito.nivel]}`}>{veredito.titulo}</span>
        <p className="saude-explicacao secundario">{veredito.explicacao}</p>
      </header>

      <div className="saude-numeros">
        <Numero
          rotulo="Conectados agora"
          valor={numero(saude.conectadosAgora)}
          // A definição fica ao lado do número porque ela tem uma pegadinha:
          // instalação que morreu no tapa fica marcada como conectada até o
          // próximo arranque, e é o preço de não ter batimento periódico.
          apoio="Conectou e ainda não desconectou"
        />
        <Numero
          rotulo="Quedas em 24h"
          valor={numero(saude.quedas24h)}
          apoio="Perdeu a live sem ter encerrado"
        />
      </div>

      <div className="saude-serie">
        <span className="rotulo">Quedas por hora, últimas 24 horas</span>
        {serie.length === 0 ? (
          <p className="saude-sem-serie secundario">
            Nenhuma queda nas últimas 24 horas. Não há gráfico aqui de propósito: barra de altura
            zero é indistinguível de gráfico que não carregou.
          </p>
        ) : (
          <ul className="saude-barras">
            {serie.map((ponto) => (
              <li key={ponto.hora} className="saude-barra">
                <span className="saude-barra-hora secundario numero">{horaCurta(ponto.hora)}</span>
                <span className="saude-barra-trilho">
                  <span
                    className="saude-barra-preenchida"
                    style={{ width: `${Math.min(100, Math.round((ponto.quedas / pico) * 100))}%` }}
                  />
                </span>
                <span className="saude-barra-total numero">{numero(ponto.quedas)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
