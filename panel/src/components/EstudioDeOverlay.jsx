import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTraducao } from "../i18n/useTraducao.js";
import { api } from "../lib/api.js";
import {
  avisoDeAncora,
  invadeACam,
  layoutComElemento,
  lerRespostaDoLayout,
  prenderNoPalco,
  semElemento,
} from "../lib/regras.js";
import "./EstudioDeOverlay.css";

/**
 * O estúdio de overlay: onde o HUD da live (ADR-015) é arrumado na tela.
 *
 * A página do OBS desenha placar, legendas, disputa, portal, presente e aviso
 * de seguidor em posições que estavam no CSS e em lugar nenhum mais. Mudar
 * qualquer uma exigia abrir `overlay-hud.mjs` e reiniciar a ponte — ou seja,
 * não era coisa que o streamer fazia, era coisa que o programador fazia. E a
 * cena de cada um é diferente: cam em cima, cam no canto, marca no rodapé.
 * Sem esta tela, o jeito de "ajustar" o overlay era não usá-lo.
 *
 * Três decisões que vale lembrar:
 *
 *   1. O CATÁLOGO — id, rótulo, posição padrão e tamanho de cada elemento —
 *      vem da PONTE, junto do layout salvo. Nenhum número de geometria da
 *      página do OBS mora aqui: se ela mudar, o estúdio acompanha sozinho.
 *   2. O arquivo guarda só EXCEÇÃO, como a tabela de movimento do ADR-016.
 *      Quem nunca abriu esta tela tem layout vazio, e a página do OBS fica
 *      exatamente como está hoje. Voltar ao padrão APAGA a chave.
 *   3. Salvar publica pelo mesmo fluxo do estado, então a fonte já aberta no
 *      OBS se ajusta sozinha. Recarregar fonte de navegador no meio da live é
 *      o tipo de coisa que ninguém faz — e por isso não se pode exigir.
 *
 * Uma consequência aparece no primeiro arrastar e assusta: os elementos
 * colados na direita ou na base (legenda de descida, portal, seguidor) e os
 * centralizados (VS, centro) nascem ancorados por ali. Ao ganharem `x`/`y`
 * passam a ser ancorados pelo canto superior esquerdo, e dão um pulo do
 * tamanho da diferença. Está no 02_DESIGN_SYSTEM, seção C, e o catálogo da
 * ponte manda a `ancora` justamente para o painel avisar quem é assim — o
 * aviso fica na linha do elemento, e some depois que ele já foi movido, que é
 * quando o pulo já aconteceu.
 */

/** Setas movem meio ponto por toque: o bastante para encostar sem arrastar. */
const PASSO_DA_SETA = 0.5;

const ESCALA_MINIMA = 0.5;
const ESCALA_MAXIMA = 2;

/**
 * Piso do tamanho DESENHADO da caixa — não é geometria da página.
 *
 * Catálogo sem medida daria caixa de área zero: nada para clicar, nada para
 * arrastar, e uma tela que parece vazia sem dizer por quê.
 */
const LARGURA_MINIMA = 8;
const ALTURA_MINIMA = 4;

/** Aceita catálogo em lista ou em mapa: quem manda na forma é a ponte. */
function catalogoEmLista(bruto) {
  const itens = Array.isArray(bruto)
    ? bruto
    : Object.entries(bruto ?? {}).map(([id, item]) => ({ id, ...item }));

  return itens
    .filter((item) => item && typeof item.id === "string")
    .map((item) => ({
      id: item.id,
      rotulo: item.rotulo ?? item.id,
      // `ancora` e `descricao` vêm do catálogo e são para a TELA: a âncora é o
      // aviso do pulo (02_DESIGN_SYSTEM, seção C) e a descrição diz o que a
      // caixa desenha, que nem sempre está no rótulo curto.
      ancora: typeof item.ancora === "string" ? item.ancora : null,
      descricao: typeof item.descricao === "string" ? item.descricao : null,
      x: Number.isFinite(item.x) ? item.x : 0,
      y: Number.isFinite(item.y) ? item.y : 0,
      largura: Math.max(LARGURA_MINIMA, Number.isFinite(item.largura) ? item.largura : 0),
      altura: Math.max(ALTURA_MINIMA, Number.isFinite(item.altura) ? item.altura : 0),
    }));
}

