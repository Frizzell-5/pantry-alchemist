import { useEffect, useMemo, useRef, useState } from "react";
import { SEED_RECIPES } from "../data/recipes.ts";
import { aiStatus, generateRecipes } from "../lib/api.ts";
import { go } from "../lib/hooks.ts";
import { loadLibrary, searchRecipes, useLibrary } from "../lib/library.ts";
import { cuisineFamily, dietOf, matchRecipe, type Match } from "../lib/match.ts";
import { actions, allRecipes, pantrySet, toast, useStore } from "../lib/store.ts";
import type { Recipe } from "../lib/types.ts";
import { Cauldron } from "./bits.tsx";
import { RecipeCard } from "./RecipeCard.tsx";
import { pantryPayload } from "./RecipesView.tsx";

const CATEGORIES: [string, string][] = [
  ["Chicken", "🍗"], ["Beef", "🥩"], ["Pasta", "🍝"], ["Seafood", "🦐"], ["Vegetarian", "🥕"], ["Vegan", "🌱"],
  ["Breakfast", "🍳"], ["Dessert", "🍰"], ["Side", "🥗"], ["Starter", "🥟"], ["Pork", "🥓"], ["Lamb", "🍖"],
];
const IDEAS = ["tacos", "curry", "fried rice", "soup", "lasagna", "pancakes", "ramen", "burger", "pie", "stir fry", "cookies", "salad"];
const PAGE = 24;

const CATEGORY_REFS: Record<string, string[]> = {
  Chicken: ["chicken_breast", "chicken_thigh"], Beef: ["ground_beef"], Pasta: ["pasta", "short_pasta"],
  Seafood: ["salmon", "shrimp", "tuna"], Pork: ["bacon", "sausage", "ham"],
};

/** Library dishes carry a category; our own recipes are sorted by meal type, diet and main ingredient. */
function inCategory(r: Recipe, c: string): boolean {
  if (r.category) return r.category === c || (c === "Vegetarian" && r.category === "Vegan");
  if (c === "Breakfast") return r.mealType === "breakfast";
  if (c === "Dessert") return r.mealType === "dessert";
  if (c === "Side" || c === "Starter") return r.mealType === "snack";
  if (c === "Vegetarian") return dietOf(r).vegetarian;
  if (c === "Vegan") return dietOf(r).vegan;
  return r.ingredients.some((i) => !i.optional && CATEGORY_REFS[c]?.includes(i.ref ?? ""));
}

type Sort = "relevance" | "pantry" | "quick";

