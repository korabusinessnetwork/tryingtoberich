import { diaCurto, dinheiro, mensagemDeFalha, mesPorExtenso, numero } from "../lib/formatar.js";
import "./PaginaDeFaturamento.css";

/**
 * Item 4 do ADR-P05: faturamento. MRR, vendas do mês e cancelamentos.
 *
 * ======================================================================
 * **A DECISÃO DO NÚMERO, e ela é a razão de esta tela ter tanto texto:**
 * o valor grande é RECEITA COBRADA NO MÊS, não projeção da carteira.
 * ======================================================================
 *
 * A pergunta ficou aberta na onda 2 e é decidida aqui. Os dois números divergem
 * feio no plano anual: US$ 199 cobrados de uma vez entram inteiros num mês pela
 * receita cobrada, e entrariam como US$ 16,58 por mês, doze vezes, pela
 * projeção da carteira.
 *
 * Escolhida a cobrada, por um motivo que não é gosto: **a projeção não é
 * calculável com o que existe.** A tabela `faturamento` é um livro de eventos
 * do webhook (ver `data/supabase/borda/lemon-webhook/mapear.mjs`): tipo, valor
 * cobrado, moeda, quando. Ela não guarda quais assinaturas estão vivas hoje nem
 * quanto cada uma vale por mês, e `licencas` não guarda preço nenhum, porque
 * preço mora na Lemon Squeezy. Projeção montada a partir de duas suposições
 * continua parecendo um número, e é assim que ela acaba numa decisão.
 *
 * A receita cobrada, essa, a tabela responde exatamente, linha por linha, e
 * bate com o painel da Lemon Squeezy, que é a fonte da verdade do dinheiro
 * (ADR-P02).
 *
 * **O custo é real e está escrito NA TELA, não só aqui:** este número não é
 * taxa mensal corrente. Um mês com uma venda anual parece um mês excelente e
 * não repete. Por isso o rótulo é "Recebido no mês" e a linha embaixo diz que
 * ele não é run-rate. Escrever "MRR" em cima de receita cobrada seria a mentira
 * de três letras que ninguém desfaz depois.
 *
 * Componente não busca dado: quem chama a rede é o `App` (CLAUDE.md).
 */

function Cartao({ rotulo, valor, apoio, destaque }) {
  return (
    <div className={`fat-cartao${destaque ? " fat-cartao-destaque" : ""}`}>
      <span className="rotulo">{rotulo}</span>
      <strong className="fat-valor numero">{valor}</strong>
      <span className="fat-apoio secundario">{apoio}</span>
    </div>
  );
}

export function PaginaDeFaturamento({ resumo, mes, aoTrocarMes, carregando, erro }) {
  const moeda = resumo?.moeda ?? "USD";
  const serie = resumo?.serie ?? [];
  const pico = serie.reduce((maior, ponto) => Math.max(maior, Number(ponto.valorCentavos ?? 0)), 0);

  return (
    <section className="fat cartao" aria-label="Faturamento">
      <header className="fat-topo">
        <div className="fat-identidade">
          <h2 className="fat-titulo">Faturamento</h2>
          <p className="fat-subtitulo secundario">
            Espelho do que o webhook da Lemon Squeezy gravou. A fonte da verdade do dinheiro é o
            painel deles (ADR-P02); isto existe para o número não mudar sozinho entre dois olhares.
          </p>
        </div>

        <label className="fat-mes">
          <span className="rotulo">Mês</span>
          <input
            type="month"
            className="fat-mes-campo numero"
            value={mes ?? ""}
            onChange={(evento) => aoTrocarMes?.(evento.target.value)}
            disabled={carregando}
          />
        </label>
      </header>

      {erro && (
        <p className="fat-recado pastilha pastilha-erro" role="alert">
          {mensagemDeFalha(erro)}
        </p>
      )}

      {!resumo ? (
        <p className="fat-recado secundario">
          {carregando ? "Consultando o faturamento…" : "Sem resposta do faturamento ainda."}
        </p>
      ) : (
        <>
          <div className="fat-cartoes">
            <Cartao
              rotulo={`Recebido em ${mesPorExtenso(resumo.mes ?? mes)}`}
              valor={dinheiro(resumo.mrrCentavos, moeda)}
              apoio="Soma do que foi cobrado no mês, menos reembolso"
              destaque
            />
            <Cartao
              rotulo="Vendas do mês"
              valor={numero(resumo.vendas)}
              apoio="Assinaturas criadas, sem contar renovação"
            />
            <Cartao
              rotulo="Cancelamentos"
              valor={numero(resumo.cancelamentos)}
              apoio="Canceladas mais expiradas"
            />
          </div>

          {/* A definição do número fica NA TELA, e não num comentário de código.
              Número de dinheiro sem definição escrita vira briga com o painel
              da Lemon Squeezy daqui a três meses, e ganha quem lembra melhor. */}
          <p className="fat-definicao">
            <strong>Este número é receita cobrada, não run-rate.</strong> Ele soma o que entrou de
            fato no mês. Um plano anual entra inteiro no mês em que foi cobrado e não se repete nos
            onze seguintes, então um mês com venda anual parece ótimo e não é taxa mensal. A
            projeção da carteira não está aqui porque não é calculável: a tabela guarda eventos de
            cobrança, não assinaturas vivas com preço.
          </p>

          <div className="fat-serie">
            <span className="rotulo">Por dia, dentro do mês</span>
            {serie.length === 0 ? (
              <p className="fat-sem-serie secundario">
                Nenhum evento de cobrança neste mês. Sem barra de altura zero: gráfico vazio é
                indistinguível de gráfico que não carregou.
              </p>
            ) : (
              // Mês só de cancelamento tem dias reais e dinheiro nenhum. A
              // barra some inteira nesse caso, e não fica vazia: uma coluna de
              // trilhos zerados é indistinguível de gráfico que não carregou,
              // e o dado ali (o dia e a contagem) é verdadeiro e vale ser lido.
              <ul className={`fat-barras${pico > 0 ? "" : " fat-barras-sem-dinheiro"}`}>
                {serie.map((ponto) => (
                  <li key={ponto.dia} className="fat-barra">
                    <span className="fat-barra-dia secundario numero">{diaCurto(ponto.dia)}</span>
                    <span className="fat-barra-trilho">
                      <span
                        className="fat-barra-preenchida"
                        style={{
                          width: `${pico > 0 ? Math.round((Math.max(ponto.valorCentavos, 0) / pico) * 100) : 0}%`,
                        }}
                      />
                    </span>
                    <span className="fat-barra-valor numero">{dinheiro(ponto.valorCentavos, moeda)}</span>
                    <span className="fat-barra-contagem secundario numero">
                      {ponto.vendas > 0 ? `${ponto.vendas} venda${ponto.vendas === 1 ? "" : "s"}` : ""}
                      {ponto.cancelamentos > 0
                        ? `${ponto.vendas > 0 ? " · " : ""}${ponto.cancelamentos} cancel.`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
