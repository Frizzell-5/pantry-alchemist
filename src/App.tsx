import { useEffect, useRef, useState } from "react";
import { aiStatus } from "./lib/api.ts";
import { go, useHashRoute } from "./lib/hooks.ts";
import { fetchLibraryRecipe, isLibraryId } from "./lib/library.ts";
import { actions, backupBlob, dismissToast, findRecipe, requestPersistentStorage, toast, useStore, useToasts } from "./lib/store.ts";
import type { Recipe } from "./lib/types.ts";
import { useTimers, fmtClock } from "./lib/timers.ts";
import { PantryView } from "./components/PantryView.tsx";
import { RecipesView } from "./components/RecipesView.tsx";
import { SearchView } from "./components/SearchView.tsx";
import { RecipeDetail } from "./components/RecipeDetail.tsx";
import { CookMode } from "./components/CookMode.tsx";
import { PlayView } from "./components/PlayView.tsx";
import { CookbookView } from "./components/CookbookView.tsx";
import { ShoppingView } from "./components/ShoppingView.tsx";
import { PrintCookbook } from "./components/PrintCookbook.tsx";
import { Cauldron, Confetti } from "./components/bits.tsx";

const TABS = [
  { id: "pantry", label: "Pantry", icon: "M5 4h14v4H5zM6 8h12v12H6zM10 12h4" },
  { id: "search", label: "Search", icon: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5" },
  { id: "recipes", label: "Cook", icon: "M4 11h16a8 8 0 0 1-16 0zM8 7c0-2 2-2 2-4M12 7c0-2 2-2 2-4M16 7c0-2 2-2 2-4" },
  { id: "play", label: "Play", icon: "M12 3l2.6 5.6 6.1.7-4.5 4.1 1.2 6L12 16.5 6.6 19.4l1.2-6L3.3 9.3l6.1-.7z" },
  { id: "list", label: "List", icon: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" },
  { id: "cookbook", label: "Cookbook", icon: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11" },
];

/** The tab you opened a recipe from stays highlighted on the recipe page. */
let lastTab = "recipes";

export function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);
}

function Toasts() {
  const toasts = useToasts();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismissToast(t.id)}>
          {t.kind === "achievement" && <Confetti />}
          {t.emoji && <span className="toast-emoji">{t.emoji}</span>}
          <span>
            {t.kind === "achievement" && <small className="eyebrow">Achievement unlocked</small>}
            <strong>{t.title}</strong>
            {t.body && <span className="toast-body">{t.body}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

/** A floating pill so running timers stay visible outside cook mode. */
function TimerPill() {
  const timers = useTimers();
  const route = useHashRoute();
  if (route[0] === "cook" || !timers.length) return null;
  const next = [...timers].sort((a, b) => Number(b.done) - Number(a.done) || a.remaining - b.remaining)[0];
  return (
    <button className={`timer-pill ${next.done ? "ringing" : ""}`} onClick={() => go(`cook/${next.recipeId}`)}>
      ⏱ {next.label} · {next.done ? "done!" : fmtClock(next.remaining)}
      {timers.length > 1 && <span className="badge">+{timers.length - 1}</span>}
    </button>
  );
}

/** Resolves a recipe id, fetching world-library dishes that aren't loaded yet (e.g. after a reload). */
function useRecipe(id: string | undefined): { recipe?: Recipe; loading: boolean } {
  useStore((s) => s.libraryRecipes); // re-resolve when a dish gets saved
  const local = id ? findRecipe(id) : undefined;
  const [fetched, setFetched] = useState<{ id: string; recipe?: Recipe } | null>(null);
  const needsFetch = !!id && !local && isLibraryId(id);
  useEffect(() => {
    if (!needsFetch) return;
    let live = true;
    fetchLibraryRecipe(id!).then((recipe) => live && setFetched({ id: id!, recipe }), () => live && setFetched({ id: id! }));
    return () => void (live = false);
  }, [id, needsFetch]);
  if (local) return { recipe: local, loading: false };
  if (needsFetch && fetched?.id !== id) return { loading: true };
  return { recipe: fetched && fetched.id === id ? fetched.recipe : undefined, loading: false };
}

/** "Continue cooking" banner: progress survives closing the app. */
function ResumeBanner() {
  const p = useStore((s) => s.cookProgress);
  if (!p || p.step === 0 || Date.now() - p.at > 12 * 3600_000) return null;
  const r = findRecipe(p.recipeId);
  if (!r) return null;
  return (
    <div className="resume-banner">
      <a href={`#/cook/${r.id}/${p.servings}`}>
        <span aria-hidden>🍳</span>
        <span><strong>Continue cooking {r.title}</strong><small>Step {p.step + 1} of {r.steps.length}</small></span>
      </a>
      <button className="icon-btn" aria-label="Dismiss" onClick={() => actions.setCookProgress(null)}>✕</button>
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function DataSection() {
  const counts = {
    pantry: useStore((s) => Object.keys(s.pantry).length),
    saved: useStore((s) => Object.keys(s.cookbook).length),
    cooked: useStore((s) => s.cookLog.length),
  };
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => void requestPersistentStorage().then(setPersisted), []);

  const download = () => {
    const url = URL.createObjectURL(backupBlob());
    const a = Object.assign(document.createElement("a"), { href: url, download: `pantry-alchemist-backup-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const restore = async (file: File) => {
    try {
      const ok = actions.restoreBackup(JSON.parse(await file.text()));
      toast(ok ? { kind: "info", emoji: "📦", title: "Backup restored", body: "Your pantry, cookbook and progress are back." } : { kind: "error", title: "That file isn't a Pantry Alchemist backup" });
    } catch {
      toast({ kind: "error", title: "Couldn't read that file" });
    }
  };

  return (
    <div className="data-box">
      <h3 className="hand">Your kitchen is saved automatically</h3>
      <p className="small">
        Every change saves on this device as you go: {plural(counts.pantry, "pantry item")}, {plural(counts.saved, "saved recipe")}, {plural(counts.cooked, "meal")} cooked, plus your notes, ratings, badges and shopping list. It's all still here after you close the app or restart your phone.
        {persisted && " Your browser has marked it as permanent storage, so it won't be cleared to free up space."}
      </p>
      <p className="small muted">Moving to a new phone or clearing your browser? Download a backup, then restore it there.</p>
      <div className="action-row">
        <button className="btn btn-ghost" onClick={download}>⬇ Download backup</button>
        <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>⬆ Restore backup</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
      </div>
    </div>
  );
}

function SettingsSheet({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const [needsCode, setNeedsCode] = useState(false);
  useEffect(() => void aiStatus().then((s) => setNeedsCode(!!s.needsCode)), []);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2 className="display">Kitchen settings</h2>
        <label className="field">
          <span>Your name (for the cookbook cover)</span>
          <input value={settings.name} placeholder="e.g. Sam" onChange={(e) => actions.setSettings({ name: e.target.value })} />
        </label>
        <div className="field">
          <span>Units</span>
          <div className="segmented">
            {(["us", "metric"] as const).map((u) => (
              <button key={u} className={settings.units === u ? "on" : ""} onClick={() => actions.setSettings({ units: u })}>{u === "us" ? "US (cups, oz)" : "Metric (g, ml)"}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Theme</span>
          <div className="segmented">
            {(["system", "light", "dark"] as const).map((t) => (
              <button key={t} className={settings.theme === t ? "on" : ""} onClick={() => actions.setSettings({ theme: t })}>{t === "system" ? "Auto" : t === "light" ? "☀️ Light" : "🌙 Dark"}</button>
            ))}
          </div>
        </div>
        {(needsCode || settings.accessCode) && (
          <label className="field">
            <span>AI access code (from whoever runs this kitchen)</span>
            <input type="password" autoComplete="off" value={settings.accessCode} placeholder="••••••" onChange={(e) => actions.setSettings({ accessCode: e.target.value })} />
          </label>
        )}
        <label className="toggle-row">
          <input type="checkbox" checked={settings.sound} onChange={(e) => actions.setSettings({ sound: e.target.checked })} />
          <span>Playful sounds (timer alarms always ring)</span>
        </label>
        <DataSection />
        <button className="btn btn-primary wide" onClick={onClose}>Done</button>
        <p className="center small" style={{ marginTop: 12 }}><a href="/">About Pantry Alchemist & install the app →</a></p>
      </div>
    </div>
  );
}

export default function App() {
  useTheme();
  const route = useHashRoute();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, arg] = route;

  const { recipe, loading } = useRecipe(view === "cook" || view === "recipe" ? arg : undefined);

  if (view === "print") return <PrintCookbook />;
  if (view === "cook" && recipe) return <><CookMode recipe={recipe} servings={Number(route[2]) || undefined} /><Toasts /></>;

  let body;
  switch (view) {
    case "recipes": body = <RecipesView />; break;
    case "search": body = <SearchView />; break;
    case "cook":
    case "recipe":
      body = recipe ? <RecipeDetail recipe={recipe} />
        : loading ? <Cauldron label="Fetching that recipe…" />
        : <p className="empty">That recipe has vanished like steam. <a href="#/search">Search for another</a></p>;
      break;
    case "play": body = <PlayView tab={arg} />; break;
    case "cookbook": body = <CookbookView />; break;
    case "list": body = <ShoppingView />; break;
    default: body = <PantryView />;
  }
  if (TABS.some((t) => t.id === view)) lastTab = view;
  const active = view === "recipe" ? lastTab : view;

  return (
    <div className="app">
      <header className="topbar">
        <a href="#/pantry" className="brand" aria-label="Pantry Alchemist home">
          <img src="/favicon.svg" alt="" width="32" height="32" style={{ borderRadius: 9 }} />
          <span className="display">Pantry <em>Alchemist</em></span>
        </a>
        <button className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
          <Icon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </button>
      </header>
      <main className="main" key={route.join("/")}>{view !== "recipe" && <ResumeBanner />}{body}</main>
      <TimerPill />
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <a key={t.id} href={`#/${t.id}`} className={active === t.id ? "active" : ""} aria-current={active === t.id ? "page" : undefined}>
            <Icon d={t.icon} />
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
      <Toasts />
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
