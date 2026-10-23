import { z } from "zod";
import { EQUIPMENT, MEAL_TYPES, MOODS, UNITS, type Recipe, type RecipeIngredient, type Step } from "./types.ts";

// The shape the model must return. Kept free of min/max constraints so it
// stays within what structured outputs supports; ranges are checked in
// validateAiRecipe() after parsing.
export const AiRecipeSchema = z.object({
  title: z.string(),
  description: z.string(),
  servings: z.number().int(),
  time_minutes: z.number().int(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  meal_type: z.enum(MEAL_TYPES),
  cuisine: z.string(),
  vegetarian: z.boolean(),
  vegan: z.boolean(),
  equipment: z.array(z.enum(EQUIPMENT)),
  moods: z.array(z.enum(MOODS)),
  ingredients: z.array(
    z.object({
      key: z.string(),
      pantry_id: z.string().nullable(),
      name: z.string(),
      amount: z.number().nullable(),
      unit: z.enum(UNITS),
      optional: z.boolean(),
      note: z.string().nullable(),
    }),
  ),
  steps: z.array(
    z.object({
      text: z.string(),
      timer_seconds: z.number().int().nullable(),
      timer_label: z.string().nullable(),
    }),
  ),
  tips: z.array(z.string()),
});

export const AiResponseSchema = z.object({ recipes: z.array(AiRecipeSchema) });

export type AiRecipe = z.infer<typeof AiRecipeSchema>;

export class RecipeValidationError extends Error {
  constructor(public issues: string[]) {
    super(`Recipe failed validation: ${issues.join("; ")}`);
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const keyify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "item";

/**
 * Checks ranges and cross-references, repairs what can be repaired safely
 * (unknown step tokens, out-of-range timers) and rejects the rest.
 */
export function validateAiRecipe(ai: AiRecipe, knownIds: Set<string>, source: Recipe["source"]): Recipe {
  const issues: string[] = [];
  const title = ai.title.trim();
  if (!title || title.length > 90) issues.push("title must be 1–90 characters");
  if (ai.servings < 1 || ai.servings > 12) issues.push("servings must be 1–12");
  if (ai.time_minutes < 1 || ai.time_minutes > 300) issues.push("time_minutes must be 1–300");
  if (ai.ingredients.length < 2 || ai.ingredients.length > 30) issues.push("need 2–30 ingredients");
  if (ai.steps.length < 1 || ai.steps.length > 20) issues.push("need 1–20 steps");

  const seen = new Set<string>();
  const ingredients: RecipeIngredient[] = ai.ingredients.map((i) => {
    let key = keyify(i.key || i.name);
    while (seen.has(key)) key += "_2";
    seen.add(key);
    if (!i.name.trim()) issues.push(`ingredient ${key} has no name`);
    if (i.amount != null && !(i.amount > 0 && i.amount < 10000)) issues.push(`ingredient ${key} has an invalid amount`);
    return {
      key,
      ref: i.pantry_id && knownIds.has(i.pantry_id) ? i.pantry_id : undefined,
      name: i.name.trim().toLowerCase(),
      amount: i.unit === "to taste" ? null : i.amount,
      unit: i.amount == null ? "to taste" : i.unit,
      optional: i.optional || undefined,
      note: i.note?.trim() || undefined,
    };
  });
  if (issues.length) throw new RecipeValidationError(issues);

  // The model was told to write [[key]] tokens; map its keys (pre-normalization)
  // to ours and turn any unknown token back into plain words.
  const keyMap = new Map(ai.ingredients.map((i, idx) => [keyify(i.key || i.name), ingredients[idx].key]));
  const steps: Step[] = ai.steps.map((s) => {
    const text = s.text.replace(/\[\[([^\]]+)\]\]/g, (_, raw: string) => {
      const k = keyMap.get(keyify(raw));
      return k ? `[[${k}]]` : raw.replace(/_/g, " ");
    });
    const secs = s.timer_seconds;
    const timer = secs && secs >= 10 && secs <= 6 * 3600 ? { label: (s.timer_label || "Timer").slice(0, 32), seconds: secs } : undefined;
    return timer ? { text, timer } : { text };
  });

  return {
    id: `${source}-${slug(title)}-${Date.now().toString(36)}`,
    title,
    description: ai.description.trim(),
    servings: ai.servings,
    time: ai.time_minutes,
    difficulty: ai.difficulty,
    mealType: ai.meal_type,
    cuisine: ai.cuisine.trim() || "Pantry",
    equipment: [...new Set(ai.equipment)],
    moods: [...new Set(ai.moods)],
    ingredients,
    steps,
    tips: ai.tips.map((t) => t.trim()).filter(Boolean).slice(0, 5),
    source,
    claimedDiet: { vegetarian: ai.vegetarian, vegan: ai.vegan },
    createdAt: Date.now(),
  };
}
