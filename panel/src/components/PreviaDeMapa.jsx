import { traduzir } from "../i18n/traduzir.js";
import { useTraducao } from "../i18n/useTraducao.js";
import { numero as numeroNoLocale } from "../i18n/formatar.js";
import { alcanceHorizontalDoPulo, FATOR_SALTO_VERTICAL } from "../lib/regras.js";
import "./PreviaDeMapa.css";

/**
 * F4.7 — pré-visualização de DADO do spec gerado pelo Gemini: paleta, altura,
 * densidade, contagem de plataformas (06_COMPONENTES). Não é render 3D — o
 * mapa de verdade só existe dentro do Roblox.
 *
 * As contas do ADR-009 vêm de lib/regras.js, que é onde elas moram no painel.
 * Um teste em test/jogo.test.mjs trava esse número junto com a ponte e o Luau:
 * divergir aqui não quebraria nada visivelmente, só desenharia uma barra
 * mentindo sobre um mapa que a ponte já aprovou.
 */
const FATOR_DERIVA_HORIZONTAL = 1.2; // Teto de geometria da variacaoHorizontal (04_MODELAGEM).

/** Stud como o streamer lê de relance: no máximo 2 casas, vírgula pt-BR. */
function numero(valor, casas = 2) {
  if (!Number.isFinite(valor)) return traduzir("common.value.none");
  return numeroNoLocale(Number(valor.toFixed(casas)), { maximumFractionDigits: casas });
}

function percentual(fracao) {
  if (!Number.isFinite(fracao)) return traduzir("common.value.none");
  return `${Math.round(fracao * 100)}%`;
}

