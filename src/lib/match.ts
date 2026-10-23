import { INGREDIENT_MAP, SUBSTITUTIONS } from "../data/ingredients.ts";
import type { Mood, Recipe, RecipeIngredient } from "./types.ts";

export interface Swap {
  missing: RecipeIngredient;
  use: string[];
  note: string;
}

export interface Match {
  recipe: Recipe;
  have: RecipeIngredient[];
  missing: RecipeIngredient[];
  swaps: Swap[];
  /** Missing items that no swap covers: what you'd actually have to buy. */
  needToBuy: RecipeIngredient[];
  required: number;
  haveCount: number;
}

const ALWAYS_HAVE = /^(water|ice|hot water|cold water)$/i;
const MEAT_WORDS = /\b(chicken|beef|pork|bacon|ham|sausage|turkey|lamb|steak|prosciutto|chorizo|pepperoni|salami)\b/i;
const FISH_WORDS = /\b(fish|salmon|tuna|shrimp|prawn|anchov|cod|crab)\w*/i;
const ANIMAL_WORDS = /\b(milk|butter|cheese|cream|yogurt|egg|honey|parmesan|cheddar|mozzarella|feta|ghee|mayo)\w*/i;

export function isRequired(i: RecipeIngredient) {
  return !i.optional && !ALWAYS_HAVE.test(i.name);
}

export function hasIngredient(i: RecipeIngredient, pantry: Set<string>) {
  if (ALWAYS_HAVE.test(i.name)) return true;
  return !!i.ref && pantry.has(i.ref);
}

export function matchRecipe(recipe: Recipe, pantry: Set<string>): Match {
  const have: RecipeIngredient[] = [];
  const missing: RecipeIngredient[] = [];
  for (const ing of recipe.ingredients) {
    if (ALWAYS_HAVE.test(ing.name)) continue;
    if (hasIngredient(ing, pantry)) have.push(ing);
    else if (!ing.optional) missing.push(ing);
  }
  const swaps: Swap[] = [];
  const needToBuy: RecipeIngredient[] = [];
  for (const m of missing) {
    const option = m.ref ? SUBSTITUTIONS[m.ref]?.find((s) => s.use.every((u) => pantry.has(u))) : undefined;
    if (option) swaps.push({ missing: m, ...option });
    else needToBuy.push(m);
  }
  const required = recipe.ingredients.filter(isRequired).length;
  return { recipe, have, missing, swaps, needToBuy, required, haveCount: required - missing.length };
}

export interface Diet {
  vegetarian: boolean;
  vegan: boolean;
  noMeat: boolean;
}

export function dietOf(recipe: Recipe): Diet {
  let meat = false, fish = false, animal = false, unknownAnimal = false;
  for (const ing of recipe.ingredients) {
    if (ing.optional) continue; // optional add-ins (bacon on top) don't decide the diet
    const cat = ing.ref ? INGREDIENT_MAP.get(ing.ref) : undefined;
    if (cat) {
      if (cat.animal === "meat") meat = true;
      else if (cat.animal === "fish") fish = true;
      else if (cat.animal) animal = true;
    } else {
      if (MEAT_WORDS.test(ing.name)) meat = true;
      else if (FISH_WORDS.test(ing.name)) fish = true;
      else if (ANIMAL_WORDS.test(ing.name) && !/plant|oat|soy|almond|coconut|vegan/i.test(ing.name)) unknownAnimal = true;
    }
  }
  const claimed = recipe.claimedDiet;
  const vegetarian = !meat && !fish && (claimed ? claimed.vegetarian || !unknownAnimal : true);
  const vegan = vegetarian && !animal && !unknownAnimal && (claimed ? claimed.vegan : true);
  return { vegetarian, vegan, noMeat: !meat };
}

export type TimeFilter = "any" | 10 | 20 | 30;
export type DietFilter = "any" | "vegetarian" | "vegan" | "noMeat";
export type EquipFilter = "any" | "stovetop" | "microwave" | "onePot" | "noOven";

