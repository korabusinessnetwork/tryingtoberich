import { Fragment, useMemo, useState } from "react";

import { useTraducao } from "../i18n/useTraducao.js";
import "./SeletorDeMundo.css";

/**
 * Montar o mundo escolhendo as peças, com a foto de cada uma.
 *
 * Substituiu o gerador por texto. Ele sempre foi um atalho — descrever e deixar
 * o modelo escolher — e o custo era não saber o que ia sair: todo mapa com o
 * mesmo céu enquanto o acervo tinha um só, plataformas todas verdes porque o
 * mapa só aceitava uma textura, formato errado porque a palavra "passarela" não
 * chegava até a regra.
 *
 * Escolher olhando é melhor em tudo que importa aqui: é instantâneo, não gasta
 * chamada de IA, não falha por spec inválido, e o streamer vê o que está
 * montando antes de montar.
 *
 * As fotos vêm da ponte (`/api/acervo/imagem/...`), desenhadas sob demanda. As
 * texturas são geradas em código: não existe arquivo para abrir e conferir, e
 * sem a imagem escolher entre `textura_pedra_musgo` e `textura_areia_compacta`
 * seria ler etiqueta e torcer.
 */

/** Como a torre é construída (ADR-009). A regra de jogabilidade muda junto. */
const FORMATOS = [
  { id: "disco", rotulo: "panel.worldPicker.shapeStairs", dica: "panel.worldPicker.shapeStairsHint" },
  { id: "laje", rotulo: "panel.worldPicker.shapeWalkway", dica: "panel.worldPicker.shapeWalkwayHint" },
];

const aprovadas = (itens) => (itens ?? []).filter((i) => i.status === "aprovado" && i.assetId);

/**
 * Costura de volta o texto traduzido que tem destaque no meio.
 *
 * O catálogo guarda a frase INTEIRA com `{marca}` onde entra o `<strong>` —
 * quem traduz lê a frase toda, e a tela não é montada com pedaço de frase
 * concatenado. Marca sem nó correspondente fica como veio, em vez de sumir sem
 * aviso. Mesmo padrão do `PainelDeOverlay`.
 */
function comMarcadores(texto, nos) {
  return texto.split(/(\{\w+\})/g).map((pedaco, indice) => {
    const marca = /^\{(\w+)\}$/.exec(pedaco);
    if (!marca || nos[marca[1]] === undefined) return pedaco;
    return <Fragment key={indice}>{nos[marca[1]]}</Fragment>;
  });
}

function Peca({ colecao, item, escolhida, aoClicar }) {
  return (
    <li>
      <button
        type="button"
        className={escolhida ? "mundo-peca escolhida" : "mundo-peca"}
        onClick={() => aoClicar(item.id)}
        aria-pressed={escolhida}
      >
        <img
          className="mundo-peca-foto"
          src={`/api/acervo/imagem/${colecao}/${encodeURIComponent(item.id)}`}
          alt=""
          loading="lazy"
          width={72}
          height={72}
        />
        <span className="mundo-peca-nome">{item.nome}</span>
      </button>
    </li>
  );
}