export function PreviaDeMapa({ mapa = null, prontidao = null }) {
  const { t } = useTraducao();

  if (!mapa) {
    return (
      <section className="previa-de-mapa previa-de-mapa-vazia">
        <p className="secundario">{t("panel.mapPreview.emptyState")}</p>
      </section>
    );
  }

  const { plataformas } = mapa;
  const tetoVertical = mapa.jumpHeight * FATOR_SALTO_VERTICAL;
  const proporcaoVertical = tetoVertical > 0 ? plataformas.espacamentoVertical / tetoVertical : 0;
  const verticalEstourou = proporcaoVertical > 1;

  const tetoGeometria = plataformas.raioBase * FATOR_DERIVA_HORIZONTAL;
  const tetoAlcance = alcanceHorizontalDoPulo(mapa.jumpHeight);
  const tetoHorizontalEfetivo = Math.min(tetoGeometria, tetoAlcance);
  const proporcaoHorizontal = tetoHorizontalEfetivo > 0 ? plataformas.variacaoHorizontal / tetoHorizontalEfetivo : 0;

  const cores = [
    { rotulo: t("panel.mapPreview.colorPrimary"), hex: mapa.paleta.primaria },
    { rotulo: t("panel.mapPreview.colorSecondary"), hex: mapa.paleta.secundaria },
    { rotulo: t("panel.mapPreview.colorAccent"), hex: mapa.paleta.destaque },
  ];

  const checkpoints = (mapa.marcos ?? [])
    .filter((marco) => marco.tipo === "checkpoint_visual")
    .map((marco) => marco.plataforma)
    .sort((a, b) => a - b);
  const topo = (mapa.marcos ?? []).find((marco) => marco.tipo === "topo");

  // O estado mais importante deste componente: um spec pode ser válido e ainda
  // assim não poder ir ao ar (acervo pendente de aprovação, ADR-004). Fica no
  // topo, antes de qualquer outro dado, para nunca parecer "pronto" por engano.
  let blocoDeProntidao;
  if (!prontidao) {
    blocoDeProntidao = (
      <div className="previa-de-mapa-prontidao previa-de-mapa-prontidao-desconhecida">
        <span className="secundario">{t("panel.mapPreview.readinessUnknown")}</span>
      </div>
    );
  } else if (prontidao.pode) {
    blocoDeProntidao = (
      <div className="previa-de-mapa-prontidao previa-de-mapa-prontidao-ok">
        <span className="pastilha pastilha-ok">{t("panel.mapPreview.readinessOk")}</span>
      </div>
    );
  } else {
    const motivos = prontidao.motivos?.length ? prontidao.motivos : [t("panel.mapPreview.readinessNoReason")];
    blocoDeProntidao = (
      <div className="previa-de-mapa-prontidao previa-de-mapa-prontidao-bloqueada" role="alert">
        <span className="pastilha pastilha-atencao">{t("panel.mapPreview.readinessBlocked")}</span>
        <p className="previa-de-mapa-prontidao-texto">{t("panel.mapPreview.readinessIntro")}</p>
        <ul className="previa-de-mapa-motivos">
          {motivos.map((motivo, indice) => (
            <li key={indice}>{motivo}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section className="previa-de-mapa">
      {blocoDeProntidao}

      <header className="previa-de-mapa-cabecalho">
        <h2 className="previa-de-mapa-titulo">{mapa.nome}</h2>
        {mapa.promptOriginal && <p className="previa-de-mapa-prompt secundario">“{mapa.promptOriginal}”</p>}
      </header>

      <div className="previa-de-mapa-paleta">
        {cores.map((cor) => (
          <div className="previa-de-mapa-cor" key={cor.rotulo}>
            <span className="previa-de-mapa-cor-amostra" style={{ background: cor.hex }} aria-hidden="true" />
            <span className="previa-de-mapa-cor-rotulo secundario">{cor.rotulo}</span>
            <span className="previa-de-mapa-cor-hex">{cor.hex}</span>
          </div>
        ))}
      </div>

      <div className="previa-de-mapa-cenario secundario">
        <span>{t("panel.mapPreview.skybox", { id: mapa.skyboxAssetId })}</span>
        <span>{t("panel.mapPreview.texture", { id: plataformas.materialAssetId })}</span>
      </div>

      <dl className="previa-de-mapa-stats">
        <div className="previa-de-mapa-stat">
          <dt>{t("panel.mapPreview.statPlatforms")}</dt>
          <dd>{mapa.totalPlataformas}</dd>
        </div>
        <div className="previa-de-mapa-stat">
          <dt>{t("panel.mapPreview.statJumpHeight")}</dt>
          <dd>{t("panel.mapPreview.studs", { n: numero(mapa.jumpHeight) })}</dd>
        </div>
        <div className="previa-de-mapa-stat">
          <dt>{t("panel.mapPreview.statShape")}</dt>
          <dd>{plataformas.formato}</dd>
        </div>
        <div className="previa-de-mapa-stat">
          <dt>{t("panel.mapPreview.statVerticalSpacing")}</dt>
          <dd>{t("panel.mapPreview.studs", { n: numero(plataformas.espacamentoVertical) })}</dd>
        </div>
        <div className="previa-de-mapa-stat">
          <dt>{t("panel.mapPreview.statHorizontalVariation")}</dt>
          <dd>
            {t("panel.mapPreview.studs", { n: numero(plataformas.variacaoHorizontal) })}
            <span className="previa-de-mapa-stat-margem secundario">
              {" "}
              {t("panel.mapPreview.horizontalCap", {
                max: numero(tetoHorizontalEfetivo),
                pct: percentual(proporcaoHorizontal),
              })}
            </span>
          </dd>
        </div>
      </dl>

      <div className="previa-de-mapa-gauge">
        <div className="previa-de-mapa-gauge-cabecalho">
          <span>{t("panel.mapPreview.gaugeTitle")}</span>
          <span className="secundario">
            {t("panel.mapPreview.gaugeSummary", {
              used: numero(plataformas.espacamentoVertical),
              max: numero(tetoVertical),
              pct: percentual(proporcaoVertical),
            })}
          </span>
        </div>
        <div className="previa-de-mapa-gauge-trilho">
          <div
            className={
              verticalEstourou
                ? "previa-de-mapa-gauge-preenchimento previa-de-mapa-gauge-preenchimento-erro"
                : "previa-de-mapa-gauge-preenchimento previa-de-mapa-gauge-preenchimento-ok"
            }
            style={{ width: `${Math.min(proporcaoVertical, 1) * 100}%` }}
          />
        </div>
        {verticalEstourou ? (
          <p className="previa-de-mapa-gauge-legenda previa-de-mapa-gauge-legenda-erro">
            {t("panel.mapPreview.gaugeOverflow")}
          </p>
        ) : (
          <p className="previa-de-mapa-gauge-legenda secundario">{t("panel.mapPreview.gaugeHint")}</p>
        )}
      </div>

      {mapa.props?.length > 0 && (
        <div className="previa-de-mapa-props">
          <h3 className="previa-de-mapa-subtitulo secundario">{t("panel.mapPreview.propsTitle")}</h3>
          <ul className="previa-de-mapa-props-lista">
            {mapa.props.map((prop, indice) => (
              <li key={`${prop.tipo}-${indice}`} className="previa-de-mapa-prop">
                <span className="previa-de-mapa-prop-tipo">{prop.tipo}</span>
                <span className="secundario">
                  {t("panel.mapPreview.propFrequency", {
                    pct: percentual(prop.densidade),
                    n: prop.aCadaNPlataformas,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="previa-de-mapa-marcos">
        <h3 className="previa-de-mapa-subtitulo secundario">{t("panel.mapPreview.milestonesTitle")}</h3>
        <p className="previa-de-mapa-marco">
          <span className="previa-de-mapa-marco-rotulo secundario">{t("panel.mapPreview.checkpointsLabel")}</span>
          <span>{checkpoints.length > 0 ? checkpoints.join(" · ") : t("panel.mapPreview.checkpointsNone")}</span>
        </p>
        <p className="previa-de-mapa-marco">
          <span className="previa-de-mapa-marco-rotulo secundario">{t("panel.mapPreview.topLabel")}</span>
          <span>
            {topo ? t("panel.mapPreview.topPlatform", { n: topo.plataforma }) : t("panel.mapPreview.topUndefined")}
          </span>
        </p>
      </div>
    </section>
  );
}
