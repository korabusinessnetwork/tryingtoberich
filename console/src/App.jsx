import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "./lib/api.js";
import { usarCarga } from "./lib/usarCarga.js";
import { CabecalhoDoConsole } from "./components/CabecalhoDoConsole.jsx";
import { FichaDoAssinante } from "./components/FichaDoAssinante.jsx";
import { ListaDeAssinantes } from "./components/ListaDeAssinantes.jsx";
import { NavegacaoDoConsole } from "./components/NavegacaoDoConsole.jsx";
import { PaginaDeFaturamento } from "./components/PaginaDeFaturamento.jsx";
import { PaginaDeLogs } from "./components/PaginaDeLogs.jsx";
import { PaginaDeSaude } from "./components/PaginaDeSaude.jsx";
import "./App.css";

/**
 * O console do operador (ADR-P05), com os seis itens do v1 em quatro páginas.
 *
 * Este arquivo carrega dado, guarda estado e distribui. Ele é o único que chama
 * `api`, porque componente não toca a rede (CLAUDE.md): é o que permite testar
 * cada tela desenhando a partir de props, sem rede nenhuma no caminho.
 *
 * **Sem uma linha de i18n**, e isso não é esquecimento. O console é superfície
 * da Kora, tem um usuário e ele é brasileiro: cada string traduzida aqui seria
 * trabalho gasto em plateia de uma pessoa (ADR-P05). O painel do cliente é o
 * lugar dos três idiomas, e ele já os tem.
 *
 * **Cada página só carrega quando está à vista.** Consultar faturamento
 * enquanto o operador olha a lista é gastar o tier gratuito com resposta que
 * ninguém leu (CLAUDE.md, Custo), e nada disto está no caminho crítico do
 * presente: o console não toca a live.
 */

/**
 * Espera entre a tecla e a consulta.
 *
 * Sem isto, cada caractere de "matheus" viraria uma varredura de tabela. Duzentos
 * e cinquenta milissegundos é o intervalo em que a mão ainda está digitando e a
 * tela ainda parece instantânea, e este NÃO é o caminho crítico do presente
 * (CLAUDE.md, Princípio nº 1): nada aqui toca a live.
 */
const ESPERA_DA_BUSCA_MS = 250;

/** O mês corrente em UTC, que é o fuso em que o banco carimba `em`. */
const mesCorrente = () => new Date().toISOString().slice(0, 7);

