import { test } from "node:test";
import assert from "node:assert/strict";
import { SEED_RECIPES } from "../src/data/recipes.ts";
import { INGREDIENT_MAP, SUBSTITUTIONS } from "../src/data/ingredients.ts";
import { formatIngredient, friendly, renderStep, stepPlainText } from "../src/lib/units.ts";
import { dietOf, matchRecipe, passesFilters, rankRecipes, DEFAULT_FILTERS } from "../src/lib/match.ts";
import { validateAiRecipe, RecipeValidationError, type AiRecipe } from "../src/lib/aiRecipe.ts";
import { offlineRecipe } from "../src/lib/offlineGen.ts";
import type { RecipeIngredient } from "../src/lib/types.ts";

const ing = (ref: string, amount: number, unit: RecipeIngredient["unit"]): RecipeIngredient => ({ key: ref, ref, name: INGREDIENT_MAP.get(ref)!.label.toLowerCase(), amount, unit });

test("seed data: ~30 recipes, unique ids, every [[token]] resolves", () => {
  assert.ok(SEED_RECIPES.length >= 30);
  assert.equal(new Set(SEED_RECIPES.map((r) => r.id)).size, SEED_RECIPES.length);
  for (const r of SEED_RECIPES) {
    const keys = new Set(r.ingredients.map((i) => i.key));
    for (const s of r.steps) for (const [, k] of s.text.matchAll(/\[\[([a-z0-9_]+)\]\]/g)) assert.ok(keys.has(k), `${r.id}: unknown token ${k}`);
  }
});

test("substitution table only references known ingredients", () => {
  for (const [k, opts] of Object.entries(SUBSTITUTIONS)) {
    assert.ok(INGREDIENT_MAP.has(k), k);
    for (const o of opts) for (const u of o.use) assert.ok(INGREDIENT_MAP.has(u), `${k} -> ${u}`);
  }
});

test("friendly fractions", () => {
  assert.equal(friendly(0.33), "⅓");
  assert.equal(friendly(1.5), "1½");
  assert.equal(friendly(0.66), "⅔");
  assert.equal(friendly(1.97), "2");
  assert.equal(friendly(0.12, true), "⅛");
});

test("eggs never come out fractional; produce can halve", () => {
  const eggs = ing("eggs", 4, "whole");
  assert.equal(formatIngredient(eggs, 1 / 3, "us").qty, "1");
  assert.equal(formatIngredient(eggs, 0.5, "us").text, "2 eggs");
  assert.equal(formatIngredient(eggs, 0.25, "us").text, "1 egg");
  const onion = ing("onion", 1, "whole");
  assert.equal(formatIngredient(onion, 0.5, "us").text, "½ onion");
  assert.equal(formatIngredient(ing("potato", 4, "whole"), 1.5, "us").text, "6 potatoes");
});

test("volume re-units as it scales", () => {
  assert.equal(formatIngredient(ing("olive_oil", 2, "tbsp"), 3, "us").qty, "⅓ cup");
  assert.equal(formatIngredient(ing("olive_oil", 2, "tbsp"), 2, "us").qty, "¼ cup");
  assert.equal(formatIngredient(ing("salt", 1, "tsp"), 3, "us").qty, "1 tbsp");
  assert.equal(formatIngredient(ing("garlic", 3, "clove"), 0.5, "us").qty, "2 cloves");
});

test("metric conversion uses grams for dry goods and rounds sensibly", () => {
  assert.equal(formatIngredient(ing("rice", 1, "cup"), 1, "metric").qty, "190 g");
  assert.equal(formatIngredient(ing("milk", 1, "cup"), 1, "metric").qty, "240 ml");
  assert.equal(formatIngredient(ing("chicken_breast", 1, "lb"), 1, "metric").qty, "450 g");
  assert.equal(formatIngredient(ing("pasta", 200, "g"), 1, "us").qty, "7 oz");
});

test("step tokens render scaled amounts and convert °F", () => {
  const r = SEED_RECIPES.find((x) => x.id === "sheet-pan-sausage")!;
  assert.match(stepPlainText(renderStep(r.steps[0], r, 1, "metric")), /220°C/);
  const hash = SEED_RECIPES.find((x) => x.id === "potato-egg-hash")!;
  assert.match(stepPlainText(renderStep(hash.steps[0], hash, 2, "us")), /Dice 4 potatoes/);
});

