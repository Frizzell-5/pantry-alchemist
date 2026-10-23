import { INGREDIENT_MAP } from "../data/ingredients.ts";
import type { Ingredient, Recipe, RecipeIngredient, Step, Unit } from "./types.ts";

// A template-based stand-in for AI generation when no API key is configured.
// It picks a base technique from what you have (hash, fried rice, frittata,
// quesadilla, noodle toss…) and folds your chosen ingredients into it.

interface Template {
  id: string;
  bases: string[];
  style: string;
  time: number;
  equipment: Recipe["equipment"];
  mealType: Recipe["mealType"];
  baseAmount: [number, Unit];
  cookBase: (b: string) => Step[];
  combine: (b: string) => string;
}

const TEMPLATES: Template[] = [
  {
    id: "hash", bases: ["potato", "sweet_potato"], style: "Crispy Hash", time: 25, equipment: ["stovetop", "onePot"], mealType: "dinner", baseAmount: [2, "whole"],
    cookBase: (b) => [{ text: `Dice [[${b}]] into small cubes. Cook in [[fat]] over medium-high, covered, stirring now and then.`, timer: { label: "Crisp potatoes", seconds: 600 } }],
    combine: () => "Uncover and let everything fry together until browned and crisp at the edges.",
  },
  {
    id: "fried-rice", bases: ["rice"], style: "Fried Rice", time: 15, equipment: ["stovetop", "onePot"], mealType: "dinner", baseAmount: [2, "cup"],
    cookBase: () => [],
    combine: (b) => `Add cooked [[${b}]] (day-old is best), press it into the pan, and fry until hot and toasty.`,
  },
  {
    id: "noodles", bases: ["pasta", "short_pasta", "ramen", "rice_noodles"], style: "Noodle Toss", time: 15, equipment: ["stovetop"], mealType: "dinner", baseAmount: [200, "g"],
    cookBase: (b) => [{ text: `Cook [[${b}]] in boiling salted water until just tender. Save a mug of the water, then drain.`, timer: { label: "Cook noodles", seconds: 540 } }],
    combine: (b) => `Toss the [[${b}]] into the pan with a splash of the saved water until glossy.`,
  },
  {
    id: "frittata", bases: ["eggs"], style: "Frittata", time: 20, equipment: ["stovetop"], mealType: "breakfast", baseAmount: [6, "whole"],
    cookBase: (b) => [{ text: `Whisk [[${b}]] with a pinch of [[salt]].` }],
    combine: (b) => `Pour the [[${b}]] over everything, cover, and cook on low until just set in the middle.`,
  },
  {
    id: "quesadilla", bases: ["tortilla", "pita"], style: "Quesadillas", time: 15, equipment: ["stovetop"], mealType: "lunch", baseAmount: [4, "whole"],
    cookBase: () => [],
    combine: (b) => `Spoon the filling onto half of each [[${b}]], fold, and toast in a dry pan until crisp on both sides.`,
  },
  {
    id: "toastie", bases: ["bread"], style: "Loaded Toast", time: 12, equipment: ["stovetop"], mealType: "lunch", baseAmount: [4, "slice"],
    cookBase: (b) => [{ text: `Toast [[${b}]] until deeply golden.` }],
    combine: (b) => `Pile everything onto the [[${b}]].`,
  },
  {
    id: "bowl", bases: ["quinoa", "couscous", "oats"], style: "Grain Bowl", time: 20, equipment: ["stovetop"], mealType: "lunch", baseAmount: [1, "cup"],
    cookBase: (b) => [{ text: `Cook [[${b}]] according to the package.`, timer: { label: "Cook grains", seconds: 720 } }],
    combine: (b) => `Spoon over the [[${b}]] and toss.`,
  },
];

function amountFor(cat: Ingredient | undefined): [number, Unit] {
  if (!cat) return [1, "cup"];
  if (cat.countable) return [1, "whole"];
  switch (cat.category) {
    case "produce": return cat.id === "garlic" ? [2, "clove"] : ["basil", "parsley", "cilantro", "spinach", "kale"].includes(cat.id) ? [1, "handful"] : [1, "cup"];
    case "proteins": return [8, "oz"];
    case "dairy": return [0.5, "cup"];
    case "canned": return [1, "can"];
    case "frozen": return [1, "cup"];
    case "sauces": return [1, "tbsp"];
    case "spices": return [1, "tsp"];
    case "baking": return [1, "tbsp"];
    default: return [1, "cup"];
  }
}

const pick = <T,>(arr: T[], seed: number) => arr[seed % arr.length];

