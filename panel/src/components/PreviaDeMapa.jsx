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
  if (!Number.isFinite(valor)) return "—";
  return Number(valor.toFixed(casas)).toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

function percentual(fracao) {
  if (!Number.isFinite(fracao)) return "—";
  return `${Math.round(fracao * 100)}%`;
}

const ROTULO_DO_MARCO = { checkpoint_visual: "Checkpoint", topo: "Topo" };

export function PreviaDeMapa({ mapa = null, prontidao = null }) {
  if (!mapa) {
    return (
      <section className="previa-de-mapa previa-de-mapa-vazia">
        <p className="secundario">Nenhum mapa selecionado. Gere ou escolha um mapa para ver a prévia.</p>
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
    { rotulo: "Primária", hex: mapa.paleta.primaria },
    { rotulo: "Secundária", hex: mapa.paleta.secundaria },
    { rotulo: "Destaque", hex: mapa.paleta.destaque },
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
        <span className="secundario">Prontidão ainda não avaliada para este mapa.</span>
      </div>
    );
  } else if (prontidao.pode) {
    blocoDeProntidao = (
      <div className="previa-de-mapa-prontidao previa-de-mapa-prontidao-ok">
        <span className="pastilha pastilha-ok">Pronto para ir ao ar</span>
      </div>
    );
  } else {
    const motivos = prontidao.motivos?.length ? prontidao.motivos : ["Motivo não informado pela ponte."];
    blocoDeProntidao = (
      <div className="previa-de-mapa-prontidao previa-de-mapa-prontidao-bloqueada" role="alert">
        <span className="pastilha pastilha-atencao">Ainda não pode ir ao ar</span>
        <p className="previa-de-mapa-prontidao-texto">
          Este spec é válido, mas não pode ir ao ar enquanto isto não for resolvido:
        </p>
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
        <span>Skybox: {mapa.skyboxAssetId}</span>
        <span>Textura: {plataformas.materialAssetId}</span>
      </div>

      <dl className="previa-de-mapa-stats">
        <div className="previa-de-mapa-stat">
          <dt>Plataformas</dt>
          <dd>{mapa.totalPlataformas}</dd>
        </div>
        <div className="previa-de-mapa-stat">
          <dt>Altura de pulo</dt>
          <dd>{numero(mapa.jumpHeight)} studs</dd>
        </div>
        <div className="previa-de-mapa-stat">
          <dt>Formato</dt>
          <dd>{plataformas.formato}</dd>
        </div>
        <div className="previa-de-mapa-stat">
          <dt>Espaçamento vertical</dt>
          <dd>{numero(plataformas.espacamentoVertical)} studs</dd>
        </div>
        <div className="previa-de-mapa-stat">
          <dt>Variação horizontal</dt>
          <dd>
            {numero(plataformas.variacaoHorizontal)} studs
            <span className="previa-de-mapa-stat-margem secundario">
              {" "}
              · até {numero(tetoHorizontalEfetivo)} ({percentual(proporcaoHorizontal)} usado)
            </span>
          </dd>
        </div>
      </dl>

      <div className="previa-de-mapa-gauge">
        <div className="previa-de-mapa-gauge-cabecalho">
          <span>Espaçamento vertical usado</span>
          <span className="secundario">
            {numero(plataformas.espacamentoVertical)} de {numero(tetoVertical)} studs · {percentual(proporcaoVertical)}
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
            Passa do teto do ADR-009 — ver motivo no topo: este mapa não é escalável sem presente.
          </p>
        ) : (
          <p className="previa-de-mapa-gauge-legenda secundario">
            Teto do ADR-009: jumpHeight × 0,7. Quanto mais cheia, mais apertado o salto — sempre dentro do alcance do
            pulo, sem presente nenhum.
          </p>
        )}
      </div>

      {mapa.props?.length > 0 && (
        <div className="previa-de-mapa-props">
          <h3 className="previa-de-mapa-subtitulo secundario">Props</h3>
          <ul className="previa-de-mapa-props-lista">
            {mapa.props.map((prop, indice) => (
              <li key={`${prop.tipo}-${indice}`} className="previa-de-mapa-prop">
                <span className="previa-de-mapa-prop-tipo">{prop.tipo}</span>
                <span className="secundario">
                  {percentual(prop.densidade)} · a cada {prop.aCadaNPlataformas} plataformas
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="previa-de-mapa-marcos">
        <h3 className="previa-de-mapa-subtitulo secundario">Marcos</h3>
        <p className="previa-de-mapa-marco">
          <span className="previa-de-mapa-marco-rotulo secundario">{ROTULO_DO_MARCO.checkpoint_visual}s</span>
          <span>{checkpoints.length > 0 ? checkpoints.join(" · ") : "nenhum"}</span>
        </p>
        <p className="previa-de-mapa-marco">
          <span className="previa-de-mapa-marco-rotulo secundario">{ROTULO_DO_MARCO.topo}</span>
          <span>{topo ? `plataforma ${topo.plataforma}` : "não definido"}</span>
        </p>
      </div>
    </section>
  );
}
