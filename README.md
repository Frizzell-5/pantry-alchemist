# Pantry Alchemist ⚗️

Check off what's in your kitchen; get recipes ranked by how little you'd need to buy, cook them step-by-step on your phone, and collect the keepers in a printable personal cookbook.

**Live:** https://pantry-alchemist.pages.dev · `/` is the landing page with the install button, `/app` is the app.

It's an installable web app (PWA): Chrome/Edge/Android get a one-tap install, iPhone uses Safari → Share → Add to Home Screen. Once installed it opens full-screen and works offline (AI features need a connection).

## Run it

```bash
npm install
cp .env.example .env        # optional: paste ANTHROPIC_API_KEY=... to turn on AI features
npm run dev                 # http://localhost:5173 (landing) and /app (also on your LAN; open it on your phone)
```

Production on your own machine: `npm run build && npm start` (serves `dist/` and `/api` on port 4173).

### Deploying to Cloudflare Pages

`functions/api/[[path]].ts` runs the same API handler as a Pages Function.

```bash
npm run build
npx wrangler@3 pages deploy dist --project-name pantry-alchemist --branch main
# Turn on AI for the deployed site (secrets never touch the repo):
npx wrangler@3 pages secret put ANTHROPIC_API_KEY --project-name pantry-alchemist
npx wrangler@3 pages secret put ACCESS_CODE --project-name pantry-alchemist
```

**Set `ACCESS_CODE` whenever you add a key to a public deployment.** Otherwise anyone who finds the URL can spend your API credits. Users then enter the code once in the app's Settings.

Everything works without a key: the 32 built-in recipes, matching, swaps, cook mode, roulette, cookbook, and an offline template generator for Chaos Mode / Leftover Remix. With a key, "Conjure", Chaos Mode, and Leftover Remix call Claude (`claude-opus-5-5`) for original recipes.

## How it's put together

| Piece | Where |
| --- | --- |
| Ingredient catalog, store sections, substitution table | `src/data/ingredients.ts` |
| Seed recipes (steps reference ingredients as `[[key]]`) | `src/data/recipes.ts` |
| Ranking, diet detection, filters, swaps | `src/lib/match.ts` |
| Scaling, friendly fractions, US/metric | `src/lib/units.ts` |
| AI JSON schema + validation/repair | `src/lib/aiRecipe.ts` |
| API handler (fetch-style; used by Vite dev, `server/prod.ts`, and Cloudflare) | `server/handler.ts`, `functions/` |
| Landing page, install flow, service worker | `src/landing.tsx`, `src/lib/install.ts`, `public/sw.js` |
| Generative SVG illustrations | `src/lib/art.tsx` |
| Persistent state (localStorage) + achievements | `src/lib/store.ts`, `src/lib/achievements.ts` |

AI responses use structured outputs against a Zod schema, then get a second pass of checks (ranges, pantry ids, step tokens, timers). If those fail, the model is shown the issues once and asked to correct them. Requests opt into server-side refusal fallbacks (`fallbacks: "default"`).

`npm test` runs the unit tests (scaling, matching, validation, offline generator). `npm run typecheck` runs TypeScript.

## Notes

- Requires Node 20+ (pinned to Vite 5 / TypeScript 5 for Node 20.6 compatibility).
- PDF export: Cookbook → Export → Print / Save PDF. Turn on "Background graphics" in the print dialog.
- Screen wake lock needs HTTPS or localhost. Over plain-HTTP LAN on a phone, the app falls back to a "turn off auto-lock" hint.
