import { useEffect, useMemo, useRef, useState } from "react";
import { INGREDIENT_MAP } from "../data/ingredients.ts";
import { aiStatus, generateRecipes } from "../lib/api.ts";
import { paletteFor } from "../lib/art.tsx";
import { go } from "../lib/hooks.ts";
import { matchRecipe, rankRecipes, recipesUsing, type Match } from "../lib/match.ts";
import { offlineRecipe } from "../lib/offlineGen.ts";
import { playFanfare, playSpinTick } from "../lib/sound.ts";
import { actions, allRecipes, catalog, findRecipe, ingredientLabel, pantrySet, useStore } from "../lib/store.ts";
import type { Recipe } from "../lib/types.ts";
import { Cauldron, Confetti } from "./bits.tsx";
import { LEFTOVER_KEY } from "./CookMode.tsx";
import { RecipeCard } from "./RecipeCard.tsx";
import { filtersToConstraints, pantryPayload } from "./RecipesView.tsx";

const TABS = [
  { id: "roulette", label: "🎡 Fridge Roulette" },
  { id: "chaos", label: "🌀 Chaos Mode" },
  { id: "leftovers", label: "♻️ Leftover Remix" },
];

function useAi() {
  const [ai, setAi] = useState<boolean | null>(null);
  useEffect(() => void aiStatus().then((s) => setAi(s.ai)), []);
  return ai;
}

// ---------------- Roulette ----------------

