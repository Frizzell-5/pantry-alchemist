import { RecipeArt } from "../lib/art.tsx";
import { ACHIEVEMENTS } from "../lib/achievements.ts";
import { actions, findRecipe, getState, useStore } from "../lib/store.ts";
import { MEAL_TYPES, type MealType, type Recipe } from "../lib/types.ts";
import { Stars } from "./bits.tsx";

export const CHAPTERS: Record<MealType, { title: string; blurb: string }> = {
  breakfast: { title: "Mornings", blurb: "For 8 a.m. lectures and slow Sundays." },
  lunch: { title: "Midday", blurb: "Between classes, quick and satisfying." },
  dinner: { title: "Suppers", blurb: "The main event." },
  snack: { title: "Snacks & Small Bites", blurb: "Study fuel and midnight cravings." },
  dessert: { title: "Sweet Things", blurb: "Because you earned it." },
};

export function cookbookRecipes(): { meal: MealType; recipes: Recipe[] }[] {
  const s = getState();
  const saved = Object.values(s.cookbook).map((e) => findRecipe(e.recipeId)).filter((r): r is Recipe => !!r);
  return MEAL_TYPES.map((meal) => ({ meal, recipes: saved.filter((r) => r.mealType === meal).sort((a, b) => a.title.localeCompare(b.title)) })).filter((c) => c.recipes.length);
}

export function CookbookView() {
  const cookbook = useStore((s) => s.cookbook);
  const settings = useStore((s) => s.settings);
  const achievements = useStore((s) => s.achievements);
  const cookLog = useStore((s) => s.cookLog);
  const state = useStore((s) => s);
  const chapters = cookbookRecipes();
  const count = Object.keys(cookbook).length;
  const unlocked = ACHIEVEMENTS.filter((a) => achievements[a.id]).length;
  const ingredientsUsed = new Set(cookLog.flatMap((l) => l.ingredientRefs)).size;

  return (
    <section className="view cookbook">
      <div className="hero-head">
        <p className="eyebrow">{settings.name ? `${settings.name}'s` : "Your"} personal cookbook</p>
        <h1 className="display">{settings.cookbookTitle || "My Cookbook"}</h1>
        <div className="stat-row">
          <span className="stat"><strong>{count}</strong> saved</span>
          <span className="stat"><strong>{cookLog.length}</strong> meals cooked</span>
          <span className="stat"><strong>{ingredientsUsed}</strong> ingredients used up</span>
        </div>
      </div>

      <div className="card-paper cover-editor">
        <h2 className="hand">Make it yours</h2>
        <label className="field"><span>Your name</span><input value={settings.name} placeholder="Sam" onChange={(e) => actions.setSettings({ name: e.target.value })} /></label>
        <label className="field"><span>Cookbook title</span><input value={settings.cookbookTitle} onChange={(e) => actions.setSettings({ cookbookTitle: e.target.value })} /></label>
        <a className={`btn btn-primary wide ${count ? "" : "disabled"}`} href={count ? "#/print" : undefined} aria-disabled={!count}>🖨 Export printable PDF</a>
        {!count && <p className="muted small">Save a recipe first. Open any recipe and tap “Save to cookbook.”</p>}
      </div>

      {chapters.map(({ meal, recipes }) => (
        <div key={meal} className="chapter">
          <h2 className="chapter-title display">{CHAPTERS[meal].title}</h2>
          <p className="hand chapter-blurb">{CHAPTERS[meal].blurb}</p>
          <div className="book-list">
            {recipes.map((r) => {
              const e = cookbook[r.id];
              return (
                <a key={r.id} href={`#/recipe/${r.id}`} className="book-item">
                  <div className="book-thumb"><RecipeArt recipe={r} /></div>
                  <div>
                    <h3>{r.title}</h3>
                    <Stars value={e.rating} size={16} />
                    {e.notes ? <p className="hand note-preview">“{e.notes}”</p> : <p className="muted small">{e.cookedCount ? `Cooked ${e.cookedCount}×` : "Not cooked yet"}</p>}
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      ))}
      {count === 0 && <p className="empty hand big">Your cookbook is a blank page. Save recipes you love and they'll live here.</p>}

      <div className="achievements">
        <h2 className="display">Badges <span className="muted">{unlocked}/{ACHIEVEMENTS.length}</span></h2>
        <div className="badge-grid">
          {ACHIEVEMENTS.map((a) => {
            const got = !!achievements[a.id];
            const prog = a.progress?.(state);
            return (
              <div key={a.id} className={`badge-card ${got ? "got" : ""}`} title={a.description}>
                <span className="badge-emoji" aria-hidden>{got ? a.emoji : "🔒"}</span>
                <strong>{a.title}</strong>
                <span className="small">{a.description}</span>
                {!got && prog && <span className="badge-prog"><i style={{ width: `${Math.min(100, (prog[0] / prog[1]) * 100)}%` }} /></span>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
