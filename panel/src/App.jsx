import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "./lib/api.js";
import { useFluxo } from "./lib/useFluxo.js";
import { BarraDeSessao } from "./components/BarraDeSessao.jsx";
import { EditorDePreset } from "./components/EditorDePreset.jsx";
import { GeradorDeMapa } from "./components/GeradorDeMapa.jsx";
import { MonitorAoVivo } from "./components/MonitorAoVivo.jsx";
import { PainelDeLogs } from "./components/PainelDeLogs.jsx";
import { PreviaDeMapa } from "./components/PreviaDeMapa.jsx";
import { SeletorDeAnimacao } from "./components/SeletorDeAnimacao.jsx";
import { SeletorDeLook } from "./components/SeletorDeLook.jsx";
import { SeletorDePresente } from "./components/SeletorDePresente.jsx";
import { SeletorModalidade } from "./components/SeletorModalidade.jsx";
import { TestadorDePresente } from "./components/TestadorDePresente.jsx";
import "./App.css";

/**
 * O painel. Uma tela só, sem navegação: o streamer olha por 2 segundos por vez
 * e não pode caçar aba (02_DESIGN_SYSTEM, seção A).
 *
 * Este arquivo carrega dado, guarda estado e distribui. Ele é o único que
 * chama `api`, porque componente não toca a rede (CLAUDE.md) — um teste em
 * `panel/test/componentesSemRede.test.mjs` faz essa regra valer.
 *
 * Regra de negócio mora em `lib/regras.js`, rede em `lib/api.js`, e desenho
 * nos componentes. Aqui só sobra fiação.
 */