export function SeletorDeMundo({ acervo, mapa, montando, erro, recado, jogoOnline, aoMontar }) {
  const { t } = useTraducao();
  const ceus = useMemo(() => aprovadas(acervo?.skybox), [acervo]);
  const texturas = useMemo(() => aprovadas(acervo?.texturas), [acervo]);

  //[[ A tela é semeada pelo mundo NO AR, até o streamer encostar nela.
  //
  // `mexeu` existe porque "lista vazia" e "ainda não escolhi" são coisas
  // diferentes, e tratá-las igual criava um bug esquisito: tirar a ÚLTIMA
  // textura caía de volta na lista do mapa, e o clique parecia não ter feito
  // nada. A partir do primeiro toque vale o que está na tela, inclusive vazio —
  // que é o estado em que o botão fica desligado, dizendo o que falta.
  const [mexeu, definirMexeu] = useState(false);
  const [ceu, definirCeu] = useState(null);
  const [escolhidas, definirEscolhidas] = useState([]);
  const [formato, definirFormato] = useState(null);

  const doMapa = [mapa?.plataformas?.materialAssetId ?? []].flat().filter(Boolean);

  const ceuAtual = ceu ?? mapa?.skyboxAssetId ?? ceus[0]?.id ?? null;
  const texturasAtuais = mexeu ? escolhidas : doMapa;
  // O formato também vem do mapa: sem isto a tela mostrava "Escada" num mundo
  // de passarela, e montar o convertia sem ninguém ter pedido.
  const formatoAtual = formato ?? mapa?.plataformas?.formato ?? "disco";

  const alternarTextura = (id) => {
    const base = texturasAtuais;
    definirMexeu(true);
    definirEscolhidas(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  };

  const podeMontar = Boolean(ceuAtual) && texturasAtuais.length > 0 && !montando;

  return (
    <section className="mundo" aria-label={t("panel.worldPicker.regionLabel")}>
      <header className="mundo-cabecalho">
        <h2 className="mundo-titulo">{t("panel.worldPicker.title")}</h2>
        <span className="mundo-etiqueta">
          {t("panel.worldPicker.catalogCounts", { skies: ceus.length, platforms: texturas.length })}
        </span>
      </header>

      {/*[[ O que está NO AR, e o que acabou de acontecer.

          Sem isto a tela ficava idêntica antes e depois de montar: as mesmas
          peças selecionadas, o mesmo tudo. Clicar e não ver nada mudar lê como
          "o botão não funciona" — mesmo com a torre se reerguendo do outro
          lado. ]]*/}
      {mapa && (
        <p className="mundo-noar">
          {comMarcadores(
            t("panel.worldPicker.onAir", {
              n: [mapa.plataformas?.materialAssetId ?? []].flat().filter(Boolean).length,
              shape:
                mapa.plataformas?.formato === "laje"
                  ? t("panel.worldPicker.shapeWalkwayInline")
                  : t("panel.worldPicker.shapeStairsInline"),
            }),
            { nome: <strong>{mapa.nome}</strong> },
          )}
        </p>
      )}

      {recado && (
        <p className="mundo-recado" role="status">
          {recado}
          {!jogoOnline && ` ${t("panel.worldPicker.gameOfflineNote")}`}
        </p>
      )}

      <p className="mundo-explicacao">
        {comMarcadores(t("panel.worldPicker.explainer"), {
          more: <strong>{t("panel.worldPicker.explainerMoreThanOne")}</strong>,
        })}
      </p>

      <fieldset className="mundo-formato" disabled={montando}>
        <legend className="mundo-rotulo">{t("panel.worldPicker.shapeLegend")}</legend>
        {FORMATOS.map((opcao) => (
          <label key={opcao.id} className={formatoAtual === opcao.id ? "mundo-formato-opcao escolhida" : "mundo-formato-opcao"}>
            <input
              type="radio"
              name="mundo-formato"
              checked={formatoAtual === opcao.id}
              onChange={() => definirFormato(opcao.id)}
            />
            <span className="mundo-formato-rotulo">{t(opcao.rotulo)}</span>
            <span className="mundo-formato-dica">{t(opcao.dica)}</span>
          </label>
        ))}
      </fieldset>

      <div className="mundo-secao">
        <h3 className="mundo-rotulo">{t("panel.worldPicker.skyHeading")}</h3>
        {ceus.length === 0 ? (
          <p className="mundo-vazio">{t("panel.worldPicker.noSkies")}</p>
        ) : (
          <ul className="mundo-grade">
            {ceus.map((item) => (
              <Peca
                key={item.id}
                colecao="skybox"
                item={item}
                escolhida={ceuAtual === item.id}
                aoClicar={definirCeu}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="mundo-secao">
        <h3 className="mundo-rotulo">
          {t("panel.worldPicker.platformsHeading")}{" "}
          <span className="secundario">
            {t("panel.worldPicker.selectedCount", { n: texturasAtuais.length })}
          </span>
        </h3>
        {texturasAtuais.length === 0 && texturas.length > 0 && (
          <p className="mundo-vazio">{t("panel.worldPicker.pickAtLeastOne")}</p>
        )}
        {texturas.length === 0 ? (
          <p className="mundo-vazio">{t("panel.worldPicker.noTextures")}</p>
        ) : (
          <ul className="mundo-grade">
            {texturas.map((item) => (
              <Peca
                key={item.id}
                colecao="texturas"
                item={item}
                escolhida={texturasAtuais.includes(item.id)}
                aoClicar={alternarTextura}
              />
            ))}
          </ul>
        )}
      </div>

      {erro && <p className="pastilha pastilha-erro">{erro}</p>}

      <button
        type="button"
        className="mundo-montar"
        disabled={!podeMontar}
        onClick={() => aoMontar({ skybox: ceuAtual, texturas: texturasAtuais, formato: formatoAtual })}
      >
        {montando ? t("panel.worldPicker.building") : t("panel.worldPicker.buildAction")}
      </button>
    </section>
  );
}
