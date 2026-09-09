import { useState } from "react";

import { useTraducao } from "../i18n/useTraducao.js";
import "./PainelDeAcervo.css";

/**
 * O acervo do ADR-004, e o estado de moderação de cada peça.
 *
 * Este é o item que trava a live inteira: nenhum mapa vai ao ar enquanto o
 * skybox e a textura que ele usa não estiverem **aprovados e com assetId**, e
 * até aqui a única forma de anotar isso era editar `data/acervo.json` na mão —
 * com o schema recusando o arquivo INTEIRO quando um número caía no item
 * errado. A tarefa que bloqueia a live merecia uma tela.
 *
 * O painel não envia imagem para o Roblox e nem poderia: upload de asset é
 * manual, de véspera, e a moderação leva o tempo que leva (ADR-004). O que ele
 * faz é registrar o resultado — o número que o Roblox devolveu e em que pé
 * está cada peça.
 *
 * `props` aparecem só como leitura: são efeitos nativos (ParticleEmitter,
 * Beam, Trail), não passam por moderação e não têm assetId. Mostrá-los com
 * campo de número sugeriria um trabalho que não existe.
 */

// O `id` é o valor gravado no acervo e não se traduz; o rótulo visível vem do
// catálogo pela chave (ADR-P03).
const STATUS = [
  { id: "pendente-upload", chave: "panel.assetLibrary.statusPending", classe: "" },
  { id: "em-moderacao", chave: "panel.assetLibrary.statusModerating", classe: "pastilha-atencao" },
  { id: "aprovado", chave: "panel.assetLibrary.statusApproved", classe: "pastilha-ok" },
  { id: "rejeitado", chave: "panel.assetLibrary.statusRejected", classe: "pastilha-erro" },
];

const classeDoStatus = (status) => STATUS.find((s) => s.id === status)?.classe ?? "";
const chaveDoStatus = (status) => STATUS.find((s) => s.id === status)?.chave ?? status;

function ItemDoAcervo({ colecao, item, salvando, aoAnotar }) {
  const { t } = useTraducao();
  // O campo é local até o streamer confirmar: teclar 5 dígitos de um assetId
  // não pode disparar 5 gravações em disco, e cada uma revalida o acervo
  // inteiro contra o schema.
  const [assetId, definirAssetId] = useState(item.assetId === null ? "" : String(item.assetId));

  const mudou = (item.assetId === null ? "" : String(item.assetId)) !== assetId.trim();

  return (
    <li className="acervo-item">
      <div className="acervo-item-topo">
        {/*[[ A FOTO da peça, e não só o nome.

            "textura_pedra_musgo" e "textura_areia_compacta" são dois nomes;
            olhando, são duas coisas. Sem a imagem, escolher o que vai no mapa
            era ler etiqueta e torcer — e as texturas são desenhadas em código,
            então nem existe arquivo para abrir e conferir.

            A ponte desenha sob demanda: mesma peça, mesma imagem, sempre. Não
            há cache para invalidar quando as tags mudam. ]]*/}
        <img
          className="acervo-item-foto"
          src={`/api/acervo/imagem/${colecao}/${encodeURIComponent(item.id)}`}
          alt={t("panel.assetLibrary.itemPreviewAlt", { nome: item.nome })}
          loading="lazy"
          width={56}
          height={56}
        />
        <span className="acervo-item-nome">{item.nome}</span>
        <span className={`pastilha ${classeDoStatus(item.status)}`}>{t(chaveDoStatus(item.status))}</span>
      </div>

      <code className="acervo-item-id">{item.id}</code>

      {item.tags?.length > 0 && (
        <p className="acervo-item-tags">
          {/* As tags não são enfeite: é delas que a imagem sai, e é por elas que
              o Gemini casa a descrição do streamer com a peça. */}
          {item.tags.join(" · ")}
        </p>
      )}

      <div className="acervo-item-controles">
        <label className="acervo-campo">
          <span className="secundario">assetId</span>
          <input
            type="text"
            inputMode="numeric"
            value={assetId}
            placeholder={t("common.value.none")}
            disabled={salvando}
            onChange={(evento) => definirAssetId(evento.target.value)}
          />
        </label>

        <label className="acervo-campo">
          <span className="secundario">{t("panel.assetLibrary.statusField")}</span>
          <select
            value={item.status}
            disabled={salvando}
            onChange={(evento) => aoAnotar(colecao, item.id, { assetId: assetId.trim(), status: evento.target.value })}
          >
            {STATUS.map((status) => (
              <option key={status.id} value={status.id}>
                {t(status.chave)}
              </option>
            ))}
          </select>
        </label>

        {/* Só aparece com mudança pendente: botão que não faz nada some, em vez
            de ficar cinza ocupando o alvo de clique de quem tem pressa. */}
        {mudou && (
          <button
            type="button"
            className="acervo-salvar"
            disabled={salvando}
            onClick={() => aoAnotar(colecao, item.id, { assetId: assetId.trim() })}
          >
            {t("panel.assetLibrary.saveAssetId")}
          </button>
        )}
      </div>
    </li>
  );
}

