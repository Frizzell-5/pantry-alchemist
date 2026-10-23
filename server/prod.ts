import "dotenv/config";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { handleApi } from "./node.ts";

// Serves the built app from dist/ plus the /api routes. Run `npm run build` first.
const DIST = join(process.cwd(), "dist");
const PORT = Number(process.env.PORT ?? 4173);
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  if (req.url?.startsWith("/api/")) return handleApi(req, res);
  const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  let file = join(DIST, path === "/app" || path.startsWith("/app/") ? "app.html" : path);
  if (!file.startsWith(DIST) || !(await stat(file).catch(() => null))?.isFile()) file = join(DIST, "index.html");
  try {
    const body = await readFile(file);
    res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end("Not found. Did you run npm run build?");
  }
}).listen(PORT, () => {
  console.log(`Pantry Alchemist on http://localhost:${PORT} (AI ${process.env.ANTHROPIC_API_KEY ? "on" : "off: add ANTHROPIC_API_KEY to .env"})`);
});
