import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Roda em localhost e só fala com a ponte. Nenhum deploy: ver ADR-001.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
