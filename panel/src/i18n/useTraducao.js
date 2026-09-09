/**
 * O hook que os componentes usam.
 *
 *   const { t } = useTraducao();
 *   <h2>{t("panel.liveMonitor.title")}</h2>
 *   <p>{t("panel.slotCard.coinsMany", { n: 6 })}</p>
 *
 * Fora de componente (lib/regras.js, lib/api.js), use `traduzir` direto de
 * ./traduzir.js — mesma resolução, sem React.
 */

import { useContext } from "react";

import { ContextoDeTraducao } from "./contexto.js";

export function useTraducao() {
  return useContext(ContextoDeTraducao);
}