function Roulette() {
  const pantry = useStore((s) => s.pantry);
  const filters = useStore((s) => s.filters);
  const aiRecipes = useStore((s) => s.aiRecipes);
  const pool = useMemo(() => {
    const ranked = rankRecipes(allRecipes(), pantrySet(), { ...filters, makeableOnly: false });
    const ready = ranked.filter((m) => m.needToBuy.length === 0);
    const list = ready.length >= 3 ? ready : ranked.filter((m) => m.needToBuy.length <= 1);
    return [...list].sort(() => Math.random() - 0.5).slice(0, 8);
  }, [pantry, aiRecipes]);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Match | null>(null);
  const ticks = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => ticks.current.forEach(clearTimeout), []);

  if (pool.length < 2) {
    return (
      <div className="empty">
        <p className="hand big">The wheel needs at least two makeable recipes.</p>
        <a className="btn btn-primary" href="#/pantry">Check off more ingredients</a>
      </div>
    );
  }

  const seg = 360 / pool.length;
  const R = 140;
  const spin = () => {
    if (spinning) return;
    const i = Math.floor(Math.random() * pool.length);
    const center = i * seg + seg / 2;
    const jitter = (Math.random() - 0.5) * seg * 0.6;
    const base = rotation - (rotation % 360);
    const target = base + 360 * 6 + (360 - center) + jitter;
    setWinner(null);
    setSpinning(true);
    setRotation(target);
    // Decelerating clicks roughly in step with the CSS easing.
    ticks.current.forEach(clearTimeout);
    ticks.current = Array.from({ length: 28 }, (_, k) => setTimeout(playSpinTick, 4200 * (1 - Math.pow(1 - k / 28, 0.45))));
    ticks.current.push(setTimeout(() => {
      setSpinning(false);
      setWinner(pool[i]);
      actions.bumpStat("rouletteSpins");
      playFanfare();
    }, 4400));
  };

  const arc = (a0: number, a1: number) => {
    const p = (a: number) => [150 + R * Math.sin((a * Math.PI) / 180), 150 - R * Math.cos((a * Math.PI) / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M150,150 L${x0},${y0} A${R},${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1},${y1} Z`;
  };

  return (
    <div className="roulette">
      <p className="lede">Can't decide? Let fate (and your fridge) pick. Everything on the wheel is cookable{pool.some((m) => m.needToBuy.length) ? " or one item away" : " right now"}.</p>
      <div className="wheel-wrap">
        <div className="pointer" aria-hidden>▼</div>
        <svg viewBox="0 0 300 300" className="wheel" style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? "transform 4.4s cubic-bezier(.12,.72,.08,1)" : "none" }} aria-hidden>
          {pool.map((m, i) => {
            const p = paletteFor(m.recipe.id);
            const mid = i * seg + seg / 2;
            const title = m.recipe.title.length > 20 ? m.recipe.title.slice(0, 19) + "…" : m.recipe.title;
            return (
              <g key={m.recipe.id}>
                <path d={arc(i * seg, (i + 1) * seg)} fill={i % 2 ? p.a : p.bg} stroke="var(--ink)" strokeWidth="2" />
                <text x="150" y="150" transform={`rotate(${mid - 90} 150 150) translate(${R - 10} 4)`} textAnchor="end" className="wheel-label" fill={i % 2 ? "#fff" : p.ink}>{title}</text>
              </g>
            );
          })}
          <circle cx="150" cy="150" r="24" fill="var(--paper)" stroke="var(--ink)" strokeWidth="3" />
        </svg>
        <button className="spin-btn" onClick={spin} disabled={spinning}>{spinning ? "…" : "SPIN"}</button>
      </div>
      {winner && (
        <div className="winner">
          <Confetti count={30} />
          <p className="hand big">The fridge has spoken:</p>
          <RecipeCard match={winner} />
          <div className="action-row center">
            <button className="btn btn-primary big" onClick={() => go(`cook/${winner.recipe.id}`)}>▶ Cook it now</button>
            <button className="btn btn-ghost" onClick={spin}>Spin again</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Chaos ----------------

const WEIRD_CATS = new Set(["sauces", "canned", "frozen", "produce", "dairy", "baking"]);

function Chaos() {
  const pantry = useStore((s) => s.pantry);
  const filters = useStore((s) => s.filters);
  const ai = useAi();
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Recipe | null>(null);
  const [error, setError] = useState("");
  const options = catalog().filter((i) => pantry[i.id] && !["salt", "black_pepper", "vegetable_oil", "olive_oil"].includes(i.id));

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? [...p.slice(1), id] : [...p, id]));
  const surprise = () => {
    const weird = options.filter((o) => WEIRD_CATS.has(o.category));
    const src = weird.length >= 3 ? weird : options;
    setPicked([...src].sort(() => Math.random() - 0.5).slice(0, 3).map((o) => o.id));
  };

  const brew = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      let recipe: Recipe;
      if (ai) {
        [recipe] = await generateRecipes({ mode: "chaos", pantry: pantryPayload(), focus: picked.map((id) => ingredientLabel(id)), mood: filters.mood, constraints: filtersToConstraints(filters), servings: 2, count: 1 });
        actions.addAiRecipes([recipe], "chaos");
      } else {
        await new Promise((r) => setTimeout(r, 1200)); // let the cauldron bubble a moment
        recipe = offlineRecipe({ focus: picked, pantry: pantrySet(), lookup: (id) => catalog().find((c) => c.id === id), labelOf: ingredientLabel, kind: "chaos" });
        actions.addAiRecipes([recipe], "offline");
        actions.bumpStat("chaosDishes");
      }
      setResult(recipe);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const resultRecipe = result && findRecipe(result.id);
  return (
    <div className="chaos">
      <p className="lede">Pick three things you need to use up (the weirder the better) and I'll build a real dish around them.</p>
      <div className="potion-slots">
        {[0, 1, 2].map((i) => (
          <button key={i} className={`slot ${picked[i] ? "filled" : ""}`} onClick={() => picked[i] && toggle(picked[i])} aria-label={picked[i] ? `Remove ${ingredientLabel(picked[i])}` : `Empty slot ${i + 1}`}>
            <svg viewBox="0 0 60 80" aria-hidden><path d="M22 6h16v18l14 36a8 8 0 0 1-7.4 11H15.4A8 8 0 0 1 8 60l14-36z" fill={picked[i] ? ["var(--accent)", "var(--mustard)", "var(--sage)"][i] : "none"} stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" /><path d="M18 6h24" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" /></svg>
            <span>{picked[i] ? ingredientLabel(picked[i]) : "?"}</span>
          </button>
        ))}
      </div>
      <div className="action-row center">
        <button className="btn btn-ghost" onClick={surprise} disabled={options.length < 3}>🎲 Surprise me</button>
        <button className="btn btn-primary big" disabled={picked.length < 3 || loading} onClick={brew}>🌀 Brew chaos</button>
      </div>
      {ai === false && <p className="muted small center">AI is off, so you'll get a pantry template. Add an API key for real chaos.</p>}
      {error && <p className="error center">{error}</p>}
      {loading && <Cauldron label="Something strange is bubbling…" />}
      {resultRecipe && <div className="winner"><Confetti /><RecipeCard match={matchRecipe(resultRecipe, pantrySet())} /></div>}
      {!loading && (
        <div className="chips pick-grid">
          {options.map((o) => (
            <div key={o.id} className={`chip-wrap ${picked.includes(o.id) ? "have" : ""}`}>
              <button className="chip" aria-pressed={picked.includes(o.id)} onClick={() => toggle(o.id)}>
                <span className="check" aria-hidden><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" /></svg></span>
                <span className="chip-label">{o.label}</span>
              </button>
            </div>
          ))}
          {options.length < 3 && <p className="muted">Check off a few more pantry items first.</p>}
        </div>
      )}
    </div>
  );
}

// ---------------- Leftovers ----------------

/** "cooked rice" → rice, "half a can of black beans" → black_beans. */
function toCatalogId(text: string): string | undefined {
  const t = text.toLowerCase();
  const all = catalog();
  return (
    all.find((i) => i.label.toLowerCase() === t || i.singular === t)?.id ??
    all.filter((i) => t.includes(i.label.toLowerCase().split(" (")[0]) || (i.singular && t.includes(i.singular))).sort((a, b) => b.label.length - a.label.length)[0]?.id ??
    all.find((i) => i.label.toLowerCase().split(" (")[0].includes(t))?.id
  );
}

function Leftovers() {
  const ai = useAi();
  const filters = useStore((s) => s.filters);
  const aiRecipes = useStore((s) => s.aiRecipes);
  const [items, setItems] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Recipe | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LEFTOVER_KEY);
      if (raw) {
        const data = JSON.parse(raw) as { items: string[]; from: string };
        setItems(data.items);
        setFrom(data.from);
        sessionStorage.removeItem(LEFTOVER_KEY);
      }
    } catch { /* ignore */ }
  }, []);

  const ids = items.map(toCatalogId).filter((x): x is string => !!x);
  const suggestions = useMemo(() => recipesUsing(allRecipes(), ids, pantrySet()).filter((m) => m.recipe.title !== from).slice(0, 6), [items.join("|"), aiRecipes]);

  const add = () => {
    const parts = input.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) setItems((l) => [...new Set([...l, ...parts])]);
    setInput("");
  };

  const remix = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      let recipe: Recipe;
      if (ai) {
        [recipe] = await generateRecipes({ mode: "leftover", pantry: pantryPayload(), focus: items, context: from, mood: filters.mood, constraints: filtersToConstraints(filters), servings: 2, count: 1 });
        actions.addAiRecipes([recipe], "remix");
      } else {
        await new Promise((r) => setTimeout(r, 1000));
        const focus = ids.length ? ids : ["rice"];
        recipe = offlineRecipe({ focus, pantry: pantrySet(), lookup: (id) => INGREDIENT_MAP.get(id) ?? catalog().find((c) => c.id === id), labelOf: ingredientLabel, kind: "remix" });
        actions.addAiRecipes([recipe], "offline");
        actions.bumpStat("leftoverRemixes");
      }
      setResult(recipe);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const resultRecipe = result && findRecipe(result.id);
  return (
    <div className="leftovers-view">
      <p className="lede">{from ? <>Leftovers from <strong>{from}</strong>. Let's make tomorrow's lunch something new.</> : "Tell me what's left over and I'll plan a next-day meal that doesn't feel like a reheat."}</p>
      <div className="leftover-input">
        <input className="text-input" placeholder="cooked rice, half an onion, 2 tortillas…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} aria-label="Add leftovers" />
        <button className="btn btn-ghost" onClick={add}>Add</button>
      </div>
      <div className="active-chips">
        {items.map((it) => <button key={it} className="pill" onClick={() => setItems((l) => l.filter((x) => x !== it))}>{it} ×</button>)}
      </div>
      {items.length > 0 && (
        <>
          <div className="alchemy-card">
            {loading ? <Cauldron label="Giving your leftovers a second life…" /> : (
              <>
                <div>
                  <h2 className="display">Remix it</h2>
                  <p>{ai ? "A brand-new next-day recipe built around exactly these leftovers." : "AI is off, so this uses a pantry template. Add an API key for a custom remix."}</p>
                  {error && <p className="error">{error}</p>}
                </div>
                <button className="btn btn-primary" onClick={remix}>♻️ Remix leftovers</button>
              </>
            )}
          </div>
          {resultRecipe && <div className="winner"><RecipeCard match={matchRecipe(resultRecipe, pantrySet())} /></div>}
          {suggestions.length > 0 && (
            <>
              <h2 className="section-title hand">Recipes that use them up</h2>
              <div className="card-grid">{suggestions.map((m, i) => <RecipeCard key={m.recipe.id} match={m} index={i} />)}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export function PlayView({ tab = "roulette" }: { tab?: string }) {
  const active = TABS.some((t) => t.id === tab) ? tab : "roulette";
  return (
    <section className="view play">
      <div className="hero-head">
        <p className="eyebrow">Kitchen games</p>
        <h1 className="display">Play with your food</h1>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <a key={t.id} role="tab" aria-selected={active === t.id} className={active === t.id ? "on" : ""} href={`#/play/${t.id}`}>{t.label}</a>
        ))}
      </div>
      {active === "roulette" && <Roulette />}
      {active === "chaos" && <Chaos />}
      {active === "leftovers" && <Leftovers />}
    </section>
  );
}
