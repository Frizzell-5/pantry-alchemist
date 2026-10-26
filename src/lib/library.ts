import { useSyncExternalStore } from "react";
import { INGREDIENTS } from "../data/ingredients.ts";
import type { Equipment, MealType, Mood, Recipe, RecipeIngredient, Step, Unit } from "./types.ts";

/**
 * The world recipe library: ~800 community dishes from TheMealDB (free, CORS-enabled),
 * normalized into our Recipe shape so pantry matching, scaling and cook mode all work.
 * The service worker caches the responses, so the library keeps working offline.
 */
const API = "https://www.themealdb.com/api/json/v1/1";
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
export const LIBRARY_PREFIX = "mdb-";
export const isLibraryId = (id: string) => id.startsWith(LIBRARY_PREFIX);

type RawMeal = Record<string, string | null>;

// ---------- ingredient name → pantry id ----------

const ALIASES: Record<string, string[]> = {
  salt: ["sea salt", "kosher salt", "table salt", "flaky sea salt", "coarse salt"],
  black_pepper: ["pepper", "ground black pepper", "black peppercorns", "white pepper", "peppercorns"],
  garlic: ["garlic clove", "garlic cloves", "minced garlic", "garlic paste"],
  onion: ["onions", "brown onion", "white onion", "yellow onion", "medium onion", "large onion"],
  red_onion: ["red onions"],
  olive_oil: ["extra virgin olive oil", "light olive oil"],
  vegetable_oil: ["oil", "sunflower oil", "rapeseed oil", "canola oil", "groundnut oil", "peanut oil", "corn oil", "cooking oil"],
  sesame_oil: ["sesame seed oil", "toasted sesame oil"],
  butter: ["unsalted butter", "salted butter", "melted butter", "softened butter"],
  sugar: ["caster sugar", "granulated sugar", "white sugar", "superfine sugar", "golden caster sugar"],
  brown_sugar: ["light brown sugar", "dark brown sugar", "muscovado sugar", "light muscovado sugar", "dark muscovado sugar", "soft brown sugar", "demerara sugar"],
  flour: ["plain flour", "all purpose flour", "all-purpose flour", "self-raising flour", "self raising flour", "strong white bread flour", "bread flour"],
  milk: ["whole milk", "semi-skimmed milk", "skimmed milk", "full fat milk"],
  eggs: ["egg", "egg yolks", "egg yolk", "egg white", "egg whites", "free-range egg", "free-range eggs", "large eggs", "beaten egg"],
  potato: ["potatoes", "baby new potatoes", "new potatoes", "floury potatoes", "waxy potatoes", "maris piper potatoes", "russet potatoes", "king edward potatoes"],
  sweet_potato: ["sweet potatoes"],
  carrot: ["carrots"],
  tomato: ["tomatoes", "plum tomatoes", "vine tomatoes"],
  cherry_tomato: ["cherry tomatoes"],
  canned_tomatoes: ["chopped tomatoes", "tinned tomatos", "tinned tomatoes", "canned tomatoes", "can of chopped tomatoes", "diced tomatoes", "crushed tomatoes", "passata"],
  tomato_paste: ["tomato puree", "tomato paste", "tomato purée"],
  bell_pepper: ["red pepper", "green pepper", "yellow pepper", "orange pepper", "red bell pepper", "green bell pepper", "bell peppers", "peppers"],
  jalapeno: ["jalapeños", "jalapenos", "jalapeno pepper"],
  cilantro: ["coriander", "coriander leaves", "fresh coriander", "chopped coriander"],
  parsley: ["flat leaf parsley", "fresh parsley", "parsley leaves"],
  basil: ["basil leaves", "fresh basil"],
  spinach: ["baby spinach", "spinach leaves"],
  cabbage: ["white cabbage", "red cabbage", "savoy cabbage", "green cabbage"],
  zucchini: ["courgette", "courgettes"],
  mushroom: ["mushrooms", "chestnut mushrooms", "button mushrooms", "white mushrooms"],
  cucumber: ["cucumbers"],
  avocado: ["avocados"],
  green_onion: ["spring onions", "spring onion", "scallions", "scallion", "green onions"],
  lemon: ["lemons", "lemon juice", "lemon zest", "juice of 1 lemon"],
  lime: ["limes", "lime juice", "lime zest"],
  apple: ["apples", "bramley apples", "granny smith apples"],
  banana: ["bananas"],
  berries: ["raspberries", "strawberries", "blueberries", "blackberries", "mixed berries"],
  ginger: ["fresh ginger", "root ginger", "ginger root"],
  rice: ["basmati rice", "jasmine rice", "long grain rice", "white rice", "arborio rice", "risotto rice", "brown rice", "sushi rice", "paella rice"],
  pasta: ["spaghetti", "linguine", "tagliatelle", "fettuccine", "linguine pasta", "spaghetti pasta"],
  short_pasta: ["penne", "penne rigate", "macaroni", "rigatoni", "fusilli", "farfalle", "pasta"],
  rice_noodles: ["rice vermicelli", "rice stick noodles"],
  bread: ["white bread", "sourdough", "sourdough bread", "baguette", "bread rolls", "crusty bread", "brown bread"],
  tortilla: ["tortillas", "flour tortilla", "flour tortillas", "corn tortillas", "tortilla wraps"],
  pita: ["pita bread", "pitta bread"],
  oats: ["rolled oats", "porridge oats", "oatmeal"],
  breadcrumbs: ["panko", "panko bread crumbs", "panko breadcrumbs", "bread crumbs"],
  cheddar: ["cheddar cheese", "cheese", "mature cheddar", "grated cheese"],
  mozzarella: ["mozzarella cheese", "mozzarella balls"],
  parmesan: ["parmesan cheese", "parmigiano-reggiano", "grated parmesan"],
  feta: ["feta cheese"],
  greek_yogurt: ["greek yogurt", "yogurt", "natural yogurt", "plain yogurt", "greek yoghurt", "yoghurt"],
  heavy_cream: ["double cream", "whipping cream", "single cream", "cream", "thickened cream"],
  chicken_breast: ["chicken breasts", "chicken", "chicken breast fillets", "skinless chicken breasts"],
  chicken_thigh: ["chicken thighs", "boneless chicken thighs", "chicken thigh fillets"],
  ground_beef: ["minced beef", "beef mince", "ground beef", "lean minced beef"],
  ground_turkey: ["turkey mince", "minced turkey"],
  bacon: ["smoked streaky bacon", "streaky bacon", "bacon rashers", "back bacon"],
  sausage: ["sausages", "pork sausages", "chorizo"],
  salmon: ["salmon fillets", "salmon fillet"],
  shrimp: ["prawns", "raw king prawns", "king prawns", "tiger prawns", "shrimps", "raw prawns"],
  kidney_beans: ["red kidney beans"],
  lentils: ["red lentils", "green lentils", "brown lentils", "puy lentils"],
  canned_corn: ["sweetcorn", "corn", "corn kernels"],
  chicken_broth: ["chicken stock", "chicken stock cube", "chicken broth"],
  veg_broth: ["vegetable stock", "vegetable stock cube", "vegetable broth"],
  cumin: ["ground cumin", "cumin seeds", "cumin seed"],
  chili_powder: ["chilli powder", "chili powder"],
  chili_flakes: ["chilli flakes", "red pepper flakes", "red chilli flakes", "crushed red pepper"],
  cinnamon: ["ground cinnamon", "cinnamon stick", "cinnamon sticks"],
  oregano: ["dried oregano"],
  italian_seasoning: ["mixed herbs", "dried mixed herbs"],
  soy_sauce: ["light soy sauce", "dark soy sauce", "tamari"],
  hot_sauce: ["hotsauce", "tabasco sauce", "tabasco"],
  ketchup: ["tomato ketchup"],
  pasta_sauce: ["tomato sauce", "marinara sauce", "pasta sauce"],
  mustard: ["dijon mustard", "english mustard", "wholegrain mustard", "yellow mustard", "mustard powder"],
  mayo: ["mayonnaise"],
  honey: ["clear honey", "runny honey"],
  vinegar: ["white vinegar", "white wine vinegar", "red wine vinegar", "apple cider vinegar", "cider vinegar", "rice vinegar", "malt vinegar"],
  balsamic: ["balsamic vinegar"],
  frozen_peas: ["peas", "garden peas", "petits pois"],
  baking_soda: ["bicarbonate of soda", "bicarbonate soda", "baking soda"],
  vanilla: ["vanilla extract", "vanilla essence", "vanilla pod"],
  cocoa: ["cocoa powder"],
  chocolate_chips: ["chocolate chips", "dark chocolate chips", "milk chocolate chips"],
  cornstarch: ["corn flour", "cornflour"],
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

let nameIndex: Map<string, string> | null = null;
function buildIndex(): Map<string, string> {
  const m = new Map<string, string>();
  for (const ing of INGREDIENTS) {
    m.set(norm(ing.label), ing.id);
    m.set(norm(ing.id.replace(/_/g, " ")), ing.id);
    if (ing.singular) m.set(norm(ing.singular), ing.id);
  }
  // Aliases win over the generic label match ("pasta" → short pasta, "pepper" → black pepper).
  for (const [id, names] of Object.entries(ALIASES)) for (const n of names) m.set(norm(n), id);
  return m;
}

/** Maps a free-text ingredient name to a pantry catalog id, if one fits. */
export function mapIngredient(name: string, extra: { id: string; label: string }[] = []): string | undefined {
  nameIndex ??= buildIndex();
  const n = norm(name);
  for (const c of extra) if (norm(c.label) === n) return c.id;
  const tries = [n, n.replace(/^(fresh|dried|large|small|medium|chopped|minced|ground|frozen|tinned|canned) /, ""), n.replace(/(es|s)$/, "")];
  for (const t of tries) {
    const hit = nameIndex.get(t);
    if (hit) return hit;
  }
  return undefined;
}

// ---------- measure strings ("2 tbs", "1/2 cup", "200g", "Juice of 1") ----------

const UNIT_WORDS: [RegExp, Unit][] = [
  [/^(g|gr|gram|grams|grammes)\b/, "g"],
  [/^(kg|kilo|kilos|kilograms?)\b/, "kg"],
  [/^(ml|millilitres?|milliliters?)\b/, "ml"],
  [/^(l|ltr|litres?|liters?)\b/, "l"],
  [/^(oz|ounces?)\b/, "oz"],
  [/^(lb|lbs|pounds?)\b/, "lb"],
  [/^(tsp|tsps|teaspoons?|t)\b/, "tsp"],
  [/^(tbsp|tbsps|tbs|tblsp|tbls|tbl|tablespoons?|tbspn)\b/, "tbsp"],
  [/^(cups?|c)\b/, "cup"],
  [/^(cloves?)\b/, "clove"],
  [/^(slices?)\b/, "slice"],
  [/^(cans?|tins?|tinned)\b/, "can"],
  [/^(pinch|pinches)\b/, "pinch"],
  [/^(handfuls?|handfull)\b/, "handful"],
  [/^(bunch|bunches)\b/, "bunch"],
  [/^(stalks?|sticks? of celery)\b/, "stalk"],
  [/^(packets?|packs?|bags?|packages?)\b/, "pack"],
];
const UNICODE_FRACTIONS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };

