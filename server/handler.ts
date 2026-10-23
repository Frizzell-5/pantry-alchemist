import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { AiResponseSchema, RecipeValidationError, validateAiRecipe } from "../src/lib/aiRecipe.ts";
import type { Recipe } from "../src/lib/types.ts";

const MODEL = "claude-opus-5-5";

const GenerateRequest = z.object({
  mode: z.enum(["pantry", "chaos", "leftover"]),
  pantry: z.array(z.object({ id: z.string().max(60), label: z.string().max(80) })).max(400),
  focus: z.array(z.string().max(80)).max(12).default([]),
  mood: z.string().max(20).nullable().default(null),
  constraints: z.array(z.string().max(80)).max(8).default([]),
  servings: z.number().int().min(1).max(12).default(2),
  count: z.number().int().min(1).max(3).default(1),
  avoidTitles: z.array(z.string().max(90)).max(60).default([]),
  context: z.string().max(400).default(""),
});
type GenerateRequest = z.infer<typeof GenerateRequest>;

// Stable across requests so it can be cached; everything per-request goes in the user turn.
const SYSTEM = `You are the Pantry Alchemist: a warm, inventive recipe developer cooking for a busy, budget-conscious college student with a small kitchen.

Write recipes that are genuinely delicious, realistic to cook, and honest about time. Rules:
- Build from the ingredients listed in the pantry. Water is always available. Anything not in the pantry must be marked optional: true, and use at most two of those per recipe.
- For each ingredient that comes from the pantry, set pantry_id to the exact id shown in the pantry list; otherwise pantry_id is null.
- Give every ingredient a short snake_case key. In step text, refer to ingredients as [[key]] at the moment they're used (e.g. "Dice [[potato]] into cubes."). The app replaces tokens with scaled amounts, so do not write the amount again next to the token.
- Use realistic amounts and units from the allowed unit list. Use "whole" for countable items (eggs, potatoes), "clove" for garlic, and "to taste" with amount null for seasoning to taste. Use singular ingredient names ("potato", "egg").
- Steps are short and concrete, one action each, in cook order. Add timer_seconds and a 2–4 word timer_label only for waiting (simmer, boil, bake, rest, marinate).
- Oven temperatures in °F. Equipment must list everything needed (stovetop, microwave, oven) plus "onePot" if only one vessel is used, or "noCook".
- vegetarian / vegan must be accurate for the required (non-optional) ingredients.
- Tips: 1–3 practical, specific notes (make-ahead, swaps, how to tell it's done). No filler.
- Tone: titles are appetizing with a bit of personality; descriptions are one or two vivid sentences.`;

function buildPrompt(req: GenerateRequest): string {
  const pantry = req.pantry.map((p) => `- ${p.id}: ${p.label}`).join("\n");
  const lines = [`<pantry>\n${pantry || "(empty)"}\n</pantry>`, ``];
  if (req.mode === "pantry") {
    lines.push(`Invent ${req.count} new recipe${req.count > 1 ? "s" : ""} I can make right now from this pantry, each for ${req.servings} servings. Make them distinct from each other (different meal types or techniques).`);
  } else if (req.mode === "chaos") {
    lines.push(`CHAOS MODE. I want to use up these ingredients in ONE dish: ${req.focus.join(", ")}.`);
    lines.push(`Every one of them must be a starring part of the recipe, not a garnish. It can be playful but it must actually taste good: explain in the description why the combination works. ${req.servings} servings. Return exactly 1 recipe.`);
  } else {
    lines.push(`LEFTOVER REMIX. After cooking, I have these leftovers: ${req.focus.join(", ")}.`);
    if (req.context) lines.push(`They came from: ${req.context}.`);
    lines.push(`Turn the leftovers into a different next-day meal (new flavors or format, not a reheat). Leftover items may be used even if not in the pantry; treat them as available with pantry_id null and optional false. ${req.servings} servings. Return exactly 1 recipe.`);
  }
  if (req.mood) lines.push(`Mood: "${req.mood}" (cozy = warm and comforting; energy = protein-forward and fresh; lazy = minimal steps and dishes; impress = a little showy; broke = as few ingredients as possible).`);
  if (req.constraints.length) lines.push(`Hard constraints: ${req.constraints.join("; ")}.`);
  if (req.avoidTitles.length) lines.push(`Don't repeat any of these existing recipes: ${req.avoidTitles.join(", ")}.`);
  return lines.join("\n");
}