test("matching counts, swaps and ranking", () => {
  const r = SEED_RECIPES.find((x) => x.id === "aglio-e-olio")!;
  const m = matchRecipe(r, new Set(["pasta", "vegetable_oil", "garlic", "chili_flakes", "salt"]));
  assert.equal(m.required, 5);
  assert.equal(m.haveCount, 4);
  assert.equal(m.swaps[0].missing.ref, "olive_oil");
  assert.equal(m.needToBuy.length, 0);
  const ranked = rankRecipes(SEED_RECIPES, new Set(["potato", "salt", "butter", "cheddar", "black_pepper"]), DEFAULT_FILTERS);
  assert.equal(ranked[0].recipe.id, "microwave-loaded-potato");
});

test("diet and equipment filters", () => {
  const get = (id: string) => SEED_RECIPES.find((x) => x.id === id)!;
  assert.deepEqual(dietOf(get("crispy-tofu-bowl")), { vegetarian: true, vegan: true, noMeat: true });
  assert.equal(dietOf(get("tuna-melt")).noMeat, true);
  assert.equal(dietOf(get("tuna-melt")).vegetarian, false);
  assert.equal(dietOf(get("cheesy-potato-soup")).vegetarian, false); // chicken broth
  assert.equal(passesFilters(get("mug-brownie"), { ...DEFAULT_FILTERS, equipment: "microwave" }), true);
  assert.equal(passesFilters(get("sheet-pan-sausage"), { ...DEFAULT_FILTERS, equipment: "noOven" }), false);
  assert.equal(passesFilters(get("burrito-bowl"), { ...DEFAULT_FILTERS, equipment: "stovetop" }), false);
});

const sampleAi = (): AiRecipe => ({
  title: "Crispy Kimchi Potato Cakes", description: "Tangy and crisp.", servings: 2, time_minutes: 25, difficulty: "easy",
  meal_type: "dinner", cuisine: "Korean-inspired", vegetarian: true, vegan: false, equipment: ["stovetop"], moods: ["cozy"],
  ingredients: [
    { key: "potato", pantry_id: "potato", name: "potato", amount: 2, unit: "whole", optional: false, note: null },
    { key: "egg", pantry_id: "eggs", name: "egg", amount: 1, unit: "whole", optional: false, note: null },
    { key: "kimchi", pantry_id: "not_in_pantry", name: "kimchi", amount: 0.5, unit: "cup", optional: false, note: null },
  ],
  steps: [
    { text: "Grate [[potato]] and mix with [[egg]] and [[kimchi]].", timer_seconds: null, timer_label: null },
    { text: "Fry in [[oil]] until crisp.", timer_seconds: 300, timer_label: "Fry cakes" },
  ],
  tips: ["Squeeze the potato dry."],
});

test("AI recipe validation maps pantry ids, repairs tokens, keeps timers", () => {
  const r = validateAiRecipe(sampleAi(), new Set(["potato", "eggs"]), "ai");
  assert.equal(r.ingredients[0].ref, "potato");
  assert.equal(r.ingredients[2].ref, undefined); // unknown pantry id dropped
  assert.equal(r.steps[1].text, "Fry in oil until crisp."); // unknown token → plain words
  assert.deepEqual(r.steps[1].timer, { label: "Fry cakes", seconds: 300 });
});

test("AI recipe validation rejects nonsense", () => {
  const bad = { ...sampleAi(), servings: 0, ingredients: [] };
  assert.throws(() => validateAiRecipe(bad, new Set(), "ai"), RecipeValidationError);
});

test("offline generator builds a coherent recipe around chaos picks", () => {
  const pantry = new Set(["rice", "garlic", "vegetable_oil", "salt", "soy_sauce"]);
  const r = offlineRecipe({ focus: ["banana", "feta", "gochujang"], pantry, lookup: (id) => INGREDIENT_MAP.get(id), labelOf: (id) => INGREDIENT_MAP.get(id)?.label ?? id, kind: "chaos" });
  const keys = new Set(r.ingredients.map((i) => i.key));
  for (const s of r.steps) for (const [, k] of s.text.matchAll(/\[\[([a-z0-9_]+)\]\]/g)) assert.ok(keys.has(k), `token ${k}`);
  for (const f of ["banana", "feta", "gochujang"]) assert.ok(keys.has(f));
  assert.match(r.title, /Fried Rice/);
});