export function parseMeasure(raw: string): { amount: number | null; unit: Unit; note?: string } {
  let s = norm(raw).replace(/(\d)([a-z])/g, "$1 $2");
  if (!s) return { amount: null, unit: "to taste" };
  if (/^(to taste|season|seasoning|as needed|as required)/.test(s)) return { amount: null, unit: "to taste" };

  let amount: number | null = null;
  const q = s.match(/^(\d+)\s+(\d+)\/(\d+)|^(\d+)\/(\d+)|^(\d*[.,]?\d+)\s*([½¼¾⅓⅔⅛])?|^([½¼¾⅓⅔⅛])/);
  if (q) {
    if (q[1]) amount = Number(q[1]) + Number(q[2]) / Number(q[3]);
    else if (q[4]) amount = Number(q[4]) / Number(q[5]);
    else if (q[6]) amount = Number(q[6].replace(",", ".")) + (q[7] ? UNICODE_FRACTIONS[q[7]] : 0);
    else if (q[8]) amount = UNICODE_FRACTIONS[q[8]];
    s = s.slice(q[0].length).trim();
    s = s.replace(/^(-|to|–)\s*\d+([./]\d+)?\s*/, ""); // "2-3 tbsp" → take the low end
  }
  if (amount != null && !(amount > 0 && amount < 10000)) amount = null;
  s = s.replace(/^\(.*?\)\s*/, ""); // "1 (400g) can" → "1 can"

  for (const [re, unit] of UNIT_WORDS) {
    const m = s.match(re);
    if (m) {
      const rest = s.slice(m[0].length).replace(/^(of|\.)\s*/, "").replace(/^\(.*?\)\s*/, "").trim();
      if (amount == null) {
        if (unit === "pinch" || unit === "handful" || unit === "bunch") amount = 1;
        else return { amount: null, unit: "to taste", note: raw.trim() };
      }
      return { amount, unit, note: rest || undefined };
    }
  }
  if (amount != null) return { amount, unit: "whole", note: s.replace(/^\(.*?\)\s*/, "") || undefined };
  return { amount: null, unit: "to taste", note: raw.trim() };
}