export function SearchView() {
  const library = useLibrary();
  const pantry = useStore((s) => s.pantry);
  const aiRecipes = useStore((s) => s.aiRecipes);
  const saved = useStore((s) => s.libraryRecipes);
  const recent = useStore((s) => s.recentSearches);
  const [query, setQuery] = useState(() => new URLSearchParams(location.hash.split("?")[1]).get("q") ?? "");
  const [category, setCategory] = useState<string | null>(null);
  const [cuisine, setCuisine] = useState("any");
  const [sort, setSort] = useState<Sort>("relevance");
  const [shown, setShown] = useState(PAGE);
  const [ai, setAi] = useState<boolean | null>(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => void loadLibrary(), []);
  useEffect(() => void aiStatus().then((s) => setAi(s.ai)), []);
  useEffect(() => setShown(PAGE), [query, category, cuisine, sort]);
  // Keep the query in the URL so Back from a recipe returns to the same results.
  useEffect(() => {
    const t = setTimeout(() => history.replaceState(null, "", query.trim() ? `#/search?q=${encodeURIComponent(query.trim())}` : "#/search"), 250);
    return () => clearTimeout(t);
  }, [query]);

  const everything = useMemo(() => {
    const own = allRecipes();
    const ids = new Set(own.map((r) => r.id));
    return [...own, ...library.recipes.filter((r) => !ids.has(r.id))];
  }, [library.recipes, aiRecipes, saved]);

  const cuisines = useMemo(() => [...new Set(everything.map((r) => cuisineFamily(r.cuisine)))].sort(), [everything]);
  const q = query.trim();
  const browsing = !q && !category && cuisine === "any";

  const results: Match[] = useMemo(() => {
    const set = pantrySet();
    let pool = everything;
    if (category) pool = pool.filter((r) => inCategory(r, category));
    if (cuisine !== "any") pool = pool.filter((r) => cuisineFamily(r.cuisine) === cuisine);
    const hits = searchRecipes(pool, q);
    const matches = hits.map((h) => ({ m: matchRecipe(h.recipe, set), score: h.score }));
    const order = browsing ? "pantry" : sort;
    matches.sort((a, b) =>
      order === "pantry" ? a.m.needToBuy.length - b.m.needToBuy.length || b.m.haveCount / (b.m.required || 1) - a.m.haveCount / (a.m.required || 1) || b.score - a.score
      : order === "quick" ? a.m.recipe.time - b.m.recipe.time || b.score - a.score
      : b.score - a.score || a.m.needToBuy.length - b.m.needToBuy.length);
    return matches.map((x) => x.m);
  }, [everything, q, category, cuisine, sort, pantry, browsing]);

  const commit = () => q && actions.rememberSearch(q);

  function surprise() {
    const pool = library.recipes.length ? library.recipes : SEED_RECIPES;
    const r = pool[Math.floor(Math.random() * pool.length)];
    go(`recipe/${r.id}`);
  }

  async function writeIt() {
    setWriting(true);
    setError("");
    try {
      const [recipe] = await generateRecipes({ mode: "dish", pantry: pantryPayload(), focus: [q], servings: 2, count: 1 });
      actions.addAiRecipes([recipe], "ai");
      actions.rememberSearch(q);
      toast({ kind: "info", emoji: "✨", title: `Wrote you a recipe for ${recipe.title}` });
      go(`recipe/${recipe.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWriting(false);
    }
  }

  const total = everything.length;
  const loadingLib = library.status === "loading";

  return (
    <section className="view search-view">
      <div className="hero-head">
        <p className="eyebrow">Find any dish</p>
        <h1 className="display">What are you <span className="ink-accent">craving?</span></h1>
        <p className="lede">
          Search {total > 100 ? <strong>{Math.floor(total / 50) * 50}+</strong> : "hundreds of"} dishes from {cuisines.length > 10 ? `${cuisines.length} cuisines` : "around the world"}.
          Every recipe shows what you already have and what you'd need to buy.
        </p>
      </div>

      <form className="search-bar big" role="search" onSubmit={(e) => { e.preventDefault(); commit(); inputRef.current?.blur(); }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          placeholder="Try “chicken curry”, “pasta”, “Mexican”…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={commit}
          aria-label="Search dishes"
        />
        {query && <button type="button" className="link" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="Clear search">✕</button>}
      </form>

      {!q && (
        <div className="idea-row">
          {recent.length > 0 && (
            <>
              <span className="hand idea-label">Recent</span>
              {recent.map((r) => <button key={r} className="pill" onClick={() => setQuery(r)}>🕘 {r}</button>)}
              <button className="link small" onClick={actions.clearSearches}>clear</button>
            </>
          )}
          {recent.length === 0 && (
            <>
              <span className="hand idea-label">Ideas</span>
              {IDEAS.map((r) => <button key={r} className="pill" onClick={() => { setQuery(r); actions.rememberSearch(r); }}>{r}</button>)}
            </>
          )}
        </div>
      )}

      <div className="cat-scroller" role="group" aria-label="Browse by category">
        {CATEGORIES.map(([c, e]) => (
          <button key={c} className={`cat-tile ${category === c ? "on" : ""}`} aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>
            <span aria-hidden>{e}</span>{c}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <select value={cuisine} onChange={(e) => setCuisine(e.target.value)} aria-label="Cuisine" className="cuisine-select">
          <option value="any">🌍 All cuisines</option>
          {cuisines.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn btn-ghost" onClick={surprise}>🎲 Surprise me</button>
      </div>
      {!browsing && (
        <div className="sort-row">
          <span className="muted small">Sort</span>
          <div className="segmented small" role="group" aria-label="Sort">
            {([["relevance", "Best match"], ["pantry", "Fewest to buy"], ["quick", "Quickest"]] as [Sort, string][]).map(([v, l]) => (
              <button key={v} className={sort === v ? "on" : ""} onClick={() => setSort(v)}>{l}</button>
            ))}
          </div>
        </div>
      )}

      {loadingLib && (
        <div className="lib-loading" role="status">
          <span>Opening the world recipe library…</span>
          <span className="lib-bar"><i style={{ width: `${(library.loaded / 26) * 100}%` }} /></span>
        </div>
      )}
      {library.status === "error" && (
        <p className="notice">
          {library.recipes.length ? "Part of the world library didn't load, so some dishes may be missing." : "Couldn't reach the world recipe library (offline?). Showing your own recipes."}{" "}
          <button className="link" onClick={() => location.reload()}>Retry</button>
        </p>
      )}

      <h2 className="section-title hand">
        {browsing ? "Closest to what's in your pantry" : `${results.length} dish${results.length === 1 ? "" : "es"}${q ? ` for “${q}”` : ""}`}
      </h2>

      <div className="card-grid" onClickCapture={commit}>
        {results.slice(0, shown).map((m, i) => <RecipeCard key={m.recipe.id} match={m} index={i % PAGE} />)}
      </div>
      {results.length > shown && (
        <button className="btn btn-ghost wide" onClick={() => setShown((n) => n + PAGE)}>Show more ({results.length - shown} left)</button>
      )}

      {q && !loadingLib && (
        <div className="alchemy-card">
          {writing ? (
            <Cauldron label={`Writing a recipe for “${q}”…`} />
          ) : (
            <>
              <div>
                <h2 className="display">{results.length ? "Want your own version?" : "Not in the library?"}</h2>
                <p>
                  {ai === false
                    ? "AI recipe writing is off on this kitchen. Ask whoever runs it to add an API key."
                    : `The alchemist can write a recipe for “${q}”, using what's in your pantry wherever it can.`}
                </p>
                {error && <p className="error">{error}</p>}
              </div>
              <button className="btn btn-primary" disabled={!ai} onClick={writeIt}>✨ Write it for me</button>
            </>
          )}
        </div>
      )}

      <p className="muted small center">World-library dishes come from <a href="https://www.themealdb.com" target="_blank" rel="noreferrer">TheMealDB</a>, a free community recipe database.</p>
    </section>
  );
}
