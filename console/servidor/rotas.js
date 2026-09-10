/**
 * A ponte do console: HTTP de um lado, camada de dados do outro.
 *
 * **Existe por causa da chave de serviço.** Ela ignora RLS e alcança a lista de
 * assinantes com e-mail, então não pode chegar ao navegador de jeito nenhum,
 * e `import.meta.env.VITE_*` é justamente o caminho que a levaria para lá, já
 * que o bundle do Vite é público por definição. A solução é a mesma que o
 * painel já usa com a ponte: a chave vive no processo Node, e o navegador fala
 * com esse processo.
 *
 * Aqui o processo Node é o próprio servidor de desenvolvimento do Vite, que
 * monta estas rotas como middleware (ver `console/vite.config.js`). Não é
 * atalho: o console é ferramenta interna que roda em `localhost`, como o
 * painel, e um segundo processo só para servir um punhado de funções seria um
 * segundo processo para o operador lembrar de subir.
 *
 * Nenhuma regra de negócio mora aqui. Isto traduz caminho e querystring em
 * chamada da camada de dados, e devolve o envelope como está. A única operação
 * que envolve dois sistemas, a troca de plano do item 3, é delegada inteira a
 * `src/faturamento/troca.js`, que é onde a ordem entre eles está justificada.
 */

import { escolherDados } from "../src/dados/index.js";
import { falha, MOTIVOS } from "../src/dados/contrato.js";
import { escolherFaturamento } from "../src/faturamento/index.js";
import { trocarPlanoDoAssinante } from "../src/faturamento/troca.js";

/** Corpo JSON, com teto. Sem teto, um POST torto segura o processo na memória. */
const CORPO_MAXIMO = 64 * 1024;

async function lerCorpo(req) {
  const pedacos = [];
  let tamanho = 0;
  for await (const pedaco of req) {
    tamanho += pedaco.length;
    if (tamanho > CORPO_MAXIMO) throw new Error("corpo grande demais");
    pedacos.push(pedaco);
  }
  if (pedacos.length === 0) return {};
  return JSON.parse(Buffer.concat(pedacos).toString("utf8"));
}

/**
 * Status HTTP a partir do motivo do contrato.
 *
 * A tela decide pelo `ok` do corpo, não pelo status. O status existe para a aba
 * de rede do navegador não mentir: uma base fora do ar que responde 200 é uma
 * falha que ninguém acha depois.
 */
function statusDoMotivo(motivo) {
  switch (motivo) {
    case MOTIVOS.PEDIDO_INVALIDO:
      return 400;
    case MOTIVOS.NAO_ENCONTRADO:
      return 404;
    case MOTIVOS.SEM_CONFIGURACAO:
      return 503;
    case MOTIVOS.TIMEOUT:
      return 504;
    default:
      return 502;
  }
}

function responder(res, resultado) {
  const status = resultado?.ok === true ? 200 : statusDoMotivo(resultado?.motivo);
  const corpo = JSON.stringify(resultado);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  // Console é dado vivo: resposta guardada em cache é resposta que mente sobre
  // quem está conectado agora.
  res.setHeader("cache-control", "no-store");
  res.end(corpo);
}

/**
 * @param env de onde saem `SUPABASE_URL` e `SUPABASE_SERVICE_KEY`. Passado por
 *            parâmetro para o `vite.config.js` entregar o que leu do `.env` da
 *            raiz, e para o teste montar as rotas sem ambiente nenhum.
 */
export function montarRotas(env = process.env) {
  const dados = escolherDados(env);

  // Os DOIS adaptadores de cobrança recebem a mesma `registrarAcao`, e é aqui
  // que a exigência da seção 4 do contrato vira código: o falso grava no log
  // administrativo igual ao real, senão o teste do item 5 passaria por acidente.
  const faturamento = escolherFaturamento(env, { registrarAcao: dados.registrarAcao });

  return async function rotasDoConsole(req, res, proximo) {
    // O middleware é montado em `/api`, então `req.url` já chega sem o prefixo.
    const url = new URL(req.url ?? "/", "http://console.local");
    const caminho = url.pathname.replace(/\/+$/, "") || "/";
    const q = url.searchParams;

    try {
      /* Item 1: a lista, com a busca que casa os três campos. */
      if (req.method === "GET" && caminho === "/assinantes") {
        return responder(
          res,
          await dados.listarAssinantes({
            busca: q.get("busca") ?? "",
            limite: q.get("limite"),
            cursor: q.get("cursor"),
          }),
        );
      }

      /* Item 2: a ficha. */
      const ficha = caminho.match(/^\/assinantes\/([^/]+)$/);
      if (req.method === "GET" && ficha) {
        return responder(res, await dados.buscarFicha(decodeURIComponent(ficha[1])));
      }

      /* Item 3: a troca de plano.
         Passa por `faturamento/troca.js`, e não direto pela camada de dados,
         porque a operação escreve em DOIS sistemas: a Lemon Squeezy primeiro,
         a base da Kora depois. A ordem e o motivo dela estão lá. */
      const plano = caminho.match(/^\/assinantes\/([^/]+)\/plano$/);
      if (req.method === "POST" && plano) {
        const corpo = await lerCorpo(req);
        return responder(
          res,
          await trocarPlanoDoAssinante({
            dados,
            faturamento,
            streamerId: decodeURIComponent(plano[1]),
            plano: corpo.plano,
            motivo: corpo.motivo ?? null,
          }),
        );
      }

      /* Item 4. */
      if (req.method === "GET" && caminho === "/faturamento") {
        return responder(res, await dados.resumoDeFaturamento({ mes: q.get("mes") }));
      }

      /* Item 5: os dois logs. */
      if (req.method === "GET" && caminho === "/eventos") {
        return responder(
          res,
          await dados.listarEventos({
            streamerId: q.get("streamerId"),
            desde: q.get("desde"),
            limite: q.get("limite"),
          }),
        );
      }

      if (req.method === "GET" && caminho === "/acoes") {
        return responder(
          res,
          await dados.listarAcoesAdministrativas({ desde: q.get("desde"), limite: q.get("limite") }),
        );
      }

      if (req.method === "POST" && caminho === "/acoes") {
        const corpo = await lerCorpo(req);
        return responder(
          res,
          await dados.registrarAcao({
            acao: corpo.acao,
            streamerId: corpo.streamerId ?? null,
            detalhe: corpo.detalhe ?? {},
          }),
        );
      }

      /* Item 6. */
      if (req.method === "GET" && caminho === "/saude") {
        return responder(res, await dados.saudeDeConexao());
      }

      /* Qual implementação está ligada.
         A tela precisa poder dizer, sem mentir, que o que está na frente do
         operador é dado de exemplo. Só o NOME sai daqui, nunca a URL nem a
         chave: saber que a base é real não é saber onde ela fica. */
      if (req.method === "GET" && caminho === "/fonte") {
        return responder(res, { ok: true, fonte: dados.fonte });
      }

      // Caminho desconhecido volta para o Vite, que serve a página.
      return proximo();
    } catch (erro) {
      return responder(res, falha(MOTIVOS.PEDIDO_INVALIDO, erro?.message ?? null));
    }
  };
}
