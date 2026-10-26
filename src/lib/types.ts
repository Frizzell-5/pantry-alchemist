export type Category = "produce" | "grains" | "dairy" | "proteins" | "canned" | "spices" | "sauces" | "frozen" | "baking";

export interface Ingredient {
  id: string;
  label: string;
  category: Category;
  /** Name used when a recipe calls for exactly one (e.g. "potato"). */
  singular?: string;
  /** Round scaled amounts to whole items (eggs, potatoes, tortillas). */
  countable: boolean;
  animal?: "meat" | "fish" | "dairy" | "egg" | "honey";
  custom?: boolean;
}

export const UNITS = [
  "whole", "clove", "slice", "can", "pack", "pinch", "handful", "bunch", "stalk",
  "tsp", "tbsp", "cup", "ml", "l", "g", "kg", "oz", "lb", "to taste",
] as const;
export type Unit = (typeof UNITS)[number];

export interface RecipeIngredient {
  /** Token used inside step text as [[key]]. */
  key: string;
  /** Catalog ingredient id, when it maps to one. Used for pantry matching. */
  ref?: string;
  name: string;
  amount: number | null;
  unit: Unit;
  optional?: boolean;
  note?: string;
}

export interface Step {
  text: string;
  timer?: { label: string; seconds: number };
}

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "dessert"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const EQUIPMENT = ["stovetop", "microwave", "oven", "onePot", "noCook"] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const MOODS = ["cozy", "energy", "lazy", "impress", "broke"] as const;
export type Mood = (typeof MOODS)[number];

export type Difficulty = "easy" | "medium" | "hard";

export interface Recipe {
  id: string;
  title: string;
  description: string;
  servings: number;
  time: number;
  difficulty: Difficulty;
  mealType: MealType;
  cuisine: string;
  equipment: Equipment[];
  moods: Mood[];
  ingredients: RecipeIngredient[];
  steps: Step[];
  tips: string[];
  source: "seed" | "ai" | "chaos" | "remix" | "offline" | "library";
  /** Diet flags the model claimed; used only when ingredients can't be mapped. */
  claimedDiet?: { vegetarian: boolean; vegan: boolean };
  createdAt?: number;
  /** World-library dishes come with a photo, an optional video and the original source. */
  image?: string;
  video?: string;
  sourceUrl?: string;
  category?: string;
  /** Time is estimated from the method rather than stated by the recipe. */
  approxTime?: boolean;
}

export interface PantryItem {
  id: string;
  low?: boolean;
  addedAt: number;
}

export interface CookbookEntry {
  recipeId: string;
  savedAt: number;
  notes: string;
  rating: number; // 0 = not rated yet
  cookedCount: number;
  lastCooked?: number;
}

export interface CookLog {
  recipeId: string;
  at: number;
  equipment: Equipment[];
  ingredientRefs: string[];
  source: Recipe["source"];
  mealType: MealType;
}
