import { useEffect, useRef, useState } from "react";

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

export function useFluxo() {
  const [estado, definirEstado] = useState(null);
  const [eventos, definirEventos] = useState([]);
  const [naoMapeados, definirNaoMapeados] = useState([]);
  const [conectado, definirConectado] = useState(false);
  const proximoId = useRef(0);

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

    fonte.onopen = () => definirConectado(true);
    fonte.onerror = () => definirConectado(false);

    ouvir("estado", definirEstado);

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
  }, []);

  return { estado, eventos, naoMapeados, conectado };
}
