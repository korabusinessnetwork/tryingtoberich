/**
 * O contexto do idioma, isolado num arquivo próprio.
 *
 * Separado do provider e do hook para não criar import circular: o provider
 * importa daqui, o hook também, e nenhum dos dois importa o outro.
 */

import { createContext } from "react";

import { IDIOMA_PADRAO, traduzir } from "./traduzir.js";

export const ContextoDeTraducao = createContext({
  idioma: IDIOMA_PADRAO,
  t: traduzir,
  trocarIdioma: () => {},
  sincronizarIdioma: () => {},
  trocandoIdioma: false,
});
