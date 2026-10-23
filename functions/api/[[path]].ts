import { handleApiRequest, type ApiEnv } from "../../server/handler.ts";

// Cloudflare Pages Function: serves /api/* on the deployed site.
// Set secrets with: npx wrangler@3 pages secret put ANTHROPIC_API_KEY --project-name pantry-alchemist
export const onRequest = (ctx: { request: Request; env: ApiEnv }) => handleApiRequest(ctx.request, ctx.env);
