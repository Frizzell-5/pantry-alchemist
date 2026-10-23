import type { IncomingMessage, ServerResponse } from "node:http";
import { handleApiRequest } from "./handler.ts";

/** Adapts Node's http request/response to the fetch-style API handler. */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const request = new Request(new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`), {
    method: req.method,
    headers: Object.entries(req.headers).flatMap(([k, v]) => (v == null ? [] : (Array.isArray(v) ? v : [v]).map((x) => [k, x] as [string, string]))),
    body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
  });
  const response = await handleApiRequest(request, { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, ACCESS_CODE: process.env.ACCESS_CODE });
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await response.arrayBuffer()));
}
