import { useSyncExternalStore } from "react";
import { INGREDIENTS, STARTER_PANTRY } from "../data/ingredients.ts";
import { SEED_RECIPES } from "../data/recipes.ts";
import { ACHIEVEMENTS } from "./achievements.ts";
import { DEFAULT_FILTERS, type Filters } from "./match.ts";
import type { CookbookEntry, CookLog, Ingredient, PantryItem, Recipe } from "./types.ts";
import type { UnitSystem } from "./units.ts";

export interface Settings {
  name: string;
  cookbookTitle: string;
  units: UnitSystem;
  theme: "system" | "light" | "dark";
  sound: boolean;
  /** Only needed when the server sets ACCESS_CODE (public deployments). */
  accessCode: string;
}

export interface Stats {
  rouletteSpins: number;
  chaosDishes: number;
  aiGenerated: number;
  leftoverRemixes: number;
}

export interface State {
  version: 1;
  pantry: Record<string, PantryItem>;
  customIngredients: Ingredient[];
  aiRecipes: Recipe[];
  cookbook: Record<string, CookbookEntry>;
  starred: string[];
  shoppingChecked: string[];
  cookLog: CookLog[];
  achievements: Record<string, number>;
  stats: Stats;
  settings: Settings;
  filters: Filters;
}

const KEY = "pantry-alchemist:v1";

function initial(): State {
  const now = Date.now();
  return {
    version: 1,
    pantry: Object.fromEntries(STARTER_PANTRY.map((id) => [id, { id, addedAt: now }])),
    customIngredients: [],
    aiRecipes: [],
    cookbook: {},
    starred: [],
    shoppingChecked: [],
    cookLog: [],
    achievements: {},
    stats: { rouletteSpins: 0, chaosDishes: 0, aiGenerated: 0, leftoverRemixes: 0 },
    settings: { name: "", cookbookTitle: "Recipes From My Tiny Kitchen", units: "us", theme: "system", sound: true, accessCode: "" },
    filters: DEFAULT_FILTERS,
  };
}

function load(): State {
  const base = initial();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<State>;
    return {
      ...base,
      ...saved,
      stats: { ...base.stats, ...saved.stats },
      settings: { ...base.settings, ...saved.settings },
      filters: { ...base.filters, ...saved.filters },
    };
  } catch {
    return base;
  }
}

let state: State = load();
const listeners = new Set<() => void>();

type Toast = { id: number; kind: "achievement" | "info" | "error"; title: string; body?: string; emoji?: string };
let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
let toastSeq = 0;

export function toast(t: Omit<Toast, "id">, ms = 4200) {
  const id = ++toastSeq;
  toasts = [...toasts, { ...t, id }];
  toastListeners.forEach((l) => l());
  setTimeout(() => dismissToast(id), ms);
}
export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  toastListeners.forEach((l) => l());
}
export const useToasts = () =>
  useSyncExternalStore((cb) => (toastListeners.add(cb), () => toastListeners.delete(cb)), () => toasts);

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private mode or full storage: the app keeps working for this session.
  }
}

function checkAchievements(next: State): State {
  const unlocked = { ...next.achievements };
  let changed = false;
  for (const a of ACHIEVEMENTS) {
    if (!unlocked[a.id] && a.check(next)) {
      unlocked[a.id] = Date.now();
      changed = true;
      toast({ kind: "achievement", title: a.title, body: a.description, emoji: a.emoji }, 5200);
    }
  }
  return changed ? { ...next, achievements: unlocked } : next;
}

export function update(fn: (s: State) => State) {
  state = checkAchievements(fn(state));
  persist();
  listeners.forEach((l) => l());
}

export const getState = () => state;
export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => select(state),
  );
}

// ---------- derived lookups ----------

let cachedAll: { ai: Recipe[]; all: Recipe[] } | null = null;
export function allRecipes(s: State = state): Recipe[] {
  if (cachedAll?.ai !== s.aiRecipes) cachedAll = { ai: s.aiRecipes, all: [...SEED_RECIPES, ...s.aiRecipes] };
  return cachedAll.all;
}
export const findRecipe = (id: string, s: State = state) => allRecipes(s).find((r) => r.id === id);

let cachedCatalog: { custom: Ingredient[]; all: Ingredient[] } | null = null;
export function catalog(s: State = state): Ingredient[] {
  if (cachedCatalog?.custom !== s.customIngredients) cachedCatalog = { custom: s.customIngredients, all: [...INGREDIENTS, ...s.customIngredients] };
  return cachedCatalog.all;
}
export const ingredientLabel = (id: string, s: State = state) => catalog(s).find((i) => i.id === id)?.label ?? id.replace(/^custom_/, "").replace(/_/g, " ");

let cachedPantrySet: { p: State["pantry"]; set: Set<string> } | null = null;
export function pantrySet(s: State = state): Set<string> {
  if (cachedPantrySet?.p !== s.pantry) cachedPantrySet = { p: s.pantry, set: new Set(Object.keys(s.pantry)) };
  return cachedPantrySet.set;
}

// ---------- actions ----------

