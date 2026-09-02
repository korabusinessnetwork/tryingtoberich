import { useState } from "react";

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

const STATUS = [
  { id: "pendente-upload", rotulo: "Pendente", classe: "" },
  { id: "em-moderacao", rotulo: "Em moderação", classe: "pastilha-atencao" },
  { id: "aprovado", rotulo: "Aprovado", classe: "pastilha-ok" },
  { id: "rejeitado", rotulo: "Rejeitado", classe: "pastilha-erro" },
];

const classeDoStatus = (status) => STATUS.find((s) => s.id === status)?.classe ?? "";
const rotuloDoStatus = (status) => STATUS.find((s) => s.id === status)?.rotulo ?? status;

function ItemDoAcervo({ colecao, item, salvando, aoAnotar }) {
  // O campo é local até o streamer confirmar: teclar 5 dígitos de um assetId
  // não pode disparar 5 gravações em disco, e cada uma revalida o acervo
  // inteiro contra o schema.
  const [assetId, definirAssetId] = useState(item.assetId === null ? "" : String(item.assetId));

  const mudou = (item.assetId === null ? "" : String(item.assetId)) !== assetId.trim();

  return (
    <li className="acervo-item">
      <div className="acervo-item-topo">
        <span className="acervo-item-nome">{item.nome}</span>
        <span className={`pastilha ${classeDoStatus(item.status)}`}>{rotuloDoStatus(item.status)}</span>
      </div>

      <code className="acervo-item-id">{item.id}</code>

      <div className="acervo-item-controles">
        <label className="acervo-campo">
          <span className="secundario">assetId</span>
          <input
            type="text"
            inputMode="numeric"
            value={assetId}
            placeholder="—"
            disabled={salvando}
            onChange={(evento) => definirAssetId(evento.target.value)}
          />
        </label>

        <label className="acervo-campo">
          <span className="secundario">Status</span>
          <select
            value={item.status}
            disabled={salvando}
            onChange={(evento) => aoAnotar(colecao, item.id, { assetId: assetId.trim(), status: evento.target.value })}
          >
            {STATUS.map((status) => (
              <option key={status.id} value={status.id}>
                {status.rotulo}
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
            Salvar número
          </button>
        )}
      </div>
    </li>
  );
}

export function PainelDeAcervo({ acervo, salvando, erro, aoAnotar }) {
  const colecoes = [
    { id: "skybox", rotulo: "Skybox", itens: acervo?.skybox ?? [] },
    { id: "texturas", rotulo: "Texturas de plataforma", itens: acervo?.texturas ?? [] },
  ];

  const pendentes = colecoes
    .flatMap(({ itens }) => itens)
    .filter((item) => item.status !== "aprovado" || item.assetId === null).length;

  return (
    <section className="acervo" aria-label="Acervo de assets">
      <header className="acervo-cabecalho">
        <h2 className="acervo-titulo">Acervo</h2>
        {pendentes > 0 ? (
          <span className="pastilha pastilha-atencao">{pendentes} sem aprovação</span>
        ) : (
          <span className="pastilha pastilha-ok">tudo aprovado</span>
        )}
      </header>

      <p className="acervo-recado">
        O Gemini escolhe daqui e nunca inventa asset (ADR-004). Subir a imagem no Roblox e esperar a
        moderação é trabalho manual; esta tela só anota o resultado. Item não aprovado não entra no
        prompt, e mapa que depende dele <strong>não vai ao ar</strong>.
      </p>

      {erro && <p className="pastilha pastilha-erro">{erro}</p>}

      {colecoes.map(({ id, rotulo, itens }) => (
        <div className="acervo-colecao" key={id}>
          <h3 className="acervo-colecao-titulo">
            {rotulo} <span className="secundario">{itens.length}</span>
          </h3>

          {itens.length === 0 ? (
            <p className="acervo-recado">Nada em <code>acervo.{id}</code>.</p>
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
          Props nativos <span className="secundario">{(acervo?.props ?? []).length}</span>
        </h3>
        <p className="acervo-recado">
          Efeito nativo do Roblox: não passa por moderação, não tem assetId, está sempre disponível.
        </p>
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
