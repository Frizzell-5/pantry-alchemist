import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { handleApi } from "./server/node.ts";

// Mounts the same /api handler the production server uses, so `npm run dev`
// is the only command needed. Secrets are read server-side from .env and are
// never exposed to the browser bundle (no VITE_ prefix).
function apiPlugin(): Plugin {
  return {
    name: "pantry-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Match Cloudflare Pages: /app serves app.html.
        if (req.url === "/app" || req.url?.startsWith("/app?") || req.url?.startsWith("/app/")) req.url = "/app.html";
        if (!req.url?.startsWith("/api/")) return next();
        handleApi(req, res).catch(next);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const k of ["ANTHROPIC_API_KEY", "ACCESS_CODE"]) if (env[k]) process.env[k] = env[k];
  return {
    plugins: [react(), apiPlugin()],
    build: { rollupOptions: { input: { index: "index.html", app: "app.html" } } },
  };
});
