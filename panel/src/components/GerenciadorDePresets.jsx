import { useState } from "react";

import { idDePreset } from "../lib/regras.js";

import "./GerenciadorDePresets.css";

/**
 * Criar, duplicar e apagar preset.
 *
 * Existe porque o painel sabia editar preset e não sabia criar um: numa
 * máquina limpa `data/presets/` está vazio, a barra de sessão mostra "Nenhum
 * preset salvo" e não havia saída pela tela — era rodar `npm run semear` ou
 * escrever o JSON à mão. A primeira coisa que o streamer faz não podia ser a
 * única que exigia terminal.
 *
 * **Duplicar** é o caminho mais usado depois do primeiro: montar os 6 slots dá
 * trabalho, e a live de sexta é a de quinta com dois presentes trocados.
 *
 * Apagar é em dois tempos, como o Stop da barra de sessão — e pelo mesmo
 * motivo de não usar `window.confirm`: diálogo nativo trava o navegador
 * inteiro num painel que fica aberto durante a live.
 */
export function GerenciadorDePresets({ presets, presetAtual, travado, salvando, aoCriar, aoDuplicar, aoApagar }) {
  const lista = Array.isArray(presets) ? presets : [];

  const [nome, definirNome] = useState("");
  const [confirmandoApagar, definirConfirmandoApagar] = useState(false);

  const id = idDePreset(nome);
  const jaExiste = lista.some((preset) => preset.presetId === id);
  const podeCriar = id.length > 0 && !jaExiste && !salvando && !travado;

  const criar = () => {
    if (!podeCriar) return;
    aoCriar(nome.trim(), id);
    definirNome("");
  };

  const apagar = () => {
    if (!confirmandoApagar) {
      definirConfirmandoApagar(true);
      return;
    }
    definirConfirmandoApagar(false);
    aoApagar(presetAtual.presetId);
  };

  return (
    <section className="presets" aria-label="Presets">
      <header className="presets-cabecalho">
        <h2 className="presets-titulo">Presets</h2>
        <span className="secundario presets-contagem">
          {lista.length === 1 ? "1 salvo" : `${lista.length} salvos`}
        </span>
      </header>

      {travado && (
        <p className="presets-recado">
          A sessão está rodando. Criar e apagar preset é trabalho de antes da live —
          o que dá para fazer agora é trocar o preset ativo, na barra do topo (R7).
        </p>
      )}

      <div className="presets-criar">
        <label className="presets-campo">
          <span className="secundario">Novo preset</span>
          <input
            type="text"
            value={nome}
            placeholder="Ex.: Escalada da madrugada"
            disabled={travado || salvando}
            onChange={(evento) => definirNome(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === "Enter") criar();
            }}
          />
        </label>

        <button type="button" className="presets-botao" onClick={criar} disabled={!podeCriar}>
          Criar vazio
        </button>

        <button
          type="button"
          className="presets-botao"
          onClick={() => aoDuplicar(presetAtual)}
          disabled={!presetAtual || travado || salvando}
          title={presetAtual ? `Copia os slots de "${presetAtual.nome}"` : "Escolha um preset para duplicar"}
        >
          Duplicar o atual
        </button>
      </div>

      {/* O id aparece antes de criar, e não depois: ele vira nome de arquivo em
          disco (ADR-003) e é por ele que a ponte acha o preset. Mostrar só o
          nome bonito esconderia por que "Escalada #2" e "escalada-2" são a
          mesma coisa. */}
      {nome.trim().length > 0 && (
        <p className="presets-recado">
          {id.length === 0 ? (
            <>Esse nome não deixa nada aproveitável para o id do arquivo. Use ao menos uma letra ou número.</>
          ) : jaExiste ? (
            <>Já existe um preset com o id <code>{id}</code>. Escolha outro nome.</>
          ) : (
            <>Vai virar <code>{id}</code> em <code>data/presets/</code>.</>
          )}
        </p>
      )}

      <div className="presets-perigo">
        <button
          type="button"
          className={confirmandoApagar ? "presets-apagar presets-apagar-confirmar" : "presets-apagar"}
          onClick={apagar}
          disabled={!presetAtual || travado || salvando}
        >
          {confirmandoApagar ? `Confirmar: apagar "${presetAtual?.nome}"` : "Apagar o preset atual"}
        </button>
        {confirmandoApagar && (
          <button
            type="button"
            className="presets-botao"
            onClick={() => definirConfirmandoApagar(false)}
          >
            Cancelar
          </button>
        )}
      </div>
    </section>
  );
}
