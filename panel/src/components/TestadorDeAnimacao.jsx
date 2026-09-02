import { useMemo, useState } from "react";

import "./TestadorDeAnimacao.css";

/**
 * Um botão por animação. Clicou, a animação toca no Roblox.
 *
 * É o teste do Bloco 2, e a pergunta que ele responde é a mais básica que
 * existe: "essa animação toca?". Por isso NÃO depende de sessão, preset nem
 * live — nada disso é necessário para o boneco se mexer, e exigir configuração
 * antes do primeiro teste é o que faz ninguém testar.
 *
 * Separado do `TestadorDePresente` de propósito: aquele testa o CAMINHO
 * (presente casa com slot, entra em combate, sai pelo long-poll) e por isso
 * atravessa tudo. Este testa o DESTINO. Juntar os dois num componente só
 * esconderia que são perguntas diferentes com pré-requisitos diferentes.
 *
 * O agrupamento por direção não é enfeite: subida e descida são as duas metades
 * da biblioteca, e ver as 10 de cada lado é o que revela buraco na cobertura.
 *
 * A intensidade fica em estado local, como o cenário de fixture da
 * `BarraDeSessao`: é escolha de teste, não configuração persistida. Ela vale
 * para o próximo clique e não muda nada no preset.
 */
export function TestadorDeAnimacao({ animacoes, jogoOnline, disparando, ultimaDisparada, aoDisparar }) {
  // 3 é o mesmo padrão da ponte quando o painel não manda nada: começar no
  // meio da escala mostra a animação como ela é, sem exagero nem timidez.
  const [intensidade, definirIntensidade] = useState(3);

  const porDirecao = useMemo(() => {
    const lista = Array.isArray(animacoes) ? animacoes : [];
    return {
      subida: lista.filter((a) => a.direcao === "subida"),
      descida: lista.filter((a) => a.direcao === "descida"),
    };
  }, [animacoes]);

  const grupos = [
    { direcao: "subida", rotulo: "Subida", sinal: "+1" },
    { direcao: "descida", rotulo: "Descida", sinal: "−1" },
  ];

  return (
    <section className="animacoes" aria-label="Testar animação">
      <header className="animacoes-cabecalho">
        <h2 className="animacoes-titulo">Testar animação</h2>
        {/* O estado do jogo fica no cabeçalho porque é o que decide se clicar
            adianta: com o Roblox fora, o long-poll descarta e o clique some. */}
        <span className={jogoOnline ? "pastilha pastilha-ok" : "pastilha pastilha-erro"}>
          {jogoOnline ? "jogo conectado" : "jogo offline"}
        </span>
      </header>

      {/* A intensidade multiplica escala, duração de partícula e densidade
          (R2). Sem este seletor o painel só sabia testar no nível 3, e "como
          fica a Fênix no 5?" era uma pergunta que exigia montar um preset,
          iniciar sessão e mandar um presente de verdade. */}
      <div className="animacoes-intensidade" role="group" aria-label="Intensidade do teste">
        <span className="animacoes-grupo-titulo">Intensidade</span>
        {[1, 2, 3, 4, 5].map((nivel) => (
          <button
            key={nivel}
            type="button"
            className={
              nivel === intensidade
                ? "animacoes-nivel animacoes-nivel-escolhido"
                : "animacoes-nivel"
            }
            aria-pressed={nivel === intensidade}
            onClick={() => definirIntensidade(nivel)}
          >
            {nivel}
          </button>
        ))}
      </div>

      {!jogoOnline ? (
        <p className="animacoes-recado">
          O Roblox não está conectado na ponte. Abra o jogo e espere o long-poll
          entrar — sem isso o disparo é descartado e nada acontece na tela.
        </p>
      ) : null}

      {grupos.map(({ direcao, rotulo, sinal }) => (
        <div className="animacoes-grupo" key={direcao}>
          <h3 className="animacoes-grupo-titulo">
            {rotulo} <span className="animacoes-grupo-sinal">delta {sinal}</span>
          </h3>

          <div className="animacoes-grade">
            {porDirecao[direcao].map((animacao) => (
              <button
                key={animacao.id}
                type="button"
                className={
                  ultimaDisparada === animacao.id ? "animacoes-botao animacoes-botao-ultimo" : "animacoes-botao"
                }
                disabled={disparando}
                onClick={() => aoDisparar(animacao.id, intensidade)}
                title={`${animacao.id} — ${animacao.duracaoBase}s, peso visual ${animacao.pesoVisual}`}
              >
                <span className="animacoes-nome">{animacao.nome}</span>
                {/* Duração junto do nome: é ela que arma o watchdog do R11 e o
                    que explica por que um clique parece "não fazer nada" ainda. */}
                <span className="animacoes-duracao">{animacao.duracaoBase}s</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {porDirecao.subida.length + porDirecao.descida.length === 0 ? (
        <p className="animacoes-recado">
          Nenhuma animação no índice. Rode <code>npm run gerar</code> na raiz.
        </p>
      ) : null}
    </section>
  );
}