/**
 * A faixa da escala é prendida AQUI, não só no `min`/`max` do controle.
 *
 * O schema da ponte recusa fora de 0,5 a 2 com um 400, e um 400 no clique de
 * salvar não diz qual linha causou. Prender na origem é o que faz o controle
 * não conseguir produzir um layout que a ponte vá rejeitar.
 */
const prenderEscala = (valor) =>
  Math.min(ESCALA_MAXIMA, Math.max(ESCALA_MINIMA, Number.isFinite(valor) ? valor : 1));

/** Comparação estável: mexer troca a ordem das chaves, e ordem não é mudança. */
function mesmoLayout(a, b) {
  const achatar = (elementos) =>
    Object.keys(elementos ?? {})
      .sort()
      .map((id) => {
        const el = elementos[id] ?? {};
        return `${id}:${el.x}:${el.y}:${el.escala}:${el.visivel}`;
      })
      .join("|");
  return achatar(a) === achatar(b);
}

export function EstudioDeOverlay() {
  const { t } = useTraducao();
  const [dados, definirDados] = useState(null);
  const [erro, definirErro] = useState(null);
  const [elementos, definirElementos] = useState({});
  const [salvos, definirSalvos] = useState({});
  const [salvando, definirSalvando] = useState(false);
  const [falhaAoSalvar, definirFalhaAoSalvar] = useState(null);
  const [arrastando, definirArrastando] = useState(null);

  const palcoRef = useRef(null);
  // Em `ref`, não em estado: o ponteiro dispara dezenas de eventos por segundo,
  // e reagendar render a cada um só para guardar a origem do arrasto faria a
  // caixa andar atrás do cursor.
  const arrastoRef = useRef(null);

  const carregar = useCallback(async () => {
    try {
      definirErro(null);
      definirFalhaAoSalvar(null);
      const resposta = await api.layoutDoOverlay();
      // Resposta vazia vira ERRO, e não `dados` nulo: `chamar` devolve null num
      // 204, e `definirDados(null)` deixaria a tela no "Carregando…", que é o
      // único estado sem mensagem e sem o botão de repetir — ninguém sai dele
      // sem recarregar o painel.
      if (!resposta || typeof resposta !== "object") {
        throw new Error(t("panel.overlayStudio.emptyResponse"));
      }
      const { elementos: guardados } = lerRespostaDoLayout(resposta);
      definirDados(resposta);
      definirElementos(guardados);
      definirSalvos(guardados);
    } catch (falha) {
      definirErro(falha.message);
    }
  }, [t]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const catalogo = useMemo(() => catalogoEmLista(lerRespostaDoLayout(dados).catalogo), [dados]);
  //[[ Sem `cam` na resposta, não se sombreia nada — e diz-se por quê.
  //
  // O fallback aqui era 33, o `--cam` do CSS da página do OBS copiado para
  // dentro do componente: a terceira escrita dos mesmos números, e a única sem
  // teste olhando (06_COMPONENTES). Se o padrão da página mudar, o estúdio
  // sombrearia a faixa errada e o aviso "encostando na faixa da cam" passaria a
  // mentir, sem nada quebrar. Nulo é o mesmo tratamento que o catálogo ausente
  // já recebe: a tela mostra que não sabe, em vez de chutar. ]]
  const cam = Number.isFinite(dados?.cam) ? dados.cam : null;

  /** A caixa como está AGORA: o padrão do catálogo, com a exceção por cima. */
  const caixaDe = useCallback(
    (item) => {
      const excecao = elementos?.[item.id] ?? {};
      const escala = prenderEscala(excecao.escala ?? 1);
      return {
        x: Number.isFinite(excecao.x) ? excecao.x : item.x,
        y: Number.isFinite(excecao.y) ? excecao.y : item.y,
        escala,
        visivel: excecao.visivel !== false,
        largura: item.largura * escala,
        altura: item.altura * escala,
        movido: elementos?.[item.id] !== undefined,
      };
    },
    [elementos],
  );

  /**
   * Grava sempre os quatro campos, mesmo mexendo só num.
   *
   * A ponte quer `{ x, y, escala, visivel }` inteiros, e mexer na escala de um
   * elemento nunca tocado criaria a chave sem posição: recusa na hora de
   * salvar, com o streamer sem ideia de qual linha causou.
   */
  const mudar = useCallback((item, campos) => {
    definirFalhaAoSalvar(null);
    definirElementos((atuais) => {
      const anterior = atuais?.[item.id] ?? {};
      const escala = prenderEscala(campos.escala ?? anterior.escala ?? 1);
      const preso = prenderNoPalco({
        x: campos.x ?? (Number.isFinite(anterior.x) ? anterior.x : item.x),
        y: campos.y ?? (Number.isFinite(anterior.y) ? anterior.y : item.y),
        // Prende pelo tamanho JÁ ESCALADO: aumentar um elemento que estava
        // encostado na borda o empurraria para fora sem isto.
        largura: item.largura * escala,
        altura: item.altura * escala,
      });

      return layoutComElemento(atuais, item.id, {
        ...preso,
        escala,
        visivel: campos.visivel ?? anterior.visivel ?? true,
      });
    });
  }, []);

  const aoPressionar = useCallback(
    (evento, item) => {
      if (evento.button !== 0) return;
      const caixa = caixaDe(item);
      arrastoRef.current = {
        id: item.id,
        item,
        px: evento.clientX,
        py: evento.clientY,
        x: caixa.x,
        y: caixa.y,
      };
      // A captura é o que faz o arrasto sobreviver ao cursor sair da caixa —
      // sem ela, mover rápido larga o elemento no meio do caminho.
      evento.currentTarget.setPointerCapture(evento.pointerId);
      definirArrastando(item.id);
    },
    [caixaDe],
  );

  // Antes de `aoArrastar` porque ele o chama, e a lista de dependências é
  // avaliada no render: declarado depois, o nome ainda estaria na zona morta.
  const aoSoltar = useCallback((evento) => {
    if (!arrastoRef.current) return;
    arrastoRef.current = null;
    definirArrastando(null);
    if (evento.currentTarget.hasPointerCapture?.(evento.pointerId)) {
      evento.currentTarget.releasePointerCapture(evento.pointerId);
    }
  }, []);

  const aoArrastar = useCallback(
    (evento) => {
      // Nenhum botão apertado e um arrasto de pé: a captura se perdeu sem um
      // pointerup chegar à caixa — o `setPointerCapture` estourando, ou o
      // ponteiro solto fora da janela. Sem isto o ref fica preenchido e a
      // próxima passada do cursor por QUALQUER caixa continua arrastando o
      // elemento agarrado antes: ele gruda no cursor e só recarregar solta.
      if (evento.buttons === 0) {
        aoSoltar(evento);
        return;
      }

      const arrasto = arrastoRef.current;
      const palco = palcoRef.current;
      if (!arrasto || !palco) return;

      // O palco é fluido, então a conversão de pixel para porcentagem lê o
      // tamanho de agora em vez de um número guardado no início do arrasto.
      const area = palco.getBoundingClientRect();
      if (!area.width || !area.height) return;

      mudar(arrasto.item, {
        x: arrasto.x + ((evento.clientX - arrasto.px) / area.width) * 100,
        y: arrasto.y + ((evento.clientY - arrasto.py) / area.height) * 100,
      });
    },
    [aoSoltar, mudar],
  );

  const aoTeclar = useCallback(
    (evento, item) => {
      const passos = {
        ArrowLeft: [-PASSO_DA_SETA, 0],
        ArrowRight: [PASSO_DA_SETA, 0],
        ArrowUp: [0, -PASSO_DA_SETA],
        ArrowDown: [0, PASSO_DA_SETA],
      };
      const passo = passos[evento.key];
      if (!passo) return;
      // Sem isto, a seta rola a página junto e a caixa "some" da vista.
      evento.preventDefault();
      const caixa = caixaDe(item);
      mudar(item, { x: caixa.x + passo[0], y: caixa.y + passo[1] });
    },
    [caixaDe, mudar],
  );

  const voltarElemento = useCallback((id) => {
    definirFalhaAoSalvar(null);
    definirElementos((atuais) => semElemento(atuais, id));
  }, []);

  const voltarTudo = useCallback(() => {
    definirFalhaAoSalvar(null);
    definirElementos({});
  }, []);

  const salvar = useCallback(async () => {
    definirSalvando(true);
    definirFalhaAoSalvar(null);
    try {
      // O que a PONTE devolveu, não o que o painel mandou: o repositório
      // descarta elemento com objeto vazio antes de gravar, e comparar com a
      // cópia local deixaria o "Salvar layout" desabilitado por cima de uma
      // diferença real entre a tela e o disco.
      const salvo = await api.salvarLayoutDoOverlay(elementos);
      definirSalvos(salvo?.elementos ?? elementos);
    } catch (falha) {
      definirFalhaAoSalvar(falha.message);
    } finally {
      definirSalvando(false);
    }
  }, [elementos]);

  if (erro) {
    return (
      <section className="estudio">
        <p className="pastilha pastilha-erro">{erro}</p>
        <button type="button" onClick={carregar}>{t("common.action.retry")}</button>
      </section>
    );
  }

  if (!dados) {
    return (
      <section className="estudio">
        <p className="estudio-nota">{t("common.state.loading")}</p>
      </section>
    );
  }

  const caixas = catalogo.map((item) => ({ item, caixa: caixaDe(item) }));
  // Sem a altura da cam não há faixa para invadir: acusar por um número chutado
  // seria pior que não acusar.
  const invasores = cam === null ? [] : caixas.filter(({ caixa }) => caixa.visivel && invadeACam(caixa, cam));
  const mexidos = Object.keys(elementos ?? {}).length;
  const semMudanca = mesmoLayout(elementos, salvos);

  return (
    <section className="estudio">
      <header className="estudio-cabecalho">
        <h2 className="estudio-titulo">{t("panel.overlayStudio.title")}</h2>
        <span className="estudio-etiqueta">
          {t("panel.overlayStudio.counts", { n: catalogo.length, m: mexidos })}
        </span>
      </header>

      <p className="estudio-nota">{t("panel.overlayStudio.intro")}</p>

      {catalogo.length === 0 ? (
        <p className="pastilha pastilha-atencao">{t("panel.overlayStudio.noCatalog")}</p>
      ) : null}

      {cam === null ? (
        <p className="pastilha pastilha-atencao">{t("panel.overlayStudio.noCamHeight")}</p>
      ) : null}

      {mexidos === 0 ? (
        <p className="estudio-nota">{t("panel.overlayStudio.nothingMoved")}</p>
      ) : null}

      <div className="estudio-mesa">
        <div className="estudio-palco" ref={palcoRef}>
          {cam === null ? null : (
            <div className="estudio-cam" style={{ height: `${cam}%` }}>
              <span className="estudio-cam-rotulo">{t("panel.overlayStudio.camBand")}</span>
            </div>
          )}

          {caixas.map(({ item, caixa }) => {
            // Uma casa decimal no que é LIDO, aqui e na lista de controles, que
            // é a mesma que o arquivo guarda: `prenderNoPalco` só arredonda o
            // que foi ARRASTADO, e o valor que vem direto do catálogo fazia o
            // leitor de tela ditar "x 77.5% e y 38.0625%".
            const classes = ["estudio-caixa"];
            if (!caixa.visivel) classes.push("estudio-caixa-oculta");
            if (caixa.movido) classes.push("estudio-caixa-movida");
            if (arrastando === item.id) classes.push("estudio-caixa-arrastando");

            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                aria-label={t("panel.overlayStudio.boxAriaLabel", {
                  rotulo: item.rotulo,
                  x: caixa.x.toFixed(1),
                  y: caixa.y.toFixed(1),
                })}
                className={classes.join(" ")}
                // A caixa é pequena e só cabe o rótulo curto; a descrição do
                // catálogo diz o que ela desenha de verdade na live.
                title={item.descricao ?? undefined}
                style={{
                  left: `${caixa.x}%`,
                  top: `${caixa.y}%`,
                  width: `${caixa.largura}%`,
                  height: `${caixa.altura}%`,
                }}
                onPointerDown={(evento) => aoPressionar(evento, item)}
                onPointerMove={aoArrastar}
                onPointerUp={aoSoltar}
                onPointerCancel={aoSoltar}
                onKeyDown={(evento) => aoTeclar(evento, item)}
              >
                <span className="estudio-caixa-nome">{item.rotulo}</span>
                {/* Texto junto, nunca só a cor esmaecida (02_DESIGN_SYSTEM). */}
                {caixa.visivel ? null : (
                  <span className="estudio-caixa-marca">{t("panel.overlayStudio.hiddenMark")}</span>
                )}
              </div>
            );
          })}
        </div>

        <ul className="estudio-controles">
          {caixas.map(({ item, caixa }) => (
            <li key={item.id} className="estudio-linha">
              <span className="estudio-linha-nome" title={item.descricao ?? undefined}>{item.rotulo}</span>
              <span className="estudio-linha-posicao">
                {t("panel.overlayStudio.position", {
                  x: caixa.x.toFixed(1),
                  y: caixa.y.toFixed(1),
                })}
              </span>

              {/* O pulo do primeiro arrastar, dito ANTES de acontecer
                  (02_DESIGN_SYSTEM, seção C). Some quando o elemento já foi
                  movido: aí ele já está preso pela esquerda e pelo topo, e o
                  aviso viraria enfeite permanente. */}
              {!caixa.movido && avisoDeAncora(item.ancora) ? (
                <span className="estudio-linha-ancora">
                  {t("panel.overlayStudio.anchorWarning", { ancora: avisoDeAncora(item.ancora) })}
                </span>
              ) : null}

              <label className="estudio-linha-escala">
                <span className="estudio-linha-legenda">{t("panel.overlayStudio.sizeLabel")}</span>
                <input
                  type="range"
                  min={ESCALA_MINIMA}
                  max={ESCALA_MAXIMA}
                  step="0.05"
                  value={caixa.escala}
                  onChange={(evento) => mudar(item, { escala: Number(evento.target.value) })}
                />
                {/* O número ao lado: "um pouco maior" não se anota, nem se
                    repete igual na live seguinte. */}
                <span className="estudio-linha-valor">{caixa.escala.toFixed(2)}×</span>
              </label>

              <label className="estudio-linha-visivel">
                <input
                  type="checkbox"
                  checked={caixa.visivel}
                  onChange={(evento) => mudar(item, { visivel: evento.target.checked })}
                />
                <span>{t("panel.overlayStudio.visibleLabel")}</span>
              </label>

              <button
                type="button"
                className="estudio-linha-voltar"
                title={t("panel.overlayStudio.resetOneTitle")}
                aria-label={t("panel.overlayStudio.resetOneAria", { rotulo: item.rotulo })}
                disabled={!caixa.movido}
                onClick={() => voltarElemento(item.id)}
              >
                ↺
              </button>
            </li>
          ))}
        </ul>
      </div>

      {invasores.length > 0 ? (
        <p className="pastilha pastilha-atencao estudio-aviso">
          {t("panel.overlayStudio.camOverlap", {
            lista: invasores.map(({ item }) => item.rotulo).join(", "),
          })}
        </p>
      ) : null}

      {falhaAoSalvar ? <p className="pastilha pastilha-erro estudio-aviso">{falhaAoSalvar}</p> : null}

      <footer className="estudio-rodape">
        <button type="button" className="estudio-salvar" disabled={semMudanca || salvando} onClick={salvar}>
          {salvando ? t("common.state.saving") : t("panel.overlayStudio.saveLayout")}
        </button>
        <button type="button" disabled={mexidos === 0} onClick={voltarTudo}>
          {t("panel.overlayStudio.resetAll")}
        </button>
        <span className="estudio-nota">{t("panel.overlayStudio.saveHint")}</span>
      </footer>
    </section>
  );
}
