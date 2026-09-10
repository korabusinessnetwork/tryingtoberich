import "./CabecalhoDoConsole.css";

/**
 * O topo do console: quem é a tela, de onde vem o dado, e o botão de atualizar.
 *
 * **A pastilha da fonte é a razão de este componente existir.** O adaptador
 * falso está ligado por padrão e é assim que o console se desenvolve, e uma
 * tela que mostra assinante inventado sem avisar é uma tela que faz o operador
 * ligar para um cliente que não existe. Ela fica no canto superior, sempre
 * visível, com TEXTO e não só cor: o âmbar diz "olhe", a palavra diz o quê.
 *
 * Não há botão de trocar a fonte, de propósito. A escolha é da configuração e
 * de mais ninguém (contrato da onda 2, seção 3): uma chave na tela seria a
 * segunda fonte de verdade que a regra de escolha existe para não ter.
 */

const FONTES = {
  exemplo: {
    texto: "Dado de exemplo",
    pastilha: "pastilha-atencao",
    titulo: "Sem SUPABASE_URL ou sem a chave de serviço no .env: o console está na base falsa.",
  },
  supabase: {
    texto: "Base da Kora",
    pastilha: "pastilha-ok",
    titulo: "Lendo o Supabase com a chave de serviço, que vive só no processo Node.",
  },
};

const VERIFICANDO = {
  texto: "Verificando a fonte",
  pastilha: "pastilha-neutra",
  titulo: "O console ainda não perguntou de onde vem o dado.",
};

export function CabecalhoDoConsole({ fonte, aoAtualizar, atualizando }) {
  const marca = FONTES[fonte] ?? VERIFICANDO;

  return (
    <header className="cabecalho">
      <div className="cabecalho-identidade">
        <h1 className="cabecalho-titulo">Console do operador</h1>
        <p className="cabecalho-subtitulo secundario">
          Kora Stream Games · uso interno · português apenas
        </p>
      </div>

      <span className={`pastilha ${marca.pastilha} cabecalho-fonte`} title={marca.titulo}>
        {marca.texto}
      </span>

      <button
        type="button"
        className="cabecalho-atualizar"
        onClick={aoAtualizar}
        disabled={atualizando}
      >
        {atualizando ? "Atualizando…" : "Atualizar"}
      </button>
    </header>
  );
}