export function App() {
  const [dados, definirDados] = useState(null);
  const [erroDeCarga, definirErroDeCarga] = useState(null);

  const [preset, definirPreset] = useState(null);
  const [salvando, definirSalvando] = useState(false);
  const [iniciando, definirIniciando] = useState(false);
  const [gerando, definirGerando] = useState(false);
  const [erroDeMapa, definirErroDeMapa] = useState(null);
  const [prontidao, definirProntidao] = useState(null);
  const [disparando, definirDisparando] = useState(false);
  const [aviso, definirAviso] = useState(null);
  const [aba, definirAba] = useState("monitor");
  // Quantos problemas já estavam no log da última vez que a aba foi aberta.
  // Sem isso o contador nunca zera e vira enfeite permanente.
  const [problemasVistos, definirProblemasVistos] = useState(0);

  // Qual slot está com um modal aberto, e qual modal. Um de cada vez: dois
  // modais empilhados num painel de segunda tela é jeito de perder o clique.
  const [editando, definirEditando] = useState(null);

  const fluxo = useFluxo();

  const carregar = useCallback(async () => {
    try {
      const [modalidades, presets, animacoes, catalogo, looks, mapas, sessao, cenarios] = await Promise.all([
        api.modalidades(), api.listarPresets(), api.animacoes(), api.catalogo(),
        api.looks(), api.mapas(), api.sessao(), api.cenarios(),
      ]);
      definirDados({ modalidades, presets, animacoes, catalogo, looks, mapas, sessao, cenarios });
      // O que a ponte registrou ANTES do painel abrir. O que vem depois chega
      // pelo SSE, e o hook junta os dois.
      api.logs()
        .then((linhas) => fluxo.juntarLogs(linhas.map((l) => ({ ...l, origem: "ponte" }))))
        .catch(() => {});
      definirPreset((atual) => atual ?? presets[0] ?? null);
      definirErroDeCarga(null);
    } catch (falha) {
      definirErroDeCarga(falha);
    }
  }, [fluxo]);

  useEffect(() => { carregar(); }, [carregar]);

  /** Toda ação que fala com a ponte passa por aqui, e toda falha vira aviso na tela. */
  const executar = useCallback(async (acao, { aoFalhar } = {}) => {
    try {
      return await acao();
    } catch (falha) {
      const texto = falha?.message ?? "Algo falhou.";
      // O aviso some da tela; a linha de log fica. Quando o streamer perceber
      // que algo parou, é no log que ele vai olhar.
      fluxo.registrarLocal("erro", falha?.codigo ?? "acao_falhou", { mensagem: texto });
      if (aoFalhar) aoFalhar(falha);
      else definirAviso(texto);
      return null;
    }
  }, [fluxo]);

  const mudarSlot = useCallback((posicao, campos) => {
    definirPreset((atual) => {
      if (!atual) return atual;
      const outros = (atual.slots ?? []).filter((s) => s.posicao !== posicao);
      const anterior = (atual.slots ?? []).find((s) => s.posicao === posicao) ?? { posicao };
      const novo = { ...anterior, ...campos, posicao };
      return { ...atual, slots: [...outros, novo].sort((a, b) => a.posicao - b.posicao) };
    });
  }, []);

  const limparSlot = useCallback((posicao) => {
    definirPreset((atual) =>
      atual ? { ...atual, slots: (atual.slots ?? []).filter((s) => s.posicao !== posicao) } : atual,
    );
  }, []);

  const salvarPreset = useCallback(async () => {
    if (!preset) return;
    definirSalvando(true);
    const salvo = await executar(() => api.salvarPreset(preset));
    if (salvo) {
      definirPreset(salvo);
      definirAviso(null);
    }
    definirSalvando(false);
  }, [preset, executar]);

  const iniciarSessao = useCallback(async (presetId, cenario) => {
    definirIniciando(true);
    await executar(() => api.iniciarSessao(presetId, cenario));
    await executar(() => api.sessao().then((sessao) => definirDados((d) => ({ ...d, sessao }))));
    definirIniciando(false);
  }, [executar]);

  const pararSessao = useCallback(async () => {
    await executar(() => api.encerrarSessao());
    await executar(() => api.sessao().then((sessao) => definirDados((d) => ({ ...d, sessao }))));
  }, [executar]);

  const gerarMapa = useCallback(async (descricao) => {
    definirGerando(true);
    definirErroDeMapa(null);
    const resultado = await executar(() => api.gerarMapa(descricao), {
      aoFalhar: (falha) => definirErroDeMapa(falha?.message ?? "A geração falhou."),
    });
    if (resultado) {
      definirDados((d) => ({ ...d, mapas: [...d.mapas.filter((m) => m.mapaId !== resultado.mapa.mapaId), resultado.mapa] }));
      definirPreset((atual) => (atual ? { ...atual, mapaId: resultado.mapa.mapaId } : atual));
      definirProntidao(resultado.prontidao);
    }
    definirGerando(false);
  }, [executar]);

  const testarPresentes = useCallback(async (presentes) => {
    definirDisparando(true);
    await executar(() => api.testarPresentes(presentes));
    definirDisparando(false);
  }, [executar]);

  const slotEditado = useMemo(
    () => (editando ? (preset?.slots ?? []).find((s) => s.posicao === editando.posicao) ?? null : null),
    [editando, preset],
  );

  const mapaEscolhido = useMemo(
    () => dados?.mapas?.find((m) => m.mapaId === preset?.mapaId) ?? null,
    [dados, preset],
  );

  const problemas = useMemo(
    () => fluxo.logs.filter((l) => l.nivel === "erro" || l.nivel === "aviso").length,
    [fluxo.logs],
  );
  const naoVistos = Math.max(0, problemas - problemasVistos);

  // A sessão rodando trava o que não pode mudar no meio da partida: modalidade,
  // look (ADR-011) e troca de mapa (F4).
  const aoVivo = fluxo.estado?.sessao === "rodando" || dados?.sessao?.estado?.sessao === "rodando";

  if (erroDeCarga) {
    return (
      <main className="app app-vazio">
        <h1 className="app-titulo">Kora Stream Games</h1>
        <p className="pastilha pastilha-erro">{erroDeCarga.message}</p>
        <button onClick={carregar}>Tentar de novo</button>
      </main>
    );
  }

  if (!dados) {
    return (
      <main className="app app-vazio">
        <h1 className="app-titulo">Kora Stream Games</h1>
        <p className="secundario">Carregando…</p>
      </main>
    );
  }

  return (
    <main className="app">
      <BarraDeSessao
        estado={fluxo.estado ?? dados.sessao?.estado ?? null}
        sessao={dados.sessao?.sessao ?? null}
        presets={dados.presets}
        presetId={preset?.presetId ?? null}
        cenarios={dados.cenarios}
        iniciando={iniciando}
        aoIniciar={iniciarSessao}
        aoParar={pararSessao}
        aoTrocarPreset={(presetId) => definirPreset(dados.presets.find((p) => p.presetId === presetId) ?? null)}
      />

      {aviso ? <p className="pastilha pastilha-erro app-aviso">{aviso}</p> : null}

      <div className="app-colunas">
        <section className="app-coluna app-coluna-larga">
          <EditorDePreset
            preset={preset}
            catalogo={dados.catalogo}
            animacoes={dados.animacoes}
            salvando={salvando}
            aoMudarSlot={mudarSlot}
            aoLimparSlot={limparSlot}
            aoSalvar={salvarPreset}
            aoEditarPresente={(posicao) => definirEditando({ posicao, tipo: "presente" })}
            aoEditarAnimacao={(posicao) => definirEditando({ posicao, tipo: "animacao" })}
          />

          <nav className="app-abas" role="tablist" aria-label="Monitor e log">
            <button
              type="button"
              role="tab"
              aria-selected={aba === "monitor"}
              className={aba === "monitor" ? "app-aba app-aba-ativa" : "app-aba"}
              onClick={() => definirAba("monitor")}
            >
              Monitor
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={aba === "logs"}
              className={aba === "logs" ? "app-aba app-aba-ativa" : "app-aba"}
              onClick={() => {
                definirAba("logs");
                definirProblemasVistos(problemas);
              }}
            >
              Log
              {/* O contador é o que impede o log de ficar invisível justamente
                  quando importa: atrás de uma aba, ninguém olha por iniciativa. */}
              {naoVistos > 0 ? <span className="app-aba-contador">{naoVistos}</span> : null}
            </button>
          </nav>

          {aba === "monitor" ? (
            <MonitorAoVivo
              eventos={fluxo.eventos}
              naoMapeados={fluxo.naoMapeados}
              estado={fluxo.estado}
              conectado={fluxo.conectado}
            />
          ) : (
            <PainelDeLogs
              logs={fluxo.logs}
              aoLimpar={() => {
                fluxo.definirLogs([]);
                definirProblemasVistos(0);
              }}
            />
          )}

          <TestadorDePresente
            preset={preset}
            catalogo={dados.catalogo}
            sessaoRodando={aoVivo}
            disparando={disparando}
            aoDisparar={testarPresentes}
          />
        </section>

        <aside className="app-coluna">
          <SeletorModalidade
            modalidades={dados.modalidades}
            modalidade={preset?.modalidade ?? "escalada"}
            aoTrocar={(modalidade) => definirPreset((atual) => (atual ? { ...atual, modalidade } : atual))}
            travado={aoVivo}
          />

          <SeletorDeLook
            looks={dados.looks}
            lookId={preset?.personagem?.lookId ?? null}
            aoEscolher={(lookId) =>
              definirPreset((atual) => (atual ? { ...atual, personagem: { lookId } } : atual))}
            travado={aoVivo}
          />

          <GeradorDeMapa
            mapas={dados.mapas}
            mapaId={preset?.mapaId ?? null}
            gerando={gerando}
            erro={erroDeMapa}
            aoGerar={gerarMapa}
            aoEscolher={(mapaId) => definirPreset((atual) => (atual ? { ...atual, mapaId } : atual))}
            travado={aoVivo}
          />

          <PreviaDeMapa mapa={mapaEscolhido} prontidao={prontidao} />
        </aside>
      </div>

      <SeletorDePresente
        aberto={editando?.tipo === "presente"}
        catalogo={dados.catalogo}
        presenteIdAtual={slotEditado?.presenteId ?? null}
        presenteIdsUsados={(preset?.slots ?? [])
          .filter((s) => s.posicao !== editando?.posicao)
          .map((s) => s.presenteId)}
        aoEscolher={(presenteId) => {
          mudarSlot(editando.posicao, { presenteId });
          definirEditando(null);
        }}
        aoFechar={() => definirEditando(null)}
      />

      <SeletorDeAnimacao
        aberto={editando?.tipo === "animacao"}
        animacoes={dados.animacoes}
        animacaoIdAtual={slotEditado?.animacaoId ?? null}
        deltaDoSlot={slotEditado?.delta ?? null}
        aoEscolher={(animacaoId) => {
          mudarSlot(editando.posicao, { animacaoId });
          definirEditando(null);
        }}
        aoFechar={() => definirEditando(null)}
      />
    </main>
  );
}