export function App() {
  const [pagina, definirPagina] = useState("assinantes");
  const [fonte, definirFonte] = useState(null);

  const [busca, definirBusca] = useState("");
  const [buscaAplicada, definirBuscaAplicada] = useState("");

  const [assinantes, definirAssinantes] = useState([]);
  const [proximo, definirProximo] = useState(null);
  const [carregandoLista, definirCarregandoLista] = useState(true);
  const [carregandoMais, definirCarregandoMais] = useState(false);
  const [erroDaLista, definirErroDaLista] = useState(null);

  const [escolhido, definirEscolhido] = useState(null);
  const [ficha, definirFicha] = useState(null);
  const [carregandoFicha, definirCarregandoFicha] = useState(false);
  const [erroDaFicha, definirErroDaFicha] = useState(null);

  const [trocandoPlano, definirTrocandoPlano] = useState(false);
  const [resultadoDaTroca, definirResultadoDaTroca] = useState(null);
  const [erroDaTroca, definirErroDaTroca] = useState(null);

  const [mes, definirMes] = useState(mesCorrente);

  // Cada carga de lista leva um número. Resposta de carga velha que chega
  // depois da nova é descartada: digitando rápido, as respostas voltam fora de
  // ordem e a lista mostraria o resultado de um termo que não está mais no
  // campo. É o mesmo motivo de sempre para não confiar na ordem da rede.
  const cargaDaLista = useRef(0);

  /* ---- de onde vem o dado ---------------------------------------- */

  useEffect(() => {
    let vivo = true;
    api.fonte().then((resposta) => {
      if (!vivo) return;
      // Falha aqui deixa a pastilha em "Verificando": ela nunca chuta
      // "Base da Kora", porque chutar isso é exatamente a mentira que ela
      // existe para não contar.
      definirFonte(resposta?.ok === true ? resposta.fonte : null);
    });
    return () => {
      vivo = false;
    };
  }, []);

  /* ---- a busca, com espera entre a tecla e a consulta -------------- */

  useEffect(() => {
    const relogio = setTimeout(() => definirBuscaAplicada(busca), ESPERA_DA_BUSCA_MS);
    return () => clearTimeout(relogio);
  }, [busca]);

  const carregarLista = useCallback(async (termo) => {
    const minha = ++cargaDaLista.current;
    definirCarregandoLista(true);

    const resposta = await api.listarAssinantes({ busca: termo });
    if (minha !== cargaDaLista.current) return;

    definirCarregandoLista(false);
    if (resposta?.ok !== true) {
      definirErroDaLista(resposta?.motivo ?? "rede");
      // A lista antiga fica na tela: apagá-la trocaria "a base caiu" por
      // "não há assinante", que é a confusão que o contrato existe para evitar.
      return;
    }

    definirErroDaLista(null);
    definirAssinantes(resposta.assinantes ?? []);
    definirProximo(resposta.proximo ?? null);
  }, []);

  useEffect(() => {
    carregarLista(buscaAplicada);
  }, [buscaAplicada, carregarLista]);

  const carregarMais = useCallback(async () => {
    if (!proximo) return;
    definirCarregandoMais(true);
    const resposta = await api.listarAssinantes({ busca: buscaAplicada, cursor: proximo });
    definirCarregandoMais(false);

    if (resposta?.ok !== true) {
      definirErroDaLista(resposta?.motivo ?? "rede");
      return;
    }
    definirErroDaLista(null);
    definirAssinantes((atuais) => [...atuais, ...(resposta.assinantes ?? [])]);
    definirProximo(resposta.proximo ?? null);
  }, [buscaAplicada, proximo]);

  /* ---- a ficha ---------------------------------------------------- */

  const carregarFicha = useCallback(async (streamerId) => {
    if (!streamerId) {
      definirFicha(null);
      return;
    }
    definirCarregandoFicha(true);
    const resposta = await api.buscarFicha(streamerId);
    definirCarregandoFicha(false);

    if (resposta?.ok !== true) {
      definirErroDaFicha(resposta?.motivo ?? "rede");
      definirFicha(null);
      return;
    }
    definirErroDaFicha(null);
    // `ficha` nula é resposta: quer dizer que o assinante não existe, e a tela
    // diz isso com todas as letras.
    definirFicha(resposta.ficha ?? null);
  }, []);

  useEffect(() => {
    carregarFicha(escolhido);
    // Trocar de assinante limpa o desfecho da troca anterior: um "Plano agora é
    // anual" pendurado na ficha do próximo cliente seria a pior frase possível
    // nesta tela.
    definirResultadoDaTroca(null);
    definirErroDaTroca(null);
  }, [escolhido, carregarFicha]);

  /* ---- item 3: a troca de plano ------------------------------------ */

  const trocarPlano = useCallback(
    async (plano, motivo) => {
      if (!escolhido) return;
      definirTrocandoPlano(true);
      definirErroDaTroca(null);
      definirResultadoDaTroca(null);

      const resposta = await api.trocarPlano(escolhido, plano, { motivo });
      definirTrocandoPlano(false);

      if (resposta?.ok !== true) {
        definirErroDaTroca(resposta?.motivo ?? "rede");
        return;
      }

      definirResultadoDaTroca(resposta);
      definirFicha(resposta.ficha ?? null);
      // A lista mostra o plano em cada linha: deixá-la desatualizada faria a
      // mesma tela dizer duas coisas diferentes sobre o mesmo cliente.
      carregarLista(buscaAplicada);
    },
    [buscaAplicada, carregarLista, escolhido],
  );

  /* ---- item 5: os dois logs --------------------------------------- */

  const carregarAcoes = useCallback(() => api.listarAcoesAdministrativas({}), []);
  const carregarEventos = useCallback(() => api.listarEventos({}), []);

  const acoes = usarCarga(carregarAcoes, { ativo: pagina === "logs" });
  const eventos = usarCarga(carregarEventos, { ativo: pagina === "logs" });

  /* ---- item 6: saúde de conexão ------------------------------------ */

  const carregarSaude = useCallback(() => api.saudeDeConexao(), []);
  const saude = usarCarga(carregarSaude, { ativo: pagina === "saude" });

  /* ---- item 4: faturamento ----------------------------------------- */

  const carregarFaturamento = useCallback(() => api.resumoDeFaturamento({ mes }), [mes]);
  const faturamento = usarCarga(carregarFaturamento, { ativo: pagina === "faturamento" });

  /* ---- o botão de atualizar --------------------------------------- */

  const atualizar = useCallback(() => {
    // Atualiza a página que está à vista, e só ela. Recarregar as quatro faria
    // três consultas para ninguém.
    if (pagina === "assinantes") {
      carregarLista(buscaAplicada);
      if (escolhido) carregarFicha(escolhido);
      return;
    }
    if (pagina === "logs") {
      acoes.recarregar();
      eventos.recarregar();
      return;
    }
    if (pagina === "saude") saude.recarregar();
    if (pagina === "faturamento") faturamento.recarregar();
  }, [
    acoes,
    buscaAplicada,
    carregarFicha,
    carregarLista,
    escolhido,
    eventos,
    faturamento,
    pagina,
    saude,
  ]);

  const atualizando = useMemo(
    () => carregandoLista || carregandoFicha || acoes.carregando || eventos.carregando || saude.carregando || faturamento.carregando,
    [acoes.carregando, carregandoFicha, carregandoLista, eventos.carregando, faturamento.carregando, saude.carregando],
  );

  return (
    <div className="console">
      <CabecalhoDoConsole fonte={fonte} aoAtualizar={atualizar} atualizando={atualizando} />
      <NavegacaoDoConsole pagina={pagina} aoTrocar={definirPagina} />

      <main className="console-corpo">
        {pagina === "assinantes" && (
          <div className="console-duas-colunas">
            <ListaDeAssinantes
              assinantes={assinantes}
              escolhido={escolhido}
              aoEscolher={definirEscolhido}
              busca={busca}
              aoBuscar={definirBusca}
              carregando={carregandoLista}
              erro={erroDaLista}
              proximo={proximo}
              aoCarregarMais={carregarMais}
              carregandoMais={carregandoMais}
            />
            <FichaDoAssinante
              ficha={ficha}
              carregando={carregandoFicha}
              erro={erroDaFicha}
              streamerId={escolhido}
              aoTrocarPlano={trocarPlano}
              trocandoPlano={trocandoPlano}
              resultadoDaTroca={resultadoDaTroca}
              erroDaTroca={erroDaTroca}
            />
          </div>
        )}

        {pagina === "faturamento" && (
          <PaginaDeFaturamento
            resumo={faturamento.dado}
            mes={mes}
            aoTrocarMes={definirMes}
            carregando={faturamento.carregando}
            erro={faturamento.erro}
          />
        )}

        {pagina === "logs" && (
          <PaginaDeLogs
            acoes={acoes.dado?.acoes}
            eventos={eventos.dado?.eventos}
            carregandoAcoes={acoes.carregando}
            carregandoEventos={eventos.carregando}
            erroDeAcoes={acoes.erro}
            erroDeEventos={eventos.erro}
          />
        )}

        {pagina === "saude" && (
          <PaginaDeSaude saude={saude.dado} carregando={saude.carregando} erro={saude.erro} />
        )}
      </main>
    </div>
  );
}
