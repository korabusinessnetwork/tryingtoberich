import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** A ponte serve o painel numa porta separada da do jogo. Ver 11_SEGURANCA. */
const PONTE = process.env.VITE_BRIDGE_URL ?? "http://127.0.0.1:8788";

/**
 * Roda em localhost e só fala com a ponte. Nenhum deploy: ver ADR-001.
 *
 * O proxy de `/api` existe por um motivo concreto: o painel vive em :5173 e a
 * ponte em :8788, que para o navegador são ORIGENS DIFERENTES. Sem o proxy,
 * toda chamada morre em CORS antes de sair — e isso não aparece em teste
 * nenhum, porque `fetch` no Node não tem CORS.
 *
 * A alternativa seria a ponte devolver Access-Control-Allow-Origin. Não vale:
 * ela ganharia um cabeçalho que autoriza origem externa numa superfície cuja
 * defesa é justamente não ser alcançável de fora. O proxy resolve no lado
 * certo, e a ponte continua sem saber que navegador existe.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: PONTE,
        changeOrigin: true,
        // O SSE da sessão passa por aqui e precisa fluir, não acumular.
        configure: (proxy) => {
          proxy.on("proxyRes", (res) => {
            res.headers["cache-control"] = "no-cache";
          });
        },
      },
    },
  },
});
