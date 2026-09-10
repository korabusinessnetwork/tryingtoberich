import { useState } from "react";

import { useTraducao } from "../i18n/useTraducao.js";
import { dataHora } from "../i18n/formatar.js";
import "./PainelDeLicenca.css";

/**
 * A licença desta instalação (ADR-P02).
 *
 * A fonte da verdade é o Supabase; o que chega aqui é o ESPELHO em disco, que
 * existe para o produto continuar de pé quando a Kora está fora do ar. A
 * checagem acontece uma vez, no arranque, e vale a sessão inteira — nada da
 * Kora entra no caminho do presente (CLAUDE.md, princípio nº 1). Por isso esta
 * tela mostra um veredito JÁ TOMADO, e não um cadeado consultado a cada clique.
 *
 * Três decisões atravessam o arquivo:
 *
 * 1. **A cor diz de quem é o problema.** Vermelho é resposta da Kora — expirou,
 *    foi cancelada. Âmbar é "ainda não deu para saber": instalação nova sem
 *    chave e falha de conexão. `indeterminada` NUNCA é vermelho: o streamer não
 *    fez nada de errado, e uma tela acusando quem pagou é o pior desenho
 *    possível para o dia em que a internet dele oscilar.
 * 2. **Todo estado diz o que fazer.** Um veredito sem próximo passo vira
 *    ticket de suporte, e do outro lado do suporte tem uma pessoa só.
 * 3. **A chave nunca aparece inteira.** Este painel fica aberto numa segunda
 *    tela DURANTE a live, e segunda tela entra em captura por engano o tempo
 *    todo. Os últimos caracteres bastam para o streamer reconhecer qual chave
 *    está ali; o resto não tem por que estar na tela.
 *
 * Nenhuma rede aqui: quem fala com a ponte é o App, por `lib/api.js`
 * (CLAUDE.md, docs/06_COMPONENTES).
 */

/**
 * O desenho de cada veredito: pastilha, rótulo e o que fazer em seguida.
 *
 * Tabela e não `if` encadeado porque o `estado` é um enum fechado do schema
 * (`data/schemas/licenca.schema.json`) — um estado novo lá deve aparecer aqui
 * como buraco visível, não como um `else` que engole tudo.
 */
const DESENHO_DO_ESTADO = {
  ativa: { tom: "ok", rotulo: "panel.license.stateActive", conselho: "panel.license.adviceActive" },
  expirada: { tom: "erro", rotulo: "panel.license.stateExpired", conselho: "panel.license.adviceExpired" },
  cancelada: { tom: "erro", rotulo: "panel.license.stateCancelled", conselho: "panel.license.adviceCancelled" },
  sem_licenca: { tom: "atencao", rotulo: "panel.license.stateNoLicense", conselho: "panel.license.adviceNoLicense" },
  indeterminada: { tom: "atencao", rotulo: "panel.license.stateUnknown", conselho: "panel.license.adviceUnknown" },
};

/**
 * Os códigos de `motivo` que a ponte devolve, traduzidos por chave (ADR-P03).
 *
 * O schema é explícito: `motivo` é código estável, nunca frase pronta — frase
 * pronta nasceria em português e o funil da Fase 1 é em inglês. Mapa literal
 * para o teste de i18n enxergar cada chave; código desconhecido não vira texto
 * cru na tela, some.
 */
const MOTIVOS = {
  sem_chave: "panel.license.reasonNoKey",
  chave_invalida: "panel.license.reasonBadKey",
  licenca_expirada: "panel.license.reasonExpired",
  licenca_cancelada: "panel.license.reasonCancelled",
  kora_indisponivel: "panel.license.reasonKoraDown",
  carencia_esgotada: "panel.license.reasonGraceOver",
};

/** Os últimos 4 caracteres bastam para reconhecer a chave. Ver decisão 3. */
function fimDaChave(chave) {
  const limpa = String(chave ?? "");
  return limpa.length <= 4 ? limpa : limpa.slice(-4);
}

