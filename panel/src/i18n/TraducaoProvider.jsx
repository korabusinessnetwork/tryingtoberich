import { useCallback, useMemo, useState } from "react";

import { ContextoDeTraducao } from "./contexto.js";
import { definirIdioma, idiomaAtivo, idiomaDoNavegador, normalizarIdioma, traduzir } from "./traduzir.js";

/**
 * Decide o idioma e o mantém.
 *
 * Ordem de resolução, do ADR-P03: o que o streamer gravou na configuração,
 * senão o locale do sistema, senão português. A configuração ganha do
 * navegador porque é escolha explícita dele; o navegador só chuta.
 *
 * O idioma vive em dois lugares de propósito: no estado do React, para
 * redesenhar a tela, e num módulo (`traduzir.js`), para `lib/` conseguir ler
 * sem hook. `definirIdioma` mantém os dois em sincronia.
 */
export function TraducaoProvider({ idiomaGravado, aoTrocarIdioma, children }) {
  const inicial = normalizarIdioma(idiomaGravado ?? idiomaDoNavegador());
  if (idiomaAtivo() !== inicial) definirIdioma(inicial);

  const [idioma, definirEstado] = useState(inicial);
  const [trocandoIdioma, definirTrocando] = useState(false);

  const trocarIdioma = useCallback(
    async (codigo) => {
      const alvo = normalizarIdioma(codigo);
      if (alvo === idiomaAtivo()) return;

      // Troca a tela primeiro e grava depois: a resposta visual é imediata, e
      // uma falha de gravação não pode deixar o painel num idioma que o
      // streamer não pediu.
      definirIdioma(alvo);
      definirEstado(alvo);

      if (!aoTrocarIdioma) return;

      definirTrocando(true);
      try {
        await aoTrocarIdioma(alvo);
      } catch {
        // Persistir é conveniência: na próxima abertura ele escolhe de novo.
        // Derrubar a tela por causa disso seria pior que esquecer a escolha.
      } finally {
        definirTrocando(false);
      }
    },
    [aoTrocarIdioma],
  );

  /**
   * Adota o idioma que já estava gravado, SEM gravar de novo.
   *
   * Existe porque a configuração do streamer só chega depois do primeiro
   * render: o painel abre no idioma do sistema e corrige quando o disco
   * responde. Usar `trocarIdioma` aqui faria o painel regravar no start o
   * mesmo valor que acabou de ler.
   */
  const sincronizarIdioma = useCallback((codigo) => {
    const alvo = normalizarIdioma(codigo);
    if (alvo === idiomaAtivo()) return;
    definirIdioma(alvo);
    definirEstado(alvo);
  }, []);

  const valor = useMemo(
    () => ({ idioma, t: traduzir, trocarIdioma, sincronizarIdioma, trocandoIdioma }),
    [idioma, trocarIdioma, sincronizarIdioma, trocandoIdioma],
  );

  return <ContextoDeTraducao.Provider value={valor}>{children}</ContextoDeTraducao.Provider>;
}
