import { test } from "node:test";
import assert from "node:assert/strict";
import { mapIngredient, normalizeMeal, parseMeasure, searchRecipes, splitInstructions } from "../src/lib/library.ts";
import { matchRecipe } from "../src/lib/match.ts";
import { formatIngredient } from "../src/lib/units.ts";

test("measures parse into amounts and units", () => {
  assert.deepEqual(parseMeasure("2 tbs"), { amount: 2, unit: "tbsp", note: undefined });
  assert.deepEqual(parseMeasure("200g"), { amount: 200, unit: "g", note: undefined });
  assert.equal(parseMeasure("1/2 tsp").amount, 0.5);
  assert.equal(parseMeasure("1½ cups").amount, 1.5);
  assert.deepEqual(parseMeasure("1 (400g) can"), { amount: 1, unit: "can", note: undefined });
  assert.deepEqual(parseMeasure("3 cloves minced"), { amount: 3, unit: "clove", note: "minced" });
  assert.deepEqual(parseMeasure("Juice of 1"), { amount: null, unit: "to taste", note: "Juice of 1" });
  assert.equal(parseMeasure("Pinch").amount, 1);
});

test("library ingredient names map to pantry items", () => {
  assert.equal(mapIngredient("Spring Onions"), "green_onion");
  assert.equal(mapIngredient("Plain Flour"), "flour");
  assert.equal(mapIngredient("Minced Beef"), "ground_beef");
  assert.equal(mapIngredient("Courgettes"), "zucchini");
  assert.equal(mapIngredient("Potatoes"), "potato");
  assert.equal(mapIngredient("Saffron"), undefined);
  assert.equal(mapIngredient("Kimchi", [{ id: "custom_kimchi", label: "Kimchi" }]), "custom_kimchi");
});

test("instructions split into steps with timers", () => {
  const steps = splitInstructions("STEP 1\r\nBoil the pasta for 10-12 minutes.\r\n\r\nSTEP 2\r\nToss with sauce.");
  assert.equal(steps.length, 2);
  assert.equal(steps[0].text, "Boil the pasta for 10-12 minutes.");
  assert.deepEqual(steps[0].timer, { label: "Boil", seconds: 720 });
  assert.equal(steps[1].timer, undefined);
});

const meal = {
  idMeal: "1", strMeal: "Spanish Potato Omelette", strCategory: "Vegetarian", strArea: "Spanish", strTags: "Eggs",
  strInstructions: "Fry the potatoes and onion in oil for 20 minutes.\nBeat the eggs, add the potatoes, cook for 5 minutes and flip.",
  strMealThumb: "https://www.themealdb.com/images/media/meals/x.jpg", strYoutube: "", strSource: null,
  strIngredient1: "Potatoes", strMeasure1: "500g", strIngredient2: "Onion", strMeasure2: "1 large",
  strIngredient3: "Eggs", strMeasure3: "6", strIngredient4: "Olive Oil", strMeasure4: "100ml", strIngredient5: "Salt", strMeasure5: "Pinch",
  strIngredient6: "", strMeasure6: " ",
};

test("a library meal becomes a full recipe that matches the pantry", () => {
  const r = normalizeMeal(meal);
  assert.equal(r.id, "mdb-1");
  assert.equal(r.source, "library");
  assert.equal(r.cuisine, "Spanish");
  assert.equal(r.ingredients.length, 5);
  assert.deepEqual(r.ingredients.map((i) => i.ref), ["potato", "onion", "eggs", "olive_oil", "salt"]);
  assert.equal(formatIngredient(r.ingredients[2], 0.5, "us").text, "3 eggs");
  assert.equal(r.steps.length, 2);
  assert.equal(r.steps[0].timer?.seconds, 1200);
  assert.ok(r.equipment.includes("stovetop"));
  const m = matchRecipe(r, new Set(["potato", "onion", "eggs", "salt"]));
  assert.deepEqual(m.needToBuy.map((i) => i.name), ["olive oil"]);
});

test("search ranks title hits first and requires every word", () => {
  const a = normalizeMeal(meal);
  const b = normalizeMeal({ ...meal, idMeal: "2", strMeal: "Potato Salad", strArea: "American" });
  const c = normalizeMeal({ ...meal, idMeal: "3", strMeal: "Chicken Curry", strArea: "Indian", strIngredient1: "Chicken" });
  assert.deepEqual(searchRecipes([a, b, c], "potato").map((h) => h.recipe.id), ["mdb-2", "mdb-1"]);
  assert.deepEqual(searchRecipes([a, b, c], "spanish omelette").map((h) => h.recipe.id), ["mdb-1"]);
  assert.deepEqual(searchRecipes([a, b, c], "curries").map((h) => h.recipe.id), ["mdb-3"]);
});
