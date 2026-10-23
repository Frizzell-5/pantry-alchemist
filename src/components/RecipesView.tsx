import { useEffect, useMemo, useState } from "react";
import { SEED_RECIPES } from "../data/recipes.ts";
import { aiStatus, generateRecipes } from "../lib/api.ts";
import { cuisineFamily, rankRecipes, type DietFilter, type EquipFilter, type Filters, type TimeFilter } from "../lib/match.ts";
import { actions, allRecipes, catalog, pantrySet, toast, useStore } from "../lib/store.ts";
import { MOODS } from "../lib/types.ts";
import { Cauldron, MOOD_META } from "./bits.tsx";
import { RecipeCard } from "./RecipeCard.tsx";

const TIME_OPTS: [TimeFilter, string][] = [["any", "Any time"], [10, "≤ 10 min"], [20, "≤ 20 min"], [30, "≤ 30 min"]];
const DIET_OPTS: [DietFilter, string][] = [["any", "Anything"], ["vegetarian", "Vegetarian"], ["vegan", "Vegan"], ["noMeat", "No meat"]];
const EQUIP_OPTS: [EquipFilter, string][] = [["any", "Any kit"], ["stovetop", "Stovetop only"], ["microwave", "Microwave only"], ["onePot", "One pot"], ["noOven", "No oven"]];

export function filtersToConstraints(f: Filters): string[] {
  const c: string[] = [];
  if (f.time !== "any") c.push(`total time ${f.time} minutes or less`);
  if (f.diet === "vegetarian") c.push("vegetarian");
  if (f.diet === "vegan") c.push("vegan");
  if (f.diet === "noMeat") c.push("no meat (fish is ok)");
  if (f.equipment === "stovetop") c.push("stovetop only, no oven or microwave");
  if (f.equipment === "microwave") c.push("microwave only");
  if (f.equipment === "onePot") c.push("one pot or pan only");
  if (f.equipment === "noOven") c.push("no oven");
  if (f.cuisine !== "any") c.push(`${f.cuisine} cuisine`);
  return c;
}

export function pantryPayload() {
  const p = pantrySet();
  return catalog().filter((i) => p.has(i.id)).map((i) => ({ id: i.id, label: i.label }));
}

