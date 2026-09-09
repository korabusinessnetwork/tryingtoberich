import { useTraducao } from "../i18n/useTraducao.js";
import "./SeletorDeLook.css";

/**
 * Lista os looks salvos para o preset escolher um por `lookId` (ADR-011).
 *
 * PROIBIÇÃO do ADR-011 / 06_COMPONENTES: este componente NUNCA tenta
 * renderizar o boneco montado. O Roblox só sabe compor um avatar de verdade
 * dentro do próprio jogo — fazer isso aqui exigiria um renderizador de avatar
 * próprio, o item mais caro do projeto. A prévia de corpo inteiro mora só no
 * vestiário dentro do jogo.
 *
 * O que existe aqui é a grade de ícones das peças (backlog Bloco 3). Os dados
 * de look que chegam por prop só trazem `itensCatalogo` como assetId numérico
 * — nenhuma URL de ícone. Por isso cada peça vira um placeholder com o
 * assetId visível. A ponte já serve o ícone de verdade em
 * `GET /jogo/catalogo-itens` quando o vestiário DENTRO DO JOGO busca no
 * catálogo do Roblox (ADR-011, 07_APIS); quando esse ícone estiver disponível
 * também para o painel, é só trocar o placeholder abaixo por uma `<img>` —
 * nada mais neste componente muda.
 */
export function SeletorDeLook({ looks, lookId, aoEscolher, travado }) {
  const { t } = useTraducao();
  const carregando = looks == null;
  const comErro = !carregando && !Array.isArray(looks);
  const semLooks = !carregando && !comErro && looks.length === 0;

  return (
    <section className="seletor-look" aria-label={t("panel.lookPicker.title")}>
      <header className="seletor-look-cabecalho">
        <h2>{t("panel.lookPicker.title")}</h2>
        {travado && <span className="pastilha pastilha-atencao">{t("panel.lookPicker.lockedBadge")}</span>}
      </header>

      {travado && (
        <p className="secundario seletor-look-aviso-travado">{t("panel.lookPicker.lockedNotice")}</p>
      )}

      {carregando && <p className="secundario">{t("panel.lookPicker.loading")}</p>}

      {comErro && <p className="pastilha pastilha-erro">{t("panel.lookPicker.loadError")}</p>}

      {semLooks && <p className="secundario">{t("panel.lookPicker.emptyState")}</p>}

      {!carregando && !comErro && !semLooks && (
        <ul className="seletor-look-lista">
          {looks.map((look) => {
            const selecionado = look.lookId === lookId;
            const pecas = look.itensCatalogo ?? [];
            return (
              <li key={look.lookId}>
                <button
                  type="button"
                  className={
                    selecionado ? "seletor-look-cartao seletor-look-cartao-selecionado" : "seletor-look-cartao"
                  }
                  aria-pressed={selecionado}
                  disabled={travado}
                  onClick={() => aoEscolher(look.lookId)}
                >
                  <div className="seletor-look-topo">
                    <span className="seletor-look-nome">{look.nome}</span>
                    {selecionado && <span className="seletor-look-marca" aria-hidden="true">✓</span>}
                  </div>

                  <div
                    className="seletor-look-pecas"
                    role="list"
                    aria-label={t("panel.lookPicker.partsLabel", { nome: look.nome })}
                  >
                    {pecas.length === 0 && <span className="secundario">{t("panel.lookPicker.noParts")}</span>}
                    {pecas.map((assetId, indice) => (
                      <span
                        key={`${assetId}-${indice}`}
                        className="seletor-look-peca"
                        role="listitem"
                        title={t("panel.lookPicker.partTitle", { assetId })}
                      >
                        {assetId}
                      </span>
                    ))}
                  </div>

                  {look.efeitoPermanente && (
                    <div className="seletor-look-efeito">
                      {/* Cor de DADO (escolhida pelo streamer no vestiário), não cor de
                          design system — é literalmente o que aparece na tela da live
                          (ADR-010), então vem de style, não de variável CSS. */}
                      <span
                        className="seletor-look-efeito-cor"
                        style={{ background: look.efeitoPermanente.cor }}
                        aria-hidden="true"
                      />
                      <span className="secundario">
                        {t("panel.lookPicker.permanentEffect", {
                          efeito: rotularEfeito(look.efeitoPermanente.tipo),
                          intensidade: look.efeitoPermanente.intensidade,
                        })}
                      </span>
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** "aura" | "rastro" | "brilho" → rótulo capitalizado para leitura no painel. */
function rotularEfeito(tipo) {
  if (typeof tipo !== "string" || tipo.length === 0) return tipo;
  return tipo.charAt(0).toUpperCase() + tipo.slice(1);
}
