/**
 * Uma carga de `/api`, com o estado que toda tela do console precisa ter.
 *
 * Existe porque a onda 3 trouxe três páginas novas e cada uma repetiria as
 * mesmas quatro coisas: carregando, erro, dado e recarregar. Escritas quatro
 * vezes à mão, elas divergem na quarta, e a que diverge é sempre a do
 * tratamento de erro.
 *
 * **Não chama a rede.** Recebe a função que chama, que continua saindo de
 * `lib/api.js` no `App`: componente não toca a rede (CLAUDE.md), e um hook que
 * importasse `api` faria a regra depender de o componente lembrar de não usá-lo.
 *
 * Duas regras que ele carrega e que valem para toda tela:
 *
 * 1. **Resposta de carga velha é descartada.** Trocar de aba rápido faz as
 *    respostas voltarem fora de ordem, e a tela mostraria o dado da aba
 *    anterior. É o mesmo motivo pelo qual a busca da lista já numera as cargas.
 * 2. **Falha não apaga o dado anterior.** Lista vazia porque não há nada e
 *    lista vazia porque a base caiu levam a decisões opostas, e é o contrato
 *    inteiro que existe para não confundir as duas.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * @param carregar função sem argumentos que devolve o envelope `{ ok, ... }`.
 *                 Precisa ser estável (`useCallback` no chamador), senão cada
 *                 render dispara uma carga nova.
 * @param ativo    só carrega quando a página está à vista. Consultar
 *                 faturamento enquanto o operador olha a lista é gastar o tier
 *                 gratuito com resposta que ninguém leu (CLAUDE.md, Custo).
 */
export function usarCarga(carregar, { ativo = true } = {}) {
  const [dado, definirDado] = useState(null);
  const [carregando, definirCarregando] = useState(false);
  const [erro, definirErro] = useState(null);
  const carga = useRef(0);

  const recarregar = useCallback(async () => {
    const minha = ++carga.current;
    definirCarregando(true);

    const resposta = await carregar();
    if (minha !== carga.current) return;

    definirCarregando(false);
    if (resposta?.ok !== true) {
      definirErro(resposta?.motivo ?? "rede");
      return;
    }
    definirErro(null);
    definirDado(resposta);
  }, [carregar]);

  useEffect(() => {
    if (ativo) recarregar();
  }, [ativo, recarregar]);

  return { dado, carregando, erro, recarregar };
}
