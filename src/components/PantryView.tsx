import { useMemo, useState } from "react";
import { CATEGORIES } from "../data/ingredients.ts";
import { rankRecipes, DEFAULT_FILTERS } from "../lib/match.ts";
import { playPop } from "../lib/sound.ts";
import { actions, allRecipes, catalog, pantrySet, useStore } from "../lib/store.ts";
import type { Category, Ingredient } from "../lib/types.ts";

type Show = "all" | "have" | "low";

function Chip({ item, have, low }: { item: Ingredient; have: boolean; low: boolean }) {
  const [pop, setPop] = useState(0);
  return (
    <div className={`chip-wrap ${have ? "have" : ""} ${low ? "low" : ""}`}>
      <button
        className="chip"
        aria-pressed={have}
        onClick={() => {
          if (!have) {
            setPop((p) => p + 1);
            playPop();
          }
          actions.togglePantry(item.id);
        }}
      >
        <span className="check" aria-hidden>
          <svg viewBox="0 0 24 24" key={pop}><path d="M5 12.5l4.5 4.5L19 7" /></svg>
        </span>
        <span className="chip-label">{item.label}</span>
        {pop > 0 && have && <span className="burst" key={`b${pop}`} aria-hidden />}
      </button>
      {have && (
        <button className="low-flag" aria-pressed={low} aria-label={`${item.label} running low`} title="Running low" onClick={() => actions.toggleLow(item.id)}>
          {low ? "low!" : "low?"}
        </button>
      )}
      {item.custom && !have && (
        <button className="low-flag remove" aria-label={`Remove ${item.label}`} onClick={() => actions.removeCustomIngredient(item.id)}>×</button>
      )}
    </div>
  );
}

export function PantryView() {
  const pantry = useStore((s) => s.pantry);
  const customs = useStore((s) => s.customIngredients);
  const aiRecipes = useStore((s) => s.aiRecipes);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [addCat, setAddCat] = useState<Category>("produce");
  const [collapsed, setCollapsed] = useState<Set<Category>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);

  const items = useMemo(() => catalog(), [customs]);
  const query = q.trim().toLowerCase();
  const visible = items.filter((i) => {
    if (query && !i.label.toLowerCase().includes(query) && !i.id.includes(query.replace(/\s+/g, "_"))) return false;
    if (show === "have" && !pantry[i.id]) return false;
    if (show === "low" && !pantry[i.id]?.low) return false;
    return true;
  });
  const exact = items.some((i) => i.label.toLowerCase() === query);
  const count = Object.keys(pantry).length;
  const lowCount = Object.values(pantry).filter((p) => p.low).length;
  const makeable = useMemo(
    () => rankRecipes(allRecipes(), pantrySet(), { ...DEFAULT_FILTERS, makeableOnly: true }).length,
    [pantry, aiRecipes],
  );

  const quickAdd = () => {
    if (!query) return;
    actions.addCustomIngredient(q, addCat);
    playPop();
    setQ("");
  };

  return (
    <section className="view pantry">
      <div className="hero-head">
        <p className="eyebrow">Step one · take stock</p>
        <h1 className="display">What's in your kitchen?</h1>
        <p className="lede">Tap everything you've got. I'll remember it next time.</p>
        <div className="stat-row">
          <span className="stat"><strong>{count}</strong> in stock</span>
          <span className="stat"><strong>{lowCount}</strong> running low</span>
          <span className="stat"><strong>{makeable}</strong> makeable now</span>
        </div>
      </div>

      <div className="search-bar">
        <svg viewBox="0 0 24 24" width="20" aria-hidden><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        <input
          type="search"
          placeholder="Search or add an ingredient…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !exact && visible.length === 0 && quickAdd()}
          aria-label="Search ingredients"
        />
      </div>

      {query && !exact && (
        <div className="quick-add">
          <span>Add <strong>“{q.trim()}”</strong> to</span>
          <select value={addCat} onChange={(e) => setAddCat(e.target.value as Category)} aria-label="Category">
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <button className="btn btn-primary" onClick={quickAdd}>+ Add</button>
        </div>
      )}

      <div className="toolbar">
        <div className="segmented small" role="group" aria-label="Show">
          {(["all", "have", "low"] as Show[]).map((s) => (
            <button key={s} className={show === s ? "on" : ""} onClick={() => setShow(s)}>{s === "all" ? "Everything" : s === "have" ? "I have" : "Running low"}</button>
          ))}
        </div>
        {count > 0 && (confirmClear ? (
          <span className="confirm">
            Clear all {count}? <button className="link danger" onClick={() => { actions.clearPantry(); setConfirmClear(false); }}>Yes, clear</button>
            <button className="link" onClick={() => setConfirmClear(false)}>Keep</button>
          </span>
        ) : (
          <button className="link" onClick={() => setConfirmClear(true)}>Clear</button>
        ))}
      </div>

      {CATEGORIES.map((cat) => {
        const list = visible.filter((i) => i.category === cat.id);
        if (!list.length) return null;
        const haveN = items.filter((i) => i.category === cat.id && pantry[i.id]).length;
        const isCollapsed = collapsed.has(cat.id) && !query;
        return (
          <div className="category" key={cat.id}>
            <button
              className="category-head"
              aria-expanded={!isCollapsed}
              onClick={() => setCollapsed((c) => { const n = new Set(c); n.has(cat.id) ? n.delete(cat.id) : n.add(cat.id); return n; })}
            >
              <span className="cat-emoji" aria-hidden>{cat.emoji}</span>
              <h2>{cat.label}</h2>
              <span className="cat-count">{haveN}</span>
              <span className="chev" aria-hidden>{isCollapsed ? "+" : "−"}</span>
            </button>
            {!isCollapsed && (
              <div className="chips">
                {list.map((item) => <Chip key={item.id} item={item} have={!!pantry[item.id]} low={!!pantry[item.id]?.low} />)}
              </div>
            )}
          </div>
        );
      })}

      {visible.length === 0 && !query && <p className="empty hand">Nothing here yet.</p>}

      <a href="#/recipes" className="cta-float">
        <span>See what I can cook</span>
        <span className="cta-count">{makeable} ready →</span>
      </a>
    </section>
  );
}