export function PainelDeAcervo({ acervo, salvando, erro, publicando, relatorio, aoAnotar, aoPublicar }) {
  const { t } = useTraducao();

  const colecoes = [
    { id: "skybox", rotulo: t("panel.assetLibrary.collectionSkybox"), itens: acervo?.skybox ?? [] },
    { id: "texturas", rotulo: t("panel.assetLibrary.collectionTextures"), itens: acervo?.texturas ?? [] },
  ];

  const pendentes = colecoes
    .flatMap(({ itens }) => itens)
    .filter((item) => item.status !== "aprovado" || item.assetId === null).length;

  return (
    <section className="acervo" aria-label={t("panel.assetLibrary.regionLabel")}>
      <header className="acervo-cabecalho">
        <h2 className="acervo-titulo">{t("panel.assetLibrary.title")}</h2>
        {pendentes > 0 ? (
          <span className="pastilha pastilha-atencao">
            {t("panel.assetLibrary.pendingCount", { n: pendentes })}
          </span>
        ) : (
          <span className="pastilha pastilha-ok">{t("panel.assetLibrary.allApproved")}</span>
        )}
      </header>

      <p className="acervo-recado">{t("panel.assetLibrary.notice")}</p>

      {/*[[ O botão que tira o acervo do papel.

          Encher isto na mão eram doze idas ao site do Roblox: criar a arte,
          subir, esperar, achar o número, colar aqui. Onze dos doze ficavam
          para trás. A ponte desenha a imagem em código, sobe pelo Open Cloud
          e anota o assetId; a moderação continua sendo do Roblox. ]]*/}
      {aoPublicar && (
        <div className="acervo-publicar">
          <button type="button" className="acervo-publicar-botao" onClick={aoPublicar} disabled={publicando}>
            {publicando ? t("panel.assetLibrary.publishing") : t("panel.assetLibrary.publishAction")}
          </button>
          <span className="acervo-publicar-dica">
            {t("panel.assetLibrary.publishHint", { chave: "ROBLOX_API_KEY", arquivo: ".env" })}
          </span>
        </div>
      )}

      {relatorio?.length > 0 && (
        <ul className="acervo-relatorio">
          {relatorio.map((linha) => (
            <li className={`acervo-relatorio-linha acervo-relatorio-${linha.acao}`} key={`${linha.colecao}/${linha.id}`}>
              <strong>{linha.id}</strong>{" "}
              {linha.acao === "falhou"
                ? t("panel.assetLibrary.uploadFailed", { motivo: linha.motivo })
                : `${linha.acao} · ${linha.status}`}
            </li>
          ))}
        </ul>
      )}

      {erro && <p className="pastilha pastilha-erro">{erro}</p>}

      {colecoes.map(({ id, rotulo, itens }) => (
        <div className="acervo-colecao" key={id}>
          <h3 className="acervo-colecao-titulo">
            {rotulo} <span className="secundario">{itens.length}</span>
          </h3>

          {itens.length === 0 ? (
            <p className="acervo-recado">
              {t("panel.assetLibrary.emptyCollection", { alvo: `acervo.${id}` })}
            </p>
          ) : (
            <ul className="acervo-lista">
              {itens.map((item) => (
                <ItemDoAcervo
                  key={item.id}
                  colecao={id}
                  item={item}
                  salvando={salvando}
                  aoAnotar={aoAnotar}
                />
              ))}
            </ul>
          )}
        </div>
      ))}

      <div className="acervo-colecao">
        <h3 className="acervo-colecao-titulo">
          {t("panel.assetLibrary.nativeProps")}{" "}
          <span className="secundario">{(acervo?.props ?? []).length}</span>
        </h3>
        <p className="acervo-recado">{t("panel.assetLibrary.nativePropsNote")}</p>
        <ul className="acervo-props">
          {(acervo?.props ?? []).map((prop) => (
            <li key={prop.id} className="acervo-prop">
              {prop.nome}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