export const actions = {
  togglePantry(id: string) {
    update((s) => {
      const pantry = { ...s.pantry };
      if (pantry[id]) delete pantry[id];
      else pantry[id] = { id, addedAt: Date.now() };
      return { ...s, pantry };
    });
  },
  setPantry(ids: string[], have: boolean) {
    update((s) => {
      const pantry = { ...s.pantry };
      for (const id of ids) {
        if (have) pantry[id] ??= { id, addedAt: Date.now() };
        else delete pantry[id];
      }
      return { ...s, pantry };
    });
  },
  toggleLow(id: string) {
    update((s) => {
      const item = s.pantry[id];
      if (!item) return s;
      return { ...s, pantry: { ...s.pantry, [id]: { ...item, low: !item.low } } };
    });
  },
  clearPantry() {
    update((s) => ({ ...s, pantry: {} }));
  },
  addCustomIngredient(label: string, category: Ingredient["category"]): string {
    const clean = label.trim().replace(/\s+/g, " ");
    const existing = catalog().find((i) => i.label.toLowerCase() === clean.toLowerCase());
    if (existing) {
      actions.setPantry([existing.id], true);
      return existing.id;
    }
    const id = "custom_" + clean.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    update((s) => ({
      ...s,
      customIngredients: [...s.customIngredients, { id, label: clean[0].toUpperCase() + clean.slice(1), category, countable: false, custom: true }],
      pantry: { ...s.pantry, [id]: { id, addedAt: Date.now() } },
    }));
    return id;
  },
  removeCustomIngredient(id: string) {
    update((s) => {
      const pantry = { ...s.pantry };
      delete pantry[id];
      return { ...s, pantry, customIngredients: s.customIngredients.filter((i) => i.id !== id) };
    });
  },
  addAiRecipes(recipes: Recipe[], kind: "ai" | "chaos" | "remix" | "offline") {
    update((s) => {
      // Keep the 40 most recent unsaved generations plus everything saved.
      const merged = [...recipes, ...s.aiRecipes];
      const kept = merged.filter((r, i) => i < 40 || s.cookbook[r.id] || s.starred.includes(r.id));
      const stats = { ...s.stats };
      if (kind === "chaos") stats.chaosDishes++;
      else if (kind === "remix") stats.leftoverRemixes++;
      if (kind !== "offline") stats.aiGenerated += recipes.length;
      return { ...s, aiRecipes: kept, stats };
    });
  },
  discardAiRecipe(id: string) {
    update((s) => ({ ...s, aiRecipes: s.aiRecipes.filter((r) => r.id !== id), starred: s.starred.filter((x) => x !== id) }));
  },
  toggleStar(id: string) {
    update((s) => ({ ...s, starred: s.starred.includes(id) ? s.starred.filter((x) => x !== id) : [...s.starred, id] }));
  },
  saveToCookbook(id: string) {
    update((s) => (s.cookbook[id] ? s : { ...s, cookbook: { ...s.cookbook, [id]: { recipeId: id, savedAt: Date.now(), notes: "", rating: 0, cookedCount: 0 } } }));
  },
  removeFromCookbook(id: string) {
    update((s) => {
      const cookbook = { ...s.cookbook };
      delete cookbook[id];
      return { ...s, cookbook };
    });
  },
  updateEntry(id: string, patch: Partial<CookbookEntry>) {
    update((s) => {
      const entry = s.cookbook[id] ?? { recipeId: id, savedAt: Date.now(), notes: "", rating: 0, cookedCount: 0 };
      return { ...s, cookbook: { ...s.cookbook, [id]: { ...entry, ...patch } } };
    });
  },
  logCook(recipe: Recipe) {
    update((s) => {
      const log: CookLog = {
        recipeId: recipe.id,
        at: Date.now(),
        equipment: recipe.equipment,
        ingredientRefs: recipe.ingredients.filter((i) => i.ref && s.pantry[i.ref]).map((i) => i.ref!),
        source: recipe.source,
        mealType: recipe.mealType,
      };
      const entry = s.cookbook[recipe.id];
      const cookbook = entry ? { ...s.cookbook, [recipe.id]: { ...entry, cookedCount: entry.cookedCount + 1, lastCooked: Date.now() } } : s.cookbook;
      return { ...s, cookLog: [...s.cookLog, log], cookbook };
    });
  },
  bumpStat(key: keyof Stats) {
    update((s) => ({ ...s, stats: { ...s.stats, [key]: s.stats[key] + 1 } }));
  },
  setFilters(patch: Partial<Filters>) {
    update((s) => ({ ...s, filters: { ...s.filters, ...patch } }));
  },
  setSettings(patch: Partial<Settings>) {
    update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  },
  toggleShoppingChecked(key: string) {
    update((s) => ({ ...s, shoppingChecked: s.shoppingChecked.includes(key) ? s.shoppingChecked.filter((k) => k !== key) : [...s.shoppingChecked, key] }));
  },
  /** Bought items go into the pantry and running-low flags clear. */
  restockChecked(ids: string[]) {
    update((s) => {
      const pantry = { ...s.pantry };
      for (const id of ids) pantry[id] = { id, addedAt: pantry[id]?.addedAt ?? Date.now() };
      return { ...s, pantry, shoppingChecked: s.shoppingChecked.filter((k) => !ids.includes(k)) };
    });
  },
};