export function offlineRecipe(opts: {
  focus: string[];
  pantry: Set<string>;
  lookup: (id: string) => Ingredient | undefined;
  labelOf: (id: string) => string;
  kind: "chaos" | "remix";
}): Recipe {
  const { focus, pantry, lookup, labelOf, kind } = opts;
  const seed = Date.now() % 997;
  const avail = new Set([...pantry, ...focus]);
  const tpl =
    TEMPLATES.find((t) => t.bases.some((b) => focus.includes(b))) ??
    TEMPLATES.filter((t) => t.bases.some((b) => avail.has(b)))[seed % Math.max(1, TEMPLATES.filter((t) => t.bases.some((b) => avail.has(b))).length)] ??
    TEMPLATES[0];
  const base = tpl.bases.find((b) => focus.includes(b)) ?? tpl.bases.find((b) => avail.has(b)) ?? tpl.bases[0];

  const ing: RecipeIngredient[] = [];
  const add = (key: string, ref: string | undefined, name: string, amount: number | null, unit: Unit, optional = false) => {
    if (ing.some((i) => i.key === key)) return;
    ing.push({ key, ref, name, amount, unit, optional: optional || undefined });
  };
  const baseCat = INGREDIENT_MAP.get(base);
  add(base, base, baseCat?.label.toLowerCase() ?? base, tpl.baseAmount[0], tpl.baseAmount[1], !avail.has(base));

  const fat = ["olive_oil", "vegetable_oil", "butter"].find((f) => pantry.has(f)) ?? "vegetable_oil";
  add("fat", fat, labelOf(fat).toLowerCase(), 2, "tbsp");
  const aromatics = ["onion", "garlic", "red_onion", "ginger"].filter((a) => avail.has(a) && !focus.includes(a)).slice(0, 2);

  const extras = focus.filter((f) => f !== base);
  const byRole = { protein: [] as string[], veg: [] as string[], cheese: [] as string[], sauce: [] as string[], spice: [] as string[], other: [] as string[] };
  for (const id of extras) {
    const c = lookup(id);
    const role = !c ? "other" : c.category === "proteins" || ["tuna", "chickpeas", "black_beans", "kidney_beans", "lentils"].includes(id) ? "protein"
      : c.category === "produce" || c.category === "frozen" ? "veg"
      : ["cheddar", "mozzarella", "parmesan", "feta", "cream_cheese", "sour_cream", "greek_yogurt"].includes(id) ? "cheese"
      : c.category === "sauces" ? "sauce" : c.category === "spices" ? "spice" : "other";
    byRole[role].push(id);
  }
  for (const id of [...aromatics, ...extras]) {
    const c = lookup(id);
    const [a, u] = amountFor(c);
    add(id, c ? id : undefined, (c?.singular && u === "whole" ? c.singular : labelOf(id)).toLowerCase(), a, u);
  }
  if (!byRole.sauce.length) {
    const s = ["soy_sauce", "hot_sauce", "sriracha", "pesto", "salsa"].find((x) => pantry.has(x));
    if (s) { byRole.sauce.push(s); add(s, s, labelOf(s).toLowerCase(), 1, "tbsp", true); }
  }
  if (pantry.has("salt")) add("salt", "salt", "salt", null, "to taste");
  if (pantry.has("black_pepper")) add("black_pepper", "black_pepper", "black pepper", null, "to taste");

  const t = (ids: string[]) => ids.map((i) => `[[${i}]]`).join(ids.length > 2 ? ", " : " and ");
  const steps: Step[] = [...tpl.cookBase(base)];
  if (aromatics.length) steps.push({ text: `Heat [[fat]] in a wide pan over medium. Cook ${t(aromatics)} until soft and fragrant.`, timer: { label: "Soften aromatics", seconds: 240 } });
  else if (tpl.id !== "hash") steps.push({ text: `Heat [[fat]] in a wide pan over medium-high.` });
  if (byRole.protein.length) steps.push({ text: `Add ${t(byRole.protein)} and cook until browned and cooked through (cut a piece to check).`, timer: { label: "Cook protein", seconds: 360 } });
  if (byRole.veg.length) steps.push({ text: `Add ${t(byRole.veg)} and cook until tender with a little color.`, timer: { label: "Cook veg", seconds: 240 } });
  if (byRole.other.length) steps.push({ text: `Stir in ${t(byRole.other)}; taste as you go, a little goes a long way.` });
  if (byRole.spice.length) steps.push({ text: `Sprinkle in ${t(byRole.spice)} and stir for 30 seconds to wake it up.` });
  steps.push({ text: tpl.combine(base) });
  const finish = [...byRole.sauce, ...byRole.cheese];
  steps.push({ text: `Finish with ${finish.length ? t(finish) + ", " : ""}${pantry.has("salt") ? "[[salt]]" : "salt"}${pantry.has("black_pepper") ? " and [[black_pepper]]" : ""}. Taste and adjust.` });

  const names = extras.slice(0, 3).map((id) => labelOf(id).split(" (")[0]);
  const nameList = names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}` : names[0] ?? labelOf(base);
  const prefix = kind === "chaos" ? pick(["Chaos", "Wild Card", "Fridge Raid", "Midnight"], seed) : pick(["Next-Day", "Second-Round", "Remix"], seed);
  const title = `${prefix} ${tpl.style}: ${nameList}`;

  return {
    id: `offline-${tpl.id}-${Date.now().toString(36)}`,
    title,
    description: kind === "chaos"
      ? `A ${tpl.style.toLowerCase()} built around ${nameList.toLowerCase()}. A sturdy base, a hot pan, and seasoning to taste.`
      : `Yesterday's ${nameList.toLowerCase()} reborn as a ${tpl.style.toLowerCase()}. Different texture, new life.`,
    servings: 2,
    time: tpl.time + (byRole.protein.length ? 5 : 0),
    difficulty: "easy",
    mealType: tpl.mealType,
    cuisine: "Pantry",
    equipment: tpl.equipment,
    moods: ["broke", "lazy"],
    ingredients: ing,
    steps,
    tips: ["Taste before the last seasoning step; leftovers and sauces are often already salty.", "Offline template recipe. Add an Anthropic API key to .env for a fully custom AI recipe."],
    source: "offline",
    createdAt: Date.now(),
  };
}
