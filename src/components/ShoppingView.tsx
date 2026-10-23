import { useMemo, useState } from "react";
import { CATEGORIES, INGREDIENT_MAP } from "../data/ingredients.ts";
import { matchRecipe } from "../lib/match.ts";
import { playPop } from "../lib/sound.ts";
import { actions, catalog, findRecipe, pantrySet, toast, useStore } from "../lib/store.ts";

interface Line {
  key: string; // catalog id, or "name:<text>" for unmapped
  label: string;
  section: string;
  forRecipes: string[];
  restock?: boolean;
}

export function ShoppingView() {
  const starred = useStore((s) => s.starred);
  const pantry = useStore((s) => s.pantry);
  const checked = useStore((s) => s.shoppingChecked);
  const aiRecipes = useStore((s) => s.aiRecipes);
  const [includeSwappable, setIncludeSwappable] = useState(false);

  const lines = useMemo(() => {
    const set = pantrySet();
    const map = new Map<string, Line>();
    const sectionOf = (id?: string) => {
      const cat = id ? INGREDIENT_MAP.get(id) ?? catalog().find((c) => c.id === id) : undefined;
      return CATEGORIES.find((c) => c.id === cat?.category)?.store ?? "Everything else";
    };
    for (const id of starred) {
      const r = findRecipe(id);
      if (!r) continue;
      const m = matchRecipe(r, set);
      for (const ing of includeSwappable ? m.missing : m.needToBuy) {
        const key = ing.ref ?? `name:${ing.name}`;
        const line = map.get(key) ?? { key, label: ing.ref ? (catalog().find((c) => c.id === ing.ref)?.label ?? ing.name) : ing.name, section: sectionOf(ing.ref), forRecipes: [] };
        line.forRecipes.push(r.title);
        map.set(key, line);
      }
    }
    for (const p of Object.values(pantry)) {
      if (!p.low) continue;
      const existing = map.get(p.id);
      if (existing) existing.restock = true;
      else map.set(p.id, { key: p.id, label: catalog().find((c) => c.id === p.id)?.label ?? p.id, section: sectionOf(p.id), forRecipes: [], restock: true });
    }
    const order = [...CATEGORIES.map((c) => c.store), "Everything else"];
    return [...map.values()].sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section) || a.label.localeCompare(b.label));
  }, [starred, pantry, includeSwappable, aiRecipes]);

  const sections = [...new Set(lines.map((l) => l.section))];
  const checkedLines = lines.filter((l) => checked.includes(l.key));
  const restockable = checkedLines.filter((l) => !l.key.startsWith("name:")).map((l) => l.key);

  const copy = async () => {
    const text = sections.map((s) => `${s.toUpperCase()}\n` + lines.filter((l) => l.section === s).map((l) => `${checked.includes(l.key) ? "☑" : "☐"} ${l.label}`).join("\n")).join("\n\n");
    try {
      if (navigator.share) await navigator.share({ title: "Shopping list", text });
      else {
        await navigator.clipboard.writeText(text);
        toast({ kind: "info", emoji: "📋", title: "List copied" });
      }
    } catch { /* user dismissed the share sheet */ }
  };

  return (
    <section className="view shopping">
      <div className="hero-head">
        <p className="eyebrow">Auto-built from your ★ recipes</p>
        <h1 className="display">Shopping list</h1>
        <p className="lede">Star recipes you want to cook this week; what you're missing shows up here, grouped by store section.</p>
      </div>

      {starred.length > 0 && (
        <div className="active-chips starred-row">
          {starred.map((id) => {
            const r = findRecipe(id);
            return r ? <span key={id} className="pill"><a href={`#/recipe/${id}`}>★ {r.title}</a> <button aria-label={`Unstar ${r.title}`} onClick={() => actions.toggleStar(id)}>×</button></span> : null;
          })}
        </div>
      )}

      <label className="toggle-row">
        <input type="checkbox" checked={includeSwappable} onChange={(e) => setIncludeSwappable(e.target.checked)} />
        <span>Include items I could swap with something I already have</span>
      </label>

      {lines.length === 0 ? (
        <div className="empty">
          <p className="hand big">Nothing to buy. Your pantry's got this.</p>
          <p className="muted">Tap ☆ on any recipe card to add its missing ingredients, or mark pantry items as “running low.”</p>
          <a className="btn btn-ghost" href="#/recipes">Browse recipes</a>
        </div>
      ) : (
        <div className="card-paper list-paper">
          {sections.map((s) => (
            <div key={s} className="list-section">
              <h2 className="hand">{s}</h2>
              <ul>
                {lines.filter((l) => l.section === s).map((l) => {
                  const on = checked.includes(l.key);
                  return (
                    <li key={l.key} className={on ? "struck" : ""}>
                      <label>
                        <input type="checkbox" checked={on} onChange={() => { if (!on) playPop(); actions.toggleShoppingChecked(l.key); }} />
                        <span className="list-label">{l.label}</span>
                        <span className="list-for">{l.restock && <span className="tag-low">restock</span>}{l.forRecipes.length > 0 && ` for ${l.forRecipes.join(", ")}`}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <div className="action-row">
          <button className="btn btn-primary" disabled={!restockable.length} onClick={() => { actions.restockChecked(restockable); toast({ kind: "info", emoji: "🧺", title: `${restockable.length} item${restockable.length > 1 ? "s" : ""} added to pantry` }); }}>
            🧺 Put {restockable.length || ""} bought item{restockable.length === 1 ? "" : "s"} in pantry
          </button>
          <button className="btn btn-ghost" onClick={copy}>📋 Share / copy</button>
        </div>
      )}
    </section>
  );
}
