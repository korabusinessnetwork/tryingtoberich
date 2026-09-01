import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "./api.js";

/**
 * O fluxo SSE da sessão.
 *
 * SSE e não WebSocket porque o fluxo é unidirecional e o SSE reconecta sozinho
 * (docs/01_ARQUITETURA). O navegador cuida da reconexão; este hook só cuida de
 * não acumular evento para sempre e de dizer se a conexão está de pé.
 */

/** O monitor mostra os últimos eventos, não o histórico. Ver 02_DESIGN_SYSTEM. */
const TETO_DE_EVENTOS = 30;
/** O log é para diagnosticar depois da falha, então guarda mais. */
const TETO_DE_LOG = 200;

export function useFluxo() {
  const [estado, definirEstado] = useState(null);
  const [eventos, definirEventos] = useState([]);
  const [naoMapeados, definirNaoMapeados] = useState([]);
  const [logs, definirLogs] = useState([]);
  const [conectado, definirConectado] = useState(false);
  const proximoId = useRef(0);

  /**
   * Registra uma linha de log vinda do PAINEL, não da ponte.
   *
   * Ela existe porque a falha mais provável é a ponte cair — e aí o SSE cai
   * junto, e o log da ponte para de chegar exatamente quando ele seria mais
   * útil. O painel precisa contar a própria versão dos fatos.
   */
  const registrarLocal = useCallback((nivel, evento, dados = {}) => {
    proximoId.current += 1;
    definirLogs((atuais) =>
      [{ id: `painel-${proximoId.current}`, em: new Date().toISOString(), origem: "painel", nivel, evento, ...dados }, ...atuais]
        .slice(0, TETO_DE_LOG),
    );
  }, []);

  useEffect(() => {
    const fonte = new EventSource(api.urlDoFluxo());

    const ouvir = (nome, tratar) => {
      fonte.addEventListener(nome, (mensagem) => {
        try {
          tratar(JSON.parse(mensagem.data));
        } catch {
          // Mensagem malformada não pode derrubar o monitor: ele é a única
          // janela do streamer para a live enquanto ela roda.
        }
      });
    };

    fonte.onopen = () => {
      definirConectado(true);
      registrarLocal("info", "fluxo_conectado");
    };
    fonte.onerror = () => {
      definirConectado((estavaConectado) => {
        // Só registra na transição: o EventSource tenta reconectar sozinho e
        // dispararia onerror a cada tentativa, enchendo o log de ruído.
        if (estavaConectado) registrarLocal("erro", "fluxo_caiu", { detalhe: "o painel parou de receber a live" });
        return false;
      });
    };

    ouvir("estado", definirEstado);

    ouvir("log", (linha) => {
      definirLogs((atuais) => [{ ...linha, origem: "ponte" }, ...atuais].slice(0, TETO_DE_LOG));
    });

    ouvir("presente", (dados) => {
      proximoId.current += 1;
      const entrada = { ...dados, chave: proximoId.current, em: Date.now() };
      definirEventos((atuais) => [entrada, ...atuais].slice(0, TETO_DE_EVENTOS));
    });

    ouvir("combateAnulado", (dados) => {
      proximoId.current += 1;
      const entrada = { ...dados, anulado: true, chave: proximoId.current, em: Date.now() };
      definirEventos((atuais) => [entrada, ...atuais].slice(0, TETO_DE_EVENTOS));
    });

    // Contador, não lista de eventos: é o que o streamer está deixando na mesa.
    ouvir("naoMapeado", (dados) => {
      definirNaoMapeados((atuais) => {
        const resto = atuais.filter((n) => n.presenteNome !== dados.presenteNome);
        return [...resto, dados].sort((a, b) => b.contagem - a.contagem);
      });
    });

    return () => fonte.close();
  }, [registrarLocal]);

  return { estado, eventos, naoMapeados, logs, conectado, registrarLocal, definirLogs };
}