export interface ApiEnv {
  ANTHROPIC_API_KEY?: string;
  /** When set, /api/generate requires a matching x-access-code header, so a public deploy can't spend your key. */
  ACCESS_CODE?: string;
}

const clients = new Map<string, Anthropic>();
const getClient = (apiKey: string) => {
  let c = clients.get(apiKey);
  if (!c) clients.set(apiKey, (c = new Anthropic({ apiKey })));
  return c;
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function generate(req: GenerateRequest, apiKey: string): Promise<Recipe[]> {
  const knownIds = new Set(req.pantry.map((p) => p.id));
  const source = req.mode === "pantry" ? "ai" : req.mode === "chaos" ? "chaos" : "remix";
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: buildPrompt(req) }];

  // One repair round: if the JSON parses but fails our checks, show the model
  // its issues and ask again.
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await getClient(apiKey).beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(AiResponseSchema) },
      system: SYSTEM,
      messages,
    });

    if (response.stop_reason === "refusal") throw new HttpError(422, "The model declined this one. Try different ingredients.");
    if (response.stop_reason === "max_tokens") throw new HttpError(502, "The recipe came back cut off. Try again.");
    const parsed = response.parsed_output;
    if (!parsed || parsed.recipes.length === 0) throw new HttpError(502, "The model returned an empty or malformed recipe.");

    try {
      return parsed.recipes.slice(0, req.count).map((r) => validateAiRecipe(r, knownIds, source));
    } catch (err) {
      if (!(err instanceof RecipeValidationError) || attempt === 1) throw err;
      messages.push(
        { role: "assistant", content: response.content },
        { role: "user", content: `That failed validation: ${err.issues.join("; ")}. Return the corrected JSON.` },
      );
    }
  }
  throw new HttpError(502, "Could not produce a valid recipe.");
}

async function readJson(req: Request): Promise<unknown> {
  const body = await req.text();
  if (body.length > 64_000) throw new HttpError(413, "Request too large");
  try {
    return JSON.parse(body || "{}");
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

const send = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/** Platform-neutral /api handler: used by the Vite dev server, the Node server, and Cloudflare Pages Functions. */
export async function handleApiRequest(req: Request, env: ApiEnv): Promise<Response> {
  const url = new URL(req.url);
  const apiKey = env.ANTHROPIC_API_KEY;
  try {
    if (url.pathname === "/api/status" && req.method === "GET") {
      return send(200, { ai: !!apiKey, needsCode: !!env.ACCESS_CODE, model: MODEL });
    }
    if (url.pathname === "/api/generate" && req.method === "POST") {
      if (!apiKey) throw new HttpError(503, "No ANTHROPIC_API_KEY configured. AI features are off.");
      if (env.ACCESS_CODE && req.headers.get("x-access-code") !== env.ACCESS_CODE) {
        throw new HttpError(401, "This kitchen needs an access code for AI. Add it in Settings (gear icon).");
      }
      const parsed = GenerateRequest.safeParse(await readJson(req));
      if (!parsed.success) throw new HttpError(400, "Bad request: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
      if (parsed.data.mode !== "pantry" && parsed.data.focus.length === 0) throw new HttpError(400, "Pick at least one ingredient.");
      const recipes = await generate(parsed.data, apiKey);
      return send(200, { recipes });
    }
    return send(404, { error: "Not found" });
  } catch (err) {
    if (err instanceof HttpError) return send(err.status, { error: err.message });
    if (err instanceof RecipeValidationError) return send(502, { error: "The AI's recipe didn't pass our checks. Try again.", issues: err.issues });
    if (err instanceof Anthropic.AuthenticationError) return send(401, { error: "The Anthropic API key was rejected. Check your configuration." });
    if (err instanceof Anthropic.RateLimitError) return send(429, { error: "Rate limited by the API. Give it a minute." });
    if (err instanceof Anthropic.APIConnectionError) return send(503, { error: "Couldn't reach the Anthropic API. Are you online?" });
    if (err instanceof Anthropic.APIError) return send(502, { error: `API error (${err.status ?? "?"}): ${err.message}` });
    console.error(err);
    return send(500, { error: "Something went wrong generating that recipe." });
  }
}
