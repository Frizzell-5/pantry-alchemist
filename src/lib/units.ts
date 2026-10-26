import { INGREDIENT_MAP } from "../data/ingredients.ts";
import type { Recipe, RecipeIngredient, Step, Unit } from "./types.ts";

export type UnitSystem = "us" | "metric";

const TSP_PER: Partial<Record<Unit, number>> = { tsp: 1, tbsp: 3, cup: 48 };
const ML_PER_TSP = 4.93;
const G_PER: Partial<Record<Unit, number>> = { g: 1, kg: 1000, oz: 28.35, lb: 453.6 };
/** Grams per US cup, so metric mode can say "185 g rice" instead of "240 ml rice". */
const DENSITY: Record<string, number> = {
  rice: 185, quinoa: 170, couscous: 175, oats: 90, flour: 125, sugar: 200, brown_sugar: 210,
  cocoa: 85, cheddar: 113, mozzarella: 113, parmesan: 90, feta: 150, short_pasta: 100,
  frozen_peas: 140, frozen_veg: 135, frozen_corn: 140, canned_corn: 165, broccoli: 90,
  berries: 145, frozen_berries: 140, chocolate_chips: 170, breadcrumbs: 110, mushroom: 70,
  greek_yogurt: 245, sour_cream: 230, cream_cheese: 230, peanut_butter: 255, spinach: 30,
};

/** Items where a fractional amount makes no sense (½ egg, ⅓ tortilla). */
const STRICT_WHOLE_UNITS: Unit[] = ["clove", "slice", "pack", "stalk"];