export function PainelDeLicenca({
  licenca,
  carregando,
  erro,
  ativando,
  desativando,
  aoAtivar,
  aoDesativar,
  aoRecarregar,
}) {
  const { t } = useTraducao();

  const [chave, definirChave] = useState("");
  // Desativar apaga a chave desta máquina. Dois tempos, dentro da tela, no
  // mesmo âmbar do resto do painel — `window.confirm` trava o navegador inteiro
  // e o painel está aberto durante a live.
  const [confirmandoSaida, definirConfirmandoSaida] = useState(false);

  if (erro) {
    return (
      <section className="licenca" aria-label={t("panel.license.title")}>
        <h2 className="licenca-titulo">{t("panel.license.title")}</h2>
        {/* A ponte pode nem ter respondido — dizer o que falhou é mais útil que
            um veredito inventado sobre a licença. */}
        <p className="pastilha pastilha-erro licenca-frase">{erro}</p>
        <p className="licenca-conselho">{t("panel.license.adviceLoadFailed")}</p>
        <button type="button" onClick={aoRecarregar}>{t("common.action.retry")}</button>
      </section>
    );
  }

  if (!licenca) {
    return (
      <section className="licenca" aria-label={t("panel.license.title")}>
        <h2 className="licenca-titulo">{t("panel.license.title")}</h2>
        <p className="secundario">{t("common.state.loading")}</p>
      </section>
    );
  }

  // Estado fora do enum é resposta que este painel não entende. Tratar como
  // `indeterminada` é a leitura honesta: não deu para saber.
  const desenho = DESENHO_DO_ESTADO[licenca.estado] ?? DESENHO_DO_ESTADO.indeterminada;

  //[[ Chave recusada volta como `sem_licenca`, e o conselho tem que mudar.
  //
  // A ponte não trata chave errada como erro HTTP: responde 200 com
  // `sem_licenca` + `chave_invalida`, porque é a resposta à pergunta que o
  // painel fez (docs/07_APIS). Só que o conselho de `sem_licenca` é o de
  // instalação nova — "começa assim, não é erro" — e ele fica ABSURDO logo
  // depois de o streamer colar uma chave e ela ser recusada.
  //
  // E há um susto a desfazer: a ponte NÃO apaga o espelho quando já havia uma
  // licença ativa, então a tela diz "sem licença" enquanto o disco continua com
  // a licença que funciona. Sem esta frase, um caractere trocado parece ter
  // derrubado a assinatura de quem pagou. A linha do motivo continua embaixo,
  // dizendo o que fazer com a chave; esta diz o que aconteceu com a antiga. ]]
  const chaveDeMotivo = MOTIVOS[licenca.motivo];
  const recusouAChave = licenca.motivo === "chave_invalida";
  const conselho = recusouAChave ? "panel.license.adviceBadKey" : desenho.conselho;

  const temChave = Boolean(licenca.chave);
  const podeEnviar = chave.trim().length >= 8 && !ativando && !desativando;

  // A carência só é notícia enquanto ela ainda cobre alguma coisa. Vencida, ela
  // vira o passado de um problema que o `motivo` já conta.
  const carencia = licenca.carenciaAte ? new Date(licenca.carenciaAte) : null;
  const carenciaValendo = carencia && !Number.isNaN(carencia.getTime()) && carencia.getTime() > Date.now();

  const fatos = [
    [t("panel.license.planLabel"), licenca.plano],
    [t("panel.license.validUntilLabel"), licenca.validaAte ? dataHora(licenca.validaAte) : null],
    [t("panel.license.checkedAtLabel"), licenca.verificadaEm ? dataHora(licenca.verificadaEm) : null],
    [t("panel.license.versionLabel"), licenca.versaoInstalada],
    [t("panel.license.keyLabel"), temChave ? t("panel.license.keyMasked", { fim: fimDaChave(licenca.chave) }) : null],
  ].filter(([, valor]) => valor);

  function enviar(evento) {
    evento.preventDefault();
    if (!podeEnviar) return;
    // O campo esvazia só depois de a ponte responder — quem limpa é o App,
    // recarregando a licença. Limpar aqui, na hora, apagaria a chave que o
    // streamer colou se a ativação falhasse, e ele teria que achá-la de novo.
    aoAtivar?.(chave.trim());
  }

  return (
    <section className="licenca" aria-label={t("panel.license.title")}>
      <header className="licenca-topo">
        <h2 className="licenca-titulo">{t("panel.license.title")}</h2>
        {/* Texto junto da cor, sempre (02_DESIGN_SYSTEM). */}
        <span className={`pastilha pastilha-${desenho.tom}`}>{t(desenho.rotulo)}</span>
        {carregando ? <span className="secundario">{t("common.state.loading")}</span> : null}
      </header>

      <p className="licenca-conselho">{t(conselho)}</p>

      {/* A carência existe porque a alternativa é pior: sem ela, um streamer sem
          internet no dia da live fica sem o produto que pagou. Se ela está
          valendo, a data é a informação mais importante desta tela. */}
      {carenciaValendo && (
        <p className="pastilha pastilha-atencao licenca-frase">
          {t("panel.license.graceUntil", { quando: dataHora(licenca.carenciaAte) })}
        </p>
      )}

      {chaveDeMotivo && <p className="licenca-motivo secundario">{t(chaveDeMotivo)}</p>}

      {fatos.length > 0 && (
        <dl className="licenca-fatos">
          {fatos.map(([rotulo, valor]) => (
            <div className="licenca-fato" key={rotulo}>
              <dt className="licenca-fato-rotulo secundario">{rotulo}</dt>
              <dd className="licenca-fato-valor">{valor}</dd>
            </div>
          ))}
        </dl>
      )}

      <form className="licenca-forma" onSubmit={enviar}>
        <label className="licenca-campo-rotulo" htmlFor="licenca-chave">
          {temChave ? t("panel.license.replaceKeyLabel") : t("panel.license.pasteKeyLabel")}
        </label>
        <div className="licenca-linha">
          <input
            id="licenca-chave"
            className="licenca-campo"
            type="text"
            value={chave}
            onChange={(evento) => definirChave(evento.target.value)}
            placeholder={t("panel.license.keyPlaceholder")}
            autoComplete="off"
            spellCheck={false}
            disabled={Boolean(ativando)}
          />
          <button type="submit" className="licenca-ativar" disabled={!podeEnviar}>
            {ativando ? t("panel.license.activating") : t("panel.license.activateButton")}
          </button>
        </div>
        <p className="licenca-nota secundario">{t("panel.license.keyHint")}</p>
      </form>

      {temChave && (
        <div className="licenca-saida">
          {confirmandoSaida ? (
            <>
              <p className="licenca-nota">{t("panel.license.deactivateConfirm")}</p>
              <div className="licenca-linha">
                <button
                  type="button"
                  className="licenca-desativar"
                  disabled={Boolean(desativando)}
                  onClick={() => {
                    definirConfirmandoSaida(false);
                    aoDesativar?.();
                  }}
                >
                  {desativando ? t("panel.license.deactivating") : t("panel.license.deactivateConfirmButton")}
                </button>
                <button type="button" onClick={() => definirConfirmandoSaida(false)}>
                  {t("common.action.cancel")}
                </button>
              </div>
            </>
          ) : (
            <>
              <button type="button" className="licenca-desativar" onClick={() => definirConfirmandoSaida(true)}>
                {t("panel.license.deactivateButton")}
              </button>
              {/* Desativar é o caminho de trocar de máquina, não uma punição:
                  sem esta frase o botão parece cancelar a assinatura. */}
              <p className="licenca-nota secundario">{t("panel.license.deactivateHint")}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
