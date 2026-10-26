import { defineConfig } from "vite";

// The built UI is served by the bot server itself at /client/ (see server/bot.py),
// so the build goes straight into server/ui. Asset paths are relative, so it works
// under any prefix. For `npm run dev`, the Pipecat endpoints are proxied to the
// running bot server.
const bot = "http://localhost:7860";

export default defineConfig({
  base: "./",
  build: { outDir: "../server/ui", emptyOutDir: true },
  server: {
    proxy: { "/start": bot, "/api": bot, "/sessions": bot },
  },
});
