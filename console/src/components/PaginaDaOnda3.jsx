import "./PaginaDaOnda3.css";

/**
 * O lugar reservado dos itens 4, 5 e 6 do ADR-P05.
 *
 * A navegação precisa mostrar a fronteira INTEIRA do v1, e não só o pedaço
 * pronto: quem abre o console tem de ver que faltam três telas e quais são.
 * Esconder as abas até estarem prontas faria a fronteira parecer menor do que
 * é, e é justamente a fronteira que o ADR-P05 pede para ficar visível.
 *
 * O que esta página **não** faz é fingir. Ela não desenha gráfico vazio nem
 * tabela com zero linha: um esqueleto de tela é indistinguível de uma tela que
 * carregou e não achou nada, e a segunda é um estado que o operador precisaria
 * levar a sério.
 */

const CONTEUDO = {
  faturamento: {
    item: 4,
    titulo: "Faturamento",
    resumo:
      "MRR, vendas do mês e cancelamentos, lidos do espelho que o webhook da Lemon Squeezy alimenta.",
    porQue:
      "A fonte da verdade do dinheiro é a Lemon Squeezy (ADR-P02). A tabela `faturamento` é espelho, para o número não mudar sozinho entre dois olhares.",
    tarefa: "C08",
  },
  logs: {
    item: 5,
    titulo: "Logs de evento e de ação administrativa",
    resumo: "Quem fez o quê e quando, mais o que cada instalação reportou por telemetria.",
    porQue:
      "O log administrativo é append-only por trigger no banco: um log que aceita `update` não serve para a única coisa que ele existe para fazer.",
    tarefa: "C05",
  },
  saude: {
    item: 6,
    titulo: "Saúde de conexão",
    resumo: "Quantos clientes conectados agora e quantas quedas nas últimas 24h.",
    porQue:
      "É o alarme de quando o TikTok quebra o acesso, que é o risco nº 1 do produto. Sem ele, a Kora descobre a quebra pelo primeiro cliente irritado que escrever.",
    tarefa: "C06",
  },
};

export function PaginaDaOnda3({ pagina }) {
  const conteudo = CONTEUDO[pagina];
  if (!conteudo) return null;

  return (
    <section className="onda3 cartao" aria-label={conteudo.titulo}>
      <span className="rotulo">Item {conteudo.item} do console v1 · tarefa {conteudo.tarefa}</span>
      <h2 className="onda3-titulo">{conteudo.titulo}</h2>
      <p className="onda3-resumo">{conteudo.resumo}</p>
      <p className="onda3-porque secundario">{conteudo.porQue}</p>
      <p className="pastilha pastilha-atencao onda3-marca">Ainda não construída</p>
      {/* A camada de dados já responde por esta tela. Está escrito porque quem
          for construí-la não precisa desenhar consulta nenhuma. */}
      <p className="onda3-nota secundario">
        A camada de dados já responde a esta página: a função do contrato existe e a rota
        `/api` correspondente está de pé. Falta a tela.
      </p>
    </section>
  );
}
