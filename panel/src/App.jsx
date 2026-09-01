import { useCallback, useEffect, useState } from "react";

import { api } from "./lib/api.js";
import "./App.css";

/**
 * O painel. Uma tela só, sem navegação: o streamer olha por 2 segundos por vez
 * e não pode caçar aba (02_DESIGN_SYSTEM, seção A).
 *
 * Este arquivo só carrega dado e distribui. Regra de negócio mora em
 * lib/regras.js, rede mora em lib/api.js, e desenho mora nos componentes.
 */
export function App() {
  const [dados, definirDados] = useState(null);
  const [erro, definirErro] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const [modalidades, presets, animacoes, catalogo, looks, mapas, sessao] = await Promise.all([
        api.modalidades(), api.listarPresets(), api.animacoes(),
        api.catalogo(), api.looks(), api.mapas(), api.sessao(),
      ]);
      definirDados({ modalidades, presets, animacoes, catalogo, looks, mapas, sessao });
      definirErro(null);
    } catch (falha) {
      definirErro(falha);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  if (erro) {
    return (
      <main className="app app-vazio">
        <h1>Kora Stream Games</h1>
        <p className="pastilha pastilha-erro">{erro.mensagem ?? erro.message}</p>
        <button onClick={carregar}>Tentar de novo</button>
      </main>
    );
  }

  if (!dados) {
    return (
      <main className="app app-vazio">
        <h1>Kora Stream Games</h1>
        <p className="secundario">Carregando…</p>
      </main>
    );
  }

  return (
    <main className="app">
      <h1 className="app-titulo">Kora Stream Games</h1>
      <p className="secundario">Painel montado na síntese da Leva 3.</p>
    </main>
  );
}
