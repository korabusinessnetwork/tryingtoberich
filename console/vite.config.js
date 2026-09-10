import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

import { montarRotas } from "./servidor/rotas.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");

/**
 * Porta própria, 5273. O painel vive na 5173 e os dois abrem juntos: portas
 * iguais fariam um roubar a do outro e o operador olhar a tela errada.
 */
const PORTA = 5273;

/**
 * O console do operador (ADR-P05). Roda em `localhost`, como o painel, e não
 * tem deploy nenhum.
 *
 * A decisão que atravessa este arquivo é a da CHAVE DE SERVIÇO. Ela ignora RLS
 * e alcança a lista de assinantes com e-mail, então não pode chegar ao
 * navegador. `loadEnv` com prefixo vazio devolve TODAS as variáveis, inclusive
 * ela, e o valor fica nesta closure, que roda no Node. Nada daqui vai para
 * `define` e nada ganha o prefixo `VITE_`, que é o único caminho pelo qual uma
 * variável entra no bundle. O navegador nunca fala com o Supabase: ele fala com
 * `/api` deste mesmo servidor, e quem responde é `servidor/rotas.js`.
 *
 * É a mesma topologia do painel com a ponte, com uma diferença: o painel
 * encaminha `/api` para outro processo, e aqui o processo é este mesmo. Um
 * segundo processo para servir oito funções seria um segundo processo para o
 * operador lembrar de subir.
 */
export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, RAIZ, "") };

  return {
    plugins: [
      react(),
      {
        name: "kora-console-api",
        configureServer(servidor) {
          servidor.middlewares.use("/api", montarRotas(env));
        },
        // O `preview` serve o build e é o jeito de olhar a tela montada. Sem
        // isto ali, `/api` cairia no index.html e a tela mostraria erro de
        // resposta ilegível em vez de dado.
        configurePreviewServer(servidor) {
          servidor.middlewares.use("/api", montarRotas(env));
        },
      },
    ],
    server: {
      host: "127.0.0.1",
      // Sem porta emprestada: o console mudar de porta sozinho é o operador
      // abrindo o painel achando que abriu o console.
      strictPort: true,
      port: PORTA,
    },
    preview: { host: "127.0.0.1", strictPort: true, port: PORTA },
  };
});