export interface Filters {
  time: TimeFilter;
  diet: DietFilter;
  equipment: EquipFilter;
  cuisine: string; // "any" or a cuisine family
  mood: Mood | null;
  makeableOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = { time: "any", diet: "any", equipment: "any", cuisine: "any", mood: null, makeableOnly: false };

/** "Chinese-inspired" and "Chinese" are the same family for filtering. */
export const cuisineFamily = (c: string) => c.split(/[-\s]/)[0];

export function passesFilters(r: Recipe, f: Filters): boolean {
  if (f.time !== "any" && r.time > f.time) return false;
  if (f.diet !== "any" && !dietOf(r)[f.diet]) return false;
  const eq = new Set(r.equipment);
  switch (f.equipment) {
    case "stovetop":
      if (eq.has("oven") || eq.has("microwave") || !eq.has("stovetop")) return false;
      break;
    case "microwave":
      if (!r.equipment.every((e) => e === "microwave" || e === "noCook")) return false;
      break;
    case "onePot":
      if (!eq.has("onePot")) return false;
      break;
    case "noOven":
      if (eq.has("oven")) return false;
      break;
  }
  if (f.cuisine !== "any" && cuisineFamily(r.cuisine) !== f.cuisine) return false;
  return true;
}

const MOOD_TIEBREAK: Record<Mood, (r: Recipe) => number> = {
  lazy: (r) => r.time + (r.difficulty === "easy" ? 0 : 20) + r.steps.length * 2,
  broke: (r) => r.ingredients.filter(isRequired).length * 3,
  energy: (r) => (r.ingredients.some((i) => ["eggs", "chicken_breast", "chicken_thigh", "tofu", "black_beans", "chickpeas", "lentils", "greek_yogurt", "tuna", "peanut_butter", "salmon", "shrimp"].includes(i.ref ?? "")) ? 0 : 30) + r.time / 2,
  cozy: (r) => (r.equipment.includes("onePot") ? 0 : 10) - r.time / 4,
  impress: (r) => (r.difficulty === "easy" ? 15 : 0) - r.steps.length,
};

/** Fewest things to buy first, then fewest swaps, then mood fit, then fastest. */
export function rankRecipes(recipes: Recipe[], pantry: Set<string>, f: Filters): Match[] {
  return recipes
    .filter((r) => passesFilters(r, f))
    .map((r) => matchRecipe(r, pantry))
    .filter((m) => !f.makeableOnly || m.needToBuy.length === 0)
    .sort((a, b) => {
      const buy = a.needToBuy.length - b.needToBuy.length;
      if (buy) return buy;
      const miss = a.missing.length - b.missing.length;
      if (miss) return miss;
      if (f.mood) {
        const am = a.recipe.moods.includes(f.mood) ? 0 : 1;
        const bm = b.recipe.moods.includes(f.mood) ? 0 : 1;
        if (am !== bm) return am - bm;
        const t = MOOD_TIEBREAK[f.mood](a.recipe) - MOOD_TIEBREAK[f.mood](b.recipe);
        if (t) return t;
      }
      return a.recipe.time - b.recipe.time;
    });
}

/** Recipes that use the most of a given set of (leftover / chaos) ingredients. */
export function recipesUsing(recipes: Recipe[], focus: string[], pantry: Set<string>): Match[] {
  const focusSet = new Set(focus);
  const merged = new Set([...pantry, ...focus]);
  return recipes
    .map((r) => ({ m: matchRecipe(r, merged), uses: r.ingredients.filter((i) => i.ref && focusSet.has(i.ref)).length }))
    .filter((x) => x.uses > 0)
    .sort((a, b) => b.uses - a.uses || a.m.needToBuy.length - b.m.needToBuy.length || a.m.recipe.time - b.m.recipe.time)
    .map((x) => x.m);
}