export function RecipesView() {
  const pantry = useStore((s) => s.pantry);
  const aiRecipes = useStore((s) => s.aiRecipes);
  const filters = useStore((s) => s.filters);
  const [showFilters, setShowFilters] = useState(false);
  const [ai, setAi] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [fresh, setFresh] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => void aiStatus().then((s) => setAi(s.ai)), []);

  const cuisines = useMemo(() => [...new Set(allRecipes().map((r) => cuisineFamily(r.cuisine)))].sort(), [aiRecipes]);
  const matches = useMemo(() => rankRecipes(allRecipes(), pantrySet(), filters), [pantry, aiRecipes, filters]);
  const freshMatches = matches.filter((m) => fresh.includes(m.recipe.id));
  const rest = matches.filter((m) => !fresh.includes(m.recipe.id));
  const readyCount = matches.filter((m) => m.needToBuy.length === 0).length;
  const pantryCount = Object.keys(pantry).length;

  const activeChips: [string, () => void][] = [];
  if (filters.time !== "any") activeChips.push([`≤ ${filters.time} min`, () => actions.setFilters({ time: "any" })]);
  if (filters.diet !== "any") activeChips.push([DIET_OPTS.find((d) => d[0] === filters.diet)![1], () => actions.setFilters({ diet: "any" })]);
  if (filters.equipment !== "any") activeChips.push([EQUIP_OPTS.find((d) => d[0] === filters.equipment)![1], () => actions.setFilters({ equipment: "any" })]);
  if (filters.cuisine !== "any") activeChips.push([filters.cuisine, () => actions.setFilters({ cuisine: "any" })]);
  if (filters.makeableOnly) activeChips.push(["Ready now", () => actions.setFilters({ makeableOnly: false })]);

  async function invent() {
    setLoading(true);
    setError("");
    try {
      const recipes = await generateRecipes({
        mode: "pantry",
        pantry: pantryPayload(),
        mood: filters.mood,
        constraints: filtersToConstraints(filters),
        servings: 2,
        count: 3,
        avoidTitles: [...SEED_RECIPES, ...aiRecipes].map((r) => r.title).slice(0, 60),
      });
      actions.addAiRecipes(recipes, "ai");
      setFresh(recipes.map((r) => r.id));
      toast({ kind: "info", emoji: "✨", title: `${recipes.length} new recipe${recipes.length > 1 ? "s" : ""} conjured` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="view recipes">
      <div className="hero-head">
        <p className="eyebrow">Step two · pick your potion</p>
        <h1 className="display">{readyCount > 0 ? <>You can make <span className="ink-accent">{readyCount}</span> things right now</> : "Let's find you something"}</h1>
        <p className="lede">Ranked by fewest extra ingredients. {pantryCount < 6 && <a href="#/pantry">Check off more of your pantry</a>}</p>
      </div>

      <div className="mood-row" role="group" aria-label="Mood">
        <span className="hand mood-q">I'm feeling…</span>
        <div className="mood-chips">
          {MOODS.map((m) => (
            <button key={m} className={`mood ${filters.mood === m ? "on" : ""}`} aria-pressed={filters.mood === m} onClick={() => actions.setFilters({ mood: filters.mood === m ? null : m })}>
              <span aria-hidden>{MOOD_META[m].emoji}</span> {MOOD_META[m].label}
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar">
        <button className={`btn btn-ghost ${showFilters ? "on" : ""}`} onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
          ⚙︎ Filters{activeChips.length ? ` · ${activeChips.length}` : ""}
        </button>
        <div className="active-chips">
          {activeChips.map(([label, clear]) => (
            <button key={label} className="pill" onClick={clear} aria-label={`Remove filter ${label}`}>{label} ×</button>
          ))}
        </div>
      </div>

      {showFilters && (
        <div className="filter-panel">
          <div className="field"><span>Max time</span>
            <div className="segmented">{TIME_OPTS.map(([v, l]) => <button key={String(v)} className={filters.time === v ? "on" : ""} onClick={() => actions.setFilters({ time: v })}>{l}</button>)}</div>
          </div>
          <div className="field"><span>Diet</span>
            <div className="segmented">{DIET_OPTS.map(([v, l]) => <button key={v} className={filters.diet === v ? "on" : ""} onClick={() => actions.setFilters({ diet: v })}>{l}</button>)}</div>
          </div>
          <div className="field"><span>Equipment</span>
            <div className="segmented wrap">{EQUIP_OPTS.map(([v, l]) => <button key={v} className={filters.equipment === v ? "on" : ""} onClick={() => actions.setFilters({ equipment: v })}>{l}</button>)}</div>
          </div>
          <label className="field"><span>Cuisine</span>
            <select value={filters.cuisine} onChange={(e) => actions.setFilters({ cuisine: e.target.value })}>
              <option value="any">Any cuisine</option>
              {cuisines.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={filters.makeableOnly} onChange={(e) => actions.setFilters({ makeableOnly: e.target.checked })} />
            <span>Only recipes I can make without shopping</span>
          </label>
        </div>
      )}

      <div className="alchemy-card">
        {loading ? (
          <Cauldron label="Stirring your pantry into something new…" />
        ) : (
          <>
            <div>
              <h2 className="display">Invent something new</h2>
              <p>
                {ai === false
                  ? "AI is off. Add ANTHROPIC_API_KEY to .env and restart to conjure original recipes from your exact pantry."
                  : `Three original recipes from your ${pantryCount} ingredients${filters.mood ? `, tuned for “${MOOD_META[filters.mood].label.toLowerCase()}”` : ""}${activeChips.length ? ", respecting your filters" : ""}.`}
              </p>
              {error && <p className="error">{error}</p>}
            </div>
            <button className="btn btn-primary" disabled={!ai || pantryCount === 0} onClick={invent}>✨ Conjure 3 recipes</button>
          </>
        )}
      </div>

      {freshMatches.length > 0 && (
        <>
          <h2 className="section-title hand">Fresh from the cauldron</h2>
          <div className="card-grid">{freshMatches.map((m, i) => <RecipeCard key={m.recipe.id} match={m} index={i} />)}</div>
          <h2 className="section-title hand">Everything else</h2>
        </>
      )}

      <div className="card-grid">
        {rest.map((m, i) => <RecipeCard key={m.recipe.id} match={m} index={i} />)}
      </div>
      {matches.length === 0 && (
        <div className="empty">
          <p className="hand big">No recipes fit those filters.</p>
          <button className="btn btn-ghost" onClick={() => actions.setFilters({ time: "any", diet: "any", equipment: "any", cuisine: "any", makeableOnly: false })}>Loosen the filters</button>
        </div>
      )}
    </section>
  );
}