// ---------- instructions → steps with timers ----------

const TIMER_VERBS = ["bake", "roast", "simmer", "boil", "fry", "rest", "chill", "marinate", "cook", "grill", "steam", "prove", "rise", "soak", "stew", "leave", "cool"];

function timerFor(text: string): Step["timer"] {
  let best = 0;
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(minutes?|mins?|hours?|hrs?)\b/gi)) {
    const n = Number(m[2] ?? m[1]);
    const secs = /^h/i.test(m[3]) ? n * 3600 : n * 60;
    best = Math.max(best, secs);
  }
  if (best < 60 || best > 6 * 3600) return undefined;
  const lower = text.toLowerCase();
  const verb = TIMER_VERBS.find((v) => lower.includes(v));
  return { label: verb ? verb[0].toUpperCase() + verb.slice(1) : "Timer", seconds: Math.round(best) };
}

export function splitInstructions(raw: string): Step[] {
  let lines = raw
    .split(/\r?\n+/)
    .map((l) => l.replace(/^\s*(step\s*\d+[:.)]?|\d+[.)]|[-•▢*])\s*/i, "").trim())
    .filter((l) => l.length > 2 && !/^(step\s*)?\d+$/i.test(l));
  // A single wall of text reads badly in cook mode: break it into 1–2 sentence steps.
  if (lines.length <= 2 && raw.length > 450) {
    const sentences = lines.join(" ").match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? lines;
    lines = [];
    let buf = "";
    for (const s of sentences) {
      buf += s;
      if (buf.length > 140) (lines.push(buf.trim()), (buf = ""));
    }
    if (buf.trim()) lines.push(buf.trim());
  }
  return lines.map((text) => {
    const timer = timerFor(text);
    return timer ? { text, timer } : { text };
  });
}

