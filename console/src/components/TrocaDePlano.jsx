import { useEffect, useState } from "react";

import { PLANOS } from "../faturamento/contrato.js";
import { mensagemDeFalha, recadoDaCobranca } from "../lib/formatar.js";
import "./TrocaDePlano.css";

/**
 * Item 3 do ADR-P05: a edição de plano, dentro da ficha.
 *
 * Mora aqui, e não numa aba própria, porque plano é um campo do assinante e a
 * pergunta "qual o plano dele" já é respondida três linhas acima. Aba separada
 * faria o operador procurar o cliente duas vezes.
 *
 * Três decisões atravessam o arquivo:
 *
 * - **Motivo é obrigatório, e o botão fica desligado sem ele.** É ação
 *   administrativa na conta paga de alguém, e ela vai para um log imutável. Log
 *   sem o porquê é log que ninguém consegue usar seis meses depois, que é
 *   exatamente quando ele é procurado. O servidor recusa também, porque regra
 *   que só existe na tela é regra que a próxima tela esquece.
 * - **O plano igual ao atual não é troca.** Deixar mandar geraria uma linha de
 *   log de uma mudança que não houve, e o log é a única coisa que este console
 *   promete manter honesta.
 * - **O que aconteceu do lado do dinheiro é dito com todas as letras.** A conta
 *   de cortesia não tem assinatura na Lemon Squeezy, e a troca dela vale só na
 *   base da Kora. Um "pronto" genérico faria o operador achar que cobrou.
 *
 * Componente não busca dado nem escreve: quem chama a rede é o `App`.
 */

export function TrocaDePlano({ ficha, aoTrocar, trocando, resultado, erro }) {
  const atual = ficha?.plano ?? null;
  const [plano, definirPlano] = useState(atual ?? PLANOS[0]);
  const [motivo, definirMotivo] = useState("");

  // Trocar de assinante limpa o formulário. Sem isto, o motivo escrito para um
  // cliente ficaria no campo ao abrir a ficha do próximo, e ele seria enviado.
  useEffect(() => {
    definirPlano(atual ?? PLANOS[0]);
    definirMotivo("");
  }, [ficha?.streamerId, atual]);

  const mesmoPlano = plano === atual;
  const semMotivo = motivo.trim().length < 3;
  const impedido = trocando || mesmoPlano || semMotivo;

  const enviar = (evento) => {
    evento.preventDefault();
    if (impedido) return;
    aoTrocar?.(plano, motivo.trim());
  };

  return (
    <form className="troca" onSubmit={enviar} aria-label="Trocar plano">
      <div className="troca-topo">
        <span className="rotulo">Trocar plano</span>
        <span className="troca-nota secundario">
          Escreve na Lemon Squeezy e registra no log administrativo, que é imutável.
        </span>
      </div>

      <div className="troca-campos">
        <label className="troca-campo">
          <span className="rotulo">Novo plano</span>
          <select
            className="troca-select"
            value={plano}
            onChange={(evento) => definirPlano(evento.target.value)}
            disabled={trocando}
          >
            {PLANOS.map((opcao) => (
              <option key={opcao} value={opcao}>
                {opcao}
                {opcao === atual ? " (atual)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="troca-campo troca-campo-largo">
          <span className="rotulo">Motivo (obrigatório)</span>
          <input
            className="troca-motivo"
            type="text"
            value={motivo}
            onChange={(evento) => definirMotivo(evento.target.value)}
            placeholder="Upgrade pedido por e-mail em 09/09"
            maxLength={200}
            disabled={trocando}
          />
        </label>

        <button type="submit" className="troca-botao" disabled={impedido}>
          {trocando ? "Trocando…" : "Trocar plano"}
        </button>
      </div>

      {/* O motivo de o botão estar desligado é escrito, nunca deduzido de um
          botão cinza: botão cinza sem explicação faz o operador achar que a
          tela quebrou. */}
      {!trocando && mesmoPlano && (
        <p className="troca-aviso secundario">
          Esse já é o plano atual. Escolha outro para haver o que trocar.
        </p>
      )}
      {!trocando && !mesmoPlano && semMotivo && (
        <p className="troca-aviso secundario">
          Escreva o motivo. Ele vai para o log imutável e é o que responde “por que essa conta mudou”.
        </p>
      )}

      {erro && (
        <p className="pastilha pastilha-erro troca-recado" role="alert">
          {mensagemDeFalha(erro)}
        </p>
      )}

      {resultado && (
        <p className="troca-recado troca-ok" role="status">
          <span className="pastilha pastilha-ok">Plano agora é {resultado.ficha?.plano ?? "—"}</span>
          <span className="secundario">{recadoDaCobranca(resultado.cobranca)}</span>
        </p>
      )}
    </form>
  );
}
