import { SEED_RECIPES } from "../data/recipes.ts";
import { cuisineFamily } from "./match.ts";
import type { State } from "./store.ts";

export interface Achievement {
  id: string;
  emoji: string;
  title: string;
  description: string;
  check: (s: State) => boolean;
  /** Optional progress readout for the badge shelf. */
  progress?: (s: State) => [number, number];
}

const uniqueUsed = (s: State) => new Set(s.cookLog.flatMap((l) => l.ingredientRefs)).size;
const cuisinesCooked = (s: State) => {
  const all = [...SEED_RECIPES, ...s.aiRecipes];
  return new Set(s.cookLog.map((l) => all.find((r) => r.id === l.recipeId)).filter(Boolean).map((r) => cuisineFamily(r!.cuisine))).size;
};
const dayStreak = (s: State) => {
  const days = [...new Set(s.cookLog.map((l) => new Date(l.at).toDateString()))].map((d) => new Date(d).getTime()).sort((a, b) => a - b);
  let best = days.length ? 1 : 0, run = 1;
  for (let i = 1; i < days.length; i++) {
    run = Math.round((days[i] - days[i - 1]) / 86_400_000) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
};
const count = (s: State, pred: (l: State["cookLog"][number]) => boolean) => s.cookLog.filter(pred).length;

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-cook", emoji: "🔥", title: "First Spark", description: "Cooked your first recipe.", check: (s) => s.cookLog.length >= 1 },
  { id: "one-pot", emoji: "🍲", title: "One Pot Wonder", description: "Cooked your first one-pot meal.", check: (s) => count(s, (l) => l.equipment.includes("onePot")) >= 1 },
  { id: "microwave", emoji: "📡", title: "Microwave Maestro", description: "Cooked 3 microwave recipes.", check: (s) => count(s, (l) => l.equipment.includes("microwave")) >= 3, progress: (s) => [count(s, (l) => l.equipment.includes("microwave")), 3] },
  { id: "used-10", emoji: "🧺", title: "Waste Not", description: "Used up 10 different pantry ingredients.", check: (s) => uniqueUsed(s) >= 10, progress: (s) => [uniqueUsed(s), 10] },
  { id: "used-30", emoji: "🧙", title: "Pantry Whisperer", description: "Used up 30 different pantry ingredients.", check: (s) => uniqueUsed(s) >= 30, progress: (s) => [uniqueUsed(s), 30] },
  { id: "breakfast", emoji: "🍳", title: "Breakfast Club", description: "Cooked 3 breakfasts. Most important meal, they say.", check: (s) => count(s, (l) => l.mealType === "breakfast") >= 3, progress: (s) => [count(s, (l) => l.mealType === "breakfast"), 3] },
  { id: "world", emoji: "🌍", title: "Passport Pending", description: "Cooked from 4 different cuisines.", check: (s) => cuisinesCooked(s) >= 4, progress: (s) => [cuisinesCooked(s), 4] },
  { id: "streak", emoji: "📆", title: "Three-Day Streak", description: "Cooked three days in a row.", check: (s) => dayStreak(s) >= 3, progress: (s) => [dayStreak(s), 3] },
  { id: "alchemist", emoji: "✨", title: "Alchemist", description: "Conjured a brand-new recipe with AI.", check: (s) => s.stats.aiGenerated >= 1 },
  { id: "chaos", emoji: "🌀", title: "Chaos Tamer", description: "Turned three weird ingredients into dinner.", check: (s) => s.stats.chaosDishes >= 1 || count(s, (l) => l.source === "chaos") >= 1 },
  { id: "remix", emoji: "♻️", title: "Second Life", description: "Remixed leftovers into a new meal.", check: (s) => s.stats.leftoverRemixes >= 1 || count(s, (l) => l.source === "remix") >= 1 },
  { id: "roulette", emoji: "🎡", title: "Spin Doctor", description: "Spun Fridge Roulette 5 times.", check: (s) => s.stats.rouletteSpins >= 5, progress: (s) => [s.stats.rouletteSpins, 5] },
  { id: "critic", emoji: "📝", title: "Tough Critic", description: "Rated 5 recipes.", check: (s) => Object.values(s.cookbook).filter((e) => e.rating > 0).length >= 5, progress: (s) => [Object.values(s.cookbook).filter((e) => e.rating > 0).length, 5] },
  { id: "chefs-kiss", emoji: "🤌", title: "Chef's Kiss", description: "Gave something a perfect 5 stars.", check: (s) => Object.values(s.cookbook).some((e) => e.rating === 5) },
  { id: "author", emoji: "📖", title: "Author, Author", description: "Saved 8 recipes to your cookbook.", check: (s) => Object.keys(s.cookbook).length >= 8, progress: (s) => [Object.keys(s.cookbook).length, 8] },
  { id: "stocked", emoji: "🏪", title: "Fully Stocked", description: "Checked off 40 pantry items.", check: (s) => Object.keys(s.pantry).length >= 40, progress: (s) => [Object.keys(s.pantry).length, 40] },
];
