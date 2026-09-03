import { useMemo, useState } from "react";

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
  { id: "disco", rotulo: "Escada", dica: "Degraus separados subindo pelo perímetro de um quadrado. O jogador pula." },
  { id: "laje", rotulo: "Passarela", dica: "Degraus colados um no outro, em linha reta. O jogador sobe andando." },
];

const aprovadas = (itens) => (itens ?? []).filter((i) => i.status === "aprovado" && i.assetId);

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
    <section className="mundo" aria-label="Montar mundo">
      <header className="mundo-cabecalho">
        <h2 className="mundo-titulo">Montar mundo</h2>
        <span className="mundo-etiqueta">
          {ceus.length} céus · {texturas.length} plataformas
        </span>
      </header>

      {/*[[ O que está NO AR, e o que acabou de acontecer.

          Sem isto a tela ficava idêntica antes e depois de montar: as mesmas
          peças selecionadas, o mesmo tudo. Clicar e não ver nada mudar lê como
          "o botão não funciona" — mesmo com a torre se reerguendo do outro
          lado. ]]*/}
      {mapa && (
        <p className="mundo-noar">
          No ar: <strong>{mapa.nome}</strong> ·{" "}
          {[mapa.plataformas?.materialAssetId ?? []].flat().filter(Boolean).length} plataformas ·{" "}
          {mapa.plataformas?.formato === "laje" ? "passarela" : "escada"}
        </p>
      )}

      {recado && (
        <p className="mundo-recado" role="status">
          {recado}
          {!jogoOnline && " O jogo está fora: a torre sobe quando o Roblox reconectar."}
        </p>
      )}

      <p className="mundo-explicacao">
        Escolha o céu e as plataformas. Com <strong>mais de uma</strong> textura elas
        revezam degrau a degrau, e os degraus deixam de ser tingidos pela paleta — a
        variedade passa a ser da textura. Entra no ar assim que você montar.
      </p>

      <fieldset className="mundo-formato" disabled={montando}>
        <legend className="mundo-rotulo">Como a torre é construída</legend>
        {FORMATOS.map((opcao) => (
          <label key={opcao.id} className={formatoAtual === opcao.id ? "mundo-formato-opcao escolhida" : "mundo-formato-opcao"}>
            <input
              type="radio"
              name="mundo-formato"
              checked={formatoAtual === opcao.id}
              onChange={() => definirFormato(opcao.id)}
            />
            <span className="mundo-formato-rotulo">{opcao.rotulo}</span>
            <span className="mundo-formato-dica">{opcao.dica}</span>
          </label>
        ))}
      </fieldset>

      <div className="mundo-secao">
        <h3 className="mundo-rotulo">Céu</h3>
        {ceus.length === 0 ? (
          <p className="mundo-vazio">
            Nenhum céu aprovado. Use “Gerar e subir o que falta” no Acervo, abaixo.
          </p>
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
          Plataformas <span className="secundario">{texturasAtuais.length} escolhidas</span>
        </h3>
        {texturasAtuais.length === 0 && texturas.length > 0 && (
          <p className="mundo-vazio">Escolha ao menos uma para poder montar.</p>
        )}
        {texturas.length === 0 ? (
          <p className="mundo-vazio">Nenhuma textura aprovada ainda.</p>
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
        {montando ? "Montando…" : "Montar e usar este mundo"}
      </button>
    </section>
  );
}