// ---------- whole meal ----------

function mealTypeOf(category: string, title: string): MealType {
  if (category === "Breakfast" || /pancake|porridge|omelette|granola|breakfast/i.test(title)) return "breakfast";
  if (category === "Dessert") return "dessert";
  if (category === "Starter" || category === "Side") return /soup|salad|sandwich/i.test(title) ? "lunch" : "snack";
  return "dinner";
}

function equipmentOf(text: string): Equipment[] {
  const t = text.toLowerCase();
  const eq = new Set<Equipment>();
  if (/\boven\b|\bbake|\broast|gas mark|°c|°f|\d{3} ?(c|f)\b/.test(t)) eq.add("oven");
  if (/microwave/.test(t)) eq.add("microwave");
  if (/\bpan\b|\bpot\b|saucepan|skillet|\bwok\b|\bboil|\bfry|simmer|\bhob\b|\bheat\b|casserole/.test(t)) eq.add("stovetop");
  if (!eq.size) eq.add("noCook");
  return [...eq];
}

export function normalizeMeal(m: RawMeal, extra: { id: string; label: string }[] = []): Recipe {
  const title = (m.strMeal ?? "Untitled").trim();
  const category = m.strCategory ?? "";
  const area = m.strArea && m.strArea !== "Unknown" ? m.strArea : "World";
  const seen = new Set<string>();
  const ingredients: RecipeIngredient[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = (m[`strIngredient${i}`] ?? "").trim();
    if (!name) continue;
    let key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `item${i}`;
    while (seen.has(key)) key += "_2";
    seen.add(key);
    const measure = parseMeasure(m[`strMeasure${i}`] ?? "");
    ingredients.push({ key, ref: mapIngredient(name, extra), name: name.toLowerCase(), ...measure, note: measure.note });
  }
  const steps = splitInstructions(m.strInstructions ?? "");
  const waiting = steps.reduce((sum, s) => sum + (s.timer?.seconds ?? 0), 0) / 60;
  const time = Math.min(240, Math.max(10, Math.round((6 + ingredients.length + steps.length * 1.5 + waiting * 0.85) / 5) * 5));
  const difficulty = ingredients.length > 14 || steps.length > 12 ? "hard" : ingredients.length > 8 || steps.length > 6 ? "medium" : "easy";
  const moods: Mood[] = [];
  if (time <= 25 && steps.length <= 6) moods.push("lazy");
  if (ingredients.length <= 7) moods.push("broke");
  if (/soup|stew|curry|pie|casserole|chili|chowder|ragu|hotpot|braise|porridge/i.test(title)) moods.push("cozy");
  if (["Chicken", "Seafood", "Beef", "Lamb", "Goat"].includes(category) && time <= 45) moods.push("energy");
  if (difficulty !== "easy" || category === "Dessert") moods.push("impress");
  const tags = (m.strTags ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 3);

  return {
    id: LIBRARY_PREFIX + m.idMeal,
    title,
    description: `${area === "World" ? "A" : /^[AEIOU]/.test(area) ? `An ${area}` : `A ${area}`} ${category ? category.toLowerCase() + " " : ""}dish${tags.length ? ` · ${tags.join(", ").toLowerCase()}` : ""}.`,
    servings: 4,
    time,
    difficulty,
    mealType: mealTypeOf(category, title),
    cuisine: area,
    equipment: equipmentOf(m.strInstructions ?? ""),
    moods,
    ingredients,
    steps: steps.length ? steps : [{ text: "Combine everything and enjoy." }],
    tips: [],
    source: "library",
    claimedDiet: category === "Vegan" ? { vegetarian: true, vegan: true } : category === "Vegetarian" ? { vegetarian: true, vegan: false } : undefined,
    image: m.strMealThumb ?? undefined,
    video: m.strYoutube || undefined,
    sourceUrl: m.strSource || undefined,
    category,
    approxTime: true,
  };
}