const FRACTIONS: [number, string][] = [
  [0, ""], [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [1 / 2, "½"], [2 / 3, "⅔"], [3 / 4, "¾"], [1, ""],
];

/** Round to the nearest kitchen-friendly fraction and render it ("1½", "⅔"). */
export function friendly(value: number, allowEighths = false): string {
  const whole = Math.floor(value);
  const frac = value - whole;
  let best = FRACTIONS[0];
  for (const f of FRACTIONS) {
    if (!allowEighths && f[0] === 1 / 8) continue;
    if (Math.abs(frac - f[0]) < Math.abs(frac - best[0])) best = f;
  }
  const w = best[0] === 1 ? whole + 1 : whole;
  if (w === 0 && best[1] === "") return allowEighths ? "⅛" : "¼";
  return `${w || ""}${best[1]}` || "0";
}

const roundTo = (v: number, step: number) => Math.max(step, Math.round(v / step) * step);

function roundGrams(g: number): string {
  if (g >= 1000) return `${(Math.round(g / 100) / 10).toString()} kg`;
  if (g < 50) return `${roundTo(g, 5)} g`;
  if (g < 500) return `${roundTo(g, 10)} g`;
  return `${roundTo(g, 25)} g`;
}

function roundMl(ml: number): string {
  if (ml >= 1000) return `${(Math.round(ml / 100) / 10).toString()} l`;
  if (ml < 100) return `${roundTo(ml, 5)} ml`;
  return `${roundTo(ml, ml < 500 ? 10 : 25)} ml`;
}

function plural(unit: string, qty: number): string {
  if (qty <= 1 || unit === "tsp" || unit === "tbsp") return unit;
  if (unit.endsWith("ch") || unit.endsWith("sh")) return unit + "es";
  return unit + "s";
}

/** Volume in teaspoons → best US unit with friendly fractions. */
function usVolume(tsp: number): string {
  if (tsp >= 12) {
    const cups = tsp / 48;
    const s = friendly(cups);
    return `${s} ${cups > 1.1 ? "cups" : "cup"}`;
  }
  if (tsp >= 3) return `${friendly(tsp / 3)} tbsp`;
  return `${friendly(tsp, true)} tsp`;
}

export interface FormattedAmount {
  /** "2", "½ cup", "200 g"; empty when the amount is "to taste". */
  qty: string;
  name: string;
  /** Full phrase for ingredient lists: "2 cloves garlic". */
  text: string;
}

export function formatIngredient(ing: RecipeIngredient, factor: number, system: UnitSystem): FormattedAmount {
  const cat = ing.ref ? INGREDIENT_MAP.get(ing.ref) : undefined;
  let name = ing.name;
  if (ing.amount == null || ing.unit === "to taste") {
    return { qty: "", name, text: ing.note ? `${name} (${ing.note.toLowerCase()})` : `${name}, to taste` };
  }
  const v = ing.amount * factor;
  let qty: string;

  if (ing.unit === "whole") {
    // Produce can be halved ("½ onion"); eggs, tortillas, sausages can't.
    const halvable = cat?.category === "produce";
    const n = halvable && v < 3 ? roundTo(v, v < 1 ? 0.25 : 0.5) : Math.max(1, Math.round(v));
    qty = halvable ? friendly(n) : String(n);
    if (n <= 1 && cat?.singular) name = cat.singular;
    else if (n <= 1 && !cat && name.endsWith("s")) name = name.replace(/s$/, "");
  } else if (STRICT_WHOLE_UNITS.includes(ing.unit)) {
    const n = Math.max(1, Math.round(v));
    qty = `${n} ${plural(ing.unit, n)}`;
  } else if (ing.unit === "can" || ing.unit === "handful" || ing.unit === "bunch" || ing.unit === "pinch") {
    const n = roundTo(v, 0.5);
    qty = `${friendly(n)} ${plural(ing.unit, n)}`;
    if (ing.unit === "can") name = name.replace(/^canned /, ""); // "1 can tomatoes", not "1 can canned tomatoes"
  } else if (TSP_PER[ing.unit]) {
    const tsp = v * TSP_PER[ing.unit]!;
    if (system === "us" || tsp < 12) {
      qty = usVolume(tsp); // metric kitchens use spoons too
    } else if (ing.ref && DENSITY[ing.ref]) {
      qty = roundGrams((tsp / 48) * DENSITY[ing.ref]);
    } else {
      qty = roundMl(tsp * ML_PER_TSP);
    }
  } else if (ing.unit === "ml" || ing.unit === "l") {
    const ml = v * (ing.unit === "l" ? 1000 : 1);
    qty = system === "metric" ? roundMl(ml) : usVolume(ml / ML_PER_TSP);
  } else if (G_PER[ing.unit]) {
    const g = v * G_PER[ing.unit]!;
    if (system === "metric") qty = roundGrams(g);
    else if (g >= 450) qty = `${friendly(g / 453.6)} lb`;
    else qty = `${Math.max(0.5, Math.round((g / 28.35) * 2) / 2)} oz`;
  } else {
    qty = `${friendly(v)} ${ing.unit}`;
  }
  return { qty, name, text: `${qty} ${name}` };
}

/** Converts oven temperatures written in °F inside step text. */
export function convertTemps(text: string, system: UnitSystem): string {
  if (system === "us") return text;
  return text.replace(/(\d{2,3})\s?°F/g, (_, f) => `${Math.round(((Number(f) - 32) * 5) / 9 / 5) * 5}°C`);
}

export type StepPart = string | { key: string; text: string; optional?: boolean };

/** Splits step text into plain strings and inline ingredient amounts. */
export function renderStep(step: Step, recipe: Recipe, factor: number, system: UnitSystem): StepPart[] {
  const byKey = new Map(recipe.ingredients.map((i) => [i.key, i]));
  const parts: StepPart[] = [];
  const re = /\[\[([a-z0-9_]+)\]\]/g;
  const text = convertTemps(step.text, system);
  let last = 0;
  for (let m; (m = re.exec(text)); ) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const ing = byKey.get(m[1]);
    if (ing) {
      const f = formatIngredient(ing, factor, system);
      parts.push({ key: ing.key, text: f.qty ? f.text : f.name, optional: ing.optional });
    } else {
      parts.push(m[1].replace(/_/g, " "));
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export const stepPlainText = (parts: StepPart[]) => parts.map((p) => (typeof p === "string" ? p : p.text)).join("");