// ---------- loading + store ----------

interface LibraryState {
  status: "idle" | "loading" | "ready" | "error";
  loaded: number;
  recipes: Recipe[];
}
let lib: LibraryState = { status: "idle", loaded: 0, recipes: [] };
const byId = new Map<string, Recipe>();
const listeners = new Set<() => void>();
const set = (patch: Partial<LibraryState>) => {
  lib = { ...lib, ...patch };
  listeners.forEach((l) => l());
};

export const getLibraryRecipe = (id: string) => byId.get(id);
export const useLibrary = () => useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => lib);

async function fetchMeals(url: string): Promise<RawMeal[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Library request failed (${res.status})`);
  const data = (await res.json()) as { meals: RawMeal[] | null };
  return data.meals ?? [];
}

let extraIngredients: () => { id: string; label: string }[] = () => [];
/** Lets the store share user-added ingredients without a circular import at load time. */
export const setExtraIngredients = (fn: typeof extraIngredients) => (extraIngredients = fn);

let loading: Promise<void> | null = null;
/** Loads the whole library (26 small requests, a few at a time). Safe to call repeatedly. */
export function loadLibrary(): Promise<void> {
  if (loading) return loading;
  set({ status: "loading", loaded: 0 });
  loading = (async () => {
    const queue = [...LETTERS];
    const all: Recipe[] = [];
    let failures = 0;
    const worker = async () => {
      for (let l; (l = queue.shift()); ) {
        try {
          for (const meal of await fetchMeals(`${API}/search.php?f=${l}`)) {
            const r = normalizeMeal(meal, extraIngredients());
            byId.set(r.id, r);
            all.push(r);
          }
        } catch {
          failures++;
        }
        set({ loaded: lib.loaded + 1 });
      }
    };
    await Promise.all(Array.from({ length: 5 }, worker));
    all.sort((a, b) => a.title.localeCompare(b.title));
    if (!all.length) {
      loading = null; // let the next visit retry
      set({ status: "error", recipes: [] });
    } else set({ status: failures ? "error" : "ready", recipes: all });
  })();
  return loading;
}

/** Fetches one dish by id (used when a saved link is opened before the library loads). */
export async function fetchLibraryRecipe(id: string): Promise<Recipe | undefined> {
  const hit = byId.get(id);
  if (hit) return hit;
  const [meal] = await fetchMeals(`${API}/lookup.php?i=${encodeURIComponent(id.slice(LIBRARY_PREFIX.length))}`);
  if (!meal) return undefined;
  const r = normalizeMeal(meal, extraIngredients());
  byId.set(r.id, r);
  return r;
}

/** Smaller image for cards (TheMealDB serves sized variants). */
export const thumb = (url: string, size: "small" | "medium" | "large" = "medium") => (/themealdb\.com/.test(url) ? `${url}/${size}` : url);

// ---------- search ----------

export interface SearchHit {
  recipe: Recipe;
  score: number;
}

/** Every word must match somewhere; title hits rank above cuisine, category and ingredient hits. */
export function searchRecipes(recipes: Recipe[], query: string): SearchHit[] {
  const q = norm(query);
  if (!q) return recipes.map((recipe) => ({ recipe, score: 0 }));
  // Each word matches in any simple singular form: "curries" → curry, "tomatoes" → tomato, "cookies" → cookie.
  const words = q.split(" ").filter(Boolean).map((w) => {
    if (w.length < 4) return [w];
    return [...new Set([w, w.replace(/ies$/, "y"), w.replace(/ies$/, "ie"), w.replace(/(?<=[osxz]|ch|sh)es$/, ""), w.replace(/(?<!s)s$/, "")])].filter((v) => v.length > 1);
  });
  const out: SearchHit[] = [];
  for (const recipe of recipes) {
    const title = norm(recipe.title);
    const cuisine = norm(recipe.cuisine);
    const cat = norm(`${recipe.category ?? ""} ${recipe.mealType}`);
    const ings = recipe.ingredients.map((i) => norm(i.name)).join(" | ");
    let score = 0;
    let all = true;
    const desc = norm(recipe.description);
    for (const forms of words) {
      const any = (text: string) => forms.some((f) => text.includes(f));
      const atWordStart = forms.some((f) => new RegExp(`(^|[^a-z])${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(title));
      const s = (any(title) ? (atWordStart ? 30 : 18) : 0)
        + (forms.some((f) => cuisine.startsWith(f)) ? 14 : 0)
        + (any(cat) ? 10 : 0)
        + (any(ings) ? 6 : 0)
        + (any(desc) ? 2 : 0);
      if (!s) {
        all = false;
        break;
      }
      score += s;
    }
    if (!all) continue;
    if (title === q) score += 100;
    else if (title.startsWith(q)) score += 40;
    else if (title.includes(q)) score += 20;
    out.push({ recipe, score });
  }
  return out.sort((a, b) => b.score - a.score);
}
